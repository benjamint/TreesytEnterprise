import type {
  ActivityEvent, AgentRepayment, Bag, Discrepancy, Inbound, Money, OrgSettings, StockCount, StockMovement, Transfer, Warehouse, WarehouseExpense, WarehouseExpenseLine,
} from '@/types';
import { apply, start, type WorkflowRecord, type WorkflowUser } from '@/engines/workflow';
import { nextNumber } from '@/engines/numbering';
import type { OpsResult } from './operations';
import { Rng } from './rng';

/**
 * Phase 12 seed (PRD H, 12.6): completed deliveries with a few discrepancies at each stage (open,
 * repayment submitted, partly paid, resolved by top-up or by the agent), deliveries still expected
 * from paid PREs, transfers between warehouses, an outbound, stock counts (reconciled, inconsistent
 * with an adjustment waiting) and warehouse expenses across the approval route. Its own random stream.
 */

export interface InventorySeed {
  inbounds: Inbound[]; discrepancies: Discrepancy[]; agentRepayments: AgentRepayment[]; movements: StockMovement[];
  transfers: Transfer[]; stockCounts: StockCount[]; warehouseExpenses: WarehouseExpense[]; activity: ActivityEvent[];
}

interface Opts {
  orgId: string; seed: number; today: Date; lang: 'en' | 'fr'; currency: string;
  /** Approvers for the warehouse-expense route, in step order. */
  approvers: string[];
  financeUserId: string;
  /** Agents whose bags stay with them for the live journey. */
  keepAgentIds: string[];
}

const DAY = 86_400_000;
const r1 = (kg: number) => Math.round(kg * 10) / 10;

export function seedInventory(ops: OpsResult, settings: OrgSettings, o: Opts): InventorySeed {
  const rng = new Rng(o.seed);
  const out: InventorySeed = { inbounds: [], discrepancies: [], agentRepayments: [], movements: [], transfers: [], stockCounts: [], warehouseExpenses: [], activity: [] };
  const iso = (t: number) => new Date(Math.min(t, o.today.getTime() - 3_600_000)).toISOString();
  const issue = (docType: string, at: number) => {
    const r = nextNumber(settings.numbering.find((p) => p.docType === docType)!, ops.sequences, { date: new Date(at) });
    ops.sequences = r.sequences;
    return r.number;
  };
  const act = (entity: string, entityId: string, key: string, params: Record<string, unknown>, actorId: string, at: string) =>
    out.activity.push({ id: `${entityId}_act_${out.activity.length}`, orgId: o.orgId, entity, entityId, key, params, actorId, at });
  const m = (amountMinor: number): Money => ({ amountMinor: Math.round(amountMinor), currency: o.currency });
  const whs = ops.warehouses;
  const hub = whs.find((w) => w.type === 'AGGREGATION_HUB') ?? whs[0]!;
  const officerOf = (w: Warehouse) => w.officerUserIds[0] ?? o.approvers[0]!;
  const purchaseOf = new Map(ops.purchases.map((p) => [p.id, p]));
  const requestOf = new Map(ops.requests.map((r) => [r.id, r]));
  const mv: (Omit<StockMovement, 'before' | 'after'> & { delta: number })[] = [];
  const movement = (warehouseId: string, kind: StockMovement['kind'], commodityId: string, bags: number, kg: number, ref: string, refId: string, by: string, at: string) =>
    mv.push({ id: `${refId}_mv_${mv.length}`, orgId: o.orgId, warehouseId, at, kind, commodityId, bags, kg: r1(Math.abs(kg)), ref, refId, by, delta: kg });
  const hist = (b: Bag, event: NonNullable<Bag['history']>[number]['event'], ref: string, by: string, at: string) => { b.history = [...(b.history ?? []), { at, event, ref, by }]; };
  const tol = (commodityId: string) => settings.inventoryRules.tolerances.find((t) => t.commodityId === commodityId && t.movement === 'INBOUND')?.pct ?? 0.5;

  // ---------- Completed deliveries: the bags in stock, one receipt per purchase request ----------
  const inStock = ops.bags.filter((b) => b.status === 'IN_STOCK');
  const byRequest = new Map<string, Bag[]>();
  for (const b of inStock) {
    const rid = purchaseOf.get(b.purchaseIds[0]!)?.requestId ?? 'none';
    byRequest.set(rid, [...(byRequest.get(rid) ?? []), b]);
  }
  const groups = [...byRequest].sort((a, b) => (requestOf.get(a[0])?.plannedDate ?? '').localeCompare(requestOf.get(b[0])?.plannedDate ?? ''));
  // The most recent receipts carry the open issues.
  const issueAt = (i: number) => groups.length - 1 - i;
  const scenario = (i: number): 'weightOpen' | 'missingSubmitted' | 'topUpResolved' | 'missingPaid' | 'partial' | null =>
    i === issueAt(0) ? 'missingSubmitted' : i === issueAt(1) ? 'weightOpen' : i === issueAt(2) ? 'partial' : i === issueAt(4) ? 'topUpResolved' : i === issueAt(6) ? 'missingPaid' : null;
  groups.forEach(([rid, bags], gi) => {
    const req = requestOf.get(rid);
    const wh = whs.find((w) => w.id === bags[0]!.warehouseId) ?? hub;
    const lastBuy = Math.max(...bags.flatMap((b) => b.purchaseIds.map((p) => new Date(purchaseOf.get(p)?.createdAt ?? o.today).getTime())));
    const at = Math.min(lastBuy + rng.int(2, 5) * DAY, o.today.getTime() - (groups.length - gi) * 3_600_000);
    const pre = ops.expenses.find((e) => e.requestId === rid && e.paymentStatus === 'PAID');
    const id = `${o.orgId}_in_${out.inbounds.length + 1}`;
    const number = issue('inbound', at);
    const officer = officerOf(wh);
    const sc = scenario(gi);
    const lines: Inbound['bags'] = [];
    const disc: Discrepancy[] = [];
    const missingBag = sc === 'missingSubmitted' || sc === 'missingPaid' ? bags[bags.length - 1] : undefined;
    bags.forEach((b, bi) => {
      // Normal transport loss, mostly under the tolerance.
      const loss = sc === 'weightOpen' && bi === 0 ? r1(b.weightKg * 0.035) : sc === 'partial' && bi < 2 ? r1(b.weightKg * 0.04) : sc === 'topUpResolved' && bi === 0 ? r1(b.weightKg * 0.03) : rng.chance(0.25) ? r1(b.weightKg * rng.float(0.0005, tol(b.commodityId) * 0.008)) : 0;
      const expectedKg = r1(b.weightKg + loss);
      if (b === missingBag) {
        lines.push({ code: b.code, expectedKg: b.weightKg, status: 'MISSING', receivedKg: 0 });
        b.status = 'MISSING';
        hist(b, 'MISSING', number, officer, iso(at));
      } else {
        lines.push({ code: b.code, expectedKg, status: 'ORIGINAL', receivedKg: b.weightKg });
        hist(b, 'INBOUND', number, officer, iso(at));
      }
      const variance = b === missingBag ? b.weightKg : loss;
      if (variance > 0.05) {
        const pct = Math.round((variance / (b === missingBag ? b.weightKg : expectedKg)) * 10000) / 100;
        const auto = b !== missingBag && pct <= tol(b.commodityId);
        disc.push({
          id: `${id}_dsc_${disc.length + 1}`, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: officer, inboundId: id, warehouseId: wh.id, agentId: req?.agentId,
          commodityId: b.commodityId, bagCode: b.code, type: b === missingBag ? 'MISSING' : 'WEIGHT', expectedKg: b === missingBag ? b.weightKg : expectedKg, receivedKg: b === missingBag ? 0 : b.weightKg,
          varianceKg: variance, variancePct: pct, status: auto ? 'AUTO_WRITTEN_OFF' : 'OPEN', openKg: auto ? 0 : variance,
          resolution: auto ? { type: 'WRITTEN_OFF', at: iso(at), by: 'system', note: `Under the ${tol(b.commodityId)}% tolerance` } : undefined,
        });
      }
    });
    let status: Inbound['status'] = disc.some((d) => d.status === 'OPEN') ? 'DISCREPANCY' : 'CONFIRMED';
    const open = disc.filter((d) => d.status === 'OPEN');
    const price = req?.unitPrice.amountMinor ?? 0;
    const owed = open.reduce((s, d) => s + d.openKg * price, 0);
    const logistics = pre && settings.inventoryRules.liability.includeLogistics ? (pre.total.amountMinor / Math.max(1, pre.bags)) * open.filter((d) => d.type === 'MISSING').length : 0;
    const total = owed + logistics;
    const repay = (amount: number, st: AgentRepayment['status'], approved?: number) => {
      const lostKg = r1(open.reduce((s, d) => s + d.openKg, 0));
      const rp: AgentRepayment = {
        id: `${id}_irp`, orgId: o.orgId, createdAt: iso(at + DAY), updatedAt: iso(at + 2 * DAY), createdBy: req ? ops.agents.find((a) => a.id === req.agentId)?.userId ?? officer : officer,
        number: issue('inventoryRepayment', at + DAY), inboundId: id, agentId: req?.agentId ?? '', discrepancyIds: open.map((d) => d.id),
        expected: { lostKg, pricePerKg: m(price), produce: m(owed), logistics: m(logistics), total: m(total) },
        submitted: { amount: m(amount), method: 'MOMO', reference: `MP${String(rng.int(10_000_000, 99_999_999))}`, proof: 'momo-receipt.jpg', at: iso(at + DAY), by: req ? ops.agents.find((a) => a.id === req.agentId)?.userId ?? officer : officer, device: 'mobile' },
        status: st,
        review: approved != null ? { approved: m(approved), balance: m(Math.max(0, total - approved)), reason: st === 'PARTIAL' ? (o.lang === 'fr' ? 'Reçu partiel seulement' : 'Only part of the amount received') : undefined, by: o.financeUserId, at: iso(at + 2 * DAY) } : undefined,
      };
      out.agentRepayments.push(rp);
      act('inbound', id, 'inbound.repaymentSubmitted', { amount: rp.submitted.amount, method: 'MOMO' }, rp.createdBy, rp.createdAt);
      return rp;
    };
    if (sc === 'missingSubmitted') { repay(total, 'SUBMITTED'); status = 'REFUND_SUBMITTED'; }
    if (sc === 'partial') { repay(Math.round(total * 0.5), 'PARTIAL', Math.round(total * 0.5)); status = 'NEEDS_RESOLUTION'; }
    if (sc === 'missingPaid') {
      repay(total, 'APPROVED', total);
      for (const d of open) Object.assign(d, { status: 'RESOLVED', openKg: 0, resolution: { type: 'PAID_BY_AGENT', at: iso(at + 2 * DAY), by: o.financeUserId } });
      status = 'RESOLVED';
    }
    let topUp: Inbound['bags'][number] | undefined;
    if (sc === 'topUpResolved') {
      // The agent brought a top-up bag with the missing weight a few days later.
      const d = open[0]!;
      const code = `${bags[0]!.code.replace(/\d+$/, '')}${String(800_000 + gi).padStart(6, '0')}`;
      topUp = { code, expectedKg: 0, status: 'TOP_UP', receivedKg: d.varianceKg };
      Object.assign(d, { status: 'RESOLVED', openKg: 0, allocations: [{ bagCode: code, kg: d.varianceKg, at: iso(at + 3 * DAY) }], resolution: { type: 'WEIGHT_RETURNED', at: iso(at + 3 * DAY), by: officer, kg: d.varianceKg, ref: code } });
      ops.bags.push({ id: `${id}_topup`, orgId: o.orgId, code, commodityId: bags[0]!.commodityId, weightKg: d.varianceKg, status: 'IN_STOCK', warehouseId: wh.id, purchaseIds: bags[0]!.purchaseIds.slice(0, 1), history: [{ at: iso(at + 3 * DAY), event: 'TOP_UP', ref: number, by: officer }] });
      status = 'RESOLVED';
    }
    const receivedKg = r1(lines.reduce((s, l) => s + (l.receivedKg ?? 0), 0));
    out.inbounds.push({
      id, orgId: o.orgId, createdAt: iso(at - DAY), updatedAt: iso(at), createdBy: 'system', number, warehouseId: wh.id,
      source: pre ? { kind: 'PRE', preId: pre.id, requestId: rid } : { kind: 'MANUAL', requestId: rid === 'none' ? undefined : rid }, agentId: req?.agentId,
      commodityId: bags[0]!.commodityId, bags: topUp ? [...lines, topUp] : lines, expectedKg: r1(lines.reduce((s, l) => s + l.expectedKg, 0)), receivedKg: r1(receivedKg + (topUp?.receivedKg ?? 0)),
      status, received: { at: iso(at), by: officer, device: rng.chance(0.8) ? 'mobile' : 'web' },
    });
    if (pre) pre.expectedDelivery = { warehouseId: wh.id, bags: pre.bags, createdAt: iso(at - DAY), inboundId: id };
    out.discrepancies.push(...disc);
    movement(wh.id, 'IN', bags[0]!.commodityId, lines.filter((l) => l.status !== 'MISSING').length, receivedKg, number, id, officer, iso(at));
    if (topUp) movement(wh.id, 'IN', bags[0]!.commodityId, 1, topUp.receivedKg!, number, `${id}_t`, officer, iso(at + 3 * DAY));
    act('inbound', id, 'inbound.received', { kg: receivedKg, expected: r1(lines.reduce((s, l) => s + l.expectedKg, 0)) }, officer, iso(at));
    for (const d of disc.filter((x) => x.status === 'AUTO_WRITTEN_OFF')) act('inbound', id, 'inbound.autoWrittenOff', { code: d.bagCode, kg: d.varianceKg, pct: d.variancePct }, 'system', iso(at));
    if (disc.some((d) => d.type === 'MISSING' || d.resolution?.type !== 'WRITTEN_OFF')) act('inbound', id, 'inbound.discrepancy', { count: disc.filter((d) => d.status !== 'AUTO_WRITTEN_OFF').length, kg: r1(disc.filter((d) => d.status !== 'AUTO_WRITTEN_OFF').reduce((s, d) => s + d.varianceKg, 0)) }, 'system', iso(at));
  });

  // ---------- Deliveries still expected: recent paid PREs whose bags are on the road ----------
  const expected = ops.expenses
    .filter((e) => e.paymentStatus === 'PAID' && !e.expectedDelivery && !o.keepAgentIds.includes(e.agentId))
    .filter((e) => e.lines.some((l) => settings.expenseTypes.find((t) => t.id === l.expenseTypeId)?.triggersInbound))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let pending = 0;
  for (const e of expected) {
    if (pending >= 2) break;
    const reqPurchases = new Set(ops.purchases.filter((p) => p.requestId === e.requestId).map((p) => p.id));
    const bags = ops.bags.filter((b) => b.status === 'WITH_AGENT' && b.weightKg > 0 && b.purchaseIds.some((p) => reqPurchases.has(p))).slice(0, Math.min(e.bags, 12));
    if (bags.length < 3) continue;
    const at = Math.min(new Date(e.createdAt).getTime() + 3 * DAY, o.today.getTime() - (2 - pending) * 6 * 3_600_000);
    const id = `${o.orgId}_in_${out.inbounds.length + 1}`;
    const number = issue('inbound', at);
    for (const b of bags) { b.status = 'IN_TRANSIT'; hist(b, 'PRE', e.number, e.createdBy, iso(at)); }
    e.bagCodes = bags.map((b) => b.code);
    e.expectedDelivery = { warehouseId: hub.id, bags: bags.length, createdAt: iso(at), inboundId: id };
    out.inbounds.push({
      id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: 'system', number, warehouseId: hub.id, source: { kind: 'PRE', preId: e.id, requestId: e.requestId },
      agentId: e.agentId, commodityId: bags[0]!.commodityId, bags: bags.map((b) => ({ code: b.code, expectedKg: b.weightKg })), expectedKg: r1(bags.reduce((s, b) => s + b.weightKg, 0)), status: 'PENDING',
    });
    act('inbound', id, 'inbound.expected', { number: e.number, count: bags.length, kg: r1(bags.reduce((s, b) => s + b.weightKg, 0)) }, 'system', iso(at));
    pending++;
  }

  // ---------- Transfers: hub → central (complete and pending), and an outbound from central ----------
  // Transfers start from the warehouse holding the most stock.
  const stockAt = (w: Warehouse) => ops.bags.filter((b) => b.status === 'IN_STOCK' && b.warehouseId === w.id).length;
  const src = [...whs].sort((a, b) => stockAt(b) - stockAt(a))[0]!;
  const dest = whs.find((w) => w.id !== src.id && w.type !== 'PORT') ?? whs.find((w) => w.id !== src.id);
  const atHub = () => ops.bags.filter((b) => b.status === 'IN_STOCK' && b.warehouseId === src.id);
  if (dest && atHub().length > 20) {
    const hub = src;
    const central = dest;
    const sendTransfer = (bags: Bag[], daysAgo: number, complete: boolean) => {
      const at = o.today.getTime() - daysAgo * DAY;
      const id = `${o.orgId}_trf_${out.transfers.length + 1}`;
      const number = issue('transfer', at);
      const sentKg = r1(bags.reduce((s, b) => s + b.weightKg, 0));
      const inId = `${o.orgId}_in_${out.inbounds.length + 1}`;
      const inNumber = issue('inbound', at);
      movement(hub.id, 'TRANSFER_OUT', bags[0]!.commodityId, bags.length, -sentKg, number, id, officerOf(hub), iso(at));
      const lines: Inbound['bags'] = bags.map((b) => {
        const exp = b.weightKg;
        if (complete) {
          const loss = rng.chance(0.3) ? r1(exp * rng.float(0.001, 0.005)) : 0;
          b.weightKg = r1(exp - loss);
          b.warehouseId = central.id;
          hist(b, 'TRANSFER', number, officerOf(hub), iso(at));
          hist(b, 'INBOUND', inNumber, officerOf(central), iso(at + DAY));
          return { code: b.code, expectedKg: exp, status: 'ORIGINAL', receivedKg: b.weightKg };
        }
        b.status = 'IN_TRANSIT';
        hist(b, 'TRANSFER', number, officerOf(hub), iso(at));
        return { code: b.code, expectedKg: exp };
      });
      const receivedKg = complete ? r1(lines.reduce((s, l) => s + (l.receivedKg ?? 0), 0)) : undefined;
      out.transfers.push({
        id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(complete ? at + DAY : at), createdBy: officerOf(hub), number, kind: 'TRANSFER', fromWarehouseId: hub.id, toWarehouseId: central.id,
        receivingOfficerId: central.officerUserIds[0], commodityId: bags[0]!.commodityId, bagCodes: bags.map((b) => b.code), sentKg, receivedKg, inboundId: inId,
        status: complete ? 'TRANSFER_COMPLETE' : 'TRANSFER_PENDING', device: 'mobile',
      });
      out.inbounds.push({
        id: inId, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(complete ? at + DAY : at), createdBy: officerOf(hub), number: inNumber, warehouseId: central.id,
        source: { kind: 'TRANSFER', transferId: id, fromWarehouseId: hub.id }, commodityId: bags[0]!.commodityId, bags: lines, expectedKg: sentKg, receivedKg,
        status: complete ? 'CONFIRMED' : 'PENDING', received: complete ? { at: iso(at + DAY), by: officerOf(central), device: 'web' } : undefined,
      });
      if (complete) movement(central.id, 'TRANSFER_IN', bags[0]!.commodityId, bags.length, receivedKg!, inNumber, inId, officerOf(central), iso(at + DAY));
      act('transfer', id, 'transfer.sent', { number, count: bags.length, kg: sentKg, to: central.name }, officerOf(hub), iso(at));
    };
    const hubBags = atHub().sort((a, b) => a.code.localeCompare(b.code));
    sendTransfer(hubBags.slice(0, Math.round(hubBags.length * 0.35)), 14, true);
    sendTransfer(atHub().slice(-8), 1, false);
    // Outbounds waiting to be loaded on dispatch orders (Phase 13 links them): half of each commodity
    // at central, and four shipments of the hub's main commodity over the last weeks.
    const outbound = (wh: Warehouse, outBags: Bag[], daysAgo: number) => {
      if (!outBags.length) return;
      const at = o.today.getTime() - daysAgo * DAY;
      const id = `${o.orgId}_trf_${out.transfers.length + 1}`;
      const number = issue('transfer', at);
      const kg = r1(outBags.reduce((s, b) => s + b.weightKg, 0));
      for (const b of outBags) { b.status = 'OUT_OF_STOCK'; hist(b, 'DISPATCH', number, officerOf(wh), iso(at)); }
      out.transfers.push({ id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: officerOf(wh), number, kind: 'OUTBOUND', fromWarehouseId: wh.id, commodityId: outBags[0]!.commodityId, bagCodes: outBags.map((b) => b.code), sentKg: kg, status: 'DISPATCHED', device: 'web' });
      movement(wh.id, 'OUT', outBags[0]!.commodityId, outBags.length, -kg, number, id, officerOf(wh), iso(at));
      act('transfer', id, 'transfer.outbound', { number, count: outBags.length, kg }, officerOf(wh), iso(at));
    };
    const atCentral = ops.bags.filter((b) => b.status === 'IN_STOCK' && b.warehouseId === central.id);
    for (const cid of [...new Set(atCentral.map((b) => b.commodityId))]) {
      const list = atCentral.filter((b) => b.commodityId === cid);
      if (list.length >= 4) outbound(central, list.slice(0, Math.floor(list.length / 2)), 5);
    }
    const atSrc = atHub();
    const counts = new Map<string, number>();
    for (const b of atSrc) counts.set(b.commodityId, (counts.get(b.commodityId) ?? 0) + 1);
    const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const mainBags = atSrc.filter((b) => b.commodityId === main).sort((a, b) => a.code.localeCompare(b.code));
    [40, 25, 9, 2].forEach((daysAgo, k) => outbound(hub, mainBags.slice(k * 12, k * 12 + 12), daysAgo));
  }

  // ---------- Stock counts: reconciled last month, inconsistent this week (adjustment waiting), one scheduled ----------
  for (const wh of whs) {
    const stock = ops.bags.filter((b) => b.status === 'IN_STOCK' && b.warehouseId === wh.id);
    if (!stock.length) continue;
    const kg = r1(stock.reduce((s, b) => s + b.weightKg, 0));
    const add = (daysAgo: number, inconsistent: boolean) => {
      const at = o.today.getTime() - daysAgo * DAY;
      const id = `${o.orgId}_cnt_${out.stockCounts.length + 1}`;
      const number = issue('stockCount', at);
      const missing = inconsistent ? stock.slice(-1).map((b) => b.code) : [];
      const codes = stock.map((b) => b.code).filter((c) => !missing.includes(c));
      const countedKg = r1(stock.filter((b) => codes.includes(b.code)).reduce((s, b) => s + b.weightKg, 0));
      out.stockCounts.push({
        id, orgId: o.orgId, createdAt: iso(at - 3 * DAY), updatedAt: iso(at), createdBy: o.approvers[0]!, number, warehouseId: wh.id, scheduledFor: iso(at).slice(0, 10),
        status: inconsistent ? 'INCONSISTENT' : 'RECONCILED', expected: { bags: stock.length, kg }, missingCodes: missing, extraCodes: [],
        counted: { bags: codes.length, kg: countedKg, codes, weighed: {}, at: iso(at), by: officerOf(wh), device: 'mobile', photos: ['count-1.jpg', 'count-2.jpg'] },
        adjustment: inconsistent ? { status: 'PENDING', kg: r1(countedKg - kg), reason: o.lang === 'fr' ? 'Sac introuvable après recomptage' : 'Bag not found after a recount', requestedBy: officerOf(wh), at: iso(at + 3_600_000) } : undefined,
      });
      act('stockCount', id, inconsistent ? 'count.inconsistent' : 'count.reconciled', { bags: codes.length, expected: stock.length, kg: countedKg }, officerOf(wh), iso(at));
    };
    add(24, false);
    if (wh.id === src.id) add(2, true);
    const next = o.today.getTime() + 5 * DAY;
    out.stockCounts.push({ id: `${o.orgId}_cnt_${out.stockCounts.length + 1}`, orgId: o.orgId, createdAt: iso(o.today.getTime() - DAY), updatedAt: iso(o.today.getTime() - DAY), createdBy: o.approvers[0]!, number: issue('stockCount', o.today.getTime()), warehouseId: wh.id, scheduledFor: new Date(next).toISOString().slice(0, 10), status: 'SCHEDULED' });
  }

  // ---------- Movement balances, oldest first ----------
  const balance = new Map<string, number>();
  out.movements = mv.sort((a, b) => a.at.localeCompare(b.at)).map(({ delta, ...x }) => {
    const before = balance.get(x.warehouseId) ?? 0;
    const after = r1(before + delta);
    balance.set(x.warehouseId, after);
    return { ...x, before: r1(before), after };
  }).reverse();

  // ---------- Warehouse expenses across the approval route ----------
  const def = settings.workflows.find((w) => w.docType === 'warehouseExpense');
  const types = settings.inventoryRules.expenseTypes ?? [];
  if (def && types.length) {
    const superUser = (id: string): WorkflowUser => ({ id, roleIds: [], permissions: ['*'] });
    const plan: ['PENDING' | 'L2' | 'APPROVED' | 'REJECTED', WarehouseExpense['paymentStatus']][] = [['PENDING', 'PENDING'], ['L2', 'PENDING'], ['APPROVED', 'PENDING'], ['APPROVED', 'PARTIAL'], ['APPROVED', 'FULL'], ['APPROVED', 'FULL'], ['REJECTED', 'PENDING']];
    plan.forEach(([target, payStatus], i) => {
      const wh = whs[i % whs.length]!;
      const at = o.today.getTime() - (plan.length - i) * 3 * DAY;
      const payee = (n: number) => ({ name: (o.lang === 'fr' ? ['Coopérative de manutention', 'Atelier Kouamé'] : ['Wa Loaders Association', 'Saaka Repairs'])[n % 2]!.toUpperCase(), providerId: settings.paymentProviders.find((p) => p.kind === 'MOBILE_MONEY')?.id ?? '', number: o.lang === 'fr' ? `+22507${String(rng.int(10_000_000, 99_999_999))}` : `+23324${String(rng.int(1_000_000, 9_999_999))}` });
      const picked = types.slice(0, 1 + (i % types.length));
      const lines: WarehouseExpenseLine[] = picked.map((t, k) => {
        const quantity = t.basis === 'PER_BAG' ? rng.int(40, 180) : t.basis === 'PER_KG' ? rng.int(2_000, 9_000) : 1;
        const rate = m(t.defaultRateMinor);
        return { typeId: t.id, basis: t.basis, quantity, rate, amount: m(rate.amountMinor * quantity), payee: payee(k), paid: payStatus === 'FULL' || (payStatus === 'PARTIAL' && k === 0) };
      });
      if (payStatus === 'PARTIAL' && lines.length < 2) lines.push({ ...lines[0]!, typeId: types[types.length - 1]!.id, basis: types[types.length - 1]!.basis, quantity: 1, rate: m(types[types.length - 1]!.defaultRateMinor), amount: m(types[types.length - 1]!.defaultRateMinor), payee: payee(1), paid: false });
      const id = `${o.orgId}_wsx_${i + 1}`;
      const creator = wh.officerUserIds[0] ?? hub.officerUserIds[0] ?? whs.find((w) => w.officerUserIds.length)?.officerUserIds[0] ?? 'system';
      const base = {
        id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: creator, number: issue('warehouseExpense', at), warehouseId: wh.id,
        description: (o.lang === 'fr' ? ['Manutention arrivage', 'Réparation du toit', 'Fumigation mensuelle'] : ['Offloading the week’s trucks', 'Roof repair after the storm', 'Loading for dispatch'])[i % 3],
        lines, total: m(lines.reduce((s, l) => s + l.amount.amountMinor, 0)), paymentStatus: payStatus, disbursements: [] as WarehouseExpense['disbursements'], device: rng.chance(0.6) ? ('mobile' as const) : ('web' as const),
      };
      let rec = start(def, base as unknown as WorkflowRecord, new Date(at).toISOString()).record;
      const steps = target === 'PENDING' ? 0 : target === 'L2' ? 2 : target === 'REJECTED' ? 1 : def.steps.length;
      for (let k = 0; k < steps; k++) rec = apply(rec, def, 'APPROVE', superUser(o.approvers[k] ?? o.approvers[o.approvers.length - 1]!), { at: new Date(at + (k + 1) * 6 * 3_600_000).toISOString() }).record;
      if (target === 'REJECTED') rec = apply(rec, def, 'REJECT', superUser(o.approvers[1] ?? o.approvers[0]!), { comment: o.lang === 'fr' ? 'Devis manquant' : 'No quotation attached', at: new Date(at + DAY).toISOString() }).record;
      const e = rec as unknown as WarehouseExpense;
      e.disbursements = lines.map((l, k) => ({ l, k })).filter(({ l }) => l.paid).map(({ l, k }) => ({ id: `${id}_d${k}`, amount: l.amount, method: 'MANUAL' as const, at: iso(at + 2 * DAY), by: o.financeUserId, proof: 'transfer-slip.pdf', lineIndex: k }));
      out.warehouseExpenses.push(e);
      act('warehouseExpense', id, 'wexpense.created', { number: e.number, total: e.total }, creator, iso(at));
    });
  }
  return out;
}
