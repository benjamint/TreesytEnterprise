import type { AggDelivery, AggProof, AggRefund, AggregatorExpense, AggregatorPurchase, Money, OrgSettings, Payment, Supplier, WorkflowDefinition } from '@/types';
import { canAct, start, type WorkflowRecord } from '@/engines/workflow';
import { aggResult, toCompany } from '@/engines/aggregators';
import { makeEvent } from '@/engines/activity';
import { can } from '@/engines/permissions';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { pay, registerPayable } from './paymentService';
import { workflowUser } from './workflowService';

/**
 * Aggregator purchases (PRD D4): supplier registry with approval, purchase orders (ACS) approved
 * through the workflow engine, disbursement (mobile money / bank or manual proof, never more than
 * the total), truck loading → proof of delivery → result with tolerance → refunds → reconciled,
 * and aggregator logistics expenses (ACSPRE).
 */

const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const currencyOf = (orgId: string) => usePlatformStore.getState().orgs.find((o) => o.id === orgId)?.currency ?? 'GHS';
const now = () => new Date().toISOString();
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string) =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device: 'web' }));
const acsOf = (id: string) => useBuyingStore.getState().aggregatorPurchases.find((a) => a.id === id)!;
const preOf = (id: string) => useBuyingStore.getState().aggregatorExpenses.find((e) => e.id === id)!;
const supplierOf = (id: string) => useBuyingStore.getState().suppliers.find((s) => s.id === id)!;

/** Notify everyone in the company who holds a permission (or can act on a workflow record). */
function notifyWho(orgId: string, test: (userId: string) => boolean, n: { key: string; params: Record<string, unknown>; link: string; kind?: 'APPROVAL' | 'PAYMENT' | 'ALERT' }, exceptId?: string) {
  const at = now();
  const { users, memberships } = useAccessStore.getState();
  for (const m of memberships.filter((x) => x.orgId === orgId && x.status === 'ACTIVE' && x.userId !== exceptId)) {
    if (!users.some((u) => u.id === m.userId) || !test(m.userId)) continue;
    useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId: m.userId, kind: n.kind ?? 'ALERT', key: n.key, params: n.params, link: n.link, read: false, at });
  }
}
const holds = (orgId: string, permission: string) => (userId: string) => {
  const { users, memberships, roles } = useAccessStore.getState();
  return can(userId, permission, orgId, { users, memberships, roles });
};
function notifyApprovers(orgId: string, record: WorkflowRecord, def: WorkflowDefinition, docType: string, number: string, link: string, exceptId?: string) {
  notifyWho(orgId, (u) => canAct(record, def, workflowUser(u, orgId)), { key: 'approvalNeeded', params: { docType, number }, link, kind: 'APPROVAL' }, exceptId);
}

// ---------------------------------------------------------------- Suppliers

export interface SupplierInput {
  name: string; kind: Supplier['kind']; phone: string; address: string; contactPerson?: string; email?: string;
  idType?: string; idNumber?: string; payout: Supplier['payout'];
}

/** Trim text fields; blank optional fields are left out. */
function clean<T extends Partial<SupplierInput>>(v: T): T {
  const out = { ...v } as Record<string, unknown>;
  for (const [k, x] of Object.entries(out)) if (typeof x === 'string') out[k] = x.trim() || undefined;
  return out as T;
}

/** New suppliers wait for approval before they can be used on a purchase order. */
export function createSupplier(orgId: string, actorId: string, input: SupplierInput): Supplier {
  const at = now();
  const s: Supplier = { id: uid('sup'), orgId, createdAt: at, updatedAt: at, createdBy: actorId, status: 'PENDING_APPROVAL', ...clean(input) };
  useBuyingStore.getState().saveSupplier(s);
  log(orgId, 'supplier', s.id, 'supplier.created', { name: s.name }, actorId);
  notifyWho(orgId, holds(orgId, 'aggregators.approveSupplier'), { key: 'supplierApproval', params: { name: s.name }, link: `/app/aggregators/suppliers?open=${s.id}`, kind: 'APPROVAL' }, actorId);
  return s;
}

export function updateSupplier(id: string, patch: Partial<SupplierInput>, actorId: string) {
  const s = supplierOf(id);
  useBuyingStore.getState().updateSupplier(id, clean(patch));
  log(s.orgId, 'supplier', id, patch.payout ? 'supplier.payoutChanged' : 'supplier.updated', { name: s.name }, actorId);
}

export type SupplierDecision = 'approve' | 'block' | 'unblock';
/** Approve a pending supplier, block one (with a reason), or lift a block. The creator can't approve their own. */
export function decideSupplier(id: string, decision: SupplierDecision, actorId: string, reason?: string): { ok: boolean; reason?: 'ownRecord' | 'reasonRequired' } {
  const s = supplierOf(id);
  if (decision === 'approve' && s.createdBy === actorId) return { ok: false, reason: 'ownRecord' };
  if (decision === 'block' && !reason?.trim()) return { ok: false, reason: 'reasonRequired' };
  const at = now();
  const patch: Partial<Supplier> = decision === 'block' ? { status: 'BLOCKED', blockedReason: reason!.trim() } : { status: 'APPROVED', approvedBy: actorId, approvedAt: s.approvedAt && decision === 'unblock' ? s.approvedAt : at, blockedReason: undefined };
  useBuyingStore.getState().updateSupplier(id, patch);
  log(s.orgId, 'supplier', id, `supplier.${decision === 'approve' ? 'approved' : decision === 'block' ? 'blocked' : 'unblocked'}`, { name: s.name, reason: reason ?? '' }, actorId);
  return { ok: true };
}

// ---------------------------------------------------------------- Purchase orders (ACS)

export const poTaken = (orgId: string, po: string, exceptId?: string) =>
  useBuyingStore.getState().aggregatorPurchases.some((a) => a.orgId === orgId && a.id !== exceptId && a.poNumber.trim().toLowerCase() === po.trim().toLowerCase());

/** Price per kg from the company price list for a commodity (first zone that lists it), in the company currency. */
export function aggListPrice(orgId: string, commodityId: string): Money | undefined {
  return settingsOf(orgId).priceList.find((p) => p.commodityId === commodityId)?.price;
}

export interface NewAggregatorPurchase {
  orgId: string; supplierId: string; poNumber: string; commodityId: string; plannedDate: string; expectedBags: number; weightPerBagKg: number;
  expectedKg: number; unitPriceMinor: number; dealCurrency: string; exchangeRate: number; includesPre: boolean; overrideReason?: string;
  poFile?: string; weighbridgeFile?: string; actorId: string;
}

export function createAggregatorPurchase(input: NewAggregatorPurchase): AggregatorPurchase {
  const { orgId } = input;
  const settings = settingsOf(orgId);
  if (poTaken(orgId, input.poNumber)) throw new Error('poTaken');
  // A supplier created inline can be used straight away; nothing is paid until it is approved.
  if (supplierOf(input.supplierId).status === 'BLOCKED') throw new Error('supplierBlocked');
  const def = settings.workflows.find((w) => w.docType === 'aggregatorPurchase')!;
  const company = currencyOf(orgId);
  const list = aggListPrice(orgId, input.commodityId);
  const unitPrice: Money = { amountMinor: input.unitPriceMinor, currency: input.dealCurrency };
  const at = now();
  const base = {
    id: uid('acs'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: useSettingsStore.getState().issueNumber(orgId, 'aggregatorPurchase', { date: new Date() }),
    poNumber: input.poNumber.trim(), supplierId: input.supplierId, commodityId: input.commodityId, plannedDate: input.plannedDate, weightPerBagKg: input.weightPerBagKg,
    expectedBags: input.expectedBags, expectedKg: input.expectedKg, unitPrice, total: { amountMinor: Math.round(input.unitPriceMinor * input.expectedKg), currency: input.dealCurrency },
    dealCurrency: input.dealCurrency, exchangeRate: input.dealCurrency === company ? 1 : input.exchangeRate, includesPre: input.includesPre,
    listPrice: list && input.dealCurrency !== company ? toCompany(list, 1 / input.exchangeRate, input.dealCurrency) : list, overrideReason: input.overrideReason?.trim() || undefined,
    poFile: input.poFile, weighbridgeFile: input.weighbridgeFile, disbursements: [], orderStatus: 'NONE' as const, paymentStatus: 'NONE' as const,
  };
  const started = start(def, base, at);
  const acs = started.record as unknown as AggregatorPurchase;
  useBuyingStore.getState().saveAggregatorPurchase(acs);
  log(orgId, 'aggregatorPurchase', acs.id, 'acs.created', { number: acs.number, po: acs.poNumber, total: acs.total }, input.actorId);
  for (const e of started.events) log(orgId, 'aggregatorPurchase', acs.id, e.key, e.params, e.key === 'workflow.autoApproved' ? 'system' : input.actorId);
  notifyApprovers(orgId, acs as unknown as WorkflowRecord, def, 'aggregatorPurchase', acs.number, `/app/aggregators?open=${acs.id}`, input.actorId);
  return acs;
}

/** What is still payable to the supplier, in the company currency. */
export function remainingToPay(a: AggregatorPurchase): number {
  return aggResult(a, settingsOf(a.orgId).buyingRules, currencyOf(a.orgId)).remainingToPay;
}

export const supplierApproved = (a: Pick<AggregatorPurchase, 'supplierId'>) => supplierOf(a.supplierId)?.status === 'APPROVED';
export const canDisburse = (a: AggregatorPurchase) => ['APPROVED', 'PARTIALLY_DISBURSED'].includes(a.status) && remainingToPay(a) > 0;

/** The supplier's payout as a payee line for the pay dialog (bank payouts go through the bank provider). */
export function supplierPayee(a: Pick<AggregatorPurchase, 'orgId' | 'supplierId'>, amount: Money) {
  const s = supplierOf(a.supplierId);
  const bank = settingsOf(a.orgId).paymentProviders.find((p) => p.kind === 'BANK' && p.enabled);
  return { name: s.payout.accountName ?? s.name.toUpperCase(), number: s.payout.number, providerId: s.payout.method === 'BANK' ? bank?.id : s.payout.providerOrBank, amount };
}

function afterAggDisbursement(id: string, amount: Money, method: 'MOMO' | 'MANUAL', actorId: string, paymentId?: string, proof?: string) {
  const a = acsOf(id);
  const disbursements = [...a.disbursements, { id: uid('dsb'), amount, method, at: now(), by: actorId, paymentId }];
  const next = { ...a, disbursements };
  const full = remainingToPay(next) <= 0;
  useBuyingStore.getState().updateAggregatorPurchase(id, { disbursements, status: full ? 'FUNDS_DISBURSED' : 'PARTIALLY_DISBURSED' });
  log(a.orgId, 'aggregatorPurchase', id, full ? 'acs.disbursedFull' : 'acs.disbursedPartial', { amount, method }, actorId);
  if (proof) log(a.orgId, 'aggregatorPurchase', id, 'acs.manualProof', { proof }, actorId);
  refreshResult(id);
}

/** Pay the supplier by mobile money or bank; the cumulative amount can't exceed the total. */
export async function disburseAggregator(id: string, amountMinor: number, actorId: string): Promise<Payment> {
  const a = acsOf(id);
  if (!supplierApproved(a)) throw new Error('supplierNotApproved');
  const amount = { amountMinor: Math.min(amountMinor, remainingToPay(a)), currency: currencyOf(a.orgId) };
  const [p] = await pay({ orgId: a.orgId, type: 'AGGREGATOR_PURCHASE', payableId: a.id, payees: [supplierPayee(a, amount)], actorId });
  return p!;
}

export function disburseAggregatorManual(id: string, amountMinor: number, proof: string, actorId: string): boolean {
  const a = acsOf(id);
  if (!supplierApproved(a) || amountMinor <= 0 || amountMinor > remainingToPay(a)) return false;
  afterAggDisbursement(id, { amountMinor, currency: currencyOf(a.orgId) }, 'MANUAL', actorId, undefined, proof);
  return true;
}

// ---------------------------------------------------------------- Delivery & reconciliation

export const canLoad = (a: AggregatorPurchase) => ['APPROVED', 'PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'].includes(a.status) && a.orderStatus === 'NONE';

export function recordDelivery(id: string, d: Omit<AggDelivery, 'at' | 'by'>, actorId: string) {
  const a = acsOf(id);
  useBuyingStore.getState().updateAggregatorPurchase(id, { delivery: { ...d, at: now(), by: actorId }, orderStatus: 'IN_TRANSIT' });
  log(a.orgId, 'aggregatorPurchase', id, 'acs.inTransit', { bags: d.bags, kg: d.kg, plate: d.plate, driver: d.driver }, actorId);
}

export function recordProof(id: string, p: Omit<AggProof, 'at' | 'by'>, actorId: string) {
  const a = acsOf(id);
  useBuyingStore.getState().updateAggregatorPurchase(id, { proof: { ...p, at: now(), by: actorId }, orderStatus: 'DELIVERED' });
  log(a.orgId, 'aggregatorPurchase', id, 'acs.delivered', { bags: p.bags, kg: p.kg, customer: p.customer }, actorId);
  const status = refreshResult(id);
  notifyWho(a.orgId, holds(a.orgId, 'aggregators.reconcile'), { key: 'acsDelivered', params: { number: a.number, status }, link: `/app/aggregators?open=${id}`, kind: 'ALERT' }, actorId);
}

/** Recompute the payment status from money and volume; closing the gap with a refund reconciles it. */
function refreshResult(id: string): AggregatorPurchase['paymentStatus'] {
  const a = acsOf(id);
  if (!a.proof) return a.paymentStatus;
  const r = aggResult(a, settingsOf(a.orgId).buyingRules, currencyOf(a.orgId));
  const patch: Partial<AggregatorPurchase> = { paymentStatus: r.status };
  if (r.status === 'RECONCILED' && !a.reconciledAt) { patch.reconciledAt = now(); patch.reconciledBy = 'system'; }
  useBuyingStore.getState().updateAggregatorPurchase(id, patch);
  if (r.status !== a.paymentStatus) log(a.orgId, 'aggregatorPurchase', id, 'acs.result', { status: r.status, gap: { amountMinor: r.gap, currency: r.currency } }, 'system');
  return r.status;
}

export function recordAggRefund(id: string, refund: Omit<AggRefund, 'id' | 'at' | 'by'>, actorId: string) {
  const a = acsOf(id);
  const item: AggRefund = { ...refund, id: uid('rf'), at: now(), by: actorId };
  useBuyingStore.getState().updateAggregatorPurchase(id, (x) => ({ refunds: [...(x.refunds ?? []), item] }));
  log(a.orgId, 'aggregatorPurchase', id, refund.kind === 'RECEIVE' ? (refund.method === 'GOODS' ? 'acs.refundGoods' : 'acs.refundReceived') : 'acs.supplierRefunded',
    { amount: refund.amount ?? '', kg: refund.kg ?? 0, po: refund.poNumber ?? '' }, actorId);
  return refreshResult(id);
}

/** Pay what the company still owes the supplier by mobile money (or bank). */
export async function refundSupplierMomo(id: string, amountMinor: number, actorId: string): Promise<Payment> {
  const a = acsOf(id);
  const amount = { amountMinor, currency: currencyOf(a.orgId) };
  const [p] = await pay({ orgId: a.orgId, type: 'AGGREGATOR_PURCHASE', payableId: a.id, payees: [supplierPayee(a, amount)], actorId, meta: { kind: 'refundSupplier' } });
  return p!;
}

/** Finance closes a fulfilled order (within tolerance, nothing to refund). */
export function markAggReconciled(id: string, actorId: string) {
  const a = acsOf(id);
  useBuyingStore.getState().updateAggregatorPurchase(id, { paymentStatus: 'RECONCILED', reconciledAt: now(), reconciledBy: actorId });
  log(a.orgId, 'aggregatorPurchase', id, 'acs.reconciled', {}, actorId);
}

registerPayable('AGGREGATOR_PURCHASE', {
  onStatus: (p) => {
    const a = useBuyingStore.getState().aggregatorPurchases.find((x) => x.id === p.payableId);
    if (!a) return;
    const by = p.approvedBy ?? p.initiatedBy;
    if (p.status === 'SUCCESSFUL') {
      if (p.meta?.kind === 'refundSupplier') recordAggRefund(a.id, { kind: 'SUPPLIER', method: 'MONEY', amount: p.amount, proof: p.reference }, by);
      else afterAggDisbursement(a.id, p.amount, 'MOMO', by, p.id);
    } else if (p.status === 'FAILED' || p.status === 'UNKNOWN') {
      log(a.orgId, 'aggregatorPurchase', a.id, p.status === 'FAILED' ? 'acs.payoutFailed' : 'acs.payoutUnknown', { reference: p.reference, reason: p.failureReason ?? '' }, by);
    }
  },
});

// ---------------------------------------------------------------- Aggregator expenses (ACSPRE)

export const acspreTypes = (settings: OrgSettings) => settings.expenseTypes.filter((x) => (x.appliesTo ?? ['PRE']).includes('ACSPRE'));

export interface NewAggExpense {
  orgId: string; aggregatorPurchaseId: string; bags: number; lines: { expenseTypeId: string; quantity: number; rateMinor: number }[];
  payee: AggregatorExpense['payee']; actorId: string;
}

const linesOf = (settings: OrgSettings, currency: string, lines: NewAggExpense['lines']) => lines.map((l) => {
  const cap = settings.expenseTypes.find((t) => t.id === l.expenseTypeId)?.cap?.amountMinor;
  const raw = Math.round(l.rateMinor * l.quantity);
  return { expenseTypeId: l.expenseTypeId, quantity: l.quantity, rate: { amountMinor: l.rateMinor, currency }, amount: { amountMinor: cap != null ? Math.min(cap, raw) : raw, currency } };
});

export function createAggExpense(input: NewAggExpense): AggregatorExpense {
  const { orgId } = input;
  const settings = settingsOf(orgId);
  const currency = currencyOf(orgId);
  const a = acsOf(input.aggregatorPurchaseId);
  const def = settings.workflows.find((w) => w.docType === 'aggregatorExpense')!;
  const lines = linesOf(settings, currency, input.lines);
  const at = now();
  const base = {
    id: uid('acspre'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: useSettingsStore.getState().issueNumber(orgId, 'aggregatorExpense', { date: new Date() }),
    aggregatorPurchaseId: a.id, bags: input.bags, lines, total: { amountMinor: lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency }, payee: input.payee, paymentStatus: 'NOT_PAID' as const,
  };
  const started = start(def, base, at);
  const e = started.record as unknown as AggregatorExpense;
  useBuyingStore.getState().saveAggregatorExpense(e);
  log(orgId, 'aggregatorExpense', e.id, 'acspre.created', { number: e.number, total: e.total, acs: a.number }, input.actorId);
  log(orgId, 'aggregatorPurchase', a.id, 'acs.expenseAdded', { number: e.number, total: e.total }, input.actorId);
  for (const ev of started.events) log(orgId, 'aggregatorExpense', e.id, ev.key, ev.params, ev.key === 'workflow.autoApproved' ? 'system' : input.actorId);
  notifyApprovers(orgId, e as unknown as WorkflowRecord, def, 'aggregatorExpense', e.number, `/app/aggregators/expenses?open=${e.id}`, input.actorId);
  return e;
}

/** Edit lines, bags and payee — only before the first human approval. */
export function canEditAggExpense(e: AggregatorExpense) {
  return !e.approvals.some((x) => x.userId !== 'system') && !['REJECTED', 'APPROVED'].includes(e.status);
}
export function updateAggExpense(id: string, input: Pick<NewAggExpense, 'bags' | 'lines' | 'payee'>, actorId: string): boolean {
  const e = preOf(id);
  if (!canEditAggExpense(e)) return false;
  const lines = linesOf(settingsOf(e.orgId), e.total.currency, input.lines);
  useBuyingStore.getState().updateAggregatorExpense(id, { bags: input.bags, lines, payee: input.payee, total: { amountMinor: lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency: e.total.currency } });
  log(e.orgId, 'aggregatorExpense', id, 'acspre.updated', { number: e.number }, actorId);
  return true;
}

function afterAggExpensePaid(id: string, method: 'MOMO' | 'MANUAL', actorId: string, paymentId?: string, proof?: string) {
  const e = preOf(id);
  useBuyingStore.getState().updateAggregatorExpense(id, { paymentStatus: 'PAID', disbursement: { method, at: now(), by: actorId, paymentId, proof } });
  log(e.orgId, 'aggregatorExpense', id, 'acspre.paid', { amount: e.total, method }, actorId);
}
export function payAggExpenseManual(id: string, proof: string, actorId: string) { afterAggExpensePaid(id, 'MANUAL', actorId, undefined, proof); }

registerPayable('AGGREGATOR_EXPENSE', {
  onStatus: (p) => {
    const e = useBuyingStore.getState().aggregatorExpenses.find((x) => x.id === p.payableId);
    if (!e) return;
    if (p.status === 'SUCCESSFUL') afterAggExpensePaid(e.id, 'MOMO', p.approvedBy ?? p.initiatedBy, p.id);
    else useBuyingStore.getState().updateAggregatorExpense(e.id, { paymentStatus: p.status === 'FAILED' ? 'FAILED' : p.status === 'REVERSED' ? 'NOT_PAID' : 'PENDING' });
  },
});
