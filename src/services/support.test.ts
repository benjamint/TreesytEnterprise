import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLoanStore } from '@/stores/loanStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { debtCheck } from './buyingService';
import { act } from './workflowService';
import { approveSupport, confirmRecipients, createSupportRequest, disburseSupport, payableAmount, recordFulfilment, releaseScored } from './supportService';
import {
  activateRecovery, confirmCash, createRecoveryRequest, eligibleLoans, ledgerOf, migrateLegacy, quoteOf, recordRepayment, rejectRecovery, reviewRecovery, saveWindow, windowOverlap,
} from './recoveryService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }) }));

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, warehouses: s.warehouses, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useGroupStore.setState({ groups: s.groups, groupMemberships: s.groupMemberships, seeded: true } as never);
  useLoanStore.setState({ loans: s.loans, seeded: true } as never);
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses, seeded: true });
  usePaymentStore.setState({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [], seeded: true });
  useSupportStore.setState({ providers: s.providers, requests: s.supportRequests, windows: s.recoveryWindows, recoveries: s.recoveryRequests, repayments: s.repayments, refunds: s.loanRefunds, legacy: s.legacyAllocations, seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}

const V = ORG.vitara;
const req = (id: string) => useSupportStore.getState().requests.find((r) => r.id === id)!;
const rec = (id: string) => useSupportStore.getState().recoveries.find((r) => r.id === id)!;

describe('Journey 6: support → scoring gate → approval → confirmation → payout → fulfilment → recovery', () => {
  beforeAll(load);
  let id = '';
  let rrId = '';
  const group = () => useGroupStore.getState().groups.find((g) => g.name === 'Daffiama Farmers Cooperative')!;
  const abena = () => useFarmerStore.getState().farmers.find((f) => f.orgId === V && f.firstName === 'Abena' && f.lastName === 'Issah' && f.farmerCode.endsWith('-0023'))!;
  const yaw = () => useAgentStore.getState().agents.find((a) => a.userId === 'u_yaw')!;

  it('a group request waits at the scoring gate, then goes to approval once the group is scored', () => {
    const members = useGroupStore.getState().groupMemberships.filter((m) => m.groupId === group().id && m.farmerId !== abena().id).slice(0, 5);
    const r = createSupportRequest({
      orgId: V, groupId: group().id, agentId: yaw().id, primaryTypeId: 'st_cash', voice: { leaderSeconds: 20, witnessSeconds: 12 }, actorId: 'u_yaw', device: 'mobile',
      lines: members.map((m) => ({ farmerId: m.farmerId, typeId: 'st_cash', amountMinor: 50_000, abilityToPay: 'Produce at harvest' })),
    });
    id = r.id;
    expect(r.number).toMatch(/^PF-/);
    expect(r.status).toBe('PENDING_SCORING');
    useGroupStore.getState().saveGroup({ ...group(), scoreStatus: 'COMPLETED' });
    expect(releaseScored(V, group().id, 'u_ama')).toBe(1);
    expect(req(id).status).toBe('PENDING_APPROVAL');
  });

  it('approval per service sets the amount per farmer; the requester cannot approve', () => {
    expect(act(V, 'supportRequest', id, 'APPROVE', 'u_yaw').ok).toBe(false);
    const out = approveSupport(id, [{ typeId: 'st_cash', amountPerFarmer: { amountMinor: 60_000, currency: 'GHS' }, expectedKgPerFarmer: 120 }], 'u_kwame');
    expect(out).toEqual({ ok: true, status: 'AGENT_CONFIRMATION' });
    expect(req(id).lines.every((l) => l.amount.amountMinor === 60_000 && l.edits?.length === 1)).toBe(true);
    expect(req(id).total.amountMinor).toBe(300_000);
  });

  it('the agent confirms who turned up; MoMo to the group wallet opens a loan per paid farmer', async () => {
    const lines = req(id).lines;
    confirmRecipients(id, { present: lines.slice(0, 4).map((l) => l.farmerId), declined: [lines[4]!.farmerId] }, 'u_yaw');
    expect(req(id).status).toBe('PENDING_DISBURSEMENT');
    expect(req(id).lines.map((l) => l.status)).toEqual(['CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'DECLINED']);
    expect(payableAmount(req(id))).toBe(240_000);
    const [p] = await disburseSupport(id, 'u_efua', () => undefined);
    expect(p!.status).toBe('SUCCESSFUL');
    expect(p!.payee.number).toBe(group().wallet!.number);
    expect(req(id).status).toBe('DISBURSED');
    const loans = useLoanStore.getState().loans.filter((l) => l.supportRequestId === id);
    expect(loans).toHaveLength(4);
    const active = useSupportStore.getState().windows.find((w) => w.orgId === V && w.typeId === 'st_cash' && w.status === 'ACTIVE')!;
    expect(loans[0]!.window.end).toBe(active.end);
  });

  it('fulfilment audio per farmer completes the request', () => {
    for (const l of req(id).lines.filter((x) => x.status === 'PAID')) recordFulfilment(id, l.id, { audioSeconds: 14 }, 'u_yaw');
    expect(req(id).status).toBe('FULFILLED');
    expect(req(id).fulfilmentStatus).toBe('FULL');
  });

  it('recovery request → manager review → finance activation with a linked direct-payment request', () => {
    const win = useSupportStore.getState().windows.find((w) => w.orgId === V && w.typeId === 'st_cash' && w.status === 'ACTIVE')!;
    const loans = eligibleLoans(V, group().id);
    expect(loans.some((l) => l.farmerId === abena().id)).toBe(true);
    expect(loans.filter((l) => l.supportRequestId === id)).toHaveLength(4);
    const r = createRecoveryRequest({ orgId: V, groupId: group().id, windowId: win.id, agentId: yaw().id, loanIds: loans.map((l) => l.id), actorId: 'u_yaw', device: 'mobile' });
    rrId = r.id;
    expect(r.number).toMatch(/^RR-/);
    reviewRecovery(rrId, { commodityId: 'com_shea', unitPriceMinor: 500, excessPriceMinor: 520 }, 'u_kwame');
    expect(rec(rrId).status).toBe('FINANCE_REVIEW');
    expect(activateRecovery(rrId, { excessPriceMinor: 540 }, 'u_efua')).toEqual({ ok: false, reason: 'reasonRequired' });
    expect(activateRecovery(rrId, { excessPriceMinor: 540, reason: 'Market price rose this week' }, 'u_efua').ok).toBe(true);
    const pr = useBuyingStore.getState().requests.find((x) => x.id === rec(rrId).purchaseRequestId)!;
    expect(pr.sourcingModel).toBe('DIRECT_PAYMENT');
    expect(pr.status).toBe('TICKET_ACTIVATED');
    expect(pr.unitPrice.amountMinor).toBe(540);
  });

  it('a mixed repayment with excess purchase settles the loan; the cash part carries the penalty', () => {
    const loan = useLoanStore.getState().loans.find((l) => l.supportRequestId === id)!;
    const res = recordRepayment({ recoveryRequestId: rrId, loanId: loan.id, mode: 'MIXED', kg: 150, cashMinor: 10_000, excess: true, bagCode: 'VB700900', photo: 'cash.jpg', actorId: 'u_yaw', device: 'mobile' });
    expect(res.ledger.penaltyCharged).toBe(9_000); // 15% of the GHS 600 owed when the cash came in
    expect(res.settled).toBe(true);
    expect(res.excessKg).toBeGreaterThan(0);
    expect(res.overpaid).toBe(0);
    expect(res.repayment.excess?.purchaseId).toBeTruthy();
    expect(useBuyingStore.getState().purchases.find((p) => p.id === res.repayment.excess!.purchaseId)!.paymentStatus).toBe('NOT_PAID');
    expect(rec(rrId).status).toBe('PARTIALLY_RECOVERED');
    expect(rejectRecovery(rrId, 'too late', 'u_kwame')).toBe(false);
    confirmCash(res.repayment.id, 'u_efua');
    expect(useSupportStore.getState().repayments.find((x) => x.id === res.repayment.id)!.receipt.status).toBe('CONFIRMED');
  });

  it('Abena is blocked by an overdue loan, then unblocked once settled in produce; older loans carry interest', () => {
    expect(debtCheck(V, abena().id).blocked).toBe(true);
    const loan = useLoanStore.getState().loans.find((l) => l.farmerId === abena().id)!;
    expect(ledgerOf(loan).overdue).toBe(true);
    const old = useLoanStore.getState().loans.filter((l) => l.orgId === V && l.status === 'ACTIVE' && l.window.end < '2026-09-01');
    expect(old.some((l) => ledgerOf(l).interestCharged > 0)).toBe(true);
    const q = quoteOf(loan, 'produce', new Date(), { amountMinor: 500, currency: 'GHS' });
    const res = recordRepayment({ recoveryRequestId: rrId, loanId: loan.id, mode: 'PRODUCE', kg: q.volumeKg!, actorId: 'u_yaw' });
    expect(res.settled).toBe(true);
    expect(debtCheck(V, abena().id).blocked).toBe(false);
  });

  it('windows of one programme cannot overlap; legacy allocations migrate to a loan once', () => {
    const w = useSupportStore.getState().windows.find((x) => x.orgId === V && x.status === 'ACTIVE')!;
    expect(windowOverlap(V, { typeId: w.typeId, start: w.start, end: w.end })).toBeTruthy();
    expect(() => saveWindow(V, 'u_efua', { name: 'Overlap', typeId: w.typeId, season: '2026', commodityId: 'com_shea', start: w.start, end: w.end, status: 'DRAFT', reminders: { sms: false, push: false } })).toThrow('windowOverlap');
    const legacy = useSupportStore.getState().legacy.find((x) => x.orgId === V && x.status !== 'FULLY_PAID')!;
    const loan = migrateLegacy(legacy.id, 'u_efua');
    expect(loan?.legacyAllocationId).toBe(legacy.id);
    expect(migrateLegacy(legacy.id, 'u_efua')).toBeNull();
  });
});
