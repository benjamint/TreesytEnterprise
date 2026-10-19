import type { LoanAccount, Money, OrgSettings, Payment, ServiceApproval, ServiceProvider, SupportLine, SupportRequest, SupportType } from '@/types';
import { canAct, start, type WorkflowRecord } from '@/engines/workflow';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLoanStore } from '@/stores/loanStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useAgentStore } from '@/stores/agentStore';
import { pay, registerPayable } from './paymentService';
import { act, workflowUser, type ActOutcome } from './workflowService';

/**
 * Farmer support (PRD F2–F3): a group request with per-farmer lines goes through the scoring gate,
 * approval per service, agent confirmation of who turned up, payout (group wallet, farmer wallets
 * or the service provider), and fulfilment proof per farmer. Recoverable support opens a loan per
 * paid farmer, recovered later through recovery requests (recoveryService).
 */

const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const currencyOf = (orgId: string) => usePlatformStore.getState().orgs.find((o) => o.id === orgId)?.currency ?? 'GHS';
const now = () => new Date().toISOString();
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
const reqOf = (id: string) => useSupportStore.getState().requests.find((r) => r.id === id)!;
export const typeOf = (orgId: string, typeId: string): SupportType | undefined => settingsOf(orgId).support.types.find((t) => t.id === typeId);
const defOf = (orgId: string) => settingsOf(orgId).workflows.find((w) => w.docType === 'supportRequest')!;

function notifyApprovers(r: SupportRequest, exceptId?: string) {
  const def = defOf(r.orgId);
  const at = now();
  for (const m of useAccessStore.getState().memberships.filter((x) => x.orgId === r.orgId && x.status === 'ACTIVE' && x.userId !== exceptId)) {
    if (canAct(r as unknown as WorkflowRecord, def, workflowUser(m.userId, r.orgId)))
      useNotificationStore.getState().push({ id: uid('ntf'), orgId: r.orgId, userId: m.userId, kind: 'APPROVAL', key: 'approvalNeeded', params: { docType: 'supportRequest', number: r.number }, link: `/app/support?open=${r.id}`, read: false, at });
  }
}
const notifyAgent = (r: SupportRequest, key: string, params: Record<string, unknown>) => {
  const agent = useAgentStore.getState().agents.find((a) => a.id === r.agentId);
  if (agent) useNotificationStore.getState().push({ id: uid('ntf'), orgId: r.orgId, userId: agent.userId, kind: 'ALERT', key, params: { number: r.number, ...params }, link: `/m/support/${r.id}`, read: false, at: now() });
};

// ---------------------------------------------------------------- Create & scoring gate

export interface NewSupportLine { farmerId: string; typeId: string; subType?: string; amountMinor: number; landSize?: number; quantity?: number; supplyDate?: string; abilityToPay: string }
export interface NewSupportRequest {
  orgId: string; groupId: string; agentId: string; primaryTypeId: string; secondaryTypeId?: string; agroforestry?: SupportRequest['agroforestry'];
  gps?: SupportRequest['gps']; lines: NewSupportLine[]; voice: SupportRequest['voice']; actorId: string; device?: 'web' | 'mobile';
}

/** The group has record documents that still need a manual score (C4) — support waits until scored. */
export function needsScoring(orgId: string, groupId: string, typeIds: string[]): boolean {
  const g = useGroupStore.getState().groups.find((x) => x.id === groupId);
  return !!g && g.scoreStatus === 'PENDING_REVIEW' && typeIds.some((id) => typeOf(orgId, id)?.groupScoring);
}

export function createSupportRequest(input: NewSupportRequest): SupportRequest {
  const { orgId } = input;
  const currency = currencyOf(orgId);
  const group = useGroupStore.getState().groups.find((g) => g.id === input.groupId)!;
  const agent = useAgentStore.getState().agents.find((a) => a.id === input.agentId);
  const at = now();
  const lines: SupportLine[] = input.lines.map((l) => ({
    id: uid('sl'), farmerId: l.farmerId, typeId: l.typeId, subType: l.subType, amount: { amountMinor: l.amountMinor, currency }, landSize: l.landSize, quantity: l.quantity,
    supplyDate: l.supplyDate, abilityToPay: l.abilityToPay, status: 'PENDING',
  }));
  const primary = typeOf(orgId, input.primaryTypeId);
  const wallet = group.wallet ? { providerId: group.wallet.provider, number: group.wallet.number, name: group.wallet.name } : undefined;
  const base = {
    id: uid('pf'), orgId, createdAt: at, updatedAt: at, createdBy: agent?.userId ?? input.actorId, number: useSettingsStore.getState().issueNumber(orgId, 'supportRequest', { date: new Date() }),
    groupId: group.id, communityId: group.communityId, agentId: input.agentId, primaryTypeId: input.primaryTypeId, secondaryTypeId: input.secondaryTypeId, agroforestry: input.agroforestry,
    gps: input.gps, lines, voice: input.voice, services: [], total: { amountMinor: lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency },
    payout: { method: (primary?.payout === 'SUPPLIER' ? 'PROVIDER' : wallet ? 'GROUP_WALLET' : 'FARMER_WALLETS') as SupportRequest['payout']['method'], wallet },
    disbursements: [], refunds: [], assets: {}, fulfilmentStatus: 'PENDING' as const, device: input.device,
  };
  let r: SupportRequest;
  const gate = needsScoring(orgId, group.id, [input.primaryTypeId, ...(input.secondaryTypeId ? [input.secondaryTypeId] : []), ...lines.map((l) => l.typeId)]);
  if (gate) r = { ...base, status: 'PENDING_SCORING', approvals: [] };
  else r = start(defOf(orgId), base, at).record as unknown as SupportRequest;
  useSupportStore.getState().saveRequest(r);
  log(orgId, 'supportRequest', r.id, 'support.created', { number: r.number, total: r.total }, input.actorId, input.device);
  if (gate) log(orgId, 'supportRequest', r.id, 'support.scoringGate', { group: group.name }, 'system');
  else notifyApprovers(r, r.createdBy);
  return r;
}

/** After the group's manual score review, its requests waiting at the gate move on to approval. */
export function releaseScored(orgId: string, groupId: string, actorId: string): number {
  const waiting = useSupportStore.getState().requests.filter((r) => r.orgId === orgId && r.groupId === groupId && r.status === 'PENDING_SCORING');
  for (const w of waiting) {
    const r = start(defOf(orgId), { ...w, status: undefined, approvals: [] } as never, now()).record as unknown as SupportRequest;
    useSupportStore.getState().saveRequest({ ...w, ...r });
    log(orgId, 'supportRequest', w.id, 'support.scored', {}, actorId);
    notifyApprovers({ ...w, ...r }, w.createdBy);
  }
  return waiting.length;
}

// ---------------------------------------------------------------- Approval per service

/** Change one farmer's amount before approval; logged old → new. */
export function editLineAmount(id: string, lineId: string, amountMinor: number, actorId: string, reason?: string) {
  const r = reqOf(id);
  const line = r.lines.find((l) => l.id === lineId)!;
  const to = { amountMinor, currency: line.amount.currency };
  const lines = r.lines.map((l) => (l.id === lineId ? { ...l, amount: to, edits: [...(l.edits ?? []), { from: l.amount, to, by: actorId, at: now(), reason }] } : l));
  useSupportStore.getState().updateRequest(id, { lines, total: { amountMinor: lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency: to.currency } });
  log(r.orgId, 'supportRequest', id, 'support.amountEdited', { from: line.amount, to }, actorId);
}

export type ServiceInput = Omit<ServiceApproval, 'by' | 'at'>;

/** Approve the services on the request (amount per farmer applied to their lines), then the workflow step. */
export function approveSupport(id: string, services: ServiceInput[], actorId: string): ActOutcome {
  const r = reqOf(id);
  const at = now();
  const lines = r.lines.map((l) => {
    const s = services.find((x) => x.typeId === l.typeId);
    if (!s) return l;
    if (s.amountPerFarmer.amountMinor === l.amount.amountMinor) return l;
    return { ...l, amount: s.amountPerFarmer, edits: [...(l.edits ?? []), { from: l.amount, to: s.amountPerFarmer, by: actorId, at }] };
  });
  const out = act(r.orgId, 'supportRequest', id, 'APPROVE', actorId);
  if (!out.ok) return out;
  const provider = services.find((s) => s.providerId)?.providerId;
  const prov = provider ? useSupportStore.getState().providers.find((p) => p.id === provider) : undefined;
  useSupportStore.getState().updateRequest(id, {
    services: services.map((s) => ({ ...s, by: actorId, at })), lines: lines.map((l) => (services.some((s) => s.typeId === l.typeId) ? { ...l, status: 'APPROVED' as const } : { ...l, status: 'REJECTED' as const })),
    total: { amountMinor: lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency: r.total.currency },
    payout: prov?.wallet && services.some((s) => s.arrangement === 'PROVIDER_PAID') ? { method: 'PROVIDER', wallet: prov.wallet } : r.payout,
  });
  for (const s of services) { const ty = typeOf(r.orgId, s.typeId); log(r.orgId, 'supportRequest', id, 'support.serviceApproved', { type: (ty && Object.values(ty.name)[0]) ?? s.typeId, amount: s.amountPerFarmer }, actorId); }
  notifyAgent(reqOf(id), 'supportApproved', {});
  return out;
}

// ---------------------------------------------------------------- Agent confirmation (mobile)

export interface Confirmation { present: string[]; declined: string[]; wallet?: SupportRequest['payout']['wallet'] }

/** Mark who turned up; the others are rejected, opt-outs are declined; confirm the group wallet. */
export function confirmRecipients(id: string, c: Confirmation, actorId: string, device: 'web' | 'mobile' = 'mobile') {
  const r = reqOf(id);
  const lines = r.lines.map((l) => {
    if (l.status !== 'APPROVED') return l;
    if (c.declined.includes(l.farmerId)) return { ...l, status: 'DECLINED' as const };
    return { ...l, status: c.present.includes(l.farmerId) ? ('CONFIRMED' as const) : ('REJECTED' as const) };
  });
  useSupportStore.getState().updateRequest(id, {
    lines, status: 'PENDING_DISBURSEMENT', confirmedAt: now(),
    payout: c.wallet && r.payout.method === 'GROUP_WALLET' ? { ...r.payout, wallet: c.wallet } : r.payout,
  });
  log(r.orgId, 'supportRequest', id, 'support.confirmed', { count: lines.filter((l) => l.status === 'CONFIRMED').length }, actorId, device);
}

// ---------------------------------------------------------------- Disbursement

export const payableAmount = (r: SupportRequest) => r.lines.filter((l) => l.status === 'CONFIRMED').reduce((s, l) => s + l.amount.amountMinor, 0);

/** Payee lines for the pay dialog: the group wallet, each confirmed farmer's wallet, or the provider. */
export function supportPayees(r: SupportRequest, farmerWallet: (farmerId: string) => { name: string; number: string } | undefined) {
  const amount = (minor: number): Money => ({ amountMinor: minor, currency: r.total.currency });
  if (r.payout.method === 'FARMER_WALLETS') {
    return r.lines.filter((l) => l.status === 'CONFIRMED').map((l) => { const w = farmerWallet(l.farmerId); return { name: w?.name ?? '', number: w?.number ?? '', amount: l.amount, payableId: r.id, meta: { lineId: l.id } }; });
  }
  const w = r.payout.wallet;
  return [{ name: w?.name ?? '', number: w?.number ?? '', providerId: w?.providerId, amount: amount(payableAmount(r)), payableId: r.id }];
}

function afterPaid(id: string, amount: Money, method: 'MOMO' | 'MANUAL', to: string, actorId: string, opts: { paymentId?: string; proof?: string; lineId?: string } = {}) {
  const r = reqOf(id);
  const lines = r.lines.map((l) => (l.status === 'CONFIRMED' && (!opts.lineId || l.id === opts.lineId) ? { ...l, status: 'PAID' as const } : l));
  const done = !lines.some((l) => l.status === 'CONFIRMED');
  const loaned = createLoans({ ...r, lines }, lines.filter((l) => l.status === 'PAID' && !l.loanId && (!opts.lineId || l.id === opts.lineId)));
  useSupportStore.getState().updateRequest(id, {
    lines: lines.map((l) => (loaned[l.id] ? { ...l, loanId: loaned[l.id] } : l)), status: done ? 'DISBURSED' : r.status,
    disbursements: [...r.disbursements, { id: uid('sd'), amount, method, to, at: now(), by: actorId, paymentId: opts.paymentId, proof: opts.proof }],
  });
  log(r.orgId, 'supportRequest', id, 'support.disbursed', { amount, to }, actorId);
  if (Object.keys(loaned).length) log(r.orgId, 'supportRequest', id, 'support.loansOpened', { count: Object.keys(loaned).length }, 'system');
  if (done) notifyAgent(reqOf(id), 'supportPaid', { amount });
}

/** Recoverable support opens a loan per paid farmer, due at the end of the programme's active recovery window. */
function createLoans(r: SupportRequest, lines: SupportLine[]): Record<string, string> {
  const out: Record<string, string> = {};
  const settings = settingsOf(r.orgId);
  const at = now();
  const today = at.slice(0, 10);
  const loans: LoanAccount[] = [];
  for (const l of lines) {
    if (!typeOf(r.orgId, l.typeId)?.recoverable) continue;
    const win = useSupportStore.getState().windows.find((w) => w.orgId === r.orgId && w.typeId === l.typeId && w.status === 'ACTIVE' && w.end >= today)
      ?? useSupportStore.getState().windows.find((w) => w.orgId === r.orgId && w.status === 'ACTIVE' && w.end >= today);
    const end = win?.end ?? new Date(Date.now() + settings.support.recoveryWindowDays * 86_400_000).toISOString().slice(0, 10);
    const id = uid('loan');
    loans.push({ id, orgId: r.orgId, createdAt: at, updatedAt: at, createdBy: 'system', farmerId: l.farmerId, principal: l.amount, disbursedAt: today, window: { start: today, end }, repayments: [], status: 'ACTIVE', typeId: l.typeId, supportRequestId: r.id, lineId: l.id, groupId: r.groupId });
    out[l.id] = id;
  }
  if (loans.length) useLoanStore.getState().addLoans(loans);
  return out;
}

export async function disburseSupport(id: string, actorId: string, farmerWallet: (farmerId: string) => { name: string; number: string } | undefined): Promise<Payment[]> {
  const r = reqOf(id);
  return pay({ orgId: r.orgId, type: 'FARMER_SUPPORT', payableId: r.id, payees: supportPayees(r, farmerWallet), actorId });
}

export function disburseSupportManual(id: string, amountMinor: number, proof: string, actorId: string) {
  const r = reqOf(id);
  afterPaid(id, { amountMinor, currency: r.total.currency }, 'MANUAL', r.payout.wallet?.name ?? '—', actorId, { proof });
}

registerPayable('FARMER_SUPPORT', {
  onStatus: (p) => {
    const r = useSupportStore.getState().requests.find((x) => x.id === p.payableId);
    if (!r) return;
    const by = p.approvedBy ?? p.initiatedBy;
    if (p.status === 'SUCCESSFUL') afterPaid(r.id, p.amount, 'MOMO', p.payee.name, by, { paymentId: p.id, lineId: p.meta?.lineId as string | undefined });
    else if (p.status === 'FAILED' || p.status === 'UNKNOWN') log(r.orgId, 'supportRequest', r.id, p.status === 'FAILED' ? 'support.payoutFailed' : 'support.payoutUnknown', { reference: p.reference, reason: p.failureReason ?? '' }, by);
  },
});

// ---------------------------------------------------------------- Fulfilment, assets, refunds

export function recordFulfilment(id: string, lineId: string, proof: { audioSeconds: number; witness?: string; photo?: string; gps?: { lat: number; lng: number; accuracy: number } }, actorId: string, device: 'web' | 'mobile' = 'mobile') {
  const r = reqOf(id);
  const lines = r.lines.map((l) => (l.id === lineId && l.status === 'PAID' ? { ...l, status: 'FULFILLED' as const, fulfilment: { ...proof, at: now(), by: actorId } } : l));
  const paidLike = lines.filter((l) => l.status === 'PAID' || l.status === 'FULFILLED');
  const fulfilled = paidLike.filter((l) => l.status === 'FULFILLED').length;
  const fulfilmentStatus: SupportRequest['fulfilmentStatus'] = fulfilled === 0 ? 'PENDING' : fulfilled === paidLike.length ? 'FULL' : 'PARTIAL';
  const all = fulfilmentStatus === 'FULL' && r.status === 'DISBURSED';
  useSupportStore.getState().updateRequest(id, { lines, fulfilmentStatus, status: all ? 'FULFILLED' : r.status });
  log(r.orgId, 'supportRequest', id, 'support.lineFulfilled', { seconds: proof.audioSeconds }, actorId, device);
  if (all) log(r.orgId, 'supportRequest', id, 'support.fulfilled', { count: fulfilled }, actorId, device);
}

export function saveAssets(id: string, assets: { agreement?: string; thumbprints?: number }, actorId: string, device: 'web' | 'mobile' = 'mobile') {
  const r = reqOf(id);
  useSupportStore.getState().updateRequest(id, { assets: { ...r.assets, ...assets, at: now() } });
  log(r.orgId, 'supportRequest', id, 'support.assets', { thumbprints: assets.thumbprints ?? 0 }, actorId, device);
}

/** Pay back a farmer who opted out after the group was paid for them. */
export function refundDeclined(id: string, farmerId: string, amountMinor: number, method: string, reference: string, document: string | undefined, actorId: string) {
  const r = reqOf(id);
  const refund = { id: uid('sr'), farmerId, amount: { amountMinor, currency: r.total.currency }, method, reference, document, at: now(), by: actorId };
  useSupportStore.getState().updateRequest(id, { refunds: [...r.refunds, refund] });
  log(r.orgId, 'supportRequest', id, 'support.refunded', { amount: refund.amount, reference }, actorId);
}

// ---------------------------------------------------------------- Service providers

export type ProviderInput = Pick<ServiceProvider, 'name' | 'typeIds' | 'offers' | 'location' | 'phone' | 'status' | 'wallet'>;
export function saveProvider(orgId: string, actorId: string, input: ProviderInput, id?: string): ServiceProvider {
  const at = now();
  const existing = id ? useSupportStore.getState().providers.find((p) => p.id === id) : undefined;
  const p: ServiceProvider = { ...(existing ?? { id: uid('sp'), orgId, createdAt: at, createdBy: actorId }), ...input, name: input.name.trim(), updatedAt: at } as ServiceProvider;
  useSupportStore.getState().saveProvider(p);
  log(orgId, 'serviceProvider', p.id, existing ? 'provider.updated' : 'provider.created', { name: p.name }, actorId);
  return p;
}
