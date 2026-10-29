import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSeed } from '@/data/seed';
import { emptyDraft, TEMPLATE_COMMODITIES } from '@/data/templates/companyTemplates';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActivityStore } from '@/stores/activityStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSessionStore } from '@/stores/sessionStore';
import { acceptInvite, checkCredentials, checkInvite, checkResetToken, requestPasswordReset, resetPassword, ssoLookup } from './authService';
import { createCompany } from './companyService';

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, invites: s.invites, sessions: s.sessions, resetTokens: [], seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, leads: s.leads, grants: s.grants, seeded: true });
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  useActivityStore.setState({ audit: s.audit, activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}

describe('auth service', () => {
  beforeEach(load);

  it('counts failed attempts and locks after five', () => {
    const r = checkCredentials('kwame.asante@vitara.example', 'wrong');
    expect(r).toEqual({ status: 'invalid', attemptsLeft: 4 });
    for (let i = 0; i < 3; i++) checkCredentials('kwame.asante@vitara.example', 'wrong');
    expect(checkCredentials('kwame.asante@vitara.example', 'wrong').status).toBe('locked');
    expect(checkCredentials('kwame.asante@vitara.example', 'demo1234').status).toBe('locked');
  });

  it('routes to 2-step, company picker or straight in', () => {
    expect(checkCredentials('ama.mensah@vitara.example', 'demo1234').status).toBe('ok');
    expect(checkCredentials('efua.boateng@vitara.example', 'demo1234').status).toBe('twoStep');
    expect(checkCredentials('naa.lamptey@vitara.example', 'demo1234').status).toBe('chooseCompany');
    expect(checkCredentials('peter.kuuire@vitara.example', 'demo1234').status).toBe('locked');
  });

  it('finds SSO only for Vitara’s domain', () => {
    expect(ssoLookup('ibrahim.seidu@vitara.example')?.id).toBe('org_vitara');
    expect(ssoLookup('someone@kakao-ivoire.example')).toBeNull();
  });

  it('resets a password once with a valid token', () => {
    const token = requestPasswordReset('kojo.mensah@vitara.example')!;
    expect(useNotificationStore.getState().outbox[0]).toMatchObject({ channel: 'EMAIL', recipient: 'kojo.mensah@vitara.example' });
    expect(checkResetToken(token).ok).toBe(true);
    expect(resetPassword(token, 'NewPass2026').ok).toBe(true);
    expect(checkResetToken(token)).toEqual({ ok: false, reason: 'used' });
    expect(checkResetToken('expired')).toEqual({ ok: false, reason: 'expired' });
    expect(checkCredentials('kojo.mensah@vitara.example', 'NewPass2026').status).toBe('ok');
  });

  it('accepts a pending invite and rejects an expired one', () => {
    // Invite expiry is relative to when the seed was built, so check it on that day.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    expect(checkInvite('inv-kakao-expired')).toEqual({ ok: false, reason: 'expired' });
    const r = acceptInvite('inv-vitara-akosua', 'Akosua Dery', 'Akosua2026');
    expect(r.ok).toBe(true);
    const u = useAccessStore.getState().users.find((x) => x.email === 'akosua.dery@vitara.example')!;
    expect(u.status).toBe('ACTIVE');
    expect(useAccessStore.getState().memberships.find((m) => m.userId === u.id)?.status).toBe('ACTIVE');
    expect(useSessionStore.getState().userId).toBe(u.id);
    expect(checkInvite('inv-vitara-akosua')).toEqual({ ok: false, reason: 'used' });
  });

  afterEach(() => vi.useRealTimers());
});

describe('company service (journey 12)', () => {
  beforeEach(load);

  it('creates a company with settings, roles, admin invites and audit', () => {
    const { org, invites } = createCompany(
      { ...emptyDraft(), name: 'Ghana Cashew Exporters', legalName: 'Ghana Cashew Exporters Ltd', template: 'cashew', commodityIds: TEMPLATE_COMMODITIES.cashew, modules: ['buying', 'farmers'], admins: [{ name: 'Esi Mensah', email: 'esi@gce.example' }] },
      'u_benjamin',
      'WIZARD',
    );
    expect(org.code).toBe('GCE');
    expect(org.status).toBe('TRIAL');
    expect(org.onboarding).toMatchObject({ via: 'WIZARD', template: 'cashew', dismissed: false });
    expect(useSettingsStore.getState().settings[org.id]!.commodities.map((c) => c.id)).toEqual(['com_cashew']);
    expect(useAccessStore.getState().roles.filter((r) => r.orgId === org.id).length).toBeGreaterThan(10);
    expect(invites).toHaveLength(1);
    const esi = useAccessStore.getState().users.find((u) => u.email === 'esi@gce.example')!;
    expect(esi.status).toBe('INVITED');
    expect(checkCredentials('esi@gce.example', '').status).toBe('invited');
    expect(useActivityStore.getState().audit.slice(0, 2).map((a) => a.key).sort()).toEqual(['company.created', 'user.invited']);
    expect(useNotificationStore.getState().outbox.some((m) => m.templateId === 'invite' && m.recipient === 'esi@gce.example')).toBe(true);
  });
});
