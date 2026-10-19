import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useDemoStore } from '@/stores/demoStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLoanStore } from '@/stores/loanStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { confirmFundsReceived, confirmRate, createPre, debtCheck, disburseMomo, reconSummary, recordPurchases, recordRefund, replaceBag, simulateAgentRequest, simulateAgentSync, updatePrice, writeOff } from './buyingService';
import { act } from './workflowService';

// The simulated provider succeeds immediately (failures come only from the demo switch).
vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }) }));

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, warehouses: s.warehouses, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useLoanStore.setState({ loans: s.loans, seeded: true } as never);
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, seeded: true });
  usePaymentStore.setState({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [], seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}

const req = (id: string) => useBuyingStore.getState().requests.find((r) => r.id === id)!;

describe('Journey 2 (web side): buy to pay', () => {
  beforeAll(load);
  let id = '';

  it('the agent submits a request; Kwame then Efua approve; the requester cannot approve', () => {
    const r = simulateAgentRequest(ORG.vitara, 'u_yaw')!;
    id = r.id;
    expect(r.status).toBe('PENDING');
    expect(r.number).toMatch(/^CS-/);
    expect(useNotificationStore.getState().notifications.some((n) => n.userId === 'u_kwame' && n.params.number === r.number)).toBe(true);
    expect(act(ORG.vitara, 'purchaseRequest', id, 'APPROVE', 'u_yaw').ok).toBe(false);
    expect(act(ORG.vitara, 'purchaseRequest', id, 'APPROVE', 'u_efua').ok).toBe(false);
    expect(act(ORG.vitara, 'purchaseRequest', id, 'APPROVE', 'u_kwame')).toEqual({ ok: true, status: 'MANAGEMENT_APPROVED' });
    expect(act(ORG.vitara, 'purchaseRequest', id, 'APPROVE', 'u_efua')).toEqual({ ok: true, status: 'FINANCE_APPROVED' });
    confirmRate(id, 'u_efua');
    expect(req(id).status).toBe('RATE_CONFIRMED');
  });

  it('the first payout fails (demo switch) and the retry succeeds', async () => {
    useDemoStore.getState().setFailNextPayout(true);
    const total = req(id).total.amountMinor;
    const failed = await disburseMomo(id, total, undefined, 'u_efua');
    expect(failed.status).toBe('FAILED');
    expect(req(id).disbursements).toHaveLength(0);
    const ok = await disburseMomo(id, total, undefined, 'u_efua');
    expect(ok.status).toBe('SUCCESSFUL');
    expect(req(id).status).toBe('FULL_DISBURSEMENT');
    expect(usePaymentStore.getState().payments.filter((p) => p.payableId === id).map((p) => p.status).sort()).toEqual(['FAILED', 'SUCCESSFUL']);
  });

  it('three offline purchases sync with a consolidated bag and a voice purchase, then auto-match with a small refund', () => {
    confirmFundsReceived(id, 'u_yaw');
    expect(req(id).status).toBe('FUNDS_RECEIVED');
    const { purchases, blocked } = simulateAgentSync(id);
    expect(blocked).toHaveLength(0);
    expect(purchases).toHaveLength(3);
    expect(purchases.every((p) => p.syncedFrom === 'MOBILE' && p.paymentStatus === 'PAID')).toBe(true);
    expect(purchases.some((p) => p.evidence.voiceNote)).toBe(true);
    expect(purchases.some((p) => p.consolidationRef)).toBe(true);
    const shared = useBuyingStore.getState().bags.find((b) => b.purchaseIds.length > 1 && b.purchaseIds.some((x) => purchases.some((p) => p.id === x)));
    expect(shared).toBeDefined();
    const r = req(id);
    const s = reconSummary(r, useBuyingStore.getState().purchases, useSettingsStore.getState().settings[ORG.vitara]!);
    expect(r.autoMatched).toBe(true);
    expect(r.reconciliationStatus).toBe('RECEIVE_REFUND');
    expect(s.gap).toBeGreaterThan(0);
    expect(s.gap / s.given).toBeLessThan(0.03);
    recordRefund(id, s.gap, 'MANUAL', 'u_efua', 'slip.jpg');
    expect(req(id).status).toBe('RECONCILED');
    expect(useActivityStore.getState().activity.filter((e) => e.entityId === id).map((e) => e.key)).toEqual(expect.arrayContaining(['request.created', 'request.payoutFailed', 'request.disbursedFull', 'request.fundsReceived', 'request.purchasesSynced', 'request.refunded', 'request.reconciled']));
  });
});

describe('buying rules', () => {
  beforeAll(load);

  it('a price above the list sends the request back for approval', () => {
    const r = useBuyingStore.getState().requests.find((x) => x.orgId === ORG.vitara && x.status === 'FINANCE_APPROVED')!;
    expect(updatePrice(r.id, r.listPrice.amountMinor + 100, 'Market moved', 'u_ama')).toBe('reapproval');
    expect(req(r.id).status).toBe('PRICE_UPDATE');
    expect(req(r.id).wf.currentStepId).toBe('mgmt');
  });

  it('Abena is blocked by her overdue loan; Kakao deducts instead', () => {
    const abena = useLoanStore.getState().loans[0]!.farmerId;
    expect(debtCheck(ORG.vitara, abena).blocked).toBe(true);
    const r = useBuyingStore.getState().requests.find((x) => x.orgId === ORG.vitara && x.status === 'FUNDS_RECEIVED')!;
    const res = recordPurchases(r.id, [{ farmerId: abena, quantity: 40 }], 'u_ama');
    expect(res.purchases).toHaveLength(0);
    expect(res.blocked).toHaveLength(1);
  });

  it('write-offs respect the company limit; replacing a bag keeps the log', () => {
    const r = useBuyingStore.getState().requests.find((x) => x.orgId === ORG.vitara && x.reconciliationStatus === 'RECEIVE_REFUND')!;
    expect(writeOff(r.id, 20_001, 'too much', 'u_efua')).toBe(false);
    expect(writeOff(r.id, 100, 'moisture', 'u_efua')).toBe(true);
    const bag = useBuyingStore.getState().bags.find((b) => b.orgId === ORG.vitara && b.status === 'WITH_AGENT')!;
    const fresh = replaceBag(bag.id, 'VIT-BAG-999999', bag.weightKg - 1.5, 'torn', 'u_ama');
    expect(useBuyingStore.getState().bags.find((b) => b.id === bag.id)!.status).toBe('REPLACED');
    expect(fresh.replacement).toMatchObject({ oldCode: bag.code, newCode: 'VIT-BAG-999999' });
    expect(useBuyingStore.getState().purchases.filter((p) => bag.purchaseIds.includes(p.id)).every((p) => p.bagCodes.includes('VIT-BAG-999999'))).toBe(true);
  });

  it('a PRE starts with the automatic level 1 and caps lines at the catalogue cap', () => {
    const r = useBuyingStore.getState().requests.find((x) => x.orgId === ORG.vitara && x.status === 'FUNDS_RECEIVED')!;
    const settings = useSettingsStore.getState().settings[ORG.vitara]!;
    const capped = { ...settings.expenseTypes[0]!, cap: { amountMinor: 5_000, currency: 'GHS' } };
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, [ORG.vitara]: { ...settings, expenseTypes: [capped, ...settings.expenseTypes.slice(1)] } } });
    const pre = createPre({ orgId: ORG.vitara, requestId: r.id, bags: 10, costDiscussed: true, lines: [{ expenseTypeId: capped.id, quantity: 1000, rateMinor: capped.cap!.amountMinor }], actorId: 'u_yaw' });
    expect(pre.status).toBe('LEVEL_1_APPROVED');
    expect(pre.total.amountMinor).toBe(capped.cap!.amountMinor);
  });
});
