import type { Bag, Farmer, LoanAccount, Money, OrgSettings, PreExpense, Purchase, PurchaseRequest, RiskFlag, SourcingModel } from '@/types';
import { canAct, start, type WorkflowRecord } from '@/engines/workflow';
import { buildLedger } from '@/engines/loans';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLoanStore } from '@/stores/loanStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { payout } from './payoutService';
import { workflowUser } from './workflowService';

/**
 * Buying (PRD D1–D3, D5): purchase requests after approval (rate, disbursement, funds received,
 * ticket), farmer purchases with bags and the debt check, reconciliation and PRE expenses.
 * Approvals themselves go through `workflowService.act`.
 */

const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const m = (amountMinor: number, currency: string): Money => ({ amountMinor: Math.round(amountMinor), currency });
const now = () => new Date().toISOString();
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
const reqOf = (id: string) => useBuyingStore.getState().requests.find((r) => r.id === id)!;
const sum = (xs: { amount: Money }[] | undefined) => (xs ?? []).reduce((s, x) => s + x.amount.amountMinor, 0);

// ---------------------------------------------------------------- Prices

export function zoneOf(settings: OrgSettings, nodeId: string) {
  return settings.zones.find((z) => z.nodeIds.includes(nodeId));
}

/** The list price for a commodity in a community's zone (grade-specific first, then any grade). */
export function listPriceFor(orgId: string, commodityId: string, communityId: string, grade?: string) {
  const settings = settingsOf(orgId);
  const c = useCommunityStore.getState().communities.find((x) => x.id === communityId);
  const zone = c && zoneOf(settings, c.locationNodeId);
  const today = now().slice(0, 10);
  const live = settings.priceList.filter((p) => p.commodityId === commodityId && (!zone || p.zoneId === zone.id) && p.effectiveFrom <= today && (!p.effectiveTo || p.effectiveTo >= today));
  return live.find((p) => p.grade && p.grade === grade) ?? live.find((p) => !p.grade) ?? live[0];
}

// ---------------------------------------------------------------- Risk

export function cashHeldByAgent(orgId: string): Map<string, number> {
  const { requests, purchases } = useBuyingStore.getState();
  const held = new Map<string, number>();
  for (const r of requests.filter((x) => x.orgId === orgId && x.fundsReceived && x.reconciliationStatus !== 'RECONCILED')) {
    const bought = purchases.filter((p) => p.requestId === r.id).reduce((s, p) => s + p.amount.amountMinor, 0);
    held.set(r.agentId, (held.get(r.agentId) ?? 0) + sum(r.disbursements) + sum(r.topUps) - bought - sum(r.refunds));
  }
  return held;
}

/** AI-style risk flags (PRD D1): price above list, agent cash held, agent flagged, many requests same day. */
export function riskFlagsFor(orgId: string, r: Pick<PurchaseRequest, 'id' | 'agentId' | 'communityId' | 'plannedDate' | 'variancePct' | 'status'>): RiskFlag[] {
  const settings = settingsOf(orgId);
  const flags: RiskFlag[] = [];
  if (r.variancePct > 15) flags.push({ key: 'priceAboveList', severity: 'HIGH', params: { pct: r.variancePct } });
  else if (r.variancePct > 5) flags.push({ key: 'priceAboveList', severity: 'MEDIUM', params: { pct: r.variancePct } });
  const held = cashHeldByAgent(orgId).get(r.agentId) ?? 0;
  if (r.status !== 'RECONCILED' && held > settings.buyingRules.agentCashLimitMinor) flags.push({ key: 'agentCashHigh', severity: 'MEDIUM', params: { held: m(held, settings.priceList[0]?.price.currency ?? 'GHS') } });
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId);
  if (agent?.flags.length) flags.push({ key: 'agentFlagged', severity: 'MEDIUM', params: {} });
  const same = useBuyingStore.getState().requests.filter((x) => x.orgId === orgId && x.id !== r.id && x.communityId === r.communityId && x.plannedDate === r.plannedDate && !['NOT_APPROVED', 'ARCHIVED'].includes(x.status));
  if (same.length >= 2) flags.push({ key: 'manySameDay', severity: 'LOW', params: { count: same.length + 1 } });
  return flags;
}

function notifyApprovers(orgId: string, r: PurchaseRequest, exceptUserId: string) {
  const def = settingsOf(orgId).workflows.find((w) => w.docType === 'purchaseRequest');
  if (!def) return;
  const at = now();
  for (const mm of useAccessStore.getState().memberships.filter((x) => x.orgId === orgId && x.status === 'ACTIVE' && x.userId !== exceptUserId)) {
    if (canAct(r as unknown as WorkflowRecord, def, workflowUser(mm.userId, orgId)))
      useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId: mm.userId, kind: 'APPROVAL', key: 'approvalNeeded', params: { docType: 'purchaseRequest', number: r.number }, link: `/app/purchase-requests?open=${r.id}`, read: false, at });
  }
}

// ---------------------------------------------------------------- Requests

export interface NewRequest {
  orgId: string; agentId: string; communityId: string; commodityId: string; grade?: string; unitId: string; volume: number; plannedDate: string;
  unitPriceMinor: number; sourcingModel: SourcingModel; notes?: string; overrideReason?: string; actorId: string; device?: 'web' | 'mobile';
}

export function createRequest(input: NewRequest): PurchaseRequest {
  const { orgId } = input;
  const settings = settingsOf(orgId);
  const currency = settings.priceList[0]?.price.currency ?? 'GHS';
  const agent = useAgentStore.getState().agents.find((a) => a.id === input.agentId)!;
  const list = listPriceFor(orgId, input.commodityId, input.communityId, input.grade);
  const listMinor = list?.price.amountMinor ?? input.unitPriceMinor;
  const variancePct = listMinor ? Math.round(((input.unitPriceMinor - listMinor) / listMinor) * 1000) / 10 : 0;
  const def = settings.workflows.find((w) => w.docType === 'purchaseRequest')!;
  const at = now();
  // Created for the agent: the agent is the requester (they can't approve their own request).
  const base = {
    id: uid('pr'), orgId, createdAt: at, updatedAt: at, createdBy: agent.userId, enteredBy: input.actorId !== agent.userId ? input.actorId : undefined,
    number: useSettingsStore.getState().issueNumber(orgId, 'purchaseRequest', { date: new Date() }),
    agentId: agent.id, communityId: input.communityId, commodityId: input.commodityId, grade: input.grade, unitId: input.unitId, volume: input.volume,
    plannedDate: input.plannedDate, unitPrice: m(input.unitPriceMinor, currency), listPrice: m(listMinor, currency), variancePct,
    total: m(input.unitPriceMinor * input.volume, currency), sourcingModel: input.sourcingModel, disbursements: [], disbursementStatus: 'NONE' as const,
    fundsReceived: false, reconciliationStatus: 'OPEN' as const, riskFlags: [] as RiskFlag[], notes: input.notes, archived: false, overrideReason: input.overrideReason,
  };
  const started = start(def, base, at);
  const r = { ...(started.record as unknown as PurchaseRequest) };
  r.riskFlags = riskFlagsFor(orgId, r);
  useBuyingStore.getState().saveRequest(r);
  log(orgId, 'purchaseRequest', r.id, 'request.created', { number: r.number, total: r.total }, input.actorId, input.device);
  for (const e of started.events) log(orgId, 'purchaseRequest', r.id, e.key, e.params, e.key === 'workflow.autoApproved' ? 'system' : input.actorId, input.device);
  notifyApprovers(orgId, r, agent.userId);
  return r;
}

/** Above the list price the request goes back for approval; at or below it only the history changes. */
export function updatePrice(id: string, unitPriceMinor: number, reason: string, actorId: string): 'reapproval' | 'updated' {
  const r = reqOf(id);
  const def = settingsOf(r.orgId).workflows.find((w) => w.docType === 'purchaseRequest')!;
  const variancePct = r.listPrice.amountMinor ? Math.round(((unitPriceMinor - r.listPrice.amountMinor) / r.listPrice.amountMinor) * 1000) / 10 : 0;
  const patch: Partial<PurchaseRequest> = {
    unitPrice: m(unitPriceMinor, r.unitPrice.currency), total: m(unitPriceMinor * r.volume, r.total.currency), variancePct, overrideReason: reason,
    priceHistory: [...(r.priceHistory ?? []), { at: now(), by: actorId, fromMinor: r.unitPrice.amountMinor, toMinor: unitPriceMinor, reason }],
  };
  const above = unitPriceMinor > r.listPrice.amountMinor && unitPriceMinor > r.unitPrice.amountMinor;
  if (above) {
    const restarted = start(def, { ...r, ...patch, approvals: r.approvals } as never, now());
    const rec = restarted.record as unknown as PurchaseRequest;
    useBuyingStore.getState().updateRequest(id, { ...patch, status: 'PRICE_UPDATE', wf: rec.wf });
  } else useBuyingStore.getState().updateRequest(id, patch);
  const next = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { riskFlags: riskFlagsFor(r.orgId, next) });
  log(r.orgId, 'purchaseRequest', id, 'request.priceUpdated', { from: r.unitPrice, to: next.unitPrice, reason }, actorId);
  if (above) notifyApprovers(r.orgId, reqOf(id), actorId);
  return above ? 'reapproval' : 'updated';
}

export function confirmRate(id: string, actorId: string) {
  const r = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { status: 'RATE_CONFIRMED', rateConfirmedAt: now() });
  log(r.orgId, 'purchaseRequest', id, 'request.rateConfirmed', { price: r.unitPrice }, actorId);
}

function afterDisbursement(id: string, amountMinor: number, weightKg: number | undefined, method: 'MOMO' | 'MANUAL', actorId: string, paymentId?: string) {
  const r = reqOf(id);
  const disb = [...r.disbursements, { id: uid('dsb'), amount: m(amountMinor, r.total.currency), weightKg, method, at: now(), by: actorId, paymentId }];
  const given = disb.reduce((s, d) => s + d.amount.amountMinor, 0);
  const full = given >= r.total.amountMinor;
  useBuyingStore.getState().updateRequest(id, { disbursements: disb, disbursementStatus: full ? 'FULL' : 'PARTIAL', status: full ? 'FULL_DISBURSEMENT' : 'PARTIAL_DISBURSEMENT' });
  log(r.orgId, 'purchaseRequest', id, full ? 'request.disbursedFull' : 'request.disbursedPartial', { amount: m(amountMinor, r.total.currency), method }, actorId);
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId);
  if (agent) useNotificationStore.getState().push({ id: uid('ntf'), orgId: r.orgId, userId: agent.userId, kind: 'PAYMENT', key: 'fundsSent', params: { number: r.number, amount: m(amountMinor, r.total.currency) }, link: `/m`, read: false, at: now() });
}

/** Pay the cash advance to the agent's wallet. A failed payout leaves the request as it was, ready to retry. */
export async function disburseMomo(id: string, amountMinor: number, weightKg: number | undefined, actorId: string) {
  const r = reqOf(id);
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId)!;
  const payment = await payout({ orgId: r.orgId, type: 'AGENT_CASH_ADVANCE', payableId: r.id, payee: { name: agent.wallet.verifiedName, number: agent.wallet.number }, amount: m(amountMinor, r.total.currency), actorId });
  if (payment.status === 'SUCCESSFUL') afterDisbursement(id, amountMinor, weightKg, 'MOMO', actorId, payment.id);
  else log(r.orgId, 'purchaseRequest', id, 'request.payoutFailed', { reference: payment.reference, reason: payment.failureReason ?? payment.status }, actorId);
  return payment;
}

export function disburseManual(id: string, amountMinor: number, weightKg: number | undefined, proof: string, actorId: string) {
  afterDisbursement(id, amountMinor, weightKg, 'MANUAL', actorId);
  const r = reqOf(id);
  log(r.orgId, 'purchaseRequest', id, 'request.manualProof', { proof }, actorId);
}

export function confirmFundsReceived(id: string, actorId: string, device: 'web' | 'mobile' = 'mobile') {
  const r = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { fundsReceived: true, fundsReceivedAt: now(), status: 'FUNDS_RECEIVED' });
  log(r.orgId, 'purchaseRequest', id, 'request.fundsReceived', { amount: m(sum(r.disbursements), r.total.currency) }, actorId, device);
}

export function activateTicket(id: string, actorId: string) {
  const r = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { status: 'TICKET_ACTIVATED', ticketActivatedAt: now() });
  log(r.orgId, 'purchaseRequest', id, 'request.ticketActivated', {}, actorId);
}

export function archiveRequest(id: string, actorId: string) {
  const r = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { status: 'ARCHIVED', archived: true });
  log(r.orgId, 'purchaseRequest', id, 'request.archived', {}, actorId);
}

export function signReceipt(id: string, signature: string, actorId: string) {
  const r = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { receipt: { signature, signedAt: now() } });
  log(r.orgId, 'purchaseRequest', id, 'request.receiptSigned', {}, actorId, 'mobile');
}

// ---------------------------------------------------------------- Purchases & bags

/** Overdue loan balance for a farmer, and what the company's debt policy does with it (PRD D2, F). */
export function debtCheck(orgId: string, farmerId: string): { balance: number; policy: OrgSettings['buyingRules']['debtPolicy']; blocked: boolean; loan?: LoanAccount } {
  const settings = settingsOf(orgId);
  const today = new Date();
  const loans = useLoanStore.getState().loans.filter((l) => l.orgId === orgId && l.farmerId === farmerId && l.status === 'ACTIVE' && new Date(l.window.end) < today);
  let balance = 0;
  for (const l of loans) balance += buildLedger(l.principal, settings.loanTerms, l.window, l.repayments.map((x) => ({ date: x.date, amountMinor: x.amount.amountMinor, mode: x.mode })), today, { disbursedAt: l.disbursedAt }).balance;
  const policy = settings.buyingRules.debtPolicy;
  const owes = balance >= settings.buyingRules.debtMinimumMinor;
  return { balance, policy, blocked: owes && policy === 'block', loan: owes ? loans[0] : undefined };
}

function bagPrefix(orgId: string): string {
  const any = useBuyingStore.getState().bags.find((b) => b.orgId === orgId);
  return any ? any.code.replace(/\d+$/, '') : 'BAG';
}
export function nextBagCode(orgId: string, offset = 0): string {
  const prefix = bagPrefix(orgId);
  const max = useBuyingStore.getState().bags.filter((b) => b.orgId === orgId).reduce((mx, b) => Math.max(mx, Number(b.code.slice(prefix.length)) || 0), 100_000);
  return `${prefix}${String(max + 1 + offset).padStart(6, '0')}`;
}

export interface NewPurchase {
  farmerId: string; quantity: number; voiceNote?: boolean; consolidateWith?: string;
  evidence?: Partial<Purchase['evidence']>; createdAt?: string;
}

/**
 * Record farmer purchases under a request (web back-office entry, or a phone's synced purchases).
 * Bags fill to the commodity's nominal weight; a bag shared by several farmers is a consolidated bag.
 */
export function recordPurchases(requestId: string, items: NewPurchase[], actorId: string, source: 'WEB' | 'MOBILE' = 'WEB'): { purchases: Purchase[]; blocked: Farmer[] } {
  const r = reqOf(requestId);
  const orgId = r.orgId;
  const settings = settingsOf(orgId);
  const pack = settings.packaging.find((p) => p.commodityId === r.commodityId);
  const nominal = pack ? Math.round((pack.minKg + pack.maxKg) / 2) : 85;
  const farmers = useFarmerStore.getState().farmers;
  const community = useCommunityStore.getState().communities.find((c) => c.id === r.communityId);
  const store = useBuyingStore.getState();
  const bags = new Map<string, Bag>();
  const out: Purchase[] = [];
  const blocked: Farmer[] = [];
  let open: Bag | null = null;
  let codeOffset = 0;
  const newBag = (): Bag => ({ id: uid('bag'), orgId, code: nextBagCode(orgId, codeOffset++), commodityId: r.commodityId, weightKg: 0, status: 'WITH_AGENT', purchaseIds: [], history: [] });
  for (const it of items) {
    const farmer = farmers.find((f) => f.id === it.farmerId)!;
    const debt = debtCheck(orgId, farmer.id);
    if (debt.blocked) { blocked.push(farmer); continue; }
    const at = it.createdAt ?? now();
    const id = uid('pur');
    const number = useSettingsStore.getState().issueNumber(orgId, 'purchase', { date: new Date(at) });
    const amountMinor = Math.round(it.quantity * r.unitPrice.amountMinor);
    const deduction = debt.policy === 'deduct' && debt.balance > 0 ? Math.min(debt.balance, amountMinor) : 0;
    const codes: string[] = [];
    let left = it.quantity;
    let consolidated = false;
    while (left > 0.05) {
      if (!open) open = newBag();
      const b: Bag = open;
      const take = Math.min(left, nominal - b.weightKg);
      b.weightKg = Math.round((b.weightKg + take) * 10) / 10;
      b.purchaseIds.push(id);
      b.contributions = [...(b.contributions ?? []), { purchaseId: id, kg: Math.round(take * 10) / 10 }];
      b.history = [...(b.history ?? []), ...(b.history?.length ? [] : [{ at, event: 'PURCHASED' as const, ref: number, by: actorId }])];
      if (b.purchaseIds.length > 1) consolidated = true;
      codes.push(b.code);
      bags.set(b.id, b);
      left = Math.round((left - take) * 10) / 10;
      if (b.weightKg >= nominal - 0.05) open = null;
    }
    const direct = r.sourcingModel === 'DIRECT_PAYMENT';
    out.push({
      id, orgId, number, requestId, farmerId: farmer.id, agentId: r.agentId, commodityId: r.commodityId, quantity: it.quantity, unitId: r.unitId,
      unitPrice: r.unitPrice, amount: m(amountMinor, r.total.currency), paidToFarmer: m(amountMinor - deduction, r.total.currency), bagCodes: codes,
      consolidationRef: consolidated ? codes[0] : undefined,
      evidence: {
        scalePhoto: 'scale-1', signature: direct ? undefined : 'sig-1', voiceNote: it.voiceNote ? 'voice-1' : undefined,
        gps: community ? { lat: community.gps.lat + (Math.random() - 0.5) * 0.01, lng: community.gps.lng + (Math.random() - 0.5) * 0.01, accuracy: 6 } : undefined, ...it.evidence,
      },
      paymentStatus: direct ? 'NOT_PAID' : 'PAID', deductedForLoan: deduction ? m(deduction, r.total.currency) : undefined, syncedFrom: source, createdAt: at, communityId: r.communityId,
    });
    if (deduction && debt.loan) {
      const l = debt.loan;
      useLoanStore.getState().addRepayment(l.id, { date: at.slice(0, 10), amount: m(deduction, l.principal.currency), mode: 'PRODUCE' });
    }
  }
  store.addPurchases(out);
  store.saveBags([...bags.values()]);
  for (const p of out) log(orgId, 'purchase', p.id, 'purchase.recorded', { number: p.number, kg: p.quantity, amount: p.amount }, actorId, source === 'MOBILE' ? 'mobile' : 'web');
  if (out.length) log(orgId, 'purchaseRequest', requestId, source === 'MOBILE' ? 'request.purchasesSynced' : 'request.purchasesRecorded', { count: out.length, kg: Math.round(out.reduce((s, p) => s + p.quantity, 0)) }, actorId, source === 'MOBILE' ? 'mobile' : 'web');
  autoReconcile(r.orgId, [requestId]);
  return { purchases: out, blocked };
}

/** Replace a damaged bag: a new code carries the contents; the weight variance is kept (PRD D2 bag registry). */
export function replaceBag(bagId: string, newCode: string, newKg: number, reason: string, actorId: string): Bag {
  const store = useBuyingStore.getState();
  const old = store.bags.find((b) => b.id === bagId)!;
  const at = now();
  const repl = { oldCode: old.code, newCode, oldKg: old.weightKg, newKg, by: actorId, at, reason };
  const fresh: Bag = { ...old, id: uid('bag'), code: newCode, weightKg: newKg, replacement: repl, history: [...(old.history ?? []), { at, event: 'REPLACED', ref: old.code, by: actorId, note: reason }] };
  store.saveBags([{ ...old, status: 'REPLACED', replacement: repl }, fresh]);
  for (const p of store.purchases.filter((x) => old.purchaseIds.includes(x.id))) store.updatePurchases([p.id], (x) => ({ bagCodes: x.bagCodes.map((c) => (c === old.code ? newCode : c)) }));
  log(old.orgId, 'bag', fresh.id, 'bag.replaced', { from: old.code, to: newCode, variance: Math.round((newKg - old.weightKg) * 10) / 10 }, actorId);
  return fresh;
}

// ---------------------------------------------------------------- Reconciliation

export type ReconStatus = 'NOT_STARTED' | 'FULFILLED' | 'OVERPAID' | 'REFUND_AGENT' | 'RECEIVE_REFUND' | 'RECONCILED' | 'TICKET_ACTIVATED' | 'PARTIALLY_PAID' | 'FULLY_PAID';

export interface ReconSummary {
  given: number; bought: number; refunds: number; topUps: number; writeOffs: number; gap: number;
  plannedKg: number; boughtKg: number; purchases: Purchase[]; status: ReconStatus; withinTolerance: boolean; tolerance: number; currency: string;
}

/** Money given vs value bought (PRD D5). Positive gap: the agent holds cash to refund. */
export function reconSummary(r: PurchaseRequest, purchases: Purchase[], settings: OrgSettings): ReconSummary {
  const mine = purchases.filter((p) => p.requestId === r.id);
  const bought = mine.reduce((s, p) => s + p.amount.amountMinor, 0);
  const given = sum(r.disbursements);
  const refunds = sum(r.refunds), topUps = sum(r.topUps), writeOffs = sum(r.writeOffs);
  const gap = given + topUps - bought - refunds - writeOffs;
  const tolerance = Math.max(settings.buyingRules.reconToleranceMinor, Math.round((given * settings.buyingRules.reconTolerancePct) / 100));
  const withinTolerance = Math.abs(gap) <= tolerance;
  const boughtKg = Math.round(mine.reduce((s, p) => s + p.quantity, 0) * 10) / 10;
  let status: ReconStatus;
  if (r.reconciliationStatus === 'RECONCILED') status = 'RECONCILED';
  else if (r.sourcingModel === 'DIRECT_PAYMENT') {
    const paid = mine.filter((p) => p.paymentStatus === 'PAID').length;
    status = !r.ticketActivatedAt && r.status !== 'TICKET_ACTIVATED' ? 'NOT_STARTED' : !mine.length || paid === 0 ? 'TICKET_ACTIVATED' : paid < mine.length ? 'PARTIALLY_PAID' : 'FULLY_PAID';
  } else if (!given) status = 'NOT_STARTED';
  else if (!mine.length) status = 'NOT_STARTED';
  else if (withinTolerance) status = 'FULFILLED';
  else if (gap > 0) status = 'RECEIVE_REFUND';
  else status = bought > r.total.amountMinor ? 'OVERPAID' : 'REFUND_AGENT';
  return { given, bought, refunds, topUps, writeOffs, gap, plannedKg: r.volume, boughtKg, purchases: mine, status, withinTolerance, tolerance, currency: r.total.currency };
}

/** Match purchases to their requests; within tolerance the request reconciles by itself. */
export function autoReconcile(orgId: string, ids?: string[]): number {
  const settings = settingsOf(orgId);
  const { requests, purchases } = useBuyingStore.getState();
  let n = 0;
  for (const r of requests.filter((x) => x.orgId === orgId && (!ids || ids.includes(x.id)) && x.reconciliationStatus !== 'RECONCILED' && x.sourcingModel === 'CASH_ADVANCE' && x.fundsReceived)) {
    const s = reconSummary(r, purchases, settings);
    if (!s.purchases.length) continue;
    const auto = s.withinTolerance && s.boughtKg >= r.volume * 0.5;
    const status = s.status === 'RECEIVE_REFUND' ? 'RECEIVE_REFUND' : s.status === 'REFUND_AGENT' || s.status === 'OVERPAID' ? s.status : 'FULFILLED';
    if (auto) {
      useBuyingStore.getState().updateRequest(r.id, { autoMatched: true, reconciliationStatus: 'RECONCILED', status: 'RECONCILED', reconciledAt: now(), reconciledBy: 'system' });
      log(orgId, 'purchaseRequest', r.id, 'request.autoReconciled', { gap: m(s.gap, s.currency) }, 'system');
      n++;
    } else useBuyingStore.getState().updateRequest(r.id, { autoMatched: true, reconciliationStatus: status as PurchaseRequest['reconciliationStatus'] });
  }
  return n;
}

function closeIfSettled(id: string, actorId: string) {
  const r = reqOf(id);
  const s = reconSummary(r, useBuyingStore.getState().purchases, settingsOf(r.orgId));
  if (s.withinTolerance) markReconciled(id, actorId);
  else useBuyingStore.getState().updateRequest(id, { reconciliationStatus: s.status === 'RECEIVE_REFUND' ? 'RECEIVE_REFUND' : s.status === 'OVERPAID' ? 'OVERPAID' : 'REFUND_AGENT' });
}

export function recordRefund(id: string, amountMinor: number, method: 'MANUAL' | 'MOMO_COLLECT', actorId: string, proof?: string, note?: string) {
  const r = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { refunds: [...(r.refunds ?? []), { id: uid('rf'), amount: m(amountMinor, r.total.currency), method, at: now(), by: actorId, proof, note }] });
  log(r.orgId, 'purchaseRequest', id, 'request.refunded', { amount: m(amountMinor, r.total.currency), method }, actorId);
  closeIfSettled(id, actorId);
}

/** Pay the agent what they spent beyond the advance. */
export async function payDifference(id: string, actorId: string) {
  const r = reqOf(id);
  const s = reconSummary(r, useBuyingStore.getState().purchases, settingsOf(r.orgId));
  const amount = -s.gap;
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId)!;
  const payment = await payout({ orgId: r.orgId, type: 'AGENT_CASH_ADVANCE', payableId: r.id, payee: { name: agent.wallet.verifiedName, number: agent.wallet.number }, amount: m(amount, r.total.currency), actorId });
  if (payment.status === 'SUCCESSFUL') {
    useBuyingStore.getState().updateRequest(id, { topUps: [...(r.topUps ?? []), { id: uid('tu'), amount: m(amount, r.total.currency), at: now(), by: actorId, paymentId: payment.id }] });
    log(r.orgId, 'purchaseRequest', id, 'request.differencePaid', { amount: m(amount, r.total.currency) }, actorId);
    closeIfSettled(id, actorId);
  }
  return payment;
}

export function writeOff(id: string, amountMinor: number, reason: string, actorId: string): boolean {
  const r = reqOf(id);
  if (amountMinor > settingsOf(r.orgId).buyingRules.writeOffLimitMinor) return false;
  useBuyingStore.getState().updateRequest(id, { writeOffs: [...(r.writeOffs ?? []), { id: uid('wo'), amount: m(amountMinor, r.total.currency), reason, at: now(), by: actorId }] });
  log(r.orgId, 'purchaseRequest', id, 'request.writtenOff', { amount: m(amountMinor, r.total.currency), reason }, actorId);
  closeIfSettled(id, actorId);
  return true;
}

export function markReconciled(id: string, actorId: string) {
  const r = reqOf(id);
  useBuyingStore.getState().updateRequest(id, { reconciliationStatus: 'RECONCILED', status: 'RECONCILED', reconciledAt: now(), reconciledBy: actorId });
  log(r.orgId, 'purchaseRequest', id, 'request.reconciled', {}, actorId);
}

// ---------------------------------------------------------------- PRE expenses

export interface NewPre { orgId: string; requestId: string; bags: number; costDiscussed: boolean; lines: { expenseTypeId: string; quantity: number; rateMinor: number }[]; bagCodes?: string[]; actorId: string; device?: 'web' | 'mobile' }

export function preLineCap(settings: OrgSettings, expenseTypeId: string): number | undefined {
  return settings.expenseTypes.find((t) => t.id === expenseTypeId)?.cap?.amountMinor;
}

export function createPre(input: NewPre): PreExpense {
  const { orgId } = input;
  const settings = settingsOf(orgId);
  const r = reqOf(input.requestId);
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId)!;
  const currency = r.total.currency;
  const lines = input.lines.map((l) => ({ expenseTypeId: l.expenseTypeId, quantity: l.quantity, rate: m(l.rateMinor, currency), amount: m(Math.min(l.rateMinor * l.quantity, preLineCap(settings, l.expenseTypeId) ?? Infinity), currency) }));
  const def = settings.workflows.find((w) => w.docType === 'preExpense')!;
  const at = now();
  const base = {
    id: uid('pre'), orgId, createdAt: at, updatedAt: at, createdBy: agent.userId, number: useSettingsStore.getState().issueNumber(orgId, 'preExpense', { date: new Date() }),
    requestId: r.id, agentId: agent.id, bags: input.bags, costDiscussed: input.costDiscussed, lines, total: m(lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency),
    payee: { name: agent.wallet.verifiedName, providerId: agent.wallet.providerId, number: agent.wallet.number }, paymentStatus: 'NOT_PAID' as const, bagCodes: input.bagCodes,
  };
  const started = start(def, base, at);
  const pre = started.record as unknown as PreExpense;
  useBuyingStore.getState().saveExpense(pre);
  log(orgId, 'preExpense', pre.id, 'pre.created', { number: pre.number, total: pre.total }, input.actorId, input.device);
  for (const e of started.events) log(orgId, 'preExpense', pre.id, e.key, e.params, e.key === 'workflow.autoApproved' ? 'system' : input.actorId, input.device);
  const defPre = def;
  for (const mm of useAccessStore.getState().memberships.filter((x) => x.orgId === orgId && x.status === 'ACTIVE')) {
    if (canAct(pre as unknown as WorkflowRecord, defPre, workflowUser(mm.userId, orgId)))
      useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId: mm.userId, kind: 'APPROVAL', key: 'approvalNeeded', params: { docType: 'preExpense', number: pre.number }, link: `/app/expenses?open=${pre.id}`, read: false, at });
  }
  return pre;
}

/** Edit lines, bags and scanned codes — only before the first human approval. */
export function updatePre(id: string, input: Pick<NewPre, 'bags' | 'costDiscussed' | 'lines' | 'bagCodes'>, actorId: string): boolean {
  const e = useBuyingStore.getState().expenses.find((x) => x.id === id)!;
  if (!canEditPre(e)) return false;
  const settings = settingsOf(e.orgId);
  const currency = e.total.currency;
  const lines = input.lines.map((l) => ({ expenseTypeId: l.expenseTypeId, quantity: l.quantity, rate: m(l.rateMinor, currency), amount: m(Math.min(l.rateMinor * l.quantity, preLineCap(settings, l.expenseTypeId) ?? Infinity), currency) }));
  const total = m(lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency);
  useBuyingStore.getState().updateExpense(id, { bags: input.bags, costDiscussed: input.costDiscussed, lines, total, bagCodes: input.bagCodes });
  log(e.orgId, 'preExpense', id, 'pre.edited', { from: e.total, to: total }, actorId);
  return true;
}

/** Only before the first human approval (PRD D3). */
export function canEditPre(e: PreExpense): boolean {
  return !e.approvals.some((a) => a.userId !== 'system') && !['REJECTED', 'APPROVED'].includes(e.status);
}

function afterPrePaid(id: string, method: 'MOMO' | 'MANUAL', actorId: string, paymentId?: string, proof?: string) {
  const e = useBuyingStore.getState().expenses.find((x) => x.id === id)!;
  const settings = settingsOf(e.orgId);
  const triggers = e.lines.some((l) => settings.expenseTypes.find((t) => t.id === l.expenseTypeId)?.triggersInbound);
  const agent = useAgentStore.getState().agents.find((a) => a.id === e.agentId);
  const warehouseId = agent?.warehouseId;
  useBuyingStore.getState().updateExpense(id, {
    paymentStatus: 'PAID', disbursement: { method, at: now(), by: actorId, paymentId, proof },
    expectedDelivery: triggers ? { warehouseId: warehouseId ?? '', bags: e.bags, createdAt: now() } : undefined,
  });
  // Bags on this PRE move with the trip.
  const codes = new Set(e.bagCodes ?? []);
  const bags = useBuyingStore.getState().bags.filter((b) => codes.has(b.code));
  if (bags.length) useBuyingStore.getState().saveBags(bags.map((b) => ({ ...b, status: 'IN_TRANSIT', history: [...(b.history ?? []), { at: now(), event: 'PRE', ref: e.number, by: actorId }] })));
  log(e.orgId, 'preExpense', id, 'pre.paid', { amount: e.total, method }, actorId);
  if (triggers) log(e.orgId, 'preExpense', id, 'pre.expectedDelivery', { count: e.bags }, 'system');
}

export async function payPre(id: string, actorId: string) {
  const e = useBuyingStore.getState().expenses.find((x) => x.id === id)!;
  useBuyingStore.getState().updateExpense(id, { paymentStatus: 'PENDING' });
  const p = await payout({ orgId: e.orgId, type: 'PRE_EXPENSE', payableId: e.id, payee: { name: e.payee.name, number: e.payee.number }, amount: e.total, actorId });
  if (p.status === 'SUCCESSFUL') afterPrePaid(id, 'MOMO', actorId, p.id);
  else useBuyingStore.getState().updateExpense(id, { paymentStatus: 'FAILED' });
  return p;
}

export function payPreManual(id: string, proof: string, actorId: string) {
  afterPrePaid(id, 'MANUAL', actorId, undefined, proof);
}

// ---------------------------------------------------------------- Demo: the agent's phone (until mobile M5 in phase 9)

/** The agent submits a request from their phone for one of their communities, at the list price. */
export function simulateAgentRequest(orgId: string, agentUserId: string): PurchaseRequest | null {
  const agent = useAgentStore.getState().agents.find((a) => a.orgId === orgId && a.userId === agentUserId);
  if (!agent) return null;
  const settings = settingsOf(orgId);
  const community = useCommunityStore.getState().communities.find((c) => c.orgId === orgId && c.agentIds.includes(agent.id));
  const commodity = settings.commodities[0];
  if (!community || !commodity) return null;
  const list = listPriceFor(orgId, commodity.id, community.id, 'A');
  const planned = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  return createRequest({
    orgId, agentId: agent.id, communityId: community.id, commodityId: commodity.id, grade: commodity.grades[0], unitId: 'kg', volume: 600, plannedDate: planned,
    unitPriceMinor: list?.price.amountMinor ?? 500, sourcingModel: 'CASH_ADVANCE', actorId: agentUserId, device: 'mobile',
  });
}

/**
 * Three purchases recorded offline on the agent's phone, then synced: one voice purchase, and bags
 * shared by two farmers (a consolidated bag). Together they come to ~98.5% of the advance, leaving a
 * small refund for reconciliation.
 */
export function simulateAgentSync(requestId: string): { purchases: Purchase[]; blocked: Farmer[] } {
  const r = reqOf(requestId);
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId)!;
  const pool = useFarmerStore.getState().farmers.filter((f) => f.orgId === r.orgId && f.communityId === r.communityId && !debtCheck(r.orgId, f.id).blocked);
  const picks = pool.slice(0, 3);
  const given = sum(r.disbursements) || r.total.amountMinor;
  const kgTotal = (given * 0.985) / r.unitPrice.amountMinor;
  const shares = [0.43, 0.31, 0.26];
  const base = Date.now() - 3 * 3_600_000;
  const items: NewPurchase[] = picks.map((f, i) => ({
    farmerId: f.id, quantity: Math.round(kgTotal * shares[i]! * 10) / 10, voiceNote: i === 1, createdAt: new Date(base + i * 40 * 60_000).toISOString(),
  }));
  return recordPurchases(requestId, items, agent.userId, 'MOBILE');
}
