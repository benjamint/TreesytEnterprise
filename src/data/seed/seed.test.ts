import { describe, expect, it } from 'vitest';
import { buildSeed, ORG } from '.';
import { canAct, type WorkflowRecord } from '@/engines/workflow';
import { buildLedger } from '@/engines/loans';
import { permissionsFor } from '@/engines/permissions';

const seed = buildSeed(new Date('2026-10-18T10:00:00Z'));
const of = <T extends { orgId: string }>(rows: T[], orgId: string) => rows.filter((r) => r.orgId === orgId);

describe('seed data (PRD 12)', () => {
  it('is deterministic', () => {
    const again = buildSeed(new Date('2026-10-18T10:00:00Z'));
    expect(again.farmers.slice(0, 5)).toEqual(seed.farmers.slice(0, 5));
    expect(again.payments.length).toBe(seed.payments.length);
  });

  it('has the Vitara volumes', () => {
    const v = ORG.vitara;
    expect(of(seed.communities, v)).toHaveLength(40);
    const farmers = of(seed.farmers, v);
    expect(farmers).toHaveLength(600);
    const women = farmers.filter((f) => f.gender === 'F').length / farmers.length;
    expect(women).toBeGreaterThan(0.55);
    expect(women).toBeLessThan(0.65);
    const groups = of(seed.groups, v);
    expect(groups).toHaveLength(45);
    expect(groups.filter((g) => g.type === 'VSLA')).toHaveLength(10);
    const agents = of(seed.agents, v);
    expect(agents).toHaveLength(24);
    expect(agents.filter((a) => a.agentTypeId === 'at_ceo')).toHaveLength(14);
    expect(agents.filter((a) => a.agentTypeId === 'at_cons')).toHaveLength(8);
    expect(agents.filter((a) => a.agentTypeId === 'at_wh')).toHaveLength(2);
    expect(of(seed.warehouses, v)).toHaveLength(3);
    expect(of(seed.requests, v)).toHaveLength(90);
    expect(of(seed.purchases, v)).toHaveLength(1200);
    expect(of(seed.expenses, v)).toHaveLength(300);
    expect(of(seed.aggregatorPurchases, v)).toHaveLength(15);
    expect(of(seed.suppliers, v)).toHaveLength(6);
    const payments = of(seed.payments, v);
    expect(payments.length).toBeGreaterThan(900);
    expect(payments.length).toBeLessThan(1100);
    const mtn = payments.filter((p) => p.providerId === 'mtn_gh').length / payments.length;
    expect(mtn).toBeGreaterThan(0.68);
    expect(mtn).toBeLessThan(0.82);
  });

  it('has the Kakao Ivoire volumes in XOF', () => {
    const k = ORG.kakao;
    expect(of(seed.communities, k)).toHaveLength(25);
    expect(of(seed.farmers, k)).toHaveLength(350);
    expect(of(seed.farmers, k)[0]!.farmerCode).toMatch(/^KI-[A-Z]{3}-\d{5}$/);
    expect(of(seed.requests, k)[0]!.number).toMatch(/^DA-\d{2}-\d{6}$/);
    expect(of(seed.payments, k).every((p) => p.amount.currency === 'XOF')).toBe(true);
  });

  it('every record belongs to a known company and ids are unique', () => {
    const orgIds = new Set(seed.orgs.map((o) => o.id));
    const collections = [seed.communities, seed.farmers, seed.groups, seed.agents, seed.requests, seed.purchases, seed.expenses, seed.payments, seed.bags, seed.nodes, seed.wallets];
    for (const rows of collections) {
      expect(rows.every((r) => orgIds.has(r.orgId))).toBe(true);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
    // Purchases only reference requests and farmers of the same company.
    const req = new Map(seed.requests.map((r) => [r.id, r.orgId]));
    const far = new Map(seed.farmers.map((f) => [f.id, f.orgId]));
    expect(seed.purchases.every((p) => req.get(p.requestId) === p.orgId && far.get(p.farmerId) === p.orgId)).toBe(true);
  });

  describe('fixed demo moments (PRD 12.5)', () => {
    it('a request 18% above list carries a HIGH risk flag', () => {
      const r = seed.requests.find((x) => x.riskFlags.some((f) => f.severity === 'HIGH' && f.key === 'priceAboveList'));
      expect(r?.variancePct).toBe(18);
      expect(r?.orgId).toBe(ORG.vitara);
    });

    it('Yaw Darko holds the most unreconciled cash, about GHS 12,400', () => {
      const held = new Map<string, number>();
      for (const r of seed.requests.filter((x) => x.fundsReceived && x.reconciliationStatus !== 'RECONCILED')) {
        const given = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
        const bought = seed.purchases.filter((p) => p.requestId === r.id).reduce((s, p) => s + p.amount.amountMinor, 0);
        held.set(r.agentId, (held.get(r.agentId) ?? 0) + given - bought);
      }
      const vitHeld = [...held.entries()].filter(([id]) => id.startsWith('vit_'));
      const top = vitHeld.sort((a, b) => b[1] - a[1])[0]!;
      expect(top[0]).toBe('vit_agt_u_yaw');
      expect(Math.abs(top[1] - 1_240_000)).toBeLessThan(5_000);
    });

    it('Abena Issah (WA-014-AI-0023, Daffiama) owes GHS 840 overdue', () => {
      const abena = seed.farmers.find((f) => f.farmerCode === 'WA-014-AI-0023')!;
      expect(`${abena.firstName} ${abena.lastName}`).toBe('Abena Issah');
      expect(seed.communities.find((c) => c.id === abena.communityId)!.name).toBe('Daffiama');
      const loan = seed.loans.find((l) => l.farmerId === abena.id)!;
      const ledger = buildLedger(loan.principal, seed.settings[ORG.vitara]!.loanTerms, loan.window,
        loan.repayments.map((r) => ({ date: r.date, amountMinor: r.amount.amountMinor, mode: r.mode })), '2026-10-18');
      expect(ledger.balance).toBe(84_000);
      expect(ledger.overdue).toBe(true);
    });

    it("Kwame has exactly five items waiting across three document types", () => {
      const ctx = { users: seed.users, memberships: seed.memberships, roles: seed.roles };
      const kwame = { id: 'u_kwame', roleIds: seed.memberships.find((m) => m.userId === 'u_kwame')!.roleIds, permissions: permissionsFor('u_kwame', ORG.vitara, ctx) };
      const s = seed.settings[ORG.vitara]!;
      const wf = (t: string) => s.workflows.find((w) => w.docType === t)!;
      const items = [
        ...of(seed.requests, ORG.vitara).filter((r) => canAct(r as unknown as WorkflowRecord, wf('purchaseRequest'), kwame)).map(() => 'pr'),
        ...of(seed.expenses, ORG.vitara).filter((r) => canAct(r as unknown as WorkflowRecord, wf('preExpense'), kwame)).map(() => 'pre'),
        ...of(seed.aggregatorPurchases, ORG.vitara).filter((r) => canAct(r as unknown as WorkflowRecord, wf('aggregatorPurchase'), kwame)).map(() => 'acs'),
      ];
      expect(items).toHaveLength(5);
      expect(new Set(items).size).toBe(3);
    });

    it('one payment is stuck in Unknown status', () => {
      expect(seed.payments.filter((p) => p.status === 'UNKNOWN')).toHaveLength(1);
    });

    it('farmer groups await a manual score review (one is the Journey 6 support scoring gate)', () => {
      const pending = of(seed.groups, ORG.vitara).filter((g) => g.scoreStatus === 'PENDING_REVIEW');
      expect(pending).toHaveLength(2);
      expect(pending.some((g) => g.name === 'Daffiama Farmers Cooperative')).toBe(true);
    });
  });
});
