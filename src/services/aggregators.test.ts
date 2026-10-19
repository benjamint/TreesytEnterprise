import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { aggResult, toCompany } from '@/engines/aggregators';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  acspreTypes, canEditAggExpense, createAggExpense, createAggregatorPurchase, createSupplier, decideSupplier, disburseAggregator, disburseAggregatorManual,
  markAggReconciled, recordAggRefund, recordDelivery, recordProof, remainingToPay,
} from './aggregatorService';
import { approveAndSend, pay } from './paymentService';
import { act } from './workflowService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }) }));

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, warehouses: s.warehouses, seeded: true } as never);
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses, seeded: true });
  usePaymentStore.setState({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [], seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}
const acs = (id: string) => useBuyingStore.getState().aggregatorPurchases.find((a) => a.id === id)!;
const V = ORG.vitara;

describe('Aggregator purchases: supplier → ACS → delivery → reconciled', () => {
  beforeAll(load);
  let supplierId = '';
  let id = '';

  it('a new supplier waits for approval; the creator cannot approve it; a block needs a reason', () => {
    const s = createSupplier(V, 'u_kwame', { name: 'Bole Shea Collectors', kind: 'COMPANY', phone: '+233244998877', address: 'Bole Market', payout: { method: 'MOMO', providerOrBank: 'mtn_gh', number: '+233244998877' } });
    supplierId = s.id;
    expect(s.status).toBe('PENDING_APPROVAL');
    expect(useNotificationStore.getState().notifications.some((n) => n.key === 'supplierApproval' && n.userId === 'u_ama')).toBe(true);
    expect(decideSupplier(supplierId, 'approve', 'u_kwame')).toEqual({ ok: false, reason: 'ownRecord' });
    expect(decideSupplier(supplierId, 'block', 'u_ama')).toEqual({ ok: false, reason: 'reasonRequired' });
  });

  it('creates the ACS (PO unique) and approves it through the workflow', () => {
    const taken = useBuyingStore.getState().aggregatorPurchases.find((a) => a.orgId === V)!.poNumber;
    expect(() => createAggregatorPurchase({ orgId: V, supplierId, poNumber: taken, commodityId: 'com_shea', plannedDate: '2026-10-25', expectedBags: 100, weightPerBagKg: 97, expectedKg: 9700, unitPriceMinor: 600, dealCurrency: 'GHS', exchangeRate: 1, includesPre: false, actorId: 'u_kwame' })).toThrow('poTaken');
    const a = createAggregatorPurchase({ orgId: V, supplierId, poNumber: 'PO-77001', commodityId: 'com_shea', plannedDate: '2026-10-25', expectedBags: 100, weightPerBagKg: 97, expectedKg: 9700, unitPriceMinor: 600, dealCurrency: 'GHS', exchangeRate: 1, includesPre: true, actorId: 'u_efua' });
    id = a.id;
    expect(a.number).toMatch(/^ACS-/);
    expect(a.total.amountMinor).toBe(600 * 9700);
    expect(a.status).toBe('PENDING');
    expect(act(V, 'aggregatorPurchase', id, 'APPROVE', 'u_efua').ok).toBe(false);
    expect(act(V, 'aggregatorPurchase', id, 'APPROVE', 'u_kwame')).toEqual({ ok: true, status: 'APPROVED' });
  });

  it('pays nothing until the supplier is approved; then part manually and the rest by mobile money, never more than the total', async () => {
    const total = acs(id).total.amountMinor;
    expect(disburseAggregatorManual(id, 1000, 'slip.jpg', 'u_efua')).toBe(false);
    await expect(disburseAggregator(id, 1000, 'u_efua')).rejects.toThrow('supplierNotApproved');
    expect(decideSupplier(supplierId, 'approve', 'u_ama').ok).toBe(true);
    expect(disburseAggregatorManual(id, total + 1, 'slip.jpg', 'u_efua')).toBe(false);
    expect(disburseAggregatorManual(id, total / 2, 'slip.jpg', 'u_efua')).toBe(true);
    expect(acs(id).status).toBe('PARTIALLY_DISBURSED');
    const p = await disburseAggregator(id, total, 'u_efua');
    expect(p.amount.amountMinor).toBe(total / 2);
    // Above the company's checker threshold: a second person approves it before it goes out.
    expect(p.status).toBe('AWAITING_CHECKER');
    expect(acs(id).status).toBe('PARTIALLY_DISBURSED');
    await approveAndSend([p.id], 'u_ama');
    expect(usePaymentStore.getState().payments.find((x) => x.id === p.id)!.status).toBe('SUCCESSFUL');
    expect(acs(id).status).toBe('FUNDS_DISBURSED');
    expect(remainingToPay(acs(id))).toBe(0);
  });

  it('loads the truck, records proof of delivery with a shortfall, and reconciles with a goods refund', () => {
    recordDelivery(id, { driver: 'Kofi Boadu', contact: '+233241112233', plate: 'NR 1180-19', bags: 100, kg: 9690, waybill: 'WB-1' }, 'u_kwame');
    expect(acs(id).orderStatus).toBe('IN_TRANSIT');
    recordProof(id, { customer: 'Vitara Central Warehouse, Tamale', bags: 96, kg: 9300, unitPrice: { amountMinor: 600, currency: 'GHS' } }, 'u_kwame');
    expect(acs(id).orderStatus).toBe('DELIVERED');
    expect(acs(id).paymentStatus).toBe('RECEIVE_REFUND');
    const r = aggResult(acs(id), useSettingsStore.getState().settings[V]!.buyingRules, 'GHS');
    expect(r.gap).toBe(400 * 600);
    expect(r.kg.variance).toBe(-400);
    expect(recordAggRefund(id, { kind: 'RECEIVE', method: 'GOODS', poNumber: 'PO-77001-B', bags: 4, kg: 400 }, 'u_efua')).toBe('RECONCILED');
    expect(acs(id).reconciledAt).toBeTruthy();
  });

  it('delivered more than paid: the supplier is refunded; within tolerance finance marks it reconciled', () => {
    const b = createAggregatorPurchase({ orgId: V, supplierId, poNumber: 'PO-77002', commodityId: 'com_shea', plannedDate: '2026-10-26', expectedBags: 10, weightPerBagKg: 100, expectedKg: 1000, unitPriceMinor: 600, dealCurrency: 'GHS', exchangeRate: 1, includesPre: false, actorId: 'u_efua' });
    act(V, 'aggregatorPurchase', b.id, 'APPROVE', 'u_kwame');
    disburseAggregatorManual(b.id, 600_000, 'slip.jpg', 'u_efua');
    recordDelivery(b.id, { driver: 'A', contact: '1', plate: 'P', bags: 10, kg: 1000 }, 'u_kwame');
    recordProof(b.id, { customer: 'C', bags: 10, kg: 1050, unitPrice: { amountMinor: 600, currency: 'GHS' } }, 'u_kwame');
    expect(acs(b.id).paymentStatus).toBe('REFUND_SUPPLIER');
    expect(recordAggRefund(b.id, { kind: 'SUPPLIER', method: 'MONEY', amount: { amountMinor: 30_000, currency: 'GHS' }, proof: 'slip.jpg' }, 'u_efua')).toBe('RECONCILED');

    const c = createAggregatorPurchase({ orgId: V, supplierId, poNumber: 'PO-77003', commodityId: 'com_shea', plannedDate: '2026-10-26', expectedBags: 10, weightPerBagKg: 100, expectedKg: 1000, unitPriceMinor: 600, dealCurrency: 'GHS', exchangeRate: 1, includesPre: false, actorId: 'u_efua' });
    act(V, 'aggregatorPurchase', c.id, 'APPROVE', 'u_kwame');
    disburseAggregatorManual(c.id, 600_000, 'slip.jpg', 'u_efua');
    recordDelivery(c.id, { driver: 'A', contact: '1', plate: 'P', bags: 10, kg: 1000 }, 'u_kwame');
    recordProof(c.id, { customer: 'C', bags: 10, kg: 999, unitPrice: { amountMinor: 600, currency: 'GHS' } }, 'u_kwame');
    expect(acs(c.id).paymentStatus).toBe('FULFILLED');
    markAggReconciled(c.id, 'u_efua');
    expect(acs(c.id).paymentStatus).toBe('RECONCILED');
  });

  it('aggregator expense (ACSPRE): catalogue lines with caps, two approvals, paid by mobile money, locked after approval', async () => {
    const settings = useSettingsStore.getState().settings[V]!;
    expect(acspreTypes(settings)).toHaveLength(40);
    const truck = acspreTypes(settings).find((x) => x.basis === 'PER_TRIP')!;
    const e = createAggExpense({ orgId: V, aggregatorPurchaseId: id, bags: 100, lines: [{ expenseTypeId: truck.id, quantity: 1, rateMinor: 50_000 }, { expenseTypeId: 'ex_load', quantity: 100, rateMinor: 200 }], payee: { name: 'SEIDU HAULAGE', providerId: 'mtn_gh', number: '+233244556677' }, actorId: 'u_ibrahim' });
    expect(e.number).toMatch(/^ACSPRE-/);
    expect(e.total.amountMinor).toBe(50_000 + 20_000);
    expect(canEditAggExpense(e)).toBe(true);
    expect(act(V, 'aggregatorExpense', e.id, 'APPROVE', 'u_kwame')).toEqual({ ok: true, status: 'OPS_APPROVED' });
    expect(act(V, 'aggregatorExpense', e.id, 'APPROVE', 'u_efua')).toEqual({ ok: true, status: 'APPROVED' });
    const done = useBuyingStore.getState().aggregatorExpenses.find((x) => x.id === e.id)!;
    expect(canEditAggExpense(done)).toBe(false);
    await pay({ orgId: V, type: 'AGGREGATOR_EXPENSE', payableId: e.id, payees: [{ ...done.payee, amount: done.total }], actorId: 'u_efua' });
    expect(useBuyingStore.getState().aggregatorExpenses.find((x) => x.id === e.id)!.paymentStatus).toBe('PAID');
  });

  it('converts deal currency to the company currency with the deal rate', () => {
    expect(toCompany({ amountMinor: 10_000, currency: 'USD' }, 15.2, 'GHS')).toEqual({ amountMinor: 152_000, currency: 'GHS' });
    expect(toCompany({ amountMinor: 1_000, currency: 'EUR' }, 655.957, 'XOF')).toEqual({ amountMinor: 6_560, currency: 'XOF' });
  });

  it('seeded orders are consistent: delivered ones carry proof and a computed result', () => {
    const settings = useSettingsStore.getState().settings[V]!;
    for (const a of useBuyingStore.getState().aggregatorPurchases.filter((x) => x.orgId === V && x.createdBy !== 'u_efua')) {
      if (a.orderStatus === 'DELIVERED') expect(a.paymentStatus).toBe(aggResult(a, settings.buyingRules, 'GHS').status);
      if (a.status === 'FUNDS_DISBURSED') expect(remainingToPay(a)).toBe(0);
      if (['PENDING', 'APPROVED', 'REJECTED'].includes(a.status)) expect(a.disbursements).toHaveLength(0);
    }
  });
});
