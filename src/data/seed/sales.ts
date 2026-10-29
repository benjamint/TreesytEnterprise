import type { ActivityEvent, Client, DispatchOrder, ImpactSnapshot, InsightRequest, Money, OrgSettings, PaymentInstalment, Plot, SalesContract, Transfer } from '@/types';
import { apply, start, type WorkflowRecord, type WorkflowUser } from '@/engines/workflow';
import { nextNumber } from '@/engines/numbering';
import type { OpsResult } from './operations';
import { Rng } from './rng';

/**
 * Phase 13 seed (PRD H6–H8, 12.6): clients (two of them Traceboard buyers), five sales contracts
 * across their statuses, twenty dispatch orders (direct and from the outbounds waiting in stock,
 * one in transit to Nordic Shea Butter), mapped plots for trace to source, and buyer insight
 * requests. Its own random stream.
 */

export interface SalesSeed { clients: Client[]; contracts: SalesContract[]; dispatches: DispatchOrder[]; plots: Plot[]; insights: InsightRequest[]; activity: ActivityEvent[] }

interface ClientDef { code: string; name: string; country: string; buyerOrgId?: string; contactName?: string }
interface ContractDef {
  client: string; commodityId: string; quantityT?: number; pricePerT: number; currency: string; term: string; packaging: string; status: SalesContract['status'];
  windowDays: [number, number]; deliveryPoint: string;
  /** Dispatches on the contract: [kind, status, daysAgo]. */
  dispatches: [DispatchOrder['kind'], DispatchOrder['status'], number][];
}
interface Opts {
  orgId: string; seed: number; today: Date; lang: 'en' | 'fr'; clients: ClientDef[]; contracts: ContractDef[];
  /** Extra direct dispatches without a contract: [client, commodity, status, daysAgo]. */
  loose: [string, string, DispatchOrder['status'], number][];
  officerUserId: string; approverUserId: string; financeUserId: string; port: { lat: number; lng: number; name: string };
  insights?: { buyerOrgId: string; userId: string; topic: string; message: string; answer?: string }[];
}

const DAY = 86_400_000;
const r1 = (kg: number) => Math.round(kg * 10) / 10;

export function seedSales(ops: OpsResult, settings: OrgSettings, transfers: Transfer[], o: Opts): SalesSeed {
  const rng = new Rng(o.seed);
  const out: SalesSeed = { clients: [], contracts: [], dispatches: [], plots: [], insights: [], activity: [] };
  const iso = (t: number) => new Date(Math.min(t, o.today.getTime() - 3_600_000)).toISOString();
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const issue = (docType: string, at: number, ctx: Record<string, string> = {}) => {
    const r = nextNumber(settings.numbering.find((p) => p.docType === docType)!, ops.sequences, { date: new Date(at), ...ctx });
    ops.sequences = r.sequences;
    return r.number;
  };
  const act = (entity: string, entityId: string, key: string, params: Record<string, unknown>, actorId: string, at: string) =>
    out.activity.push({ id: `${entityId}_act_${out.activity.length}`, orgId: o.orgId, entity, entityId, key, params, actorId, at });
  const m = (amountMinor: number, currency: string): Money => ({ amountMinor: Math.round(amountMinor), currency });
  const superUser = (id: string): WorkflowUser => ({ id, roleIds: [], permissions: ['*'] });

  // ---------- Plots: about half of the farmers have a mapped plot near their community ----------
  const communityOf = new Map(ops.communities.map((c) => [c.id, c]));
  const eudrRelevant = settings.commodities.some((c) => c.eudrRelevant);
  for (const f of ops.farmers) {
    if (!rng.chance(0.55)) continue;
    const c = communityOf.get(f.communityId);
    if (!c) continue;
    const cLat = c.gps.lat + rng.float(-0.03, 0.03);
    const cLng = c.gps.lng + rng.float(-0.03, 0.03);
    const areaHa = Math.round(rng.float(0.4, 3.6) * 10) / 10;
    const r = Math.sqrt(areaHa / 3.14) * 0.009;
    const n = rng.int(5, 7);
    const polygon = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2;
      const rr = r * rng.float(0.75, 1.2);
      // Most plots were mapped with phone GPS (7 decimals); one in ten came from an old 5-decimal import.
      const q = f.id.charCodeAt(f.id.length - 1) % 10 === 0 ? 1e5 : 1e7;
      return [Math.round((cLat + Math.sin(a) * rr) * q) / q, Math.round((cLng + Math.cos(a) * rr) * q) / q] as [number, number];
    });
    out.plots.push({
      id: `${f.id}_plot`, orgId: o.orgId, createdAt: f.registeredAt, updatedAt: f.registeredAt, createdBy: f.createdBy, farmerId: f.id, communityId: f.communityId, polygon, areaHa,
      eudrStatus: rng.weighted(eudrRelevant ? [['COMPLIANT', 70], ['AT_RISK', 12], ['PENDING', 18]] as const : [['COMPLIANT', 80], ['AT_RISK', 5], ['PENDING', 15]] as const),
      crop: f.primaryCrop,
    });
  }
  const plotsByFarmer = new Map(out.plots.map((p) => [p.farmerId, p]));

  // ---------- Clients ----------
  for (const c of o.clients) {
    out.clients.push({ id: `${o.orgId}_cl_${c.code.toLowerCase()}`, orgId: o.orgId, createdAt: iso(o.today.getTime() - 300 * DAY), updatedAt: iso(o.today.getTime() - 300 * DAY), createdBy: o.officerUserId, name: c.name, code: c.code, country: c.country, buyerOrgId: c.buyerOrgId, contactName: c.contactName });
  }
  const clientId = (code: string) => `${o.orgId}_cl_${code.toLowerCase()}`;

  // ---------- Trace helpers over the seed data ----------
  const purchasesByRequest = new Map<string, typeof ops.purchases>();
  for (const p of ops.purchases) purchasesByRequest.set(p.requestId, [...(purchasesByRequest.get(p.requestId) ?? []), p]);
  const bagByCode = new Map(ops.bags.map((b) => [b.code, b]));
  const purchaseById = new Map(ops.purchases.map((p) => [p.id, p]));
  const farmerById = new Map(ops.farmers.map((f) => [f.id, f]));
  const impactFor = (purchaseIds: string[]): ImpactSnapshot => {
    const fids = new Set(purchaseIds.map((id) => purchaseById.get(id)?.farmerId).filter(Boolean) as string[]);
    const farmers = [...fids].map((id) => farmerById.get(id)!).filter(Boolean);
    const plots = farmers.map((f) => plotsByFarmer.get(f.id)).filter(Boolean) as Plot[];
    const n = farmers.length;
    return {
      farmers: n, communities: new Set(farmers.map((f) => f.communityId)).size, womenPct: n ? Math.round((farmers.filter((f) => f.gender === 'F').length / n) * 100) : 0,
      childrenPerFarmer: n ? Math.round((farmers.reduce((s, f) => s + Number(f.customFields.numberOfChildren ?? 0), 0) / n) * 10) / 10 : 0,
      treesPlanted: Math.round(n * rng.float(2, 6)), plotsMapped: plots.length, eudrPct: plots.length ? Math.round((plots.filter((p) => p.eudrStatus === 'COMPLIANT').length / plots.length) * 100) : 0,
    };
  };
  // Direct dispatches draw from reconciled requests of the commodity, oldest first, never twice.
  const usedRequests = new Set<string>();
  const directRequests = (commodityId: string, count: number) => {
    const list = ops.requests.filter((r) => r.commodityId === commodityId && r.status === 'RECONCILED' && !usedRequests.has(r.id) && purchasesByRequest.get(r.id)?.length)
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)).slice(0, count);
    list.forEach((r) => usedRequests.add(r.id));
    if (list.length) return list;
    // Small commodities run out of reconciled requests: fall back to any request with purchases.
    return ops.requests.filter((r) => r.commodityId === commodityId && purchasesByRequest.get(r.id)?.length).slice(0, count);
  };
  const freeOutbounds = transfers.filter((t) => t.orgId === o.orgId && t.kind === 'OUTBOUND' && !t.dispatchId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const def = settings.workflows.find((w) => w.docType === 'dispatchOrder')!;
  const drivers = o.lang === 'fr' ? ['Yao Kouadio', 'Bamba Seydou', 'Konan Brou', 'Ouattara Issa'] : ['Kwesi Ankrah', 'Abdul-Rahman Iddrisu', 'Kofi Boadu', 'Sumaila Mahama'];
  const route = (from: { lat: number; lng: number }, f: number) => ({ lat: Math.round((from.lat + (o.port.lat - from.lat) * f) * 1e4) / 1e4, lng: Math.round((from.lng + (o.port.lng - from.lng) * f) * 1e4) / 1e4 });

  const makeDispatch = (clientCode: string, commodityId: string, kind: DispatchOrder['kind'], status: DispatchOrder['status'], daysAgo: number, contractId?: string, unitPriceMinor?: number, currency?: string) => {
    const at = o.today.getTime() - daysAgo * DAY;
    let outboundIds: string[] = [];
    let bagCodes: string[] = [];
    let requestIds: string[] = [];
    let expectedKg = 0;
    let purchaseIds: string[] = [];
    let loadingWh = ops.warehouses[0]!;
    if (kind === 'INVENTORY') {
      const t = freeOutbounds.find((x) => x.commodityId === commodityId && new Date(x.createdAt).getTime() <= at + 3_600_000) ?? freeOutbounds.find((x) => x.commodityId === commodityId);
      if (!t) return undefined;
      freeOutbounds.splice(freeOutbounds.indexOf(t), 1);
      outboundIds = [t.id];
      bagCodes = t.bagCodes;
      expectedKg = t.sentKg;
      purchaseIds = [...new Set(bagCodes.flatMap((c) => bagByCode.get(c)?.purchaseIds ?? []))];
      loadingWh = ops.warehouses.find((w) => w.id === t.fromWarehouseId) ?? loadingWh;
    } else {
      const reqs = directRequests(commodityId, rng.int(2, 3));
      if (!reqs.length) return undefined;
      requestIds = reqs.map((r) => r.id);
      const ps = reqs.flatMap((r) => purchasesByRequest.get(r.id) ?? []);
      purchaseIds = ps.map((p) => p.id);
      expectedKg = r1(ps.reduce((s, p) => s + p.quantity, 0));
    }
    const id = `${o.orgId}_do_${out.dispatches.length + 1}`;
    const creator = o.officerUserId;
    const driverName = rng.pick(drivers);
    const plate = o.lang === 'fr' ? `${rng.int(1000, 9999)} ${rng.pick(['FD', 'GH', 'KN'])} 01` : `${rng.pick(['UW', 'NR', 'GR'])} ${rng.int(1000, 9999)}-${rng.int(10, 24)}`;
    const base = {
      id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: creator, number: issue('dispatchOrder', at), kind, clientId: clientId(clientCode), contractId, commodityId,
      outboundIds, requestIds, bagCodes, loading: { warehouseId: kind === 'INVENTORY' ? loadingWh.id : undefined, place: kind === 'INVENTORY' ? loadingWh.name : (o.lang === 'fr' ? 'Collecte bord-champ' : 'Farm-gate collection') },
      driver: { name: driverName, phone: o.lang === 'fr' ? `+22507${rng.int(10_000_000, 99_999_999)}` : `+23324${rng.int(1_000_000, 9_999_999)}`, licence: 'driver-licence.jpg' }, truck: { plate, image: 'truck-photo.jpg' },
      waybill: `WB-${rng.int(100_000, 999_999)}`, expectedKg, impact: impactFor(purchaseIds), tracking: [] as DispatchOrder['tracking'],
      documents: [{ id: `${id}_d1`, type: 'licence', name: 'driver-licence.jpg', at: iso(at), by: creator }, { id: `${id}_d2`, type: 'truck', name: 'truck-photo.jpg', at: iso(at), by: creator }, { id: `${id}_d3`, type: 'waybill', name: 'waybill.pdf', at: iso(at), by: creator }] as DispatchOrder['documents'],
      downloads: [] as DispatchOrder['downloads'],
    };
    let rec = start(def, base as unknown as WorkflowRecord, iso(at)).record;
    const tracking: DispatchOrder['tracking'] = [{ at: iso(at), status: 'PENDING_APPROVAL', by: creator }];
    if (status === 'REJECTED') rec = apply(rec, def, 'REJECT', superUser(o.approverUserId), { comment: o.lang === 'fr' ? 'Camion non conforme' : 'Truck not roadworthy — find another', at: iso(at + 3 * 3_600_000) }).record;
    else if (status !== 'PENDING_APPROVAL') rec = apply(rec, def, 'APPROVE', superUser(o.approverUserId), { at: iso(at + 3 * 3_600_000) }).record;
    const d = rec as unknown as DispatchOrder;
    const steps: DispatchOrder['status'][] = ['PENDING', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'VERIFIED'];
    const reach = steps.indexOf(status);
    let position: DispatchOrder['position'];
    for (let k = 0; k <= reach; k++) {
      const st = steps[k]!;
      const t = at + (k + 1) * 0.6 * DAY;
      const p = st === 'IN_TRANSIT' ? route(loadingWh.gps, status === 'IN_TRANSIT' ? 0.55 : 0.2) : st === 'ARRIVED' || st === 'DELIVERED' ? route(loadingWh.gps, 1) : undefined;
      tracking.push({ at: iso(t), status: st, lat: p?.lat, lng: p?.lng, eta: st === 'IN_TRANSIT' ? iso(t + DAY) : undefined, by: k === 0 ? o.approverUserId : creator });
      if (p) position = { ...p, at: iso(t), eta: st === 'IN_TRANSIT' ? iso(t + DAY) : undefined };
    }
    if (status === 'IN_TRANSIT') tracking.push({ at: iso(o.today.getTime() - 4 * 3_600_000), status: 'IN_TRANSIT', ...route(loadingWh.gps, 0.62), eta: iso(o.today.getTime() + 20 * 3_600_000), note: o.lang === 'fr' ? 'Passage du poste de contrôle' : 'Passed the Kintampo checkpoint', by: creator });
    if (status === 'IN_TRANSIT') position = { ...route(loadingWh.gps, 0.62), at: iso(o.today.getTime() - 4 * 3_600_000), eta: iso(o.today.getTime() + 20 * 3_600_000) };
    let verification: DispatchOrder['verification'];
    const docs = [...base.documents];
    if (status === 'VERIFIED') {
      const vAt = at + 3.2 * DAY;
      const deliveredKg = r1(expectedKg * rng.float(0.985, 0.999));
      const price = unitPriceMinor ?? 0;
      const cur = currency ?? 'GHS';
      verification = {
        weighbridge: 'weighbridge-report.pdf', invoice: 'invoice.pdf', qualityTest: rng.chance(0.6) ? 'quality-test.pdf' : undefined, deliveredKg, bagsDelivered: kind === 'INVENTORY' ? bagCodes.length : Math.round(deliveredKg / 85),
        unitPrice: m(price, cur), amount: m((deliveredKg / 1000) * price, cur), saleNumber: issue('saleNumber', vAt, { clientCode }), at: iso(vAt), by: creator,
      };
      docs.push({ id: `${id}_d4`, type: 'weighbridge', name: 'weighbridge-report.pdf', at: iso(vAt), by: creator }, { id: `${id}_d5`, type: 'invoice', name: 'invoice.pdf', at: iso(vAt), by: creator });
      if (verification.qualityTest) docs.push({ id: `${id}_d6`, type: 'qualityTest', name: 'quality-test.pdf', at: iso(vAt), by: creator });
    }
    const final: DispatchOrder = { ...d, status, tracking, position, verification, documents: docs, updatedAt: tracking[tracking.length - 1]!.at };
    out.dispatches.push(final);
    for (const tid of outboundIds) { const t = transfers.find((x) => x.id === tid); if (t) t.dispatchId = id; }
    act('dispatchOrder', id, 'dispatch.created', { number: final.number, kg: expectedKg, client: o.clients.find((c) => c.code === clientCode)?.name ?? '' }, creator, iso(at));
    if (verification) act('dispatchOrder', id, 'dispatch.verified', { sale: verification.saleNumber, kg: verification.deliveredKg, amount: verification.amount }, creator, verification.at);
    return final;
  };

  // ---------- Contracts and their dispatches ----------
  o.contracts.forEach((cd, ci) => {
    const at = o.today.getTime() - (cd.windowDays[0] + 20) * DAY;
    const id = `${o.orgId}_sc_${ci + 1}`;
    const number = issue('salesContract', at);
    const tmpl = settings.sales.templates.find((t) => t.commodityId === cd.commodityId);
    const commodity = settings.commodities.find((c) => c.id === cd.commodityId);
    // Dispatches first, so a contract's quantity can match what was delivered when it is fulfilled.
    const linked = cd.dispatches.map(([kind, status, daysAgo]) => makeDispatch(cd.client, cd.commodityId, kind, status, daysAgo, id, cd.pricePerT, cd.currency)).filter(Boolean) as DispatchOrder[];
    const delivered = linked.filter((d) => d.verification).reduce((s, d) => s + d.verification!.deliveredKg, 0);
    const quantity = cd.quantityT ?? Math.max(1, Math.round(delivered / 1000));
    const total = m(quantity * cd.pricePerT, cd.currency);
    const term = settings.sales.paymentTerms.find((t) => t.id === cd.term)!;
    const firstDelivery = linked.map((d) => d.verification?.at).filter(Boolean).sort()[0] as string | undefined;
    let left = total.amountMinor;
    const schedule: PaymentInstalment[] = term.instalments.map((p, k) => {
      const amount = k === term.instalments.length - 1 ? left : Math.round((total.amountMinor * p.pct) / 100);
      left -= amount;
      const due = p.trigger === 'SIGNATURE' && cd.status !== 'DRAFT' ? day(at + p.days * DAY) : firstDelivery ? day(new Date(firstDelivery).getTime() + (p.trigger === 'AFTER_DELIVERY' ? p.days : 0) * DAY) : undefined;
      const received = due && cd.status !== 'CANCELLED' && (p.trigger === 'SIGNATURE' || cd.status === 'FULFILLED') && new Date(due).getTime() < o.today.getTime() - 2 * DAY
        ? { at: iso(new Date(due).getTime() + DAY), by: o.financeUserId, reference: `TT-${rng.int(10_000, 99_999)}` } : undefined;
      return { id: `${id}_pi_${k + 1}`, label: `${p.pct}%`, pct: p.pct, amount: m(amount, cd.currency), trigger: p.trigger, dueDate: due, received };
    });
    out.contracts.push({
      id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: o.officerUserId, number, clientId: clientId(cd.client), templateId: tmpl?.id, commodityId: cd.commodityId,
      grade: commodity?.grades[0], quantity, unitId: 't', pricePerUnit: m(cd.pricePerT, cd.currency),
      qualitySpec: (commodity?.quality ?? []).map((q) => ({ key: q.key, label: q.label, max: q.max, unit: q.unit })), paymentTermId: cd.term, packagingId: cd.packaging,
      shipmentWindow: { start: day(o.today.getTime() - cd.windowDays[0] * DAY), end: day(o.today.getTime() + cd.windowDays[1] * DAY) }, deliveryPoint: cd.deliveryPoint,
      officerUserId: o.officerUserId, tolerancePct: tmpl?.tolerancePct ?? 2, status: cd.status, signedDocument: cd.status === 'DRAFT' ? undefined : 'signed-contract.pdf', schedule,
      documents: cd.status === 'DRAFT' ? [] : [{ id: `${id}_doc1`, type: 'signedContract', name: 'signed-contract.pdf', at: iso(at + DAY), by: o.officerUserId }],
      notes: cd.status === 'CANCELLED' ? (o.lang === 'fr' ? 'Annulé par l’acheteur' : 'Cancelled by the buyer — crop failure in the region') : undefined,
    });
    act('salesContract', id, 'contract.created', { number, total }, o.officerUserId, iso(at));
  });

  // ---------- Dispatches without a contract ----------
  for (const [client, commodityId, status, daysAgo] of o.loose) {
    const price = settings.priceList.find((p) => p.commodityId === commodityId)?.price.amountMinor ?? 0;
    makeDispatch(client, commodityId, status === 'PENDING_APPROVAL' && freeOutbounds.some((t) => t.commodityId === commodityId) ? 'INVENTORY' : 'DIRECT', status, daysAgo, undefined, price * 1000 * 1.25, settings.priceList[0]?.price.currency);
  }

  // ---------- Buyer insight requests ----------
  for (const [k, ins] of (o.insights ?? []).entries()) {
    const at = o.today.getTime() - (12 - k * 7) * DAY;
    out.insights.push({
      id: `${o.orgId}_ins_${k + 1}`, fromOrgId: ins.buyerOrgId, orgId: o.orgId, userId: ins.userId, topic: ins.topic, message: ins.message, status: ins.answer ? 'ANSWERED' : 'OPEN', createdAt: iso(at),
      answer: ins.answer ? { text: ins.answer, by: o.officerUserId, at: iso(at + 2 * DAY) } : undefined,
    });
  }
  out.dispatches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}
