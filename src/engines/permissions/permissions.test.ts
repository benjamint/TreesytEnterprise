import { describe, expect, it } from 'vitest';
import { can, expandPermissions, hasPermission, PERMISSIONS, ROLE_TEMPLATES } from '.';

describe('permissions engine', () => {
  it('matches wildcards and denials', () => {
    expect(hasPermission(['*'], 'farmers.view')).toBe(true);
    expect(hasPermission(['farmers.*'], 'farmers.edit')).toBe(true);
    expect(hasPermission(['*.view'], 'payments.view')).toBe(true);
    expect(hasPermission(['*.view'], 'payments.initiate')).toBe(false);
    expect(hasPermission(['*', '!platform.*'], 'platform.view')).toBe(false);
  });

  it('has a catalogue of at least 99 permissions', () => {
    expect(PERMISSIONS.length).toBeGreaterThanOrEqual(99);
  });

  it('keeps finance and operations approvals separate', () => {
    const ops = expandPermissions(ROLE_TEMPLATES.operationsManager.permissions);
    const fin = expandPermissions(ROLE_TEMPLATES.financeOfficer.permissions);
    expect(ops).toContain('purchaseRequests.approveManagement');
    expect(ops).not.toContain('purchaseRequests.approveFinance');
    expect(fin).toContain('purchaseRequests.approveFinance');
    expect(fin).not.toContain('purchaseRequests.approveManagement');
  });

  it('scopes permissions to the company of the membership and the plan ceiling', () => {
    const ctx = {
      users: [{ id: 'u1', name: 'A', email: '', phone: '', language: 'en' as const, status: 'ACTIVE' as const, avatarColor: '' }],
      memberships: [{ id: 'm1', userId: 'u1', orgId: 'org_a', roleIds: ['r1'], status: 'ACTIVE' as const }],
      roles: [{ id: 'r1', orgId: 'org_a', template: 'financeOfficer' as const, permissions: ['payments.*'] }],
      ceilings: { org_a: ['*', '!payments.reverse'] },
    };
    expect(can('u1', 'payments.initiate', 'org_a', ctx)).toBe(true);
    expect(can('u1', 'payments.initiate', 'org_b', ctx)).toBe(false);
    expect(can('u1', 'payments.reverse', 'org_a', ctx)).toBe(false);
  });
});
