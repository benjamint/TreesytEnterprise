import { toast } from 'sonner';
import type { Invite, Lang, Membership, Organisation, Session, User } from '@/types';
import { uid } from '@/lib/utils';
import i18n from '@/i18n';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useActivityStore } from '@/stores/activityStore';
import { useDemoStore } from '@/stores/demoStore';
import { sendEmail } from './emailGateway';
import { DEFAULT_POLICY, emailDomain, oneTimeCode, passwordFailures } from './authPolicy';

/** Demo authentication (PRD A2). No real security — it makes every screen and state reachable. */

const DEVICE_KEY = 'treesyt-demo:v1:device';
const MAX_ATTEMPTS = 5;

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid('dev');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

export function describeDevice(): Pick<Session, 'device' | 'browser' | 'os' | 'location' | 'ip'> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Linux';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return { device: i18n.t('account.thisDevice'), browser, os, location: 'Accra, GH', ip: '102.176.65.10' };
}

const findUser = (email: string) => useAccessStore.getState().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
const membershipsOf = (userId: string) => useAccessStore.getState().memberships.filter((m) => m.userId === userId);
const orgById = (id: string) => usePlatformStore.getState().orgs.find((o) => o.id === id);

function audit(orgId: string, actorId: string, entity: string, entityId: string, key: string, after?: unknown) {
  useActivityStore.getState().addAudit({ id: uid('aud'), orgId, actorId, entity, entityId, key, after, at: new Date().toISOString() });
}

/** Companies a user can enter: active memberships in active companies; the platform owner sees all. */
export function companiesFor(user: User): Organisation[] {
  const orgs = usePlatformStore.getState().orgs;
  if (user.isPlatformOwner) return orgs;
  const ids = new Set(membershipsOf(user.id).filter((m) => m.status === 'ACTIVE').map((m) => m.orgId));
  return orgs.filter((o) => ids.has(o.id));
}

/** Does this user need a 2-step code on this device? */
export function needsTwoStep(user: User): boolean {
  if (user.trustedDevices.includes(deviceId())) return false;
  if (user.twoFactor.enabled) return true;
  const { roles } = useAccessStore.getState();
  const settings = useSettingsStore.getState().settings;
  return membershipsOf(user.id).some((m) => {
    const tpl = roles.find((r) => r.id === m.roleIds[0])?.template;
    return !!tpl && (settings[m.orgId]?.security.twoFactorRoles ?? []).includes(tpl);
  });
}

export type SignInResult =
  | { status: 'invalid'; attemptsLeft: number }
  | { status: 'locked' | 'deactivated' | 'invited' | 'suspended' | 'noCompany' }
  | { status: 'twoStep' | 'chooseCompany' | 'ok'; user: User; orgs: Organisation[] };

/** Step 1: email + password. */
export function checkCredentials(email: string, password: string): SignInResult {
  const user = findUser(email);
  const access = useAccessStore.getState();
  if (!user) return { status: 'invalid', attemptsLeft: MAX_ATTEMPTS };
  if (user.status === 'LOCKED') return { status: 'locked' };
  if (user.status === 'DEACTIVATED') return { status: 'deactivated' };
  if (user.status === 'INVITED') return { status: 'invited' };
  if (user.password !== password) {
    const failed = user.failedAttempts + 1;
    const locked = failed >= MAX_ATTEMPTS;
    access.updateUser(user.id, { failedAttempts: failed, status: locked ? 'LOCKED' : user.status });
    if (locked) audit(membershipsOf(user.id)[0]?.orgId ?? 'org_treesyt', user.id, 'user', user.id, 'user.locked', { reason: 'failedAttempts' });
    return locked ? { status: 'locked' } : { status: 'invalid', attemptsLeft: MAX_ATTEMPTS - failed };
  }
  return afterPassword(user);
}

/** What comes after a correct password (or SSO): 2-step, company picker or straight in. */
export function afterPassword(user: User): SignInResult {
  const orgs = companiesFor(user).filter((o) => o.status !== 'SUSPENDED' && o.status !== 'DEACTIVATED');
  if (!orgs.length) return { status: companiesFor(user).length ? 'suspended' : 'noCompany' };
  if (needsTwoStep(user)) return { status: 'twoStep', user, orgs };
  if (orgs.length > 1) return { status: 'chooseCompany', user, orgs };
  return { status: 'ok', user, orgs };
}

/** Send a demo one-time code; it appears in the Demo panel instead of a phone or inbox. */
export function issueCode(label: 'twoStep' | 'verifyEmail', to: string): string {
  const code = oneTimeCode();
  useDemoStore.getState().pushCode({ label, to, code });
  return code;
}

export function trustDevice(userId: string) {
  const u = useAccessStore.getState().users.find((x) => x.id === userId);
  if (u && !u.trustedDevices.includes(deviceId())) useAccessStore.getState().updateUser(userId, { trustedDevices: [...u.trustedDevices, deviceId()] });
}

/** Final step: create the Session record and sign this tab in. */
export function completeSignIn(user: User, orgId: string) {
  const access = useAccessStore.getState();
  const now = new Date().toISOString();
  const session: Session = { id: uid('ses'), userId: user.id, orgId, ...describeDevice(), createdAt: now, lastActiveAt: now };
  access.addSession(session);
  access.updateUser(user.id, { failedAttempts: 0, lastActiveAt: now });
  const org = orgById(orgId);
  const lang: Lang = user.language ?? org?.language ?? 'en';
  useSessionStore.getState().signIn(user.id, orgId, lang, session.id);
  void i18n.changeLanguage(lang);
}

/** Pick the company to land in when signing in as a demo persona. */
export function homeOrgFor(user: User, preferred?: string): string {
  const orgs = companiesFor(user);
  if (preferred && orgs.some((o) => o.id === preferred)) return preferred;
  return membershipsOf(user.id)[0]?.orgId ?? orgs[0]?.id ?? 'org_treesyt';
}

/** Demo panel: sign in as a persona without the password screens. */
export function signInAsPersona(userId: string, preferredOrg?: string) {
  const user = useAccessStore.getState().users.find((u) => u.id === userId);
  if (!user) return;
  completeSignIn(user, homeOrgFor(user, user.isPlatformOwner ? preferredOrg : undefined));
}

export function signOutThisTab() {
  const { sessionId } = useSessionStore.getState();
  if (sessionId) useAccessStore.getState().revokeSession(sessionId);
  useSessionStore.getState().signOut();
}

/** SSO: find a company whose SSO domain matches the work email. */
export function ssoLookup(email: string): Organisation | null {
  const domain = emailDomain(email);
  if (!domain) return null;
  const settings = useSettingsStore.getState().settings;
  const orgId = Object.keys(settings).find((id) => settings[id]!.security.sso.enabled && settings[id]!.security.sso.domain === domain);
  return orgId ? orgById(orgId) ?? null : null;
}

export function ssoProviderName(orgId: string): string {
  return useSettingsStore.getState().settings[orgId]?.security.sso.idpName || 'Identity provider';
}

// ---------- Password reset ----------
const RESET_MINUTES = 30;

export function requestPasswordReset(email: string): string | null {
  const user = findUser(email);
  if (!user) return null;
  const token = uid('rst');
  const now = Date.now();
  useAccessStore.getState().addResetToken({ token, userId: user.id, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + RESET_MINUTES * 60_000).toISOString() });
  const lng = user.language;
  const orgId = membershipsOf(user.id)[0]?.orgId ?? 'org_treesyt';
  const link = `${window.location.origin}/reset-password?token=${token}`;
  sendEmail({ orgId, to: user.email, templateId: 'passwordReset', language: lng, subject: i18n.t('email.reset.subject', { lng }), body: i18n.t('email.reset.body', { lng, name: user.name.split(' ')[0], link, minutes: RESET_MINUTES }) });
  useDemoStore.getState().pushLink({ label: 'reset', to: user.email, href: `/reset-password?token=${token}` });
  return token;
}

export type ResetCheck = { ok: true; user: User; policy: typeof DEFAULT_POLICY } | { ok: false; reason: 'expired' | 'used' | 'unknown' };

export function checkResetToken(token: string | null): ResetCheck {
  if (token === 'expired') return { ok: false, reason: 'expired' };
  const t = useAccessStore.getState().resetTokens.find((x) => x.token === token);
  if (!t) return { ok: false, reason: 'unknown' };
  if (t.usedAt) return { ok: false, reason: 'used' };
  if (Date.now() > new Date(t.expiresAt).getTime()) return { ok: false, reason: 'expired' };
  const user = useAccessStore.getState().users.find((u) => u.id === t.userId)!;
  return { ok: true, user, policy: policyFor(user) };
}

/** The strictest password policy across the user's companies. */
export function policyFor(user: Pick<User, 'id'>, orgId?: string): typeof DEFAULT_POLICY {
  const settings = useSettingsStore.getState().settings;
  const ids = orgId ? [orgId] : membershipsOf(user.id).map((m) => m.orgId);
  return ids.reduce((acc, id) => {
    const p = settings[id]?.security.passwordPolicy;
    if (!p) return acc;
    return { minLength: Math.max(acc.minLength, p.minLength), requireNumber: acc.requireNumber || p.requireNumber, requireSymbol: acc.requireSymbol || p.requireSymbol, requireMixedCase: acc.requireMixedCase || p.requireMixedCase };
  }, DEFAULT_POLICY);
}

export function resetPassword(token: string, password: string) {
  const check = checkResetToken(token);
  if (!check.ok) return check;
  useAccessStore.getState().updateUser(check.user.id, { password, passwordChangedAt: new Date().toISOString(), failedAttempts: 0, status: check.user.status === 'LOCKED' ? 'ACTIVE' : check.user.status });
  useAccessStore.getState().markResetTokenUsed(token);
  return check;
}

// ---------- Invites ----------
export type InviteCheck = { ok: true; invite: Invite; org: Organisation } | { ok: false; reason: 'expired' | 'used' | 'unknown' };

function inviteByToken(token: string | null) {
  return useAccessStore.getState().invites.find((i) => i.token === token);
}

export function checkInvite(token: string | null): InviteCheck {
  const inv = inviteByToken(token);
  if (!inv) return { ok: false, reason: 'unknown' };
  if (inv.status === 'ACCEPTED') return { ok: false, reason: 'used' };
  if (inv.status !== 'PENDING' || Date.now() > new Date(inv.expiresAt).getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, invite: inv, org: orgById(inv.orgId)! };
}

export function acceptInvite(token: string, name: string, password: string) {
  const check = checkInvite(token);
  if (!check.ok) return check;
  const access = useAccessStore.getState();
  const inv = check.invite;
  let user = access.users.find((u) => u.email.toLowerCase() === inv.email.toLowerCase());
  const now = new Date().toISOString();
  if (user) access.updateUser(user.id, { name, password, status: 'ACTIVE', passwordChangedAt: now });
  else {
    user = {
      id: uid('u'), name, email: inv.email, phone: '', language: check.org.language, status: 'ACTIVE', avatarColor: '#2F6FDB', password,
      passwordChangedAt: now, twoFactor: { enabled: false, method: 'APP', backupCodes: [] }, failedAttempts: 0, trustedDevices: [],
    };
    access.addUser(user);
  }
  const existing = access.memberships.find((m) => m.userId === user!.id && m.orgId === inv.orgId);
  const membership: Membership = existing ? { ...existing, status: 'ACTIVE', roleIds: inv.roleIds } : { id: `mem_${user.id}_${inv.orgId}`, userId: user.id, orgId: inv.orgId, roleIds: inv.roleIds, status: 'ACTIVE' };
  access.addMembership(membership);
  access.updateInvite(inv.id, { status: 'ACCEPTED' });
  audit(inv.orgId, user.id, 'invite', inv.id, 'user.inviteAccepted', { email: inv.email });
  const fresh = useAccessStore.getState().users.find((u) => u.id === user!.id)!;
  completeSignIn(fresh, inv.orgId);
  return { ok: true as const, org: check.org };
}

export function notifyDemo(messageKey: string, params: Record<string, unknown> = {}) {
  toast(i18n.t(messageKey, params));
}

export { passwordFailures };
