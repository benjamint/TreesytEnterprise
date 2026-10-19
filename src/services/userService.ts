import type { Invite, Membership, User, UserStatus } from '@/types';
import { uid } from '@/lib/utils';
import i18n from '@/i18n';
import { usePlatformStore } from '@/stores/platformStore';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useDemoStore } from '@/stores/demoStore';
import { sendEmail } from './emailGateway';

/** People in a company (PRD A4 Users): invites, resends, role changes, deactivation, removal. */

const AVATARS = ['#1F4E79', '#0F6E6E', '#5B3FA0', '#2C5282', '#6B4E16', '#3D6B2F', '#7A3E12'];
const INVITE_DAYS = 7;

function audit(orgId: string, actorId: string, entity: string, entityId: string, key: string, after?: unknown, before?: unknown) {
  useActivityStore.getState().addAudit({ id: uid('aud'), orgId, actorId, entity, entityId, key, before, after, at: new Date().toISOString() });
}

function sendInviteEmail(invite: Invite, name: string) {
  const org = usePlatformStore.getState().orgs.find((o) => o.id === invite.orgId)!;
  const lng = org.language;
  const link = `${window.location.origin}/accept-invite?token=${invite.token}`;
  sendEmail({ orgId: org.id, to: invite.email, templateId: 'invite', language: lng, subject: i18n.t('email.invite.subject', { lng, company: org.name }), body: i18n.t('email.invite.body', { lng, name: name.split(' ')[0] || '', company: org.name, link }) });
  useDemoStore.getState().pushLink({ label: 'invite', to: invite.email, href: `/accept-invite?token=${invite.token}` });
}

export type InviteOutcome = { ok: true; invite: Invite } | { ok: false; reason: 'invalidEmail' | 'alreadyMember' | 'noRole' };

/** Invite one person: creates the user if new, an INVITED membership, the invite and its email. */
export function inviteUser(orgId: string, input: { name: string; email: string; roleIds: string[] }, actorId: string): InviteOutcome {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, reason: 'invalidEmail' };
  if (!input.roleIds.length) return { ok: false, reason: 'noRole' };
  const access = useAccessStore.getState();
  let user = access.users.find((u) => u.email.toLowerCase() === email);
  const existing = user && access.memberships.find((m) => m.userId === user!.id && m.orgId === orgId);
  if (existing && existing.status !== 'INVITED') return { ok: false, reason: 'alreadyMember' };
  if (!user) {
    const org = usePlatformStore.getState().orgs.find((o) => o.id === orgId);
    user = {
      id: uid('u'), name: input.name.trim() || email, email, phone: '', language: org?.language ?? 'en', status: 'INVITED',
      avatarColor: AVATARS[access.users.length % AVATARS.length]!, password: '', twoFactor: { enabled: false, method: 'APP', backupCodes: [] },
      failedAttempts: 0, trustedDevices: [],
    } satisfies User;
    access.addUser(user);
  }
  const membership: Membership = { id: `mem_${user.id}_${orgId}`, userId: user.id, orgId, roleIds: input.roleIds, status: 'INVITED' };
  access.addMembership(membership);
  const now = new Date().toISOString();
  const invite: Invite = {
    id: uid('inv'), token: uid('inv'), orgId, email, name: input.name.trim() || undefined, roleIds: input.roleIds, invitedBy: actorId,
    createdAt: now, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(), status: 'PENDING',
  };
  for (const old of access.invites.filter((i) => i.orgId === orgId && i.email === email && i.status === 'PENDING')) access.updateInvite(old.id, { status: 'REVOKED' });
  access.addInvite(invite);
  sendInviteEmail(invite, input.name || user.name);
  audit(orgId, actorId, 'invite', invite.id, 'user.invited', { email, roles: input.roleIds });
  return { ok: true, invite };
}

/** Resend: a fresh token and expiry; the old link stops working. */
export function resendInvite(inviteId: string, actorId: string): Invite | null {
  const access = useAccessStore.getState();
  const inv = access.invites.find((i) => i.id === inviteId);
  if (!inv) return null;
  const token = uid('inv');
  const patch = { token, status: 'PENDING' as const, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString() };
  access.updateInvite(inv.id, patch);
  const fresh = { ...inv, ...patch };
  sendInviteEmail(fresh, inv.name ?? '');
  audit(inv.orgId, actorId, 'invite', inv.id, 'user.inviteResent', { email: inv.email });
  return fresh;
}

export function revokeInvite(inviteId: string, actorId: string) {
  const access = useAccessStore.getState();
  const inv = access.invites.find((i) => i.id === inviteId);
  if (!inv) return;
  access.updateInvite(inv.id, { status: 'REVOKED' });
  const user = access.users.find((u) => u.email.toLowerCase() === inv.email.toLowerCase());
  const m = user && access.memberships.find((x) => x.userId === user.id && x.orgId === inv.orgId && x.status === 'INVITED');
  if (m) useAccessStore.setState((st) => ({ memberships: st.memberships.filter((x) => x.id !== m.id) }));
  audit(inv.orgId, actorId, 'invite', inv.id, 'user.inviteRevoked', { email: inv.email });
}

export function setMemberRoles(membershipId: string, roleIds: string[], actorId: string) {
  const m = useAccessStore.getState().memberships.find((x) => x.id === membershipId)!;
  useAccessStore.getState().updateMembership(membershipId, { roleIds });
  audit(m.orgId, actorId, 'membership', membershipId, 'user.rolesChanged', { roles: roleIds }, { roles: m.roleIds });
}

export function setMemberStatus(membershipId: string, status: Extract<UserStatus, 'ACTIVE' | 'DEACTIVATED'>, actorId: string) {
  const access = useAccessStore.getState();
  const m = access.memberships.find((x) => x.id === membershipId)!;
  access.updateMembership(membershipId, { status });
  // Deactivating signs the person out of this company everywhere.
  if (status === 'DEACTIVATED') useAccessStore.setState((st) => ({ sessions: st.sessions.map((s) => (s.userId === m.userId && s.orgId === m.orgId && !s.revokedAt ? { ...s, revokedAt: new Date().toISOString() } : s)) }));
  audit(m.orgId, actorId, 'membership', membershipId, status === 'DEACTIVATED' ? 'user.deactivated' : 'user.reactivated', { status }, { status: m.status });
}

export function removeMember(membershipId: string, actorId: string) {
  const m = useAccessStore.getState().memberships.find((x) => x.id === membershipId)!;
  useAccessStore.setState((st) => ({
    memberships: st.memberships.filter((x) => x.id !== membershipId),
    sessions: st.sessions.map((s) => (s.userId === m.userId && s.orgId === m.orgId && !s.revokedAt ? { ...s, revokedAt: new Date().toISOString() } : s)),
  }));
  audit(m.orgId, actorId, 'membership', membershipId, 'user.removed', undefined, { userId: m.userId, roles: m.roleIds });
}

export function unlockUser(userId: string, orgId: string, actorId: string) {
  useAccessStore.getState().updateUser(userId, { status: 'ACTIVE', failedAttempts: 0 });
  const m = useAccessStore.getState().memberships.find((x) => x.userId === userId && x.orgId === orgId);
  if (m?.status === 'LOCKED') useAccessStore.getState().updateMembership(m.id, { status: 'ACTIVE' });
  audit(orgId, actorId, 'user', userId, 'user.unlocked');
}
