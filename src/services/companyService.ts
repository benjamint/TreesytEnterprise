import type { Invite, Membership, Organisation, User } from '@/types';
import { uid } from '@/lib/utils';
import i18n from '@/i18n';
import { buildCompanySettings, type CompanyDraft } from '@/data/templates/companyTemplates';
import { rolesFor } from '@/data/seed/platform';
import { roleId } from '@/data/seed/templates';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useDemoStore } from '@/stores/demoStore';
import { sendEmail } from './emailGateway';

// Brand colours for new companies: never a status hue (red/amber/blue are reserved for state).
const PALETTE = ['#14583F', '#1F4E79', '#7A3E12', '#0F6E6E', '#5B3FA0', '#2C5282', '#6B4E16', '#3D6B2F'];

function codeFor(name: string, taken: Set<string>): string {
  const base = name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join('').replace(/[^A-Z]/g, '').slice(0, 3) || 'CO';
  let code = base;
  let i = 2;
  while (taken.has(code)) code = `${base}${i++}`;
  return code;
}

/**
 * Create a company from the wizard or sign-up (PRD A1, A3): organisation, settings from the chosen
 * template, roles copied from the role templates, admin invites (emails go to the outbox) and audit.
 */
export function createCompany(d: CompanyDraft, actorId: string, via: 'WIZARD' | 'SIGNUP'): { org: Organisation; invites: Invite[] } {
  const platform = usePlatformStore.getState();
  const code = codeFor(d.name, new Set(platform.orgs.map((o) => o.code)));
  const orgId = `org_${code.toLowerCase()}_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const org: Organisation = {
    id: orgId, code, name: d.name.trim(), legalName: (d.legalName || d.name).trim(), type: d.type, countries: d.countries,
    currency: d.currency, locale: `${d.language}-${d.countries[0] ?? 'GH'}`, language: d.language, languages: [...new Set([d.language, 'en' as const])],
    timezone: d.timezone, weekStart: d.weekStart, planId: d.planId, status: 'TRIAL', createdAt: now,
    branding: { primaryColor: PALETTE[platform.orgs.length % PALETTE.length]!, logoText: code.slice(0, 2), senderName: d.name.trim(), signatureName: i18n.t('wizard.defaultSignature', { lng: d.language }) },
    onboarding: { via, template: d.template, dismissed: false, done: [], description: d.description || undefined },
  };
  platform.addOrg(org);
  useSettingsStore.getState().addSettings(buildCompanySettings(orgId, d));
  const access = useAccessStore.getState();
  access.addRoles(rolesFor(orgId, d.type === 'BUYER' ? 'buyer' : 'supplier'));
  const audit = useActivityStore.getState().addAudit;
  audit({ id: uid('aud'), orgId, actorId, entity: 'organisation', entityId: orgId, key: 'company.created', after: { name: org.name, template: d.template, plan: d.planId }, at: now });

  const invites: Invite[] = [];
  for (const a of d.admins.filter((x) => x.email.trim())) {
    const email = a.email.trim().toLowerCase();
    let user = useAccessStore.getState().users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      user = {
        id: uid('u'), name: a.name.trim() || email, email, phone: '', language: d.language, status: 'INVITED', avatarColor: PALETTE[(invites.length + 3) % PALETTE.length]!,
        password: '', twoFactor: { enabled: false, method: 'APP', backupCodes: [] }, failedAttempts: 0, trustedDevices: [],
      } satisfies User;
      access.addUser(user);
    }
    const membership: Membership = { id: `mem_${user.id}_${orgId}`, userId: user.id, orgId, roleIds: [roleId(orgId, 'companyAdmin')], status: 'INVITED' };
    access.addMembership(membership);
    const invite: Invite = {
      id: uid('inv'), token: uid('inv'), orgId, email, name: a.name.trim() || undefined, roleIds: membership.roleIds, invitedBy: actorId,
      createdAt: now, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), status: 'PENDING',
    };
    access.addInvite(invite);
    invites.push(invite);
    const link = `${window.location.origin}/accept-invite?token=${invite.token}`;
    const lng = d.language;
    sendEmail({ orgId, to: email, templateId: 'invite', language: lng, subject: i18n.t('email.invite.subject', { lng, company: org.name }), body: i18n.t('email.invite.body', { lng, name: a.name.split(' ')[0] || '', company: org.name, link }) });
    useDemoStore.getState().pushLink({ label: 'invite', to: email, href: `/accept-invite?token=${invite.token}` });
    audit({ id: uid('aud'), orgId, actorId, entity: 'invite', entityId: invite.id, key: 'user.invited', after: { email }, at: now });
  }
  return { org, invites };
}

/** Mark a setup-checklist step as done (for steps that can't be detected from data). */
export function completeChecklistStep(orgId: string, step: string) {
  const org = usePlatformStore.getState().orgs.find((o) => o.id === orgId);
  if (!org?.onboarding || org.onboarding.done.includes(step)) return;
  usePlatformStore.getState().updateOrg(orgId, { onboarding: { ...org.onboarding, done: [...org.onboarding.done, step] } });
}

export function setCompanyStatus(orgId: string, status: Organisation['status'], actorId: string) {
  const org = usePlatformStore.getState().orgs.find((o) => o.id === orgId)!;
  usePlatformStore.getState().updateOrg(orgId, { status });
  useActivityStore.getState().addAudit({ id: uid('aud'), orgId, actorId, entity: 'organisation', entityId: orgId, key: status === 'SUSPENDED' ? 'company.suspended' : 'company.reactivated', before: { status: org.status }, after: { status }, at: new Date().toISOString() });
}

export function changePlan(orgId: string, planId: string, actorId: string) {
  const platform = usePlatformStore.getState();
  const org = platform.orgs.find((o) => o.id === orgId)!;
  const name = (id: string) => platform.plans.find((p) => p.id === id)?.name;
  platform.updateOrg(orgId, { planId });
  useActivityStore.getState().addAudit({ id: uid('aud'), orgId, actorId, entity: 'organisation', entityId: orgId, key: 'company.planChanged', before: { plan: name(org.planId) }, after: { plan: name(planId) }, at: new Date().toISOString() });
}
