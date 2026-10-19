import type { Collection, Money, OrgSettings, Payment, PayableType, PaymentProvider } from '@/types';
import { calculateFees } from '@/engines/money';
import { makeEvent } from '@/engines/activity';
import { hasPermission } from '@/engines/permissions';
import { latency, uid } from '@/lib/utils';
import { lookupName, transfer } from './paymentGateway';
import { workflowUser } from './workflowService';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useDemoStore } from '@/stores/demoStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Payments engine (PRD E1–E2, simulated T-Pay): network from the wallet number, name lookup, fee /
 * withdrawal / tax / extra charges, role and provider limits, wallet balance, maker–checker,
 * processing with provider callbacks, check status, retry, reversal, collections and top-ups.
 * Each payable type registers what happens to its record when a payment settles.
 */

const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const now = () => new Date().toISOString();
const m = (amountMinor: number, currency: string): Money => ({ amountMinor: Math.round(amountMinor), currency });
const store = () => usePaymentStore.getState();
const payOf = (id: string) => store().payments.find((p) => p.id === id)!;
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string) =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device: 'web' }));
const event = (id: string, key: string, by?: string, note?: string) =>
  store().updatePayment(id, (p) => ({ events: [...(p.events ?? []), { at: now(), key, by, note }] }));

// ---------------------------------------------------------------- Payable hooks

export interface PayableHandler {
  /** Called whenever a payment for this payable changes status. */
  onStatus: (p: Payment) => void;
}
const handlers = new Map<PayableType, PayableHandler>();
export function registerPayable(type: PayableType, h: PayableHandler) { handlers.set(type, h); }
const notifyPayable = (p: Payment) => handlers.get(p.payableType)?.onStatus(p);

// ---------------------------------------------------------------- Providers, quotes, lookup

const countryCode = (orgId: string) => usePlatformStore.getState().orgs.find((o) => o.id === orgId)?.countries[0] ?? 'GH';

/** The network of a wallet number, from the company's provider prefixes. */
export function providerOfPhone(settings: OrgSettings, phone: string, country: string): PaymentProvider | undefined {
  const mobile = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY' && p.enabled);
  const cc = country === 'CI' ? '225' : '233';
  const digits = phone.replace(/[\s+]/g, '');
  const local = digits.startsWith(cc) ? digits.slice(cc.length) : digits;
  const withZero = local.startsWith('0') ? local : `0${local}`;
  return mobile.find((p) => p.prefixes.some((pre) => withZero.startsWith(pre) || local.startsWith(pre))) ?? mobile[0];
}
export const detectProvider = (orgId: string, phone: string) => providerOfPhone(settingsOf(orgId), phone, countryCode(orgId));

export interface Quote {
  provider?: PaymentProvider;
  amount: Money; fee: Money; tax: Money; extras: Money; withdrawal: Money; total: Money; received: Money; payer: 'company' | 'payee';
}

/** Charges for one payee (PRD E1 step 2). `includeWithdrawal` adds the payee's cash-out charge on top. */
export function quote(orgId: string, amount: Money, providerId: string | undefined, opts: { extraIds?: string[]; includeWithdrawal?: boolean } = {}): Quote {
  const settings = settingsOf(orgId);
  const provider = settings.paymentProviders.find((p) => p.id === providerId);
  const extrasList = settings.extraCharges.filter((x) => x.enabled && (opts.extraIds ?? []).includes(x.id));
  const companyExtras = extrasList.filter((x) => x.payer === 'company').reduce((s, x) => s + x.amountMinor, 0);
  const payeeExtras = extrasList.filter((x) => x.payer === 'payee').reduce((s, x) => s + x.amountMinor, 0);
  const w = provider?.withdrawal;
  const withdrawalMinor = opts.includeWithdrawal && w ? (w.type === 'percent' ? Math.round((amount.amountMinor * w.value) / 100) : w.value) : 0;
  const sent = m(amount.amountMinor + withdrawalMinor, amount.currency);
  const q = calculateFees(sent, settings.feeTiers, providerId ?? '', { taxPct: settings.taxPct, extras: [m(companyExtras, amount.currency)] });
  return {
    provider, amount, fee: q.fee, tax: q.tax, extras: m(companyExtras + payeeExtras, amount.currency), withdrawal: m(withdrawalMinor, amount.currency),
    total: q.total, received: m(q.received.amountMinor - companyExtras - payeeExtras, amount.currency), payer: q.payer,
  };
}

/** Name registered on the wallet (simulated provider lookup). */
export async function lookupPayee(number: string, expectedName: string) {
  const r = await lookupName(number, expectedName);
  return { name: r.name, match: r.match };
}

// ---------------------------------------------------------------- Limits & controls

export interface LimitCheck { ok: boolean; reason?: 'perPayment' | 'daily' | 'providerPerPayment' | 'providerDaily' | 'balance' | 'permission'; limit?: Money; used?: Money }

export function payLimitsFor(orgId: string, userId: string) {
  const { memberships, roles } = useAccessStore.getState();
  const mm = memberships.find((x) => x.userId === userId && x.orgId === orgId);
  const mine = roles.filter((r) => mm?.roleIds.includes(r.id) && r.payLimits);
  if (!mine.length) return undefined;
  return { perPaymentMinor: Math.max(...mine.map((r) => r.payLimits!.perPaymentMinor)), dailyMinor: Math.max(...mine.map((r) => r.payLimits!.dailyMinor)) };
}

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const counted = (p: Payment) => !['FAILED', 'REVERSED'].includes(p.status);

/** Can this user send these totals? Checks role limits, provider limits and company wallet balances. */
export function checkLimits(orgId: string, userId: string, lines: { providerId?: string; total: Money }[]): LimitCheck {
  const currency = lines[0]?.total.currency ?? 'GHS';
  if (!hasPermission(workflowUser(userId, orgId).permissions, 'payments.initiate')) return { ok: false, reason: 'permission' };
  const today = store().payments.filter((p) => p.orgId === orgId && p.createdAt >= startOfDay() && counted(p));
  const role = payLimitsFor(orgId, userId);
  const sum = lines.reduce((s, l) => s + l.total.amountMinor, 0);
  if (role) {
    const biggest = Math.max(...lines.map((l) => l.total.amountMinor));
    if (biggest > role.perPaymentMinor) return { ok: false, reason: 'perPayment', limit: m(role.perPaymentMinor, currency) };
    const used = today.filter((p) => p.initiatedBy === userId).reduce((s, p) => s + p.total.amountMinor, 0);
    if (used + sum > role.dailyMinor) return { ok: false, reason: 'daily', limit: m(role.dailyMinor, currency), used: m(used, currency) };
  }
  const settings = settingsOf(orgId);
  for (const pid of new Set(lines.map((l) => l.providerId))) {
    const p = settings.paymentProviders.find((x) => x.id === pid);
    const mine = lines.filter((l) => l.providerId === pid);
    const total = mine.reduce((s, l) => s + l.total.amountMinor, 0);
    if (p?.limits?.perPaymentMinor && mine.some((l) => l.total.amountMinor > p.limits!.perPaymentMinor)) return { ok: false, reason: 'providerPerPayment', limit: m(p.limits.perPaymentMinor, currency) };
    if (p?.limits?.dailyMinor) {
      const used = today.filter((x) => x.providerId === pid).reduce((s, x) => s + x.total.amountMinor, 0);
      if (used + total > p.limits.dailyMinor) return { ok: false, reason: 'providerDaily', limit: m(p.limits.dailyMinor, currency), used: m(used, currency) };
    }
    const w = store().wallets.find((x) => x.orgId === orgId && x.providerId === pid);
    if (w && w.balance.amountMinor < total) return { ok: false, reason: 'balance', limit: w.balance };
  }
  return { ok: true };
}

/** Maker–checker (PRD E1 step 3): above the company threshold a second user approves before sending. */
export function needsChecker(orgId: string, totalMinor: number): boolean {
  const s = settingsOf(orgId);
  return s.makerChecker && totalMinor >= (s.makerCheckerMinMinor ?? 0);
}

// ---------------------------------------------------------------- Initiate, check, process

export interface PayeeLine { name: string; number: string; providerId?: string; amount: Money; payableId?: string; meta?: Record<string, unknown> }
export interface InitiateInput {
  orgId: string; type: PayableType; payableId: string; payees: PayeeLine[]; actorId: string;
  extraIds?: string[]; includeWithdrawal?: boolean; meta?: Record<string, unknown>; retryOf?: string;
}

/** Create the payment attempts. Returns them as Awaiting checker, or Pending to be processed now. */
export function initiate(input: InitiateInput): Payment[] {
  const { orgId } = input;
  const batchId = input.payees.length > 1 ? uid('batch') : undefined;
  const at = now();
  const out: Payment[] = input.payees.map((pe) => {
    const providerId = pe.providerId ?? detectProvider(orgId, pe.number)?.id ?? '';
    const q = quote(orgId, pe.amount, providerId, { extraIds: input.extraIds, includeWithdrawal: input.includeWithdrawal });
    const reference = useSettingsStore.getState().issueNumber(orgId, 'payment', { date: new Date() });
    return {
      id: uid('pay'), orgId, reference, payableType: input.type, payableId: pe.payableId ?? input.payableId, payee: { name: pe.name, number: pe.number }, providerId,
      amount: pe.amount, fee: q.fee, tax: q.tax, total: q.total, extras: q.extras, withdrawal: q.withdrawal, received: q.received,
      status: 'PENDING', initiatedBy: input.actorId, createdAt: at, batchId, retryOf: input.retryOf, meta: { ...input.meta, ...pe.meta, extraIds: input.extraIds, includeWithdrawal: input.includeWithdrawal },
      events: [{ at, key: 'initiated', by: input.actorId }],
    } satisfies Payment;
  });
  const total = out.reduce((s, p) => s + p.total.amountMinor, 0);
  const checker = !input.retryOf && needsChecker(orgId, total);
  const ready = out.map((p) => (checker ? { ...p, status: 'AWAITING_CHECKER' as const, events: [...p.events!, { at, key: 'awaitingChecker' }] } : p));
  store().addPayments(ready);
  for (const p of ready) {
    log(orgId, 'payment', p.id, checker ? 'payment.awaitingChecker' : 'payment.initiated', { reference: p.reference, amount: p.amount, name: p.payee.name }, input.actorId);
    notifyPayable(p);
  }
  if (checker) {
    const { memberships } = useAccessStore.getState();
    for (const mm of memberships.filter((x) => x.orgId === orgId && x.status === 'ACTIVE' && x.userId !== input.actorId)) {
      if (hasPermission(workflowUser(mm.userId, orgId).permissions, 'payments.check'))
        useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId: mm.userId, kind: 'PAYMENT', key: 'paymentToCheck', params: { reference: ready[0]!.reference, count: ready.length, amount: m(total, ready[0]!.total.currency) }, link: `/app/payments?view=AWAITING_CHECKER&open=${ready[0]!.id}`, read: false, at });
    }
  }
  return ready;
}

/** A checker approves or rejects payments waiting for them; the maker can't check their own payment. */
export function checkPayments(ids: string[], checkerId: string, decision: 'approve' | 'reject', note?: string): { ok: string[]; blocked: string[] } {
  const ok: string[] = [];
  const blocked: string[] = [];
  for (const id of ids) {
    const p = payOf(id);
    if (!p || p.status !== 'AWAITING_CHECKER' || p.initiatedBy === checkerId || !hasPermission(workflowUser(checkerId, p.orgId).permissions, 'payments.check')) { blocked.push(id); continue; }
    if (decision === 'approve') {
      store().updatePayment(id, { status: 'PENDING', approvedBy: checkerId });
      event(id, 'checked', checkerId);
      log(p.orgId, 'payment', id, 'payment.checked', { reference: p.reference }, checkerId);
    } else {
      store().updatePayment(id, { status: 'FAILED', approvedBy: checkerId, failureReason: note || 'Rejected by checker' });
      event(id, 'rejectedByChecker', checkerId, note);
      log(p.orgId, 'payment', id, 'payment.rejected', { reference: p.reference, reason: note ?? '' }, checkerId);
      notifyPayable(payOf(id));
    }
    ok.push(id);
  }
  return { ok, blocked };
}

/** Send one Pending payment to the provider and wait for its callback. */
export async function processPayment(id: string): Promise<Payment> {
  const p = payOf(id);
  if (p.status !== 'PENDING') return p;
  store().updatePayment(id, { status: 'PROCESSING' });
  event(id, 'accepted');
  notifyPayable(payOf(id));
  const demo = useDemoStore.getState();
  const forced = demo.failNextPayout;
  if (forced) demo.setFailNextPayout(false);
  const res = await transfer();
  const status = forced ? 'FAILED' : res.status;
  const failureReason = status === 'FAILED' ? (forced ? 'Payee wallet limit reached' : 'Provider timeout') : undefined;
  const response = { transactionId: res.providerRef, status: status === 'SUCCESSFUL' ? 'SUCCESSFUL' : status === 'FAILED' ? 'FAILED' : 'PENDING', amount: (p.amount.amountMinor + (p.withdrawal?.amountMinor ?? 0)) / 100, currency: p.amount.currency, payer: { partyIdType: 'MSISDN', partyId: p.payee.number }, payeeNote: p.reference, reason: failureReason, financialTransactionId: status === 'SUCCESSFUL' ? `FT${Date.now().toString(36).toUpperCase()}` : undefined };
  store().updatePayment(id, { status, failureReason, providerRef: res.providerRef, response });
  event(id, `callback.${status.toLowerCase()}`, undefined, failureReason);
  const settled = payOf(id);
  log(p.orgId, 'payment', id, `payment.${status.toLowerCase()}`, { reference: p.reference, amount: p.amount, name: p.payee.name }, p.initiatedBy);
  if (status === 'SUCCESSFUL') debitWallet(settled);
  notifyPayable(settled);
  return settled;
}

function debitWallet(p: Payment, sign = 1) {
  const w = store().wallets.find((x) => x.orgId === p.orgId && x.providerId === p.providerId);
  if (w) store().updateWallet(w.id, { balance: { ...w.balance, amountMinor: w.balance.amountMinor - sign * p.total.amountMinor } });
}

/** Initiate and, without a checker, send straight away. */
export async function pay(input: InitiateInput, onProgress?: (p: Payment) => void): Promise<Payment[]> {
  const created = initiate(input);
  const out: Payment[] = [];
  for (const p of created) {
    if (p.status !== 'PENDING') { out.push(p); continue; }
    onProgress?.({ ...p, status: 'PROCESSING' });
    const done = await processPayment(p.id);
    onProgress?.(done);
    out.push(done);
  }
  return out;
}

/** Checker approves, then the payments go out. */
export async function approveAndSend(ids: string[], checkerId: string, onProgress?: (p: Payment) => void) {
  const { ok, blocked } = checkPayments(ids, checkerId, 'approve');
  const sent: Payment[] = [];
  for (const id of ok) { const p = await processPayment(id); onProgress?.(p); sent.push(p); }
  return { sent, blocked };
}

/** "Check status" for an Unknown payment: the provider answers on the second ask. */
export async function checkStatus(id: string, actorId: string): Promise<Payment> {
  const p = payOf(id);
  if (p.status !== 'UNKNOWN') return p;
  await latency(800, 1600);
  const status = Number.parseInt(p.reference.replace(/\D/g, '').slice(-1) || '0', 10) % 5 === 4 ? 'FAILED' : 'SUCCESSFUL';
  store().updatePayment(id, { status, failureReason: status === 'FAILED' ? 'Not delivered by the provider' : undefined, response: { ...(p.response ?? {}), status } });
  event(id, `statusCheck.${status.toLowerCase()}`, actorId);
  log(p.orgId, 'payment', id, `payment.${status.toLowerCase()}`, { reference: p.reference, amount: p.amount, name: p.payee.name }, actorId);
  const settled = payOf(id);
  if (status === 'SUCCESSFUL') debitWallet(settled);
  notifyPayable(settled);
  return settled;
}

/** Retry a failed payment as a new attempt (no new checker: the original was already approved). */
export async function retry(id: string, actorId: string): Promise<Payment> {
  const p = payOf(id);
  const [next] = await pay({ orgId: p.orgId, type: p.payableType, payableId: p.payableId, payees: [{ name: p.payee.name, number: p.payee.number, providerId: p.providerId, amount: p.amount }], actorId, meta: p.meta, retryOf: p.id, extraIds: p.meta?.extraIds as string[] | undefined, includeWithdrawal: p.meta?.includeWithdrawal as boolean | undefined });
  event(id, 'retried', actorId, next!.reference);
  return next!;
}

/** Mark a successful payment as reversed by the provider: the wallet is credited back. */
export function reverse(id: string, actorId: string, reason: string) {
  const p = payOf(id);
  if (p.status !== 'SUCCESSFUL') return false;
  store().updatePayment(id, { status: 'REVERSED', failureReason: reason });
  event(id, 'reversed', actorId, reason);
  debitWallet(p, -1);
  log(p.orgId, 'payment', id, 'payment.reversed', { reference: p.reference, reason }, actorId);
  notifyPayable(payOf(id));
  return true;
}

/** True while a payment for this payable is waiting or on its way (so the UI doesn't pay twice). */
export function inFlight(payableId: string) {
  return store().payments.some((p) => p.payableId === payableId && ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(p.status));
}

// ---------------------------------------------------------------- Collections (PRD E2)

type CollectionHandler = (c: Collection) => void;
const collectionHandlers = new Map<Collection['payableType'], CollectionHandler>();
export function registerCollection(type: Collection['payableType'], h: CollectionHandler) { collectionHandlers.set(type, h); }

export function requestCollection(input: Omit<Collection, 'id' | 'reference' | 'status' | 'createdAt' | 'providerId'> & { providerId?: string }): Collection {
  const c: Collection = {
    ...input, id: uid('col'), providerId: input.providerId ?? detectProvider(input.orgId, input.payer.number)?.id ?? '',
    reference: useSettingsStore.getState().issueNumber(input.orgId, 'payment', { date: new Date() }).replace(/^[A-Z]+/, 'COL'), status: 'PENDING', createdAt: now(),
  };
  store().addCollection(c);
  log(c.orgId, 'collection', c.id, 'collection.requested', { reference: c.reference, amount: c.amount, name: c.payer.name }, c.requestedBy);
  if (c.payer.userId) useNotificationStore.getState().push({ id: uid('ntf'), orgId: c.orgId, userId: c.payer.userId, kind: 'PAYMENT', key: 'collectionRequested', params: { amount: c.amount, reference: c.reference }, link: '/m', read: false, at: c.createdAt });
  return c;
}

/** The payer answers the prompt on their phone. Approved money is credited to the company wallet. */
export function answerCollection(id: string, approve: boolean, actorId: string) {
  const c = store().collections.find((x) => x.id === id);
  if (!c || c.status !== 'PENDING') return;
  store().updateCollection(id, { status: approve ? 'SUCCESSFUL' : 'DECLINED', settledAt: now() });
  if (approve) {
    const w = store().wallets.find((x) => x.orgId === c.orgId && x.providerId === c.providerId);
    if (w) store().updateWallet(w.id, { balance: { ...w.balance, amountMinor: w.balance.amountMinor + c.amount.amountMinor } });
  }
  log(c.orgId, 'collection', id, approve ? 'collection.approved' : 'collection.declined', { reference: c.reference, amount: c.amount, name: c.payer.name }, actorId);
  useNotificationStore.getState().push({ id: uid('ntf'), orgId: c.orgId, userId: c.requestedBy, kind: 'PAYMENT', key: approve ? 'collectionApproved' : 'collectionDeclined', params: { amount: c.amount, name: c.payer.name, reference: c.reference }, link: '/app/payments?view=collections', read: false, at: now() });
  if (approve) collectionHandlers.get(c.payableType)?.({ ...c, status: 'SUCCESSFUL' });
}

// ---------------------------------------------------------------- Wallet top-ups

export function requestTopUp(orgId: string, walletId: string, amount: Money, actorId: string, note?: string) {
  const t = { id: uid('top'), orgId, walletId, amount, status: 'REQUESTED' as const, requestedBy: actorId, createdAt: now(), note };
  store().addTopUp(t);
  log(orgId, 'wallet', walletId, 'wallet.topUpRequested', { amount }, actorId);
  // Simulated treasury: the bank transfer lands a little later.
  window.setTimeout(() => {
    const w = store().wallets.find((x) => x.id === walletId);
    if (!w) return;
    store().updateWallet(walletId, { balance: { ...w.balance, amountMinor: w.balance.amountMinor + amount.amountMinor }, lastTopUpAt: now() });
    store().updateTopUp(t.id, { status: 'CREDITED', creditedAt: now() });
    log(orgId, 'wallet', walletId, 'wallet.toppedUp', { amount }, 'system');
  }, 4000);
  return t;
}
