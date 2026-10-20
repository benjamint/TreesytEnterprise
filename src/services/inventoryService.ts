import type {
  AgentRepayment, Bag, BagReceipt, Discrepancy, Inbound, InboundBag, Money, MovementKind, MovementType, OrgSettings, Payment, PreExpense,
  StockCount, StockMovement, Transfer, Warehouse, WarehouseExpense, WarehouseExpenseLine,
} from '@/types';
import { canAct, start, type WorkflowRecord } from '@/engines/workflow';
import { makeEvent } from '@/engines/activity';
import { hasPermission } from '@/engines/permissions';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { pay, registerPayable } from './paymentService';
import { workflowUser } from './workflowService';

/**
 * Inventory (PRD H1–H5). Bags are the unit of stock: a bag is in stock at a warehouse, in transit,
 * with an agent, missing or out of stock. Receiving compares each bag with what was expected and
 * raises discrepancies (missing bags, weight loss); small losses under the company tolerance are
 * written off automatically, the rest is resolved physically (returned bag, replaced tag, top-up
 * weight) or paid back by the agent and reviewed by finance.
 */

const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const currencyOf = (orgId: string) => usePlatformStore.getState().orgs.find((o) => o.id === orgId)?.currency ?? 'GHS';
const now = () => new Date().toISOString();
const r1 = (kg: number) => Math.round(kg * 10) / 10;
const money = (amountMinor: number, currency: string): Money => ({ amountMinor: Math.round(amountMinor), currency });
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
const W = () => useWarehouseStore.getState();
const issue = (orgId: string, docType: string) => useSettingsStore.getState().issueNumber(orgId, docType, { date: new Date() });
const inboundOf = (id: string) => W().inbounds.find((x) => x.id === id)!;
const whName = (id?: string) => W().warehouses.find((w) => w.id === id)?.name ?? '';

/** Users of the company holding a permission (for notifications). */
export function usersWith(orgId: string, permission: string): string[] {
  return useAccessStore.getState().memberships
    .filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && hasPermission(workflowUser(m.userId, orgId).permissions, permission))
    .map((m) => m.userId);
}
function notify(orgId: string, userIds: string[], key: string, params: Record<string, unknown>, link: string, kind: 'ALERT' | 'APPROVAL' | 'PAYMENT' = 'ALERT') {
  const at = now();
  for (const userId of new Set(userIds)) useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId, kind, key, params, link, read: false, at });
}
const agentUser = (agentId?: string) => useAgentStore.getState().agents.find((a) => a.id === agentId)?.userId;

// ---------------------------------------------------------------- Stock

export const bagsAt = (orgId: string, warehouseId: string) => useBuyingStore.getState().bags.filter((b) => b.orgId === orgId && b.warehouseId === warehouseId && b.status === 'IN_STOCK');
export const stockKg = (orgId: string, warehouseId: string) => r1(bagsAt(orgId, warehouseId).reduce((s, b) => s + b.weightKg, 0));

/** The agent who bought the produce in a bag. */
export function agentOfBag(b: Bag): string | undefined {
  const p = useBuyingStore.getState().purchases.find((x) => x.id === b.purchaseIds[0]);
  return p?.agentId;
}

/** Allowed loss in percent for a commodity and movement (Settings → Inventory rules). */
export function tolerancePct(orgId: string, commodityId: string, movement: MovementType): number {
  return settingsOf(orgId).inventoryRules.tolerances.find((t) => t.commodityId === commodityId && t.movement === movement)?.pct ?? 0;
}

function move(orgId: string, warehouseId: string, kind: MovementKind, commodityId: string, bags: number, kg: number, ref: string, refId: string, by: string): StockMovement {
  const before = stockKg(orgId, warehouseId);
  // Called after the bags were updated, so "before" is reconstructed from the signed change.
  const sign = kind === 'IN' || kind === 'TRANSFER_IN' || kind === 'RETURN' ? 1 : kind === 'ADJUSTMENT' ? Math.sign(kg) : -1;
  const delta = sign * Math.abs(kg);
  const mv: StockMovement = { id: uid('mv'), orgId, warehouseId, at: now(), kind, commodityId, bags, kg: r1(Math.abs(kg)), before: r1(before - delta), after: before, ref, refId, by };
  W().addMovements([mv]);
  return mv;
}

function saveBags(list: Bag[]) { if (list.length) useBuyingStore.getState().saveBags(list); }
const hist = (b: Bag, event: NonNullable<Bag['history']>[number]['event'], ref: string, by: string, note?: string) => [...(b.history ?? []), { at: now(), event, ref, by, note }];

// ---------------------------------------------------------------- Expected deliveries

/** Where an agent's trips are delivered: their own warehouse, or the company's first aggregation hub. */
export function deliveryWarehouse(orgId: string, agentId: string): Warehouse | undefined {
  const agent = useAgentStore.getState().agents.find((a) => a.id === agentId);
  const list = W().warehouses.filter((w) => w.orgId === orgId && w.status === 'ACTIVE');
  return list.find((w) => w.id === agent?.warehouseId) ?? list.find((w) => w.type === 'AGGREGATION_HUB') ?? list[0];
}

/** A paid PRE whose lines trigger inbound becomes an expected delivery with its bag list (PRD H2). */
export function createExpectedDelivery(e: PreExpense, actorId: string): Inbound | undefined {
  const wh = deliveryWarehouse(e.orgId, e.agentId);
  if (!wh) return undefined;
  const all = useBuyingStore.getState().bags;
  const req = useBuyingStore.getState().requests.find((r) => r.id === e.requestId);
  const codes = new Set(e.bagCodes ?? []);
  let bags = all.filter((b) => b.orgId === e.orgId && codes.has(b.code) && b.status !== 'IN_STOCK' && b.status !== 'OUT_OF_STOCK');
  if (!bags.length) {
    // No scanned list: the bags still with the agent on this request, up to the number on the PRE.
    const reqPurchases = new Set(useBuyingStore.getState().purchases.filter((p) => p.requestId === e.requestId).map((p) => p.id));
    bags = all.filter((b) => b.orgId === e.orgId && ['WITH_AGENT', 'IN_TRANSIT'].includes(b.status) && b.purchaseIds.some((id) => reqPurchases.has(id))).slice(0, e.bags);
  }
  const at = now();
  const inbound: Inbound = {
    id: uid('in'), orgId: e.orgId, createdAt: at, updatedAt: at, createdBy: actorId, number: issue(e.orgId, 'inbound'), warehouseId: wh.id,
    source: { kind: 'PRE', preId: e.id, requestId: e.requestId }, agentId: e.agentId, commodityId: req?.commodityId ?? bags[0]?.commodityId ?? '',
    bags: bags.map((b) => ({ code: b.code, expectedKg: b.weightKg })), expectedKg: r1(bags.reduce((s, b) => s + b.weightKg, 0)), status: 'PENDING',
  };
  W().saveInbound(inbound);
  saveBags(bags.map((b) => ({ ...b, status: 'IN_TRANSIT' })));
  useBuyingStore.getState().updateExpense(e.id, { expectedDelivery: { warehouseId: wh.id, bags: bags.length || e.bags, createdAt: at, inboundId: inbound.id } });
  log(e.orgId, 'inbound', inbound.id, 'inbound.expected', { number: e.number, count: bags.length, kg: inbound.expectedKg }, 'system');
  notify(e.orgId, [...wh.officerUserIds, ...usersWith(e.orgId, 'inbound.receive').filter((u) => wh.officerUserIds.includes(u))], 'inboundExpected', { number: inbound.number, count: bags.length, warehouse: wh.name }, '/m/warehouse');
  return inbound;
}

// ---------------------------------------------------------------- Receiving

export interface ReceiveBag { code: string; status: Exclude<BagReceipt, 'TOP_UP'>; receivedKg?: number; newCode?: string }
export interface ReceiveInput { bags: ReceiveBag[]; topUps?: { code: string; kg: number }[]; note?: string; actorId: string; device?: 'web' | 'mobile' }
export interface ReceiveResult { inbound: Inbound; discrepancies: Discrepancy[]; autoWrittenOff: Discrepancy[]; allocations: Allocation[]; steps: string[]; outOfBounds: string[] }
export interface Allocation { discrepancyId: string; bagCode: string; kg: number; inboundNumber: string }

/**
 * Receive an expected delivery or a transfer: each bag Original / Missing / Replaced tag with its
 * weight, plus any top-up bags. Raises discrepancies, writes off what is under the tolerance and
 * allocates top-up weight to the oldest open weight discrepancies.
 */
export function receiveInbound(id: string, input: ReceiveInput): ReceiveResult {
  const ib = inboundOf(id);
  const { orgId } = ib;
  const settings = settingsOf(orgId);
  const device = input.device ?? 'web';
  const movement: MovementType = ib.source.kind === 'TRANSFER' ? 'TRANSFER' : 'INBOUND';
  const tol = tolerancePct(orgId, ib.commodityId, movement);
  const pack = settings.packaging.find((p) => p.commodityId === ib.commodityId);
  const store = useBuyingStore.getState();
  const at = now();
  const steps: string[] = [];
  const outOfBounds: string[] = [];
  const updated: Bag[] = [];
  const created: Discrepancy[] = [];
  const lines: InboundBag[] = ib.bags.map((exp) => {
    const r = input.bags.find((x) => x.code === exp.code) ?? { code: exp.code, status: 'ORIGINAL' as const, receivedKg: exp.expectedKg };
    const bag = store.bags.find((b) => b.orgId === orgId && b.code === exp.code);
    const receivedKg = r.status === 'MISSING' ? 0 : r1(r.receivedKg ?? exp.expectedKg);
    if (bag) {
      if (r.status === 'MISSING') updated.push({ ...bag, status: 'MISSING', history: hist(bag, 'MISSING', ib.number, input.actorId) });
      else {
        const code = r.status === 'REPLACED' && r.newCode ? r.newCode : bag.code;
        updated.push({
          ...bag, code, status: 'IN_STOCK', warehouseId: ib.warehouseId, weightKg: receivedKg,
          replacement: r.status === 'REPLACED' && r.newCode ? { oldCode: bag.code, newCode: r.newCode, oldKg: exp.expectedKg, newKg: receivedKg, by: input.actorId, at, reason: 'Tag replaced on arrival' } : bag.replacement,
          history: hist(bag, r.status === 'REPLACED' ? 'REPLACED' : 'INBOUND', ib.number, input.actorId, r.status === 'REPLACED' ? `${bag.code} → ${r.newCode}` : undefined),
        });
      }
    }
    if (pack && r.status !== 'MISSING' && (receivedKg < pack.minKg || receivedKg > pack.maxKg)) outOfBounds.push(r.newCode ?? exp.code);
    const variance = r1(exp.expectedKg - receivedKg);
    if (r.status === 'MISSING' || variance > 0.05) {
      const pct = exp.expectedKg ? Math.round((variance / exp.expectedKg) * 10000) / 100 : 100;
      const auto = r.status !== 'MISSING' && settings.inventoryRules.autoWriteOff && pct <= tol;
      created.push({
        id: uid('dsc'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, inboundId: ib.id, warehouseId: ib.warehouseId, agentId: ib.agentId,
        commodityId: ib.commodityId, bagCode: exp.code, type: r.status === 'MISSING' ? 'MISSING' : 'WEIGHT', expectedKg: exp.expectedKg, receivedKg,
        varianceKg: variance, variancePct: pct, status: auto ? 'AUTO_WRITTEN_OFF' : 'OPEN', openKg: auto ? 0 : variance,
        resolution: auto ? { type: 'WRITTEN_OFF', at, by: 'system', note: `Under the ${tol}% tolerance` } : undefined,
      });
    }
    return { ...exp, status: r.status, receivedKg, newCode: r.newCode };
  });
  saveBags(updated);
  const missing = created.filter((d) => d.type === 'MISSING');
  if (missing.length) steps.push('missing');
  const auto = created.filter((d) => d.status === 'AUTO_WRITTEN_OFF');
  W().saveDiscrepancies(created);

  // Top-up bags: new stock, and weight returned to the oldest open weight discrepancies of the same agent.
  const allocations: Allocation[] = [];
  const topUps = input.topUps ?? [];
  if (topUps.length) {
    const ref = useBuyingStore.getState().bags.find((b) => b.code === ib.bags[0]?.code);
    saveBags(topUps.map((t) => ({ id: uid('bag'), orgId, code: t.code, commodityId: ib.commodityId, weightKg: r1(t.kg), status: 'IN_STOCK' as const, warehouseId: ib.warehouseId, purchaseIds: ref?.purchaseIds.slice(0, 1) ?? [], history: [{ at, event: 'TOP_UP' as const, ref: ib.number, by: input.actorId }] })));
    for (const t of topUps) allocations.push(...allocateTopUp(orgId, ib.agentId, ib.warehouseId, t.code, t.kg, input.actorId));
    steps.push('weight');
  }
  const receivedKg = r1(lines.reduce((s, l) => s + (l.receivedKg ?? 0), 0) + topUps.reduce((s, t) => s + t.kg, 0));
  const open = W().discrepancies.filter((d) => d.inboundId === ib.id && d.status === 'OPEN');
  const status: Inbound['status'] = open.length ? 'DISCREPANCY' : 'CONFIRMED';
  W().updateInbound(ib.id, { bags: [...lines, ...topUps.map((t) => ({ code: t.code, expectedKg: 0, status: 'TOP_UP' as const, receivedKg: t.kg }))], receivedKg, status, received: { at, by: input.actorId, device, note: input.note } });
  const inBags = lines.filter((l) => l.status !== 'MISSING').length + topUps.length;
  move(orgId, ib.warehouseId, ib.source.kind === 'TRANSFER' ? 'TRANSFER_IN' : 'IN', ib.commodityId, inBags, receivedKg, ib.number, ib.id, input.actorId);
  steps.push('stock');

  if (ib.source.transferId) W().updateTransfer(ib.source.transferId, { receivedKg, status: 'TRANSFER_COMPLETE' });
  log(orgId, 'inbound', ib.id, 'inbound.received', { kg: receivedKg, expected: ib.expectedKg }, input.actorId, device);
  for (const d of auto) log(orgId, 'inbound', ib.id, 'inbound.autoWrittenOff', { code: d.bagCode, kg: d.varianceKg, pct: d.variancePct }, 'system');
  if (open.length) {
    log(orgId, 'inbound', ib.id, 'inbound.discrepancy', { count: open.length, kg: r1(open.reduce((s, d) => s + d.openKg, 0)) }, 'system');
    const rule = settings.notificationRules.find((x) => x.eventKey === 'inbound.discrepancy' && x.enabled);
    if (rule) notify(orgId, [...usersWith(orgId, 'inbound.resolve'), ...usersWith(orgId, 'inbound.reviewRepayment')].filter((u) => u !== input.actorId), 'inboundDiscrepancy', { number: ib.number, warehouse: whName(ib.warehouseId) }, `/app/inventory/inbound?open=${ib.id}`);
    const u = agentUser(ib.agentId);
    if (u && ib.source.kind === 'PRE') notify(orgId, [u], 'repaymentDue', { number: ib.number, amount: repaymentExpected(ib.id).total }, `/m/warehouse/repay/${ib.id}`, 'PAYMENT');
  }
  return { inbound: inboundOf(ib.id), discrepancies: created, autoWrittenOff: auto, allocations, steps, outOfBounds };
}

/** Top-up weight goes to the oldest open weight discrepancies of the agent at this warehouse first. */
export function allocateTopUp(orgId: string, agentId: string | undefined, warehouseId: string, bagCode: string, kg: number, actorId: string): Allocation[] {
  let left = r1(kg);
  const out: Allocation[] = [];
  const open = W().discrepancies
    .filter((d) => d.orgId === orgId && d.warehouseId === warehouseId && d.type === 'WEIGHT' && d.status === 'OPEN' && d.openKg > 0 && (!agentId || d.agentId === agentId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const d of open) {
    if (left <= 0) break;
    const take = r1(Math.min(left, d.openKg));
    left = r1(left - take);
    const openKg = r1(d.openKg - take);
    W().updateDiscrepancy(d.id, {
      openKg, allocations: [...(d.allocations ?? []), { bagCode, kg: take, at: now() }],
      ...(openKg <= 0 ? { status: 'RESOLVED' as const, resolution: { type: 'WEIGHT_RETURNED' as const, at: now(), by: actorId, kg: d.varianceKg, ref: bagCode } } : {}),
    });
    out.push({ discrepancyId: d.id, bagCode, kg: take, inboundNumber: inboundOf(d.inboundId)?.number ?? '' });
    refreshInbound(d.inboundId);
  }
  return out;
}

/** A top-up bag brought later for missing weight: new stock, then allocated oldest-first. */
export function receiveTopUp(inboundId: string, code: string, kg: number, actorId: string, device: 'web' | 'mobile' = 'web'): Allocation[] {
  const ib = inboundOf(inboundId);
  const ref = useBuyingStore.getState().bags.find((b) => b.code === ib.bags[0]?.code);
  saveBags([{ id: uid('bag'), orgId: ib.orgId, code, commodityId: ib.commodityId, weightKg: r1(kg), status: 'IN_STOCK', warehouseId: ib.warehouseId, purchaseIds: ref?.purchaseIds.slice(0, 1) ?? [], history: [{ at: now(), event: 'TOP_UP', ref: ib.number, by: actorId }] }]);
  move(ib.orgId, ib.warehouseId, 'IN', ib.commodityId, 1, kg, ib.number, ib.id, actorId);
  const res = allocateTopUp(ib.orgId, ib.agentId, ib.warehouseId, code, kg, actorId);
  log(ib.orgId, 'inbound', ib.id, 'inbound.topUp', { code, kg: r1(kg) }, actorId, device);
  return res;
}

/** Inbound status follows its discrepancies. */
function refreshInbound(id: string) {
  const ib = inboundOf(id);
  if (!ib || ib.status === 'PENDING') return;
  const open = W().discrepancies.filter((d) => d.inboundId === id && d.status === 'OPEN');
  const submitted = W().agentRepayments.some((r) => r.inboundId === id && r.status === 'SUBMITTED');
  const next: Inbound['status'] = !open.length ? (W().discrepancies.some((d) => d.inboundId === id && d.status === 'RESOLVED') ? 'RESOLVED' : 'CONFIRMED') : submitted ? 'REFUND_SUBMITTED' : ib.status === 'CONFIRMED' ? 'DISCREPANCY' : ib.status;
  if (next !== ib.status) W().updateInbound(id, { status: next });
}

/** Physical resolution of one discrepancy: the bag turned up, its tag was replaced, or it is written off. */
export function resolveDiscrepancy(id: string, v: { type: 'BAG_RETURNED' | 'TAG_REPLACED' | 'WRITTEN_OFF'; newCode?: string; kg?: number; note?: string }, actorId: string, device: 'web' | 'mobile' = 'web') {
  const d = W().discrepancies.find((x) => x.id === id)!;
  const bag = useBuyingStore.getState().bags.find((b) => b.orgId === d.orgId && b.code === d.bagCode);
  const kg = r1(v.kg ?? d.expectedKg);
  if (v.type !== 'WRITTEN_OFF' && bag) {
    saveBags([{ ...bag, code: v.newCode || bag.code, status: 'IN_STOCK', warehouseId: d.warehouseId, weightKg: kg, history: hist(bag, 'RETURNED', inboundOf(d.inboundId).number, actorId, v.newCode ? `${bag.code} → ${v.newCode}` : undefined) }]);
    move(d.orgId, d.warehouseId, 'RETURN', d.commodityId, 1, kg, inboundOf(d.inboundId).number, d.inboundId, actorId);
  }
  if (v.type === 'WRITTEN_OFF') move(d.orgId, d.warehouseId, 'WRITE_OFF', d.commodityId, 0, 0, inboundOf(d.inboundId).number, d.inboundId, actorId);
  const shortfall = v.type === 'WRITTEN_OFF' ? 0 : r1(Math.max(0, d.expectedKg - kg));
  W().updateDiscrepancy(id, shortfall > 0.05
    ? { type: 'WEIGHT', receivedKg: kg, varianceKg: shortfall, openKg: shortfall, variancePct: Math.round((shortfall / d.expectedKg) * 10000) / 100 }
    : { status: 'RESOLVED', openKg: 0, resolution: { type: v.type, at: now(), by: actorId, note: v.note, kg, ref: v.newCode } });
  log(d.orgId, 'inbound', d.inboundId, `inbound.${v.type === 'WRITTEN_OFF' ? 'writtenOff' : v.type === 'TAG_REPLACED' ? 'tagReplaced' : 'bagReturned'}`, { code: d.bagCode, kg }, actorId, device);
  refreshInbound(d.inboundId);
}

// ---------------------------------------------------------------- Agent repayment

/**
 * What the agent owes for an inbound's open discrepancies: lost kg × the price basis (blended across
 * the purchases and loan produce in each bag, or the list price), plus a share of the trip's
 * logistics cost per missing bag when the policy says so.
 */
export function repaymentExpected(inboundId: string) {
  const ib = inboundOf(inboundId);
  const settings = settingsOf(ib.orgId);
  const currency = currencyOf(ib.orgId);
  const { purchases, bags, expenses } = useBuyingStore.getState();
  const open = W().discrepancies.filter((d) => d.inboundId === inboundId && d.status === 'OPEN');
  const listPrice = settings.priceList.find((p) => p.commodityId === ib.commodityId)?.price.amountMinor ?? 0;
  const loanRepayments = useSupportStore.getState().repayments;
  const recoveries = useSupportStore.getState().recoveries;
  let value = 0;
  let lostKg = 0;
  for (const d of open) {
    lostKg += d.openKg;
    let price = listPrice;
    if (settings.inventoryRules.liability.priceBasis === 'PURCHASE') {
      const bag = bags.find((b) => b.orgId === ib.orgId && (b.code === d.bagCode || b.replacement?.oldCode === d.bagCode));
      const parts = (bag?.contributions ?? []).map((c) => ({ kg: c.kg, price: purchases.find((p) => p.id === c.purchaseId)?.unitPrice.amountMinor ?? listPrice }));
      // Loan produce in the bag is valued at the recovery price (a blended basis).
      for (const rp of loanRepayments.filter((x) => x.bagCode === d.bagCode && x.kg)) parts.push({ kg: rp.kg!, price: recoveries.find((r) => r.id === rp.recoveryRequestId)?.review?.unitPrice.amountMinor ?? listPrice });
      const kg = parts.reduce((s, x) => s + x.kg, 0);
      if (kg > 0) price = parts.reduce((s, x) => s + x.kg * x.price, 0) / kg;
    }
    value += d.openKg * price;
  }
  const pre = expenses.find((e) => e.id === ib.source.preId);
  const missingBags = open.filter((d) => d.type === 'MISSING').length;
  const logistics = settings.inventoryRules.liability.includeLogistics && pre && pre.bags ? (pre.total.amountMinor / pre.bags) * missingBags : 0;
  lostKg = r1(lostKg);
  return {
    lostKg, pricePerKg: money(lostKg ? value / lostKg : listPrice, currency), produce: money(value, currency), logistics: money(logistics, currency),
    total: money(value + logistics, currency), discrepancyIds: open.map((d) => d.id),
  };
}

export function submitAgentRepayment(inboundId: string, v: { amountMinor: number; method: AgentRepayment['submitted']['method']; reference?: string; proof?: string }, actorId: string, device: 'web' | 'mobile' = 'mobile'): AgentRepayment {
  const ib = inboundOf(inboundId);
  const exp = repaymentExpected(inboundId);
  const at = now();
  const rp: AgentRepayment = {
    id: uid('irp'), orgId: ib.orgId, createdAt: at, updatedAt: at, createdBy: actorId, number: issue(ib.orgId, 'inventoryRepayment'), inboundId, agentId: ib.agentId ?? '',
    discrepancyIds: exp.discrepancyIds, expected: { lostKg: exp.lostKg, pricePerKg: exp.pricePerKg, produce: exp.produce, logistics: exp.logistics, total: exp.total },
    submitted: { amount: money(v.amountMinor, exp.total.currency), method: v.method, reference: v.reference, proof: v.proof, at, by: actorId, device }, status: 'SUBMITTED',
  };
  W().saveRepayment(rp);
  W().updateInbound(inboundId, { status: 'REFUND_SUBMITTED' });
  log(ib.orgId, 'inbound', inboundId, 'inbound.repaymentSubmitted', { amount: rp.submitted.amount, method: v.method }, actorId, device);
  notify(ib.orgId, usersWith(ib.orgId, 'inbound.reviewRepayment').filter((u) => u !== actorId), 'repaymentToReview', { number: ib.number, amount: rp.submitted.amount }, `/app/inventory/inbound?open=${inboundId}&tab=repayment`, 'APPROVAL');
  return rp;
}

/** Finance: approve in full, approve part (the rest stays owed), or reject with a reason. */
export function reviewAgentRepayment(id: string, v: { decision: 'APPROVE' | 'PARTIAL' | 'REJECT'; amountMinor?: number; reason?: string }, actorId: string): { ok: boolean; reason?: 'reasonRequired' } {
  const rp = W().agentRepayments.find((x) => x.id === id)!;
  if (v.decision !== 'APPROVE' && !v.reason?.trim()) return { ok: false, reason: 'reasonRequired' };
  const c = rp.expected.total.currency;
  const approved = v.decision === 'APPROVE' ? rp.submitted.amount.amountMinor : v.decision === 'PARTIAL' ? Math.min(v.amountMinor ?? 0, rp.submitted.amount.amountMinor) : 0;
  const balance = Math.max(0, rp.expected.total.amountMinor - approved);
  W().saveRepayment({ ...rp, updatedAt: now(), status: v.decision === 'APPROVE' ? 'APPROVED' : v.decision === 'PARTIAL' ? 'PARTIAL' : 'REJECTED', review: { approved: money(approved, c), balance: money(balance, c), reason: v.reason, by: actorId, at: now() } });
  if (v.decision === 'APPROVE' && balance <= 0) {
    for (const did of rp.discrepancyIds) W().updateDiscrepancy(did, { status: 'RESOLVED', openKg: 0, resolution: { type: 'PAID_BY_AGENT', at: now(), by: actorId, ref: rp.number } });
    W().updateInbound(rp.inboundId, { status: 'RESOLVED' });
  } else W().updateInbound(rp.inboundId, { status: 'NEEDS_RESOLUTION' });
  log(rp.orgId, 'inbound', rp.inboundId, `inbound.repayment${v.decision === 'APPROVE' ? 'Approved' : v.decision === 'PARTIAL' ? 'Partial' : 'Rejected'}`, { amount: money(approved, c), balance: money(balance, c), reason: v.reason ?? '' }, actorId);
  const u = agentUser(rp.agentId);
  if (u) notify(rp.orgId, [u], `repayment${v.decision === 'APPROVE' ? 'Approved' : v.decision === 'PARTIAL' ? 'Partial' : 'Rejected'}`, { number: inboundOf(rp.inboundId).number, amount: money(approved, c), balance: money(balance, c), reason: v.reason ?? '' }, `/m/warehouse/repay/${rp.inboundId}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Outbound and transfers

export interface TransferInput { orgId: string; fromWarehouseId: string; kind: Transfer['kind']; toWarehouseId?: string; receivingOfficerId?: string; bagCodes: string[]; note?: string; actorId: string; device?: 'web' | 'mobile' }

/** Bags leave the warehouse: to dispatch (out of stock) or to another warehouse (in transit, expected there). */
export function createTransfer(input: TransferInput): Transfer {
  const { orgId } = input;
  const codes = new Set(input.bagCodes);
  const bags = bagsAt(orgId, input.fromWarehouseId).filter((b) => codes.has(b.code));
  if (!bags.length) throw new Error('noBags');
  if (input.kind === 'TRANSFER' && (!input.toWarehouseId || input.toWarehouseId === input.fromWarehouseId)) throw new Error('destination');
  const at = now();
  const sentKg = r1(bags.reduce((s, b) => s + b.weightKg, 0));
  const commodityId = bags[0]!.commodityId;
  const tr: Transfer = {
    id: uid('trf'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(orgId, 'transfer'), kind: input.kind, fromWarehouseId: input.fromWarehouseId,
    toWarehouseId: input.toWarehouseId, receivingOfficerId: input.receivingOfficerId, commodityId, bagCodes: bags.map((b) => b.code), sentKg,
    status: input.kind === 'TRANSFER' ? 'TRANSFER_PENDING' : 'DISPATCHED', device: input.device, note: input.note,
  };
  saveBags(bags.map((b) => ({ ...b, status: input.kind === 'TRANSFER' ? 'IN_TRANSIT' : 'OUT_OF_STOCK', history: hist(b, input.kind === 'TRANSFER' ? 'TRANSFER' : 'DISPATCH', tr.number, input.actorId) })));
  move(orgId, input.fromWarehouseId, input.kind === 'TRANSFER' ? 'TRANSFER_OUT' : 'OUT', commodityId, bags.length, sentKg, tr.number, tr.id, input.actorId);
  if (input.kind === 'TRANSFER') {
    const ib: Inbound = {
      id: uid('in'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(orgId, 'inbound'), warehouseId: input.toWarehouseId!,
      source: { kind: 'TRANSFER', transferId: tr.id, fromWarehouseId: input.fromWarehouseId }, commodityId, bags: bags.map((b) => ({ code: b.code, expectedKg: b.weightKg })),
      expectedKg: sentKg, status: 'PENDING',
    };
    W().saveInbound(ib);
    tr.inboundId = ib.id;
    const dest = W().warehouses.find((w) => w.id === input.toWarehouseId);
    notify(orgId, [...(input.receivingOfficerId ? [input.receivingOfficerId] : []), ...(dest?.officerUserIds ?? [])], 'transferIncoming', { number: tr.number, count: bags.length, from: whName(input.fromWarehouseId) }, '/m/warehouse');
  }
  W().saveTransfer(tr);
  log(orgId, 'transfer', tr.id, input.kind === 'TRANSFER' ? 'transfer.sent' : 'transfer.outbound', { number: tr.number, count: bags.length, kg: sentKg, to: whName(input.toWarehouseId) }, input.actorId, input.device);
  return tr;
}

// ---------------------------------------------------------------- Stock counts

export function scheduleCount(orgId: string, warehouseId: string, scheduledFor: string, actorId: string): StockCount {
  const at = now();
  const c: StockCount = { id: uid('cnt'), orgId, createdAt: at, updatedAt: at, createdBy: actorId, number: issue(orgId, 'stockCount'), warehouseId, scheduledFor, status: 'SCHEDULED' };
  W().saveStockCount(c);
  log(orgId, 'stockCount', c.id, 'count.scheduled', { date: scheduledFor, warehouse: whName(warehouseId) }, actorId);
  return c;
}

/** Submit a count: scanned codes (and weights), compared with what should be there. */
export function submitCount(id: string, v: { codes: string[]; weighed?: Record<string, number>; photos?: string[] }, actorId: string, device: 'web' | 'mobile' = 'web'): StockCount {
  const c = W().stockCounts.find((x) => x.id === id)!;
  const expected = bagsAt(c.orgId, c.warehouseId);
  const expectedCodes = new Set(expected.map((b) => b.code));
  const counted = new Set(v.codes);
  const missingCodes = expected.filter((b) => !counted.has(b.code)).map((b) => b.code);
  const extraCodes = v.codes.filter((x) => !expectedCodes.has(x));
  const weighed = v.weighed ?? {};
  const countedKg = r1(v.codes.reduce((s, code) => s + (weighed[code] ?? expected.find((b) => b.code === code)?.weightKg ?? 0), 0));
  const expectedKg = r1(expected.reduce((s, b) => s + b.weightKg, 0));
  const commodity = expected[0]?.commodityId ?? '';
  const tol = tolerancePct(c.orgId, commodity, 'STORAGE');
  const within = expectedKg ? Math.abs(expectedKg - countedKg) / expectedKg * 100 <= tol : countedKg === 0;
  const status: StockCount['status'] = !missingCodes.length && !extraCodes.length && within ? 'RECONCILED' : 'INCONSISTENT';
  W().updateStockCount(id, {
    status, expected: { bags: expected.length, kg: expectedKg }, missingCodes, extraCodes,
    counted: { bags: v.codes.length, kg: countedKg, codes: v.codes, weighed, at: now(), by: actorId, device, photos: v.photos ?? [] },
  });
  saveBags(expected.filter((b) => counted.has(b.code)).map((b) => ({ ...b, history: hist(b, 'COUNTED', c.number, actorId) })));
  log(c.orgId, 'stockCount', id, `count.${status === 'RECONCILED' ? 'reconciled' : 'inconsistent'}`, { bags: v.codes.length, expected: expected.length, kg: countedKg }, actorId, device);
  if (status === 'INCONSISTENT') notify(c.orgId, usersWith(c.orgId, 'stockCounts.approveAdjustment').filter((u) => u !== actorId), 'countInconsistent', { number: c.number, warehouse: whName(c.warehouseId) }, `/app/inventory/stock-counts?open=${id}`);
  return W().stockCounts.find((x) => x.id === id)!;
}

export function requestAdjustment(id: string, reason: string, actorId: string) {
  const c = W().stockCounts.find((x) => x.id === id)!;
  const kg = r1((c.counted?.kg ?? 0) - (c.expected?.kg ?? 0));
  W().updateStockCount(id, { adjustment: { status: 'PENDING', kg, reason, requestedBy: actorId, at: now() } });
  log(c.orgId, 'stockCount', id, 'count.adjustmentRequested', { kg, reason }, actorId);
  notify(c.orgId, usersWith(c.orgId, 'stockCounts.approveAdjustment').filter((u) => u !== actorId), 'adjustmentToApprove', { number: c.number, kg }, `/app/inventory/stock-counts?open=${id}`, 'APPROVAL');
}

/** Approving the adjustment corrects stock to what was counted (never by the requester). */
export function reviewAdjustment(id: string, approve: boolean, actorId: string, note?: string): { ok: boolean; reason?: string } {
  const c = W().stockCounts.find((x) => x.id === id)!;
  if (!c.adjustment || c.adjustment.status !== 'PENDING') return { ok: false, reason: 'notAllowed' };
  if (c.adjustment.requestedBy === actorId) return { ok: false, reason: 'sameUser' };
  if (!approve && !note?.trim()) return { ok: false, reason: 'reasonRequired' };
  if (approve) {
    const all = useBuyingStore.getState().bags;
    const missing = all.filter((b) => b.orgId === c.orgId && c.missingCodes?.includes(b.code));
    const extra = all.filter((b) => b.orgId === c.orgId && c.extraCodes?.includes(b.code));
    const weighed = c.counted?.weighed ?? {};
    const reweigh = all.filter((b) => b.orgId === c.orgId && b.warehouseId === c.warehouseId && b.status === 'IN_STOCK' && weighed[b.code] != null && weighed[b.code] !== b.weightKg);
    saveBags([
      ...missing.map((b) => ({ ...b, status: 'MISSING' as const, history: hist(b, 'MISSING', c.number, actorId) })),
      ...extra.map((b) => ({ ...b, status: 'IN_STOCK' as const, warehouseId: c.warehouseId, history: hist(b, 'COUNTED', c.number, actorId) })),
      ...reweigh.map((b) => ({ ...b, weightKg: weighed[b.code]! })),
    ]);
    move(c.orgId, c.warehouseId, 'ADJUSTMENT', missing[0]?.commodityId ?? extra[0]?.commodityId ?? '', extra.length - missing.length, c.adjustment.kg, c.number, c.id, actorId);
  }
  W().updateStockCount(id, { status: approve ? 'RECONCILED' : c.status, adjustment: { ...c.adjustment, status: approve ? 'APPROVED' : 'REJECTED', reviewedBy: actorId, reviewedAt: now(), note } });
  log(c.orgId, 'stockCount', id, approve ? 'count.adjustmentApproved' : 'count.adjustmentRejected', { kg: c.adjustment.kg, note: note ?? '' }, actorId);
  return { ok: true };
}

// ---------------------------------------------------------------- Warehouse expenses

export interface NewWarehouseExpense {
  orgId: string; warehouseId: string; description?: string; actorId: string; device?: 'web' | 'mobile';
  lines: { typeId: string; quantity: number; rateMinor: number; payee: WarehouseExpenseLine['payee'] }[];
}

const wexDef = (orgId: string) => settingsOf(orgId).workflows.find((w) => w.docType === 'warehouseExpense')!;

export function createWarehouseExpense(input: NewWarehouseExpense): WarehouseExpense {
  const { orgId } = input;
  const currency = currencyOf(orgId);
  const types = settingsOf(orgId).inventoryRules.expenseTypes ?? [];
  const lines: WarehouseExpenseLine[] = input.lines.map((l) => ({
    typeId: l.typeId, basis: types.find((t) => t.id === l.typeId)?.basis ?? 'FLAT', quantity: l.quantity, rate: money(l.rateMinor, currency), amount: money(l.rateMinor * l.quantity, currency), payee: l.payee,
  }));
  const at = now();
  const base = {
    id: uid('wsx'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(orgId, 'warehouseExpense'), warehouseId: input.warehouseId, description: input.description,
    lines, total: money(lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency), paymentStatus: 'PENDING' as const, disbursements: [], device: input.device,
  };
  const e = start(wexDef(orgId), base as never, at).record as unknown as WarehouseExpense;
  W().saveExpense(e);
  log(orgId, 'warehouseExpense', e.id, 'wexpense.created', { number: e.number, total: e.total }, input.actorId, input.device);
  const def = wexDef(orgId);
  const approvers = useAccessStore.getState().memberships.filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && m.userId !== input.actorId && canAct(e as unknown as WorkflowRecord, def, workflowUser(m.userId, orgId))).map((m) => m.userId);
  notify(orgId, approvers, 'approvalNeeded', { docType: 'warehouseExpense', number: e.number }, `/app/inventory/expenses?open=${e.id}`, 'APPROVAL');
  return e;
}

/** Payment status: Pending / Partial / Full, or Rejected when the workflow rejected it. */
export const expensePayStatus = (e: WarehouseExpense): WarehouseExpense['paymentStatus'] => (e.status === 'REJECTED' ? 'REJECTED' : e.paymentStatus);
export const unpaidLines = (e: WarehouseExpense) => e.lines.map((l, i) => ({ ...l, index: i })).filter((l) => !l.paid);

function linesPaid(id: string, indexes: number[], method: 'MOMO' | 'MANUAL', actorId: string, paymentId?: string, proof?: string) {
  const e = W().warehouseExpenses.find((x) => x.id === id)!;
  const lines = e.lines.map((l, i) => (indexes.includes(i) ? { ...l, paid: true } : l));
  const amount = indexes.reduce((s, i) => s + (e.lines[i]?.amount.amountMinor ?? 0), 0);
  const disb = indexes.map((i) => ({ id: uid('wd'), amount: e.lines[i]!.amount, method, at: now(), by: actorId, paymentId, proof, lineIndex: i }));
  W().updateExpense(id, { lines, paymentStatus: lines.every((l) => l.paid) ? 'FULL' : 'PARTIAL', disbursements: [...e.disbursements, ...disb] });
  log(e.orgId, 'warehouseExpense', id, 'wexpense.paid', { amount: money(amount, e.total.currency), method }, actorId);
}

/** Pay the unpaid lines by mobile money, one payee per line. */
export async function payWarehouseExpense(id: string, actorId: string, indexes?: number[]): Promise<Payment[]> {
  const e = W().warehouseExpenses.find((x) => x.id === id)!;
  const lines = unpaidLines(e).filter((l) => !indexes || indexes.includes(l.index));
  return pay({ orgId: e.orgId, type: 'WAREHOUSE_EXPENSE', payableId: e.id, actorId, payees: lines.map((l) => ({ name: l.payee.name, number: l.payee.number, providerId: l.payee.providerId, amount: l.amount, payableId: `${e.id}#${l.index}` })) });
}

export function payWarehouseExpenseManual(id: string, indexes: number[], proof: string, actorId: string) { linesPaid(id, indexes, 'MANUAL', actorId, undefined, proof); }

registerPayable('WAREHOUSE_EXPENSE', {
  // Each line is its own payment: payableId is "<expense id>#<line index>".
  onStatus: (p) => {
    if (p.status !== 'SUCCESSFUL') return;
    const [id, idx] = p.payableId.split('#');
    const e = W().warehouseExpenses.find((x) => x.id === id);
    if (e && idx != null && !e.lines[Number(idx)]?.paid) linesPaid(e.id, [Number(idx)], 'MOMO', p.initiatedBy, p.id);
  },
});
