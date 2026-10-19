import type { LoanAccount, Money, OrgSettings, Payment, PurchaseRequest, RecoveryRequest, RecoveryWindow, Repayment } from '@/types';
import { buildLedger, quote, type Ledger, type SettlementQuote } from '@/engines/loans';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLoanStore } from '@/stores/loanStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { recordPurchases } from './buyingService';
import { pay, registerPayable } from './paymentService';

/**
 * Recovery (PRD F4–F5): windows per programme, recovery requests (manager review → finance
 * activation, which opens a direct-payment purchase request for excess produce), repayments in
 * cash / produce / mixed against the loan ledger, cash confirmation, overpayment refunds, group
 * feedback and migration of legacy allocations.
 */

const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const currencyOf = (orgId: string) => usePlatformStore.getState().orgs.find((o) => o.id === orgId)?.currency ?? 'GHS';
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
const recOf = (id: string) => useSupportStore.getState().recoveries.find((r) => r.id === id)!;
const loanOf = (id: string) => useLoanStore.getState().loans.find((l) => l.id === id)!;

// ---------------------------------------------------------------- Ledger helpers

const repaymentsOf = (l: LoanAccount) => l.repayments.map((r) => ({ date: r.date, amountMinor: r.amount.amountMinor, mode: r.mode }));
export function ledgerOf(l: LoanAccount, asOf: string | Date = new Date()): Ledger {
  return buildLedger(l.principal, settingsOf(l.orgId).loanTerms, l.window, repaymentsOf(l), asOf, { disbursedAt: l.disbursedAt });
}
export function quoteOf(l: LoanAccount, mode: 'cash' | 'produce', asOf: string | Date = new Date(), pricePerKg?: Money): SettlementQuote {
  return quote(l.principal, settingsOf(l.orgId).loanTerms, l.window, repaymentsOf(l), asOf, mode, pricePerKg);
}

// ---------------------------------------------------------------- Windows

export type WindowInput = Pick<RecoveryWindow, 'name' | 'typeId' | 'season' | 'commodityId' | 'start' | 'end' | 'status' | 'remark' | 'reminders'>;

/** Windows of the same programme may not overlap (drafts included). */
export function windowOverlap(orgId: string, w: Pick<RecoveryWindow, 'typeId' | 'start' | 'end'>, exceptId?: string): RecoveryWindow | undefined {
  return useSupportStore.getState().windows.find((x) => x.orgId === orgId && x.id !== exceptId && x.typeId === w.typeId && x.start <= w.end && w.start <= x.end);
}

export function saveWindow(orgId: string, actorId: string, input: WindowInput, id?: string): RecoveryWindow {
  if (input.end < input.start) throw new Error('windowDates');
  if (windowOverlap(orgId, input, id)) throw new Error('windowOverlap');
  const at = now();
  const existing = id ? useSupportStore.getState().windows.find((w) => w.id === id) : undefined;
  const w = { ...(existing ?? { id: uid('rw'), orgId, createdAt: at, createdBy: actorId }), ...input, updatedAt: at } as RecoveryWindow;
  useSupportStore.getState().saveWindow(w);
  log(orgId, 'recoveryWindow', w.id, existing ? 'window.updated' : 'window.created', { name: w.name }, actorId);
  return w;
}

export const daysLeft = (w: RecoveryWindow) => Math.ceil((new Date(w.end).getTime() - Date.now()) / 86_400_000);
export const activeWindows = (orgId: string) => useSupportStore.getState().windows.filter((w) => w.orgId === orgId && w.status === 'ACTIVE' && w.end >= today());

// ---------------------------------------------------------------- Requests

/** Loans in the group with something left to pay that aren't already in an open recovery request. */
export function eligibleLoans(orgId: string, groupId: string): LoanAccount[] {
  const members = new Set(useGroupStore.getState().groupMemberships.filter((m) => m.groupId === groupId && !m.leftAt).map((m) => m.farmerId));
  const busy = new Set(useSupportStore.getState().recoveries.filter((r) => r.orgId === orgId && !['FULLY_RECOVERED', 'REJECTED'].includes(r.status)).flatMap((r) => r.loanIds));
  return useLoanStore.getState().loans.filter((l) => l.orgId === orgId && l.status === 'ACTIVE' && (members.has(l.farmerId) || l.groupId === groupId) && !busy.has(l.id) && ledgerOf(l).balance > 0);
}

export function createRecoveryRequest(input: { orgId: string; groupId: string; windowId: string; agentId: string; loanIds: string[]; actorId: string; device?: 'web' | 'mobile' }): RecoveryRequest {
  const at = now();
  const r: RecoveryRequest = {
    id: uid('rr'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: useSettingsStore.getState().issueNumber(input.orgId, 'recoveryBatch', { date: new Date() }),
    groupId: input.groupId, windowId: input.windowId, agentId: input.agentId, loanIds: input.loanIds, status: 'PENDING_REVIEW', device: input.device,
  };
  useSupportStore.getState().saveRecovery(r);
  log(input.orgId, 'recoveryRequest', r.id, 'recovery.created', { number: r.number, count: r.loanIds.length }, input.actorId, input.device);
  return r;
}

const hasRepayments = (r: RecoveryRequest) => useSupportStore.getState().repayments.some((x) => x.recoveryRequestId === r.id && x.status !== 'REVERSED');

/** Manager review: the recovery commodity and its price per unit, with an optional excess-purchase price. */
export function reviewRecovery(id: string, v: { commodityId: string; unitPriceMinor: number; excessPriceMinor?: number }, actorId: string) {
  const r = recOf(id);
  const c = currencyOf(r.orgId);
  useSupportStore.getState().updateRecovery(id, {
    status: 'FINANCE_REVIEW',
    review: { commodityId: v.commodityId, unitPrice: { amountMinor: v.unitPriceMinor, currency: c }, excessPrice: v.excessPriceMinor ? { amountMinor: v.excessPriceMinor, currency: c } : undefined, by: actorId, at: now() },
  });
  log(r.orgId, 'recoveryRequest', id, 'recovery.reviewed', { price: { amountMinor: v.unitPriceMinor, currency: c } }, actorId);
}

/** Reject with a reason — only while nothing has been repaid. */
export function rejectRecovery(id: string, reason: string, actorId: string): boolean {
  const r = recOf(id);
  if (hasRepayments(r) || !reason.trim()) return false;
  useSupportStore.getState().updateRecovery(id, { status: 'REJECTED', rejection: { reason: reason.trim(), by: actorId, at: now() } });
  log(r.orgId, 'recoveryRequest', id, 'recovery.rejected', { reason }, actorId);
  return true;
}

/**
 * Finance activation: may change the excess price (reason required), and opens the linked
 * direct-payment purchase request for excess produce when the programme setting is on.
 */
export function activateRecovery(id: string, v: { excessPriceMinor?: number; reason?: string }, actorId: string): { ok: boolean; reason?: 'reasonRequired' } {
  const r = recOf(id);
  const c = currencyOf(r.orgId);
  const changed = v.excessPriceMinor != null && v.excessPriceMinor !== r.review?.excessPrice?.amountMinor;
  if (changed && !v.reason?.trim()) return { ok: false, reason: 'reasonRequired' };
  const excess = v.excessPriceMinor != null ? { amountMinor: v.excessPriceMinor, currency: c } : r.review?.excessPrice;
  let purchaseRequestId: string | undefined;
  if (settingsOf(r.orgId).support.linkPurchaseRequest && r.review) purchaseRequestId = linkedRequest({ ...r, activation: { excessPrice: excess, by: actorId, at: now() } }, actorId).id;
  useSupportStore.getState().updateRecovery(id, { status: 'ACTIVATED', activation: { excessPrice: excess, reason: changed ? v.reason!.trim() : undefined, by: actorId, at: now() }, purchaseRequestId });
  log(r.orgId, 'recoveryRequest', id, 'recovery.activated', { excess: excess ?? '' }, actorId);
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId);
  if (agent) useNotificationStore.getState().push({ id: uid('ntf'), orgId: r.orgId, userId: agent.userId, kind: 'ALERT', key: 'recoveryActivated', params: { number: r.number }, link: `/m/recovery/${r.id}`, read: false, at: now() });
  return { ok: true };
}

/** The purchase request that excess produce is bought on: direct payment, ticket already active. */
function linkedRequest(r: RecoveryRequest, actorId: string): PurchaseRequest {
  const group = useGroupStore.getState().groups.find((g) => g.id === r.groupId)!;
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId)!;
  const price = r.activation?.excessPrice ?? r.review!.unitPrice;
  const at = now();
  const volume = Math.max(1, Math.round(r.loanIds.reduce((s, id) => s + ledgerOf(loanOf(id)).balance, 0) / Math.max(1, r.review!.unitPrice.amountMinor) * 0.2));
  const pr: PurchaseRequest = {
    id: uid('pr'), orgId: r.orgId, createdAt: at, updatedAt: at, createdBy: agent.userId, enteredBy: actorId,
    number: useSettingsStore.getState().issueNumber(r.orgId, 'purchaseRequest', { date: new Date() }),
    agentId: agent.id, communityId: group.communityId, commodityId: r.review!.commodityId, unitId: 'kg', volume, plannedDate: today(),
    unitPrice: price, listPrice: price, variancePct: 0, total: { amountMinor: price.amountMinor * volume, currency: price.currency }, sourcingModel: 'DIRECT_PAYMENT',
    status: 'TICKET_ACTIVATED', wf: { currentStepId: null, stepApprovals: {} }, approvals: [],
    disbursements: [], disbursementStatus: 'NONE', fundsReceived: false, reconciliationStatus: 'OPEN', riskFlags: [], archived: false, ticketActivatedAt: at,
    notes: `Excess produce for recovery ${r.number}`, recoveryRequestId: r.id,
  };
  useBuyingStore.getState().saveRequest(pr);
  log(r.orgId, 'purchaseRequest', pr.id, 'request.fromRecovery', { number: r.number }, actorId);
  return pr;
}

// ---------------------------------------------------------------- Repayments

export interface RepaymentInput {
  recoveryRequestId: string; loanId: string; mode: Repayment['mode']; kg?: number; bagCode?: string; cashMinor?: number;
  /** Buy the produce beyond what clears the loan at the excess price. */
  excess?: boolean; photo?: string; actorId: string; device?: 'web' | 'mobile';
}

export interface RepaymentResult { repayment: Repayment; ledger: Ledger; settled: boolean; excessKg: number; overpaid: number }

/**
 * Record a repayment against a farmer's loan. Produce is valued at the recovery's unit price; with
 * the excess toggle, produce beyond the balance is bought on the linked purchase request instead of
 * being credited. Cash triggers the company's cash penalty through the ledger, and waits for
 * finance to confirm the receipt photo.
 */
export function recordRepayment(input: RepaymentInput): RepaymentResult {
  const r = recOf(input.recoveryRequestId);
  const loan = loanOf(input.loanId);
  const c = loan.principal.currency;
  const price = r.review?.unitPrice.amountMinor ?? 0;
  const date = today();
  const cash = input.mode !== 'PRODUCE' ? Math.max(0, Math.round(input.cashMinor ?? 0)) : 0;
  let kg = input.mode !== 'CASH' ? Math.max(0, input.kg ?? 0) : 0;
  let excessKg = 0;
  let cap = Infinity;
  if (kg && input.excess && price) {
    // What the produce must cover once the cash part (and its penalty) is in.
    const withCash = { ...loan, repayments: cash ? [...loan.repayments, { date, amount: { amountMinor: cash, currency: c }, mode: 'CASH' as const }] : loan.repayments };
    const owed = ledgerOf(withCash, date).balance;
    const neededKg = Math.ceil((owed / price) * 10) / 10;
    // The produce kept for the loan is rounded up to 0.1 kg; it clears the balance, not more.
    if (kg > neededKg) { excessKg = Math.round((kg - neededKg) * 10) / 10; kg = neededKg; cap = owed; }
  }
  const produceValue = Math.min(Math.round(kg * price), cap);
  const id = uid('rp');
  const entries: LoanAccount['repayments'] = [];
  // Cash first (it is what triggers the cash penalty), then the produce that clears the rest.
  if (cash > 0) entries.push({ date, amount: { amountMinor: cash, currency: c }, mode: 'CASH', repaymentId: id });
  if (produceValue > 0) entries.push({ date, amount: { amountMinor: produceValue, currency: c }, mode: 'PRODUCE', repaymentId: id });
  const next = { ...loan, repayments: [...loan.repayments, ...entries] };
  const ledger = ledgerOf(next, date);
  const settled = ledger.settled;
  useLoanStore.getState().updateLoan(loan.id, { repayments: next.repayments, status: settled ? 'SETTLED' : 'ACTIVE', settledAt: settled ? now() : undefined });

  let excess: Repayment['excess'];
  if (excessKg > 0 && r.purchaseRequestId) {
    const { purchases } = recordPurchases(r.purchaseRequestId, [{ farmerId: loan.farmerId, quantity: excessKg, bagCodes: input.bagCode ? [input.bagCode] : undefined }], input.actorId, input.device === 'mobile' ? 'MOBILE' : 'WEB');
    const p = purchases[0];
    excess = { kg: excessKg, amount: p?.amount ?? { amountMinor: 0, currency: c }, purchaseId: p?.id };
  }
  const repayment: Repayment = {
    id, orgId: loan.orgId, loanId: loan.id, farmerId: loan.farmerId, recoveryRequestId: r.id, agentId: r.agentId, date, mode: input.mode, kg: kg || undefined, bagCode: input.bagCode,
    cash: cash ? { amountMinor: cash, currency: c } : undefined, produceValue: produceValue ? { amountMinor: produceValue, currency: c } : undefined, excess,
    receipt: cash ? { status: 'PENDING', photo: input.photo } : { status: 'NA' }, status: 'RECORDED', createdAt: now(), createdBy: input.actorId,
  };
  useSupportStore.getState().addRepayment(repayment);
  log(loan.orgId, 'loan', loan.id, 'loan.repaid', { amount: { amountMinor: produceValue + cash, currency: c }, mode: input.mode, kg }, input.actorId, input.device);
  log(r.orgId, 'recoveryRequest', r.id, 'recovery.repayment', { amount: { amountMinor: produceValue + cash, currency: c }, mode: input.mode }, input.actorId, input.device);
  if (settled) log(loan.orgId, 'loan', loan.id, 'loan.settled', {}, 'system');
  refreshRecovery(r.id);
  return { repayment, ledger, settled, excessKg, overpaid: ledger.overpaid };
}

function refreshRecovery(id: string) {
  const r = recOf(id);
  if (!['ACTIVATED', 'PARTIALLY_RECOVERED', 'FULLY_RECOVERED'].includes(r.status)) return;
  const loans = r.loanIds.map(loanOf).filter(Boolean);
  const repaid = useSupportStore.getState().repayments.some((x) => x.recoveryRequestId === id);
  const status = loans.every((l) => l.status === 'SETTLED') ? 'FULLY_RECOVERED' : repaid ? 'PARTIALLY_RECOVERED' : 'ACTIVATED';
  if (status !== r.status) {
    useSupportStore.getState().updateRecovery(id, { status });
    log(r.orgId, 'recoveryRequest', id, `recovery.${status === 'FULLY_RECOVERED' ? 'fullyRecovered' : 'partiallyRecovered'}`, {}, 'system');
  }
}

/** Finance confirms the cash receipt photo. */
export function confirmCash(repaymentId: string, actorId: string) {
  const rp = useSupportStore.getState().repayments.find((x) => x.id === repaymentId)!;
  useSupportStore.getState().updateRepayment(repaymentId, { receipt: { ...rp.receipt, status: 'CONFIRMED', by: actorId, at: now() }, status: 'CONFIRMED' });
  log(rp.orgId, 'loan', rp.loanId, 'loan.cashConfirmed', { amount: rp.cash ?? '' }, actorId);
}

export function saveFeedback(id: string, fb: { experience: string; lendAgain: 'YES' | 'MAYBE' | 'NO'; comment?: string }, actorId: string, device: 'web' | 'mobile' = 'mobile') {
  const r = recOf(id);
  useSupportStore.getState().updateRecovery(id, { feedback: { ...fb, at: now(), by: actorId } });
  log(r.orgId, 'recoveryRequest', id, 'recovery.feedback', { experience: fb.experience }, actorId, device);
}

// ---------------------------------------------------------------- Overpayment refunds

/** What the farmer paid beyond the ledger balance, less refunds already made. */
export function refundDue(l: LoanAccount): number {
  const refunded = useSupportStore.getState().refunds.filter((x) => x.loanId === l.id).reduce((s, x) => s + x.amount.amountMinor, 0);
  return Math.max(0, ledgerOf(l).overpaid - refunded);
}

export async function refundOverpaymentMomo(loanId: string, wallet: { name: string; number: string; providerId?: string }, actorId: string): Promise<Payment> {
  const l = loanOf(loanId);
  const [p] = await pay({ orgId: l.orgId, type: 'FARMER_REFUND', payableId: l.id, payees: [{ ...wallet, amount: { amountMinor: refundDue(l), currency: l.principal.currency } }], actorId });
  return p!;
}
export function refundOverpaymentManual(loanId: string, proof: string, actorId: string) {
  const l = loanOf(loanId);
  addRefund(l, refundDue(l), 'MANUAL', actorId, { proof });
}
function addRefund(l: LoanAccount, amountMinor: number, method: 'MOMO' | 'MANUAL', actorId: string, opts: { paymentId?: string; proof?: string }) {
  useSupportStore.getState().addRefund({ id: uid('lrf'), orgId: l.orgId, loanId: l.id, farmerId: l.farmerId, amount: { amountMinor, currency: l.principal.currency }, method, at: now(), by: actorId, ...opts });
  log(l.orgId, 'loan', l.id, 'loan.refunded', { amount: { amountMinor, currency: l.principal.currency }, method }, actorId);
}
registerPayable('FARMER_REFUND', {
  onStatus: (p) => {
    const l = useLoanStore.getState().loans.find((x) => x.id === p.payableId);
    if (l && p.status === 'SUCCESSFUL') addRefund(l, p.amount.amountMinor, 'MOMO', p.approvedBy ?? p.initiatedBy, { paymentId: p.id });
  },
});

// ---------------------------------------------------------------- Legacy allocations

/** Demo migration: what is still owed on an old allocation becomes a loan with a fresh window. */
export function migrateLegacy(id: string, actorId: string): LoanAccount | null {
  const a = useSupportStore.getState().legacy.find((x) => x.id === id);
  if (!a || a.migratedLoanId) return null;
  const owed = a.amount.amountMinor - a.repayments.reduce((s, r) => s + r.amount.amountMinor, 0);
  if (owed <= 0) return null;
  const at = now();
  const loan: LoanAccount = {
    id: uid('loan'), orgId: a.orgId, createdAt: at, updatedAt: at, createdBy: actorId, farmerId: a.farmerId, principal: { amountMinor: owed, currency: a.amount.currency },
    disbursedAt: today(), window: { start: today(), end: new Date(Date.now() + settingsOf(a.orgId).support.recoveryWindowDays * 86_400_000).toISOString().slice(0, 10) },
    repayments: [], status: 'ACTIVE', legacyAllocationId: a.id,
  };
  useLoanStore.getState().addLoans([loan]);
  useSupportStore.getState().updateLegacy(id, { migratedLoanId: loan.id });
  log(a.orgId, 'loan', loan.id, 'loan.migrated', { type: a.type, amount: loan.principal }, actorId);
  return loan;
}
