import type {
  Client, DispatchOrder, ImpactSnapshot, InsightRequest, Money, OrgSettings, PaymentInstalment, Plot, SalesContract, SalesDocument,
} from '@/types';
import { canAct, start, type WorkflowRecord } from '@/engines/workflow';
import { makeEvent } from '@/engines/activity';
import { hasPermission } from '@/engines/permissions';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSalesStore } from '@/stores/salesStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { workflowUser } from './workflowService';

/**
 * Sales (PRD H6–H8): contracts with a payment schedule from the company's terms, dispatch orders
 * loaded from pending outbounds (or bought direct), approval, shipment tracking, verification with
 * the per-client sale number, contract fulfilment, and what the buyer sees on Traceboard through a
 * data-sharing grant: orders, impact and trace to the farmers, communities and plots behind them.
 */

const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const now = () => new Date().toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);
const r1 = (kg: number) => Math.round(kg * 10) / 10;
const money = (amountMinor: number, currency: string): Money => ({ amountMinor: Math.round(amountMinor), currency });
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
const S = () => useSalesStore.getState();
const dispatchOf = (id: string) => S().dispatches.find((d) => d.id === id)!;
const contractOf = (id: string) => S().contracts.find((c) => c.id === id)!;
export const clientOf = (id: string): Client | undefined => S().clients.find((c) => c.id === id);
const issue = (orgId: string, docType: string, ctx: Record<string, string> = {}) => useSettingsStore.getState().issueNumber(orgId, docType, { date: new Date(), ...ctx });

/** Kg in a contract quantity (contracts are in tonnes by default). */
export const toKg = (quantity: number, unitId: string) => (unitId === 't' ? quantity * 1000 : unitId === 'bag' ? quantity * 85 : quantity);

function usersWith(orgId: string, permission: string): string[] {
  return useAccessStore.getState().memberships
    .filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && hasPermission(workflowUser(m.userId, orgId).permissions, permission))
    .map((m) => m.userId);
}
function notify(orgId: string, userIds: string[], key: string, params: Record<string, unknown>, link: string, kind: 'ALERT' | 'APPROVAL' | 'PAYMENT' = 'ALERT') {
  const at = now();
  for (const userId of new Set(userIds)) useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId, kind, key, params, link, read: false, at });
}

// ---------------------------------------------------------------- Contracts

export interface ContractInput {
  orgId: string; clientId: string; templateId?: string; commodityId: string; grade?: string; quantity: number; unitId: string; pricePerUnitMinor: number; currency: string;
  paymentTermId: string; packagingId: string; shipmentWindow: { start: string; end: string }; deliveryPoint: string; officerUserId: string; tolerancePct: number;
  status?: 'DRAFT' | 'AGREED'; signedDocument?: string; notes?: string; actorId: string;
}

/** Instalments from the payment terms; advances fall due a few days after signature, the rest on or after delivery. */
export function buildSchedule(settings: OrgSettings, termId: string, total: Money, signedAt?: string): PaymentInstalment[] {
  const term = settings.sales.paymentTerms.find((x) => x.id === termId);
  const parts = term?.instalments ?? [{ pct: 100, trigger: 'DELIVERY' as const, days: 0 }];
  let left = total.amountMinor;
  return parts.map((p, i) => {
    const amount = i === parts.length - 1 ? left : Math.round((total.amountMinor * p.pct) / 100);
    left -= amount;
    const due = p.trigger === 'SIGNATURE' && signedAt ? day(new Date(new Date(signedAt).getTime() + p.days * 86_400_000)) : undefined;
    return { id: uid('pi'), label: `${p.pct}%`, pct: p.pct, amount: money(amount, total.currency), trigger: p.trigger, dueDate: due };
  });
}

export const contractValue = (c: Pick<SalesContract, 'quantity' | 'pricePerUnit'>) => money(c.quantity * c.pricePerUnit.amountMinor, c.pricePerUnit.currency);

export function saveContract(input: ContractInput, id?: string): SalesContract {
  const { orgId } = input;
  const settings = settingsOf(orgId);
  const existing = id ? contractOf(id) : undefined;
  const at = now();
  const commodity = settings.commodities.find((c) => c.id === input.commodityId);
  const status = existing && existing.status !== 'DRAFT' ? existing.status : input.status ?? 'DRAFT';
  const base = {
    clientId: input.clientId, templateId: input.templateId, commodityId: input.commodityId, grade: input.grade, quantity: input.quantity, unitId: input.unitId,
    pricePerUnit: money(input.pricePerUnitMinor, input.currency), paymentTermId: input.paymentTermId, packagingId: input.packagingId, shipmentWindow: input.shipmentWindow,
    deliveryPoint: input.deliveryPoint, officerUserId: input.officerUserId, tolerancePct: input.tolerancePct, signedDocument: input.signedDocument, notes: input.notes,
    qualitySpec: existing?.qualitySpec ?? (commodity?.quality ?? []).map((q) => ({ key: q.key, label: q.label, max: q.max, unit: q.unit })),
  };
  const total = contractValue({ quantity: input.quantity, pricePerUnit: base.pricePerUnit });
  const scheduleChanged = !existing || existing.paymentTermId !== input.paymentTermId || existing.quantity !== input.quantity || existing.pricePerUnit.amountMinor !== input.pricePerUnitMinor;
  const c: SalesContract = {
    ...(existing ?? { id: uid('sc'), orgId, createdAt: at, createdBy: input.actorId, number: issue(orgId, 'salesContract'), documents: [] }),
    ...base, status, updatedAt: at,
    schedule: scheduleChanged && !existing?.schedule.some((p) => p.received) ? buildSchedule(settings, input.paymentTermId, total, status !== 'DRAFT' ? at : undefined) : existing!.schedule,
    documents: input.signedDocument && !existing?.documents.some((d) => d.name === input.signedDocument)
      ? [...(existing?.documents ?? []), { id: uid('doc'), type: 'signedContract', name: input.signedDocument, at, by: input.actorId }] : existing?.documents ?? [],
  };
  S().saveContract(c);
  log(orgId, 'salesContract', c.id, existing ? 'contract.updated' : 'contract.created', { number: c.number, total }, input.actorId);
  return c;
}

/** Draft → Agreed: advances in the schedule get their due dates. */
export function agreeContract(id: string, actorId: string, signedDocument?: string) {
  const c = contractOf(id);
  const at = now();
  S().updateContract(id, {
    status: 'AGREED',
    schedule: c.schedule.map((p) => (p.trigger === 'SIGNATURE' && !p.dueDate ? { ...p, dueDate: day(new Date(Date.now() + 7 * 86_400_000)) } : p)),
    signedDocument: signedDocument ?? c.signedDocument,
    documents: signedDocument ? [...c.documents, { id: uid('doc'), type: 'signedContract', name: signedDocument, at, by: actorId }] : c.documents,
  });
  log(c.orgId, 'salesContract', id, 'contract.agreed', { number: c.number }, actorId);
}

export function cancelContract(id: string, reason: string, actorId: string) {
  const c = contractOf(id);
  S().updateContract(id, { status: 'CANCELLED', notes: reason });
  log(c.orgId, 'salesContract', id, 'contract.cancelled', { reason }, actorId);
}

export function markInstalmentReceived(contractId: string, instalmentId: string, reference: string, actorId: string) {
  const c = contractOf(contractId);
  S().updateContract(contractId, { schedule: c.schedule.map((p) => (p.id === instalmentId ? { ...p, received: { at: now(), by: actorId, reference } } : p)) });
  const p = c.schedule.find((x) => x.id === instalmentId);
  log(c.orgId, 'salesContract', contractId, 'contract.paymentReceived', { amount: p?.amount ?? '', reference }, actorId);
}

/** Instalments past their due date and not received. */
export const overdueInstalments = (c: SalesContract, today = day(new Date())) => c.schedule.filter((p) => !p.received && p.dueDate && p.dueDate < today);

/** Delivered (verified) kg against the contract, and whether it is fulfilled within tolerance. */
export function fulfilment(c: SalesContract, dispatches = S().dispatches) {
  const linked = dispatches.filter((d) => d.contractId === c.id && d.status !== 'REJECTED');
  const deliveredKg = r1(linked.filter((d) => d.verification).reduce((s, d) => s + d.verification!.deliveredKg, 0));
  const inTransitKg = r1(linked.filter((d) => !d.verification).reduce((s, d) => s + d.expectedKg, 0));
  const contractedKg = toKg(c.quantity, c.unitId);
  const pct = contractedKg ? Math.round((deliveredKg / contractedKg) * 1000) / 10 : 0;
  return { linked, deliveredKg, inTransitKg, contractedKg, pct, fulfilled: deliveredKg >= contractedKg * (1 - c.tolerancePct / 100) };
}

function refreshContract(id: string, actorId: string) {
  const c = contractOf(id);
  if (!c || c.status === 'CANCELLED') return;
  const f = fulfilment(c);
  const status: SalesContract['status'] = f.fulfilled ? 'FULFILLED' : f.linked.length ? 'ORDER_CREATED' : c.status;
  // Instalments due on delivery get their date at the first verified delivery.
  const firstDelivery = f.linked.map((d) => d.verification?.at).filter(Boolean).sort()[0];
  const schedule = firstDelivery
    ? c.schedule.map((p) => (p.dueDate ? p : p.trigger === 'DELIVERY' ? { ...p, dueDate: firstDelivery.slice(0, 10) } : p.trigger === 'AFTER_DELIVERY' ? { ...p, dueDate: day(new Date(new Date(firstDelivery).getTime() + (settingsOf(c.orgId).sales.paymentTerms.find((x) => x.id === c.paymentTermId)?.instalments.find((i) => i.trigger === 'AFTER_DELIVERY')?.days ?? 30) * 86_400_000)) } : p))
    : c.schedule;
  if (status !== c.status || schedule !== c.schedule) S().updateContract(id, { status, schedule });
  if (status !== c.status) log(c.orgId, 'salesContract', id, status === 'FULFILLED' ? 'contract.fulfilled' : 'contract.orderCreated', { pct: f.pct }, actorId);
}

// ---------------------------------------------------------------- Trace and impact

/** The farmers, communities and plots behind a dispatch: from its bags' purchases, or the requests bought direct. */
export function traceOf(d: Pick<DispatchOrder, 'orgId' | 'bagCodes' | 'requestIds' | 'kind'>) {
  const { purchases, bags } = useBuyingStore.getState();
  const codes = new Set(d.bagCodes);
  const purchaseIds = new Set<string>();
  if (d.kind === 'INVENTORY') for (const b of bags) { if (b.orgId === d.orgId && codes.has(b.code)) b.purchaseIds.forEach((p) => purchaseIds.add(p)); }
  const reqIds = new Set(d.requestIds);
  const list = purchases.filter((p) => p.orgId === d.orgId && (purchaseIds.has(p.id) || reqIds.has(p.requestId)));
  const farmerIds = new Set(list.map((p) => p.farmerId));
  const farmers = useFarmerStore.getState().farmers.filter((f) => farmerIds.has(f.id));
  const communityIds = new Set(farmers.map((f) => f.communityId));
  const communities = useCommunityStore.getState().communities.filter((c) => communityIds.has(c.id));
  const plots = S().plots.filter((p) => farmerIds.has(p.farmerId));
  const kgByCommunity = new Map<string, number>();
  for (const p of list) kgByCommunity.set(p.communityId, (kgByCommunity.get(p.communityId) ?? 0) + p.quantity);
  return { purchases: list, farmers, communities, plots, kgByCommunity };
}

/** The company's impact KPIs for the farmers behind an order (no metric is hard-wired to zero). */
export function impactOf(d: Pick<DispatchOrder, 'orgId' | 'bagCodes' | 'requestIds' | 'kind'>): ImpactSnapshot {
  const t = traceOf(d);
  const n = t.farmers.length;
  const women = t.farmers.filter((f) => f.gender === 'F').length;
  const children = t.farmers.reduce((s, f) => s + Number(f.customFields.numberOfChildren ?? 0), 0);
  const ids = new Set(t.farmers.map((f) => f.id));
  // Trees from paid agroforestry support (seedlings handed out per farmer line).
  const trees = useSupportStore.getState().requests.filter((r) => r.orgId === d.orgId).flatMap((r) => r.lines)
    .filter((l) => ids.has(l.farmerId) && ['PAID', 'FULFILLED'].includes(l.status) && /agro/i.test(l.typeId)).reduce((s, l) => s + (l.quantity ?? 25), 0);
  const farmersWithPlot = new Set(t.plots.map((p) => p.farmerId)).size;
  const compliant = t.plots.filter((p) => p.eudrStatus === 'COMPLIANT').length;
  return {
    farmers: n, communities: t.communities.length, womenPct: n ? Math.round((women / n) * 100) : 0, childrenPerFarmer: n ? Math.round((children / n) * 10) / 10 : 0,
    treesPlanted: trees, plotsMapped: farmersWithPlot, eudrPct: t.plots.length ? Math.round((compliant / t.plots.length) * 100) : 0,
  };
}

// ---------------------------------------------------------------- Dispatch orders

/** Outbounds that left a warehouse and are not on a dispatch order yet. */
export function pendingOutbounds(orgId: string, commodityId?: string) {
  return useWarehouseStore.getState().transfers.filter((t) => t.orgId === orgId && t.kind === 'OUTBOUND' && !t.dispatchId && (!commodityId || t.commodityId === commodityId));
}

export interface DispatchInput {
  orgId: string; kind: DispatchOrder['kind']; clientId: string; contractId?: string; commodityId: string; outboundIds?: string[]; requestIds?: string[];
  loading: DispatchOrder['loading']; driver: DispatchOrder['driver']; truck: DispatchOrder['truck']; waybill: string; expectedKg?: number; actorId: string;
}

export function createDispatch(input: DispatchInput): DispatchOrder {
  const { orgId } = input;
  const transfers = useWarehouseStore.getState().transfers.filter((t) => input.outboundIds?.includes(t.id));
  if (input.kind === 'INVENTORY') {
    if (!transfers.length) throw new Error('noOutbound');
    if (transfers.some((t) => t.commodityId !== input.commodityId)) throw new Error('commodity');
    if (transfers.some((t) => t.dispatchId)) throw new Error('alreadyLoaded');
  }
  if (input.contractId && contractOf(input.contractId).commodityId !== input.commodityId) throw new Error('contractCommodity');
  const bagCodes = transfers.flatMap((t) => t.bagCodes);
  const requestIds = input.requestIds ?? [];
  const expectedKg = input.kind === 'INVENTORY' ? r1(transfers.reduce((s, t) => s + t.sentKg, 0)) : r1(input.expectedKg ?? 0);
  const at = now();
  const base = {
    id: uid('do'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(orgId, 'dispatchOrder'), kind: input.kind, clientId: input.clientId,
    contractId: input.contractId, commodityId: input.commodityId, outboundIds: transfers.map((t) => t.id), requestIds, bagCodes, loading: input.loading,
    driver: input.driver, truck: input.truck, waybill: input.waybill, expectedKg, impact: impactOf({ orgId, bagCodes, requestIds, kind: input.kind }),
    tracking: [], documents: input.truck.image || input.driver.licence ? [
      ...(input.driver.licence ? [{ id: uid('doc'), type: 'licence', name: input.driver.licence, at, by: input.actorId }] : []),
      ...(input.truck.image ? [{ id: uid('doc'), type: 'truck', name: input.truck.image, at, by: input.actorId }] : []),
    ] : [], downloads: [],
  };
  const def = settingsOf(orgId).workflows.find((w) => w.docType === 'dispatchOrder')!;
  const d = start(def, base as never, at).record as unknown as DispatchOrder;
  S().saveDispatch({ ...d, tracking: [{ at, status: d.status, by: input.actorId }] });
  for (const t of transfers) useWarehouseStore.getState().updateTransfer(t.id, { dispatchId: d.id });
  log(orgId, 'dispatchOrder', d.id, 'dispatch.created', { number: d.number, kg: expectedKg, client: clientOf(input.clientId)?.name ?? '' }, input.actorId);
  if (input.contractId) refreshContract(input.contractId, input.actorId);
  const approvers = useAccessStore.getState().memberships.filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && m.userId !== input.actorId && canAct(d as unknown as WorkflowRecord, def, workflowUser(m.userId, orgId))).map((m) => m.userId);
  notify(orgId, approvers, 'approvalNeeded', { docType: 'dispatchOrder', number: d.number }, `/app/dispatch?open=${d.id}`, 'APPROVAL');
  return dispatchOf(d.id);
}

/** Buyer users of the client's platform company, when a sharing grant with orders is active. */
function buyerUsers(d: DispatchOrder): { orgId: string; userIds: string[] } | null {
  const client = clientOf(d.clientId);
  if (!client?.buyerOrgId) return null;
  const grant = usePlatformStore.getState().grants.find((g) => g.fromOrgId === d.orgId && g.toOrgId === client.buyerOrgId && g.status === 'ACTIVE' && g.scopes.includes('orders'));
  if (!grant) return null;
  return { orgId: client.buyerOrgId, userIds: usersWith(client.buyerOrgId, 'traceboard.view') };
}

const NEXT: Partial<Record<DispatchOrder['status'], 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED'>> = { PENDING: 'IN_TRANSIT', IN_TRANSIT: 'ARRIVED', ARRIVED: 'DELIVERED' };

/** Move a shipment on (Pending → In transit → Arrived → Delivered), with the truck's position and ETA. */
export function advanceShipment(id: string, actorId: string, update: { lat?: number; lng?: number; eta?: string; note?: string } = {}) {
  const d = dispatchOf(id);
  const next = NEXT[d.status];
  if (!next) return { ok: false as const };
  const at = now();
  const pos = update.lat != null && update.lng != null ? { lat: update.lat, lng: update.lng, at, eta: update.eta } : d.position;
  S().updateDispatch(id, { status: next, position: pos, tracking: [...d.tracking, { at, status: next, lat: update.lat, lng: update.lng, eta: update.eta, note: update.note, by: actorId }] });
  log(d.orgId, 'dispatchOrder', id, `dispatch.${next === 'IN_TRANSIT' ? 'inTransit' : next === 'ARRIVED' ? 'arrived' : 'delivered'}`, { eta: update.eta ?? '' }, actorId);
  shipmentNotify(dispatchOf(id), next);
  return { ok: true as const, status: next };
}

/** A position update while on the road. */
export function updatePosition(id: string, v: { lat: number; lng: number; eta?: string; note?: string }, actorId: string) {
  const d = dispatchOf(id);
  const at = now();
  S().updateDispatch(id, { position: { lat: v.lat, lng: v.lng, at, eta: v.eta }, tracking: [...d.tracking, { at, status: d.status, ...v, by: actorId }] });
}

function shipmentNotify(d: DispatchOrder, status: 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED' | 'VERIFIED') {
  if (status === 'ARRIVED') return;
  const key = status === 'IN_TRANSIT' ? 'shipmentInTransit' : status === 'DELIVERED' ? 'shipmentDelivered' : 'shipmentVerified';
  const buyer = buyerUsers(d);
  const supplier = usePlatformStore.getState().orgs.find((o) => o.id === d.orgId);
  const params = { number: d.number, supplier: supplier?.name ?? '', kg: Math.round(d.verification?.deliveredKg ?? d.expectedKg), sale: d.verification?.saleNumber ?? '' };
  if (buyer) notify(buyer.orgId, buyer.userIds, key, params, `/app/traceboard?open=${d.id}`, status === 'DELIVERED' ? 'APPROVAL' : 'ALERT');
  // The supplier's sales team (recipients by permission).
  notify(d.orgId, usersWith(d.orgId, 'salesContracts.view').filter((u) => hasPermission(workflowUser(u, d.orgId).permissions, 'dispatch.verify')), key, params, `/app/dispatch?open=${d.id}`);
}

export interface VerifyInput { weighbridge: string; invoice: string; qualityTest?: string; deliveredKg: number; bagsDelivered: number; unitPriceMinor: number; currency: string }

/** Verification: delivered weight, price and documents → sale number → buyer notified → contract fulfilment. */
export function verifyDispatch(id: string, v: VerifyInput, actorId: string) {
  const d = dispatchOf(id);
  if (d.status !== 'DELIVERED') throw new Error('notDelivered');
  const client = clientOf(d.clientId);
  const saleNumber = issue(d.orgId, 'saleNumber', { clientCode: client?.code ?? 'XX' });
  const at = now();
  const unitPrice = money(v.unitPriceMinor, v.currency);
  const amount = money((v.deliveredKg / 1000) * v.unitPriceMinor, v.currency);
  const docs: SalesDocument[] = [
    { id: uid('doc'), type: 'weighbridge', name: v.weighbridge, at, by: actorId },
    { id: uid('doc'), type: 'invoice', name: v.invoice, at, by: actorId },
    ...(v.qualityTest ? [{ id: uid('doc'), type: 'qualityTest', name: v.qualityTest, at, by: actorId }] : []),
  ];
  S().updateDispatch(id, {
    status: 'VERIFIED', verification: { weighbridge: v.weighbridge, invoice: v.invoice, qualityTest: v.qualityTest, deliveredKg: r1(v.deliveredKg), bagsDelivered: v.bagsDelivered, unitPrice, amount, saleNumber, at, by: actorId },
    documents: [...d.documents, ...docs], tracking: [...d.tracking, { at, status: 'VERIFIED', by: actorId }],
  });
  log(d.orgId, 'dispatchOrder', id, 'dispatch.verified', { sale: saleNumber, kg: r1(v.deliveredKg), amount }, actorId);
  shipmentNotify(dispatchOf(id), 'VERIFIED');
  if (d.contractId) refreshContract(d.contractId, actorId);
  return dispatchOf(id);
}

export function addDispatchDocument(id: string, doc: { type: string; name: string }, actorId: string) {
  const d = dispatchOf(id);
  S().updateDispatch(id, { documents: [...d.documents, { id: uid('doc'), ...doc, at: now(), by: actorId }] });
}

/** Every document download is logged, with the downloader's company (supplier or buyer). */
export function logDownload(dispatchId: string, docId: string, userId: string, orgId: string) {
  const d = dispatchOf(dispatchId);
  S().updateDispatch(dispatchId, { downloads: [...d.downloads, { docId, userId, orgId, at: now() }] });
  log(d.orgId, 'dispatchOrder', dispatchId, 'dispatch.downloaded', { name: d.documents.find((x) => x.id === docId)?.name ?? '' }, userId);
}

// ---------------------------------------------------------------- Traceboard

/** Suppliers sharing with a buyer, and which scopes. */
export function sharingSuppliers(buyerOrgId: string) {
  return usePlatformStore.getState().grants.filter((g) => g.toOrgId === buyerOrgId && g.status === 'ACTIVE');
}

/** What a buyer may see: dispatches of suppliers that share orders with it, for its own client records. */
export function buyerDispatches(buyerOrgId: string, all = S().dispatches, clients = S().clients) {
  const grants = sharingSuppliers(buyerOrgId).filter((g) => g.scopes.includes('orders'));
  const mine = new Set(clients.filter((c) => c.buyerOrgId === buyerOrgId && grants.some((g) => g.fromOrgId === c.orgId)).map((c) => c.id));
  return all.filter((d) => mine.has(d.clientId) && grants.some((g) => g.fromOrgId === d.orgId) && !['PENDING_APPROVAL', 'REJECTED', 'ON_HOLD'].includes(d.status));
}

export function setGrantScopes(grantId: string, scopes: ('orders' | 'traceability' | 'impact')[], actorId: string) {
  const g = usePlatformStore.getState().grants.find((x) => x.id === grantId)!;
  usePlatformStore.setState((st) => ({ grants: st.grants.map((x) => (x.id === grantId ? { ...x, scopes } : x)) }));
  log(g.fromOrgId, 'grant', grantId, 'grant.updated', { scopes: scopes.join(', ') }, actorId);
}

export function requestInsights(input: { fromOrgId: string; orgId: string; userId: string; topic: string; message: string; dispatchId?: string }): InsightRequest {
  const r: InsightRequest = { id: uid('ins'), ...input, status: 'OPEN', createdAt: now() };
  S().saveInsight(r);
  const buyer = usePlatformStore.getState().orgs.find((o) => o.id === input.fromOrgId);
  notify(input.orgId, usersWith(input.orgId, 'traceboard.share'), 'insightRequested', { buyer: buyer?.name ?? '', topic: input.topic }, '/app/traceboard?tab=insights');
  return r;
}

export function answerInsight(id: string, text: string, actorId: string) {
  const r = S().insights.find((x) => x.id === id)!;
  S().saveInsight({ ...r, status: 'ANSWERED', answer: { text, by: actorId, at: now() } });
  notify(r.fromOrgId, [r.userId], 'insightAnswered', { topic: r.topic }, '/app/traceboard?tab=insights');
}

export const plotsOf = (orgId: string): Plot[] => S().plots.filter((p) => p.orgId === orgId);
