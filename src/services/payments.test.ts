import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLoanStore } from '@/stores/loanStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { collectRefund } from './buyingService';
import { answerCollection, approveAndSend, checkLimits, initiate, pay, quote, reverse } from './paymentService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async (_n: string, name: string) => ({ name, match: true }) }));

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
const GHS = (major: number) => ({ amountMinor: major * 100, currency: 'GHS' });
const wallet = (providerId: string) => usePaymentStore.getState().wallets.find((w) => w.orgId === ORG.vitara && w.providerId === providerId)!;

describe('payments engine (PRD E1–E2)', () => {
  beforeAll(load);

  it('quotes fee, withdrawal charge, tax and extras', () => {
    const plain = quote(ORG.vitara, GHS(1000), 'mtn_gh');
    expect(plain.fee.amountMinor).toBe(1000);
    const gross = quote(ORG.vitara, GHS(1000), 'mtn_gh', { includeWithdrawal: true, extraIds: ['xc_transport'] });
    expect(gross.withdrawal.amountMinor).toBe(1000);
    expect(gross.total.amountMinor).toBe(100_000 + 1000 + gross.fee.amountMinor + 500);
  });

  it('a payment above the checker threshold waits; the maker cannot check it, another finance user can', async () => {
    const [p] = initiate({ orgId: ORG.vitara, type: 'AGENT_CASH_ADVANCE', payableId: 'x', payees: [{ name: 'YAW DARKO', number: '+233244000001', providerId: 'mtn_gh', amount: GHS(8000) }], actorId: 'u_efua' });
    expect(p!.status).toBe('AWAITING_CHECKER');
    expect(useNotificationStore.getState().notifications.some((n) => n.userId === 'u_ama' && n.key === 'paymentToCheck')).toBe(true);
    const own = await approveAndSend([p!.id], 'u_efua');
    expect(own.blocked).toEqual([p!.id]);
    const before = wallet('mtn_gh').balance.amountMinor;
    const res = await approveAndSend([p!.id], 'u_ama');
    expect(res.sent[0]!.status).toBe('SUCCESSFUL');
    expect(res.sent[0]!.approvedBy).toBe('u_ama');
    expect(wallet('mtn_gh').balance.amountMinor).toBe(before - res.sent[0]!.total.amountMinor);
    expect(reverse(p!.id, 'u_ama', 'Provider reversal')).toBe(true);
    expect(wallet('mtn_gh').balance.amountMinor).toBe(before);
  });

  it('blocks payments above the role limit or the wallet balance', () => {
    expect(checkLimits(ORG.vitara, 'u_efua', [{ providerId: 'mtn_gh', total: GHS(60_000) }])).toMatchObject({ ok: false, reason: 'perPayment' });
    expect(checkLimits(ORG.vitara, 'u_kwame', [{ providerId: 'mtn_gh', total: GHS(10) }])).toMatchObject({ ok: false, reason: 'permission' });
    const w = wallet('airteltigo_gh');
    expect(checkLimits(ORG.vitara, 'u_efua', [{ providerId: 'airteltigo_gh', total: { amountMinor: w.balance.amountMinor + 1, currency: 'GHS' } }])).toMatchObject({ ok: false, reason: 'balance' });
  });

  it('Journey 3: bulk pay 4 unpaid direct purchases of the ticket', async () => {
    const yaw = useAgentStore.getState().agents.find((a) => a.userId === 'u_yaw')!;
    const ticket = useBuyingStore.getState().requests.find((r) => r.agentId === yaw.id && r.status === 'TICKET_ACTIVATED')!;
    const unpaid = useBuyingStore.getState().purchases.filter((p) => p.requestId === ticket.id && p.paymentStatus === 'NOT_PAID');
    expect(unpaid).toHaveLength(4);
    const farmers = useFarmerStore.getState().farmers;
    const out = await pay({ orgId: ORG.vitara, type: 'BULK_FARMER_PURCHASE', payableId: ticket.id, actorId: 'u_efua', payees: unpaid.map((p) => {
      const f = farmers.find((x) => x.id === p.farmerId)!;
      return { name: `${f.firstName} ${f.lastName}`, number: f.phone, amount: p.paidToFarmer, payableId: p.id };
    }) });
    expect(out).toHaveLength(4);
    expect(new Set(out.map((p) => p.batchId)).size).toBe(1);
    expect(useBuyingStore.getState().purchases.filter((p) => unpaid.some((u) => u.id === p.id)).every((p) => p.paymentStatus === 'PAID')).toBe(true);
  });

  it('a refund collection is recorded when the agent approves it on the phone', () => {
    const r = useBuyingStore.getState().requests.find((x) => x.orgId === ORG.vitara && x.reconciliationStatus === 'RECEIVE_REFUND')!;
    const c = collectRefund(r.id, 5_000, 'u_efua');
    expect(c.status).toBe('PENDING');
    const agentUser = useAgentStore.getState().agents.find((a) => a.id === r.agentId)!.userId;
    expect(useNotificationStore.getState().notifications.some((n) => n.userId === agentUser && n.key === 'collectionRequested')).toBe(true);
    answerCollection(c.id, true, agentUser);
    const after = useBuyingStore.getState().requests.find((x) => x.id === r.id)!;
    expect(after.refunds?.at(-1)).toMatchObject({ method: 'MOMO_COLLECT', amount: { amountMinor: 5_000 } });
  });
});
