import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { createPre, payPreManual } from './buyingService';
import { act } from './workflowService';
import {
  allocateTopUp, bagsAt, createTransfer, createWarehouseExpense, payWarehouseExpenseManual, receiveInbound, repaymentExpected, requestAdjustment,
  reviewAdjustment, reviewAgentRepayment, scheduleCount, stockKg, submitAgentRepayment, submitCount,
} from './inventoryService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }) }));

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses, seeded: true });
  usePaymentStore.setState({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [], seeded: true });
  useSupportStore.setState({ providers: s.providers, requests: s.supportRequests, windows: s.recoveryWindows, recoveries: s.recoveryRequests, repayments: s.repayments, refunds: s.loanRefunds, legacy: s.legacyAllocations, seeded: true });
  useWarehouseStore.setState({ warehouses: s.warehouses, inbounds: s.inbounds, discrepancies: s.discrepancies, agentRepayments: s.agentRepayments, movements: s.movements, transfers: s.transfers, stockCounts: s.stockCounts, warehouseExpenses: s.warehouseExpenses, seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}

const W = () => useWarehouseStore.getState();
const wa = () => W().warehouses.find((w) => w.orgId === ORG.vitara && w.name.startsWith('Wa'))!;

describe('Journey 4: logistics to the warehouse', () => {
  beforeAll(load);
  let preId = '';
  let inboundId = '';
  let codes: string[] = [];

  it('Yaw submits a PRE with the bags scanned; Level 1 is automatic, then logistics, operations and finance approve', () => {
    const yaw = useAgentStore.getState().agents.find((a) => a.userId === 'u_yaw')!;
    const req = useBuyingStore.getState().requests.find((r) => r.agentId === yaw.id && r.status === 'FUNDS_RECEIVED')!;
    const reqPurchases = new Set(useBuyingStore.getState().purchases.filter((p) => p.requestId === req.id).map((p) => p.id));
    const bags = useBuyingStore.getState().bags.filter((b) => b.status === 'WITH_AGENT' && b.weightKg > 0 && b.purchaseIds.some((p) => reqPurchases.has(p))).slice(0, 6);
    expect(bags.length).toBeGreaterThanOrEqual(4);
    codes = bags.map((b) => b.code);
    const pre = createPre({ orgId: ORG.vitara, requestId: req.id, bags: codes.length, costDiscussed: true, lines: [{ expenseTypeId: 'ex_wh', quantity: codes.length, rateMinor: 600 }, { expenseTypeId: 'ex_load', quantity: codes.length, rateMinor: 200 }], bagCodes: codes, actorId: 'u_yaw', device: 'mobile' });
    preId = pre.id;
    expect(pre.status).toBe('LEVEL_1_APPROVED');
    for (const u of ['u_ibrahim', 'u_kwame', 'u_efua']) expect(act(ORG.vitara, 'preExpense', pre.id, 'APPROVE', u).ok).toBe(true);
    expect(useBuyingStore.getState().expenses.find((e) => e.id === pre.id)!.status).toBe('APPROVED');
  });

  it('paying the PRE creates the expected delivery at Wa with the bag list', () => {
    payPreManual(preId, 'slip.pdf', 'u_efua');
    const pre = useBuyingStore.getState().expenses.find((e) => e.id === preId)!;
    expect(pre.expectedDelivery?.inboundId).toBeTruthy();
    inboundId = pre.expectedDelivery!.inboundId!;
    const ib = W().inbounds.find((x) => x.id === inboundId)!;
    expect(ib.warehouseId).toBe(wa().id);
    expect(ib.status).toBe('PENDING');
    expect(ib.bags.map((b) => b.code)).toEqual(codes);
    expect(useBuyingStore.getState().bags.filter((b) => codes.includes(b.code)).every((b) => b.status === 'IN_TRANSIT')).toBe(true);
  });

  it('Sulemana receives: one bag missing, one 6% light → discrepancies; small loss written off automatically', () => {
    const ib = W().inbounds.find((x) => x.id === inboundId)!;
    const before = stockKg(ORG.vitara, wa().id);
    const [missing, light, tiny, ...rest] = ib.bags;
    const res = receiveInbound(inboundId, {
      bags: [
        { code: missing!.code, status: 'MISSING' },
        { code: light!.code, status: 'ORIGINAL', receivedKg: Math.round(light!.expectedKg * 0.94 * 10) / 10 },
        { code: tiny!.code, status: 'ORIGINAL', receivedKg: Math.round((tiny!.expectedKg - 0.1) * 10) / 10 },
        ...rest.map((b) => ({ code: b.code, status: 'ORIGINAL' as const, receivedKg: b.expectedKg })),
      ],
      actorId: 'u_sulemana', device: 'mobile',
    });
    expect(res.inbound.status).toBe('DISCREPANCY');
    const open = res.discrepancies.filter((d) => d.status === 'OPEN');
    expect(open.map((d) => d.type).sort()).toEqual(['MISSING', 'WEIGHT']);
    expect(res.autoWrittenOff).toHaveLength(1);
    expect(useBuyingStore.getState().bags.find((b) => b.code === missing!.code)!.status).toBe('MISSING');
    expect(stockKg(ORG.vitara, wa().id)).toBeCloseTo(before + res.inbound.receivedKg!, 1);
    expect(W().movements[0]!.after).toBeCloseTo(stockKg(ORG.vitara, wa().id), 1);
  });

  it('the agent owes lost kg at the purchase price plus the logistics share of the missing bag', () => {
    const exp = repaymentExpected(inboundId);
    expect(exp.lostKg).toBeGreaterThan(0);
    expect(exp.logistics.amountMinor).toBe(800);
    expect(exp.total.amountMinor).toBe(exp.produce.amountMinor + exp.logistics.amountMinor);
  });

  it('Yaw submits the repayment; finance approves; the discrepancies are paid by the agent', () => {
    const exp = repaymentExpected(inboundId);
    submitAgentRepayment(inboundId, { amountMinor: exp.total.amountMinor, method: 'MOMO', reference: 'MP123', proof: 'momo.jpg' }, 'u_yaw', 'mobile');
    expect(W().inbounds.find((x) => x.id === inboundId)!.status).toBe('REFUND_SUBMITTED');
    const rp = W().agentRepayments.find((x) => x.inboundId === inboundId)!;
    expect(reviewAgentRepayment(rp.id, { decision: 'PARTIAL', amountMinor: 1 }, 'u_efua')).toEqual({ ok: false, reason: 'reasonRequired' });
    expect(reviewAgentRepayment(rp.id, { decision: 'APPROVE' }, 'u_efua').ok).toBe(true);
    expect(W().inbounds.find((x) => x.id === inboundId)!.status).toBe('RESOLVED');
    expect(W().discrepancies.filter((d) => d.inboundId === inboundId && d.status !== 'AUTO_WRITTEN_OFF').every((d) => d.status === 'RESOLVED' && d.resolution?.type === 'PAID_BY_AGENT')).toBe(true);
  });
});

describe('inventory rules', () => {
  beforeAll(load);

  it('top-up weight goes to the oldest open weight discrepancies first', () => {
    const open = W().discrepancies.filter((d) => d.orgId === ORG.vitara && d.type === 'WEIGHT' && d.status === 'OPEN').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(open.length).toBeGreaterThan(0);
    const first = open[0]!;
    const res = allocateTopUp(ORG.vitara, first.agentId, first.warehouseId, 'VB999001', first.openKg + 0.1, 'u_sulemana');
    expect(res[0]!.discrepancyId).toBe(first.id);
    expect(W().discrepancies.find((d) => d.id === first.id)!.status).toBe('RESOLVED');
  });

  it('a transfer leaves the source and is received at the destination', () => {
    const src = wa();
    const dest = W().warehouses.find((w) => w.orgId === ORG.vitara && w.type === 'CENTRAL')!;
    const bags = bagsAt(ORG.vitara, src.id).slice(0, 5);
    const before = stockKg(ORG.vitara, src.id);
    const tr = createTransfer({ orgId: ORG.vitara, fromWarehouseId: src.id, kind: 'TRANSFER', toWarehouseId: dest.id, bagCodes: bags.map((b) => b.code), actorId: 'u_sulemana' });
    expect(stockKg(ORG.vitara, src.id)).toBeCloseTo(before - tr.sentKg, 1);
    const ib = W().inbounds.find((x) => x.id === tr.inboundId)!;
    const res = receiveInbound(ib.id, { bags: ib.bags.map((b) => ({ code: b.code, status: 'ORIGINAL', receivedKg: b.expectedKg })), actorId: 'u_adwoa' });
    expect(res.inbound.status).toBe('CONFIRMED');
    expect(W().transfers.find((x) => x.id === tr.id)!.status).toBe('TRANSFER_COMPLETE');
    expect(() => createTransfer({ orgId: ORG.vitara, fromWarehouseId: src.id, kind: 'TRANSFER', toWarehouseId: src.id, bagCodes: [bagsAt(ORG.vitara, src.id)[0]!.code], actorId: 'u_sulemana' })).toThrow('destination');
  });

  it('a count with a missing bag is inconsistent; the adjustment needs someone else to approve it', () => {
    const c = scheduleCount(ORG.vitara, wa().id, '2026-10-18', 'u_adwoa');
    const codes = bagsAt(ORG.vitara, wa().id).map((b) => b.code);
    const done = submitCount(c.id, { codes: codes.slice(1), photos: ['p.jpg'] }, 'u_sulemana', 'mobile');
    expect(done.status).toBe('INCONSISTENT');
    expect(done.missingCodes).toEqual([codes[0]]);
    requestAdjustment(c.id, 'Recounted twice', 'u_sulemana');
    expect(reviewAdjustment(c.id, true, 'u_sulemana').reason).toBe('sameUser');
    expect(reviewAdjustment(c.id, true, 'u_adwoa').ok).toBe(true);
    expect(useBuyingStore.getState().bags.find((b) => b.code === codes[0])!.status).toBe('MISSING');
    expect(W().stockCounts.find((x) => x.id === c.id)!.status).toBe('RECONCILED');
  });

  it('warehouse expenses go through four people, then pay line by line', () => {
    const e = createWarehouseExpense({ orgId: ORG.vitara, warehouseId: wa().id, actorId: 'u_sulemana', lines: [
      { typeId: 'wx_in', quantity: 40, rateMinor: 150, payee: { name: 'WA LOADERS', providerId: 'mtn_gh', number: '+233244000111' } },
      { typeId: 'wx_maint', quantity: 1, rateMinor: 40_000, payee: { name: 'SAAKA REPAIRS', providerId: 'mtn_gh', number: '+233244000222' } },
    ] });
    expect(e.status).toBe('PENDING');
    expect(act(ORG.vitara, 'warehouseExpense', e.id, 'APPROVE', 'u_sulemana').ok).toBe(false);
    for (const u of ['u_adwoa', 'u_ibrahim', 'u_kwame', 'u_efua']) expect(act(ORG.vitara, 'warehouseExpense', e.id, 'APPROVE', u).ok).toBe(true);
    expect(W().warehouseExpenses.find((x) => x.id === e.id)!.status).toBe('APPROVED');
    payWarehouseExpenseManual(e.id, [0], 'slip.pdf', 'u_efua');
    expect(W().warehouseExpenses.find((x) => x.id === e.id)!.paymentStatus).toBe('PARTIAL');
    payWarehouseExpenseManual(e.id, [1], 'slip.pdf', 'u_efua');
    expect(W().warehouseExpenses.find((x) => x.id === e.id)!.paymentStatus).toBe('FULL');
  });
});
