import type {
  ActivityEvent, CarbonProject, DispatchOrder, DueDiligenceStatement, EudrLot, ForestLossZone, Nursery, NurseryBatch, NurseryRound, OrgSettings, Plot, PlotVisit,
  SeedlingAllocation, SeedlingLot, Tree, TreeState, TreeVisit,
} from '@/types';
import { nextNumber } from '@/engines/numbering';
import { NEW_FARM_OFFSET, centroid, decimalsOf, gpsReading, overlapShare, polygonAreaHa, validateGeometry, type LatLng } from '@/engines/geo';
import type { OpsResult } from './operations';
import { Rng } from './rng';

/**
 * Phase 14 seed (PRD I1–I6, Journeys 11 and 14): community nurseries with batches and monitoring
 * rounds, seedling lots and their codes, allocations to agents and farmers, the trees they became
 * with their monitoring visits, plots enriched with type, validation and a deforestation check
 * against a bundled forest-loss layer, EUDR lots and statements for cocoa dispatches, and one
 * carbon project per company. Its own random stream.
 */

export interface LandSeed {
  nurseries: Nursery[]; lots: SeedlingLot[]; allocations: SeedlingAllocation[]; trees: Tree[]; plots: Plot[]; lossZones: ForestLossZone[];
  eudrLots: EudrLot[]; statements: DueDiligenceStatement[]; projects: CarbonProject[]; activity: ActivityEvent[];
}

interface Opts {
  orgId: string; seed: number; today: Date; lang: 'en' | 'fr';
  /** Field agents who raise nurseries and plant (agent type). */
  agentTypeId: string;
  /** The journey agent: keeps seedlings in hand, has a primary round overdue, trees due. */
  mainUserId: string;
  /** The journey mapper: a forest-loss area sits just outside their first community (Journey 11). */
  mapperUserId?: string;
  nurseries: number;
  farmersPlanting: number;
  externalSupplier: string;
  officeUserId: string;
  project: { name: string; standard: CarbonProject['standard']; partner: string; plan: string; baselineT: number };
  dispatches: DispatchOrder[];
  checkedShare: number;
}

const DAY = 86_400_000;
export { NEW_FARM_OFFSET };

export function seedLand(ops: OpsResult, settings: OrgSettings, plots: Plot[], o: Opts): LandSeed {
  const rng = new Rng(o.seed);
  const out: LandSeed = { nurseries: [], lots: [], allocations: [], trees: [], plots: [], lossZones: [], eudrLots: [], statements: [], projects: [], activity: [] };
  const land = settings.land;
  const now = o.today.getTime();
  const iso = (t: number) => new Date(Math.min(t, now - 3_600_000)).toISOString();
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const issue = (docType: string, at: number, prefix?: string) => {
    const base = settings.numbering.find((p) => p.docType === docType)!;
    const r = nextNumber(prefix != null ? { ...base, prefix } : base, ops.sequences, { date: new Date(at) });
    ops.sequences = r.sequences;
    return r.number;
  };
  const act = (entity: string, entityId: string, key: string, params: Record<string, unknown>, actorId: string, at: string, device?: string) =>
    out.activity.push({ id: `${entityId}_act_${out.activity.length}`, orgId: o.orgId, entity, entityId, key, params, actorId, at, ...(device ? { meta: { device } } : {}) } as ActivityEvent);

  const agents = ops.agents.filter((a) => a.agentTypeId === o.agentTypeId && a.status === 'ACTIVE');
  const main = ops.agents.find((a) => a.userId === o.mainUserId)!;
  const species = land.species.filter((s) => s.enabled);
  const communities = ops.communities;
  const byId = new Map(communities.map((c) => [c.id, c]));
  // Agents' communities: where they are assigned, else spread across the company.
  const communitiesOf = (agentId: string, i: number) => {
    const mine = communities.filter((c) => c.agentIds.includes(agentId));
    return mine.length ? mine : communities.filter((_, k) => k % Math.max(1, agents.length) === i % Math.max(1, agents.length));
  };

  // ---------- Forest-loss layer (simulated, cleared after 31 Dec 2020) ----------
  const zone = (name: string, lat: number, lng: number, h: number, w: number, year: number): ForestLossZone => {
    const n = 8;
    const polygon = Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; const r = 0.8 + ((k * 37) % 10) / 25; return [Number((lat + Math.sin(a) * h * r).toFixed(6)), Number((lng + Math.cos(a) * w * r).toFixed(6))] as LatLng; });
    return { id: `${o.orgId}_loss_${out.lossZones.length + 1}`, orgId: o.orgId, name, polygon, lossYear: year };
  };
  for (const c of rng.sample(communities, Math.min(4, communities.length))) {
    out.lossZones.push(zone(c.name, c.gps.lat + rng.float(-0.02, 0.02), c.gps.lng + rng.float(-0.02, 0.02), rng.float(0.003, 0.006), rng.float(0.004, 0.007), rng.pick([2021, 2022, 2023])));
  }
  if (o.mapperUserId) {
    const mapper = ops.agents.find((a) => a.userId === o.mapperUserId)!;
    // Beside each of the mapper's villages, so a newly walked farm there shows up as cleared after the cut-off.
    for (const home of communities.filter((c) => c.agentIds.includes(mapper.id))) {
      out.lossZones.push(zone(home.name, home.gps.lat + NEW_FARM_OFFSET[0], home.gps.lng + NEW_FARM_OFFSET[1], 0.0024, 0.003, 2022));
    }
  }

  // ---------- Plots: code, type, declared area, validation, deforestation check, monitoring ----------
  const plotTypes = land.plotTypes;
  // Rings from the sales seed are drawn too wide: scale each to its stated area, keeping its precision.
  const fit = (p: Plot): Plot => {
    const c = centroid(p.polygon);
    const k = Math.sqrt(p.areaHa / Math.max(0.01, polygonAreaHa(p.polygon)));
    // Old 5-decimal imports stay at 5 decimals; phone-mapped rings read 7.
    const old = Math.max(...p.polygon.flatMap((x) => [decimalsOf(x[0]), decimalsOf(x[1])])) <= 5;
    const scaled = p.polygon.map(([la, lo]) => [c[0] + (la - c[0]) * k, c[1] + (lo - c[1]) * k] as LatLng);
    return { ...p, polygon: old ? scaled.map(([la, lo]) => [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5] as LatLng) : scaled.map(gpsReading) };
  };
  const ordered = plots.map(fit).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byCommunity = new Map<string, Plot[]>();
  for (const p of ordered) byCommunity.set(p.communityId, [...(byCommunity.get(p.communityId) ?? []), p]);
  const farmerAgent = new Map(ops.farmers.map((f) => [f.id, f.agentId]));
  for (const p of ordered) {
    const t = new Date(p.createdAt).getTime();
    const others = (byCommunity.get(p.communityId) ?? []).filter((x) => x.id !== p.id).map((x) => ({ id: x.id, polygon: x.polygon }));
    const validation = validateGeometry({ polygon: p.polygon }, land.eudr, others);
    const checked = rng.chance(o.checkedShare);
    const hit = out.lossZones.map((z) => ({ z, share: overlapShare(p.polygon, z.polygon) })).find((x) => x.share > 0);
    const checkAt = iso(Math.max(t, now - rng.int(10, 120) * DAY));
    const result = !checked ? 'NOT_CHECKED' as const : hit ? 'RISK' as const : 'CLEAR' as const;
    const visits: PlotVisit[] = [];
    if (rng.chance(0.45)) {
      const at = iso(now - rng.int(5, 150) * DAY);
      visits.push({ id: `${p.id}_v1`, at, by: farmerAgent.get(p.farmerId) ?? '', device: 'mobile', photos: ['plot-visit.jpg'], answers: Object.fromEntries(land.plotMonitoring.map((q) => [q.id, q.kind === 'YES_NO' ? (q.id === 'fenced' ? rng.chance(0.3) : rng.chance(q.id === 'chemicals' ? 0.25 : 0.12)) : rng.pick(o.lang === 'fr' ? ['Désherbage', 'Récolte', 'Aucune'] : ['Weeding', 'Harvesting', 'None'])])) });
    }
    out.plots.push({
      ...p, code: issue('plot', t), typeId: plotTypes[rng.chance(0.82) ? 0 : Math.min(1, plotTypes.length - 1)]!.id, geometry: 'POLYGON',
      areaHa: polygonAreaHa(p.polygon), declaredAreaHa: Math.round(p.areaHa * rng.float(0.8, 1.3) * 10) / 10, gpsAccuracyM: rng.int(3, 9),
      validation, check: result === 'NOT_CHECKED' ? { result } : { result, at: checkAt, by: o.officeUserId, lossHa: hit ? Math.round(p.areaHa * hit.share * 100) / 100 : 0, zoneId: hit?.z.id },
      eudrStatus: result === 'RISK' ? 'AT_RISK' : result === 'CLEAR' ? 'COMPLIANT' : 'PENDING',
      agreement: rng.chance(0.7) ? { name: 'plot-agreement.jpg', at: p.createdAt, by: farmerAgent.get(p.farmerId) ?? '' } : undefined,
      images: [{ id: `${p.id}_img`, kind: 'PLOT', name: 'plot.jpg', at: p.createdAt, by: farmerAgent.get(p.farmerId) ?? '' }],
      visits, agentId: farmerAgent.get(p.farmerId), device: 'mobile', source: 'MAPPED',
    });
    act('plot', p.id, 'plot.mapped', { area: polygonAreaHa(p.polygon) }, farmerAgent.get(p.farmerId) ?? o.officeUserId, p.createdAt, 'mobile');
    if (result !== 'NOT_CHECKED') act('plot', p.id, result === 'RISK' ? 'plot.checkRisk' : 'plot.checkClear', {}, o.officeUserId, checkAt);
  }
  const plotOf = new Map(out.plots.map((p) => [p.farmerId, p]));

  // ---------- Nurseries with batches and monitoring rounds ----------
  const rounds = land.nurseryRounds;
  for (let i = 0; i < o.nurseries; i++) {
    const agent = i < 2 ? main : agents[i % agents.length] ?? main;
    const comms = communitiesOf(agent.id, i);
    const c = comms[i % comms.length]!;
    // The journey nursery: sown 25 days ago, its primary round (21 days) is overdue.
    const sownAgo = i === 0 ? 25 : rng.int(40, 220);
    const sown = now - sownAgo * DAY;
    const createdAt = iso(sown - rng.int(5, 30) * DAY);
    const id = `${o.orgId}_nur${i + 1}`;
    const batches: NurseryBatch[] = Array.from({ length: i === 0 ? 2 : rng.int(1, 3) }, (_, k) => {
      const sp = species[(i + k) % species.length]!;
      const quantity = rng.int(6, 30) * 100;
      return { id: `${id}_b${k + 1}`, number: issue('nurseryBatch', sown), speciesId: sp.id, sownAt: day(sown + k * DAY), quantity, potted: 0, germinated: 0, alive: 0, disbursed: 0, history: [] };
    });
    const nRounds: NurseryRound[] = [];
    let secondary = 0;
    for (const def of rounds) {
      const due = sown + def.dueDays * DAY;
      const done = due < now - 2 * DAY && !(i === 0);
      if (def.kind === 'SECONDARY') secondary++;
      const r: NurseryRound = { id: `${id}_r_${def.id}`, defId: def.id, seq: def.kind === 'SECONDARY' ? secondary : 0, kind: def.kind, dueDate: day(due), values: [], photos: [] };
      if (done) {
        const at = due + rng.int(-2, 6) * DAY;
        r.doneAt = iso(at); r.by = agent.userId; r.device = 'mobile'; r.photos = ['nursery-round.jpg'];
        for (const b of batches) {
          if (def.kind === 'PRIMARY') {
            b.potted = Math.round(b.quantity * rng.float(0.92, 0.99));
            b.germinated = Math.round(b.potted * rng.float(0.68, 0.9));
            b.alive = b.germinated;
            r.values.push({ batchId: b.id, polyBags: b.quantity, potted: b.potted, germinated: b.germinated });
          } else {
            const dead = Math.round(b.alive * rng.float(0.02, 0.1));
            const fresh = Math.round((b.potted - b.germinated) * rng.float(0, 0.15));
            b.germinated += fresh; b.alive = b.alive - dead + fresh;
            r.values.push({ batchId: b.id, alive: b.alive, dead, newGerminations: fresh });
          }
          b.history.push({ roundId: r.id, at: r.doneAt!, germinated: b.germinated, alive: b.alive });
        }
      }
      nRounds.push(r);
    }
    const n: Nursery = {
      id, orgId: o.orgId, createdAt, updatedAt: createdAt, createdBy: agent.userId, code: issue('nursery', sown), name: o.lang === 'fr' ? `Pépinière de ${c.name}` : `${c.name} community nursery`,
      communityId: c.id, agentId: agent.id, gps: { lat: Number((c.gps.lat + rng.float(-0.004, 0.004)).toFixed(6)), lng: Number((c.gps.lng + rng.float(-0.004, 0.004)).toFixed(6)), accuracy: rng.int(3, 8) },
      fenced: rng.chance(0.7), waterSource: rng.pick(['borehole', 'dam', 'river', 'well']), material: rng.pick(['Poly bags', 'Seed trays', 'Raised beds']),
      representative: { name: `${rng.pick(o.lang === 'fr' ? ['Adjoua', 'Kouassi', 'Aya', 'Konan'] : ['Abiba', 'Issahaku', 'Fatimatu', 'Bayor'])} ${rng.pick(o.lang === 'fr' ? ['Kouamé', 'Yao', 'Koffi'] : ['Dery', 'Naa', 'Kuuire'])}`, gender: rng.chance(0.55) ? 'F' : 'M', phone: o.lang === 'fr' ? `+22507${rng.int(10_000_000, 99_999_999)}` : `+23324${rng.int(1_000_000, 9_999_999)}` },
      profile: { capacity: batches.reduce((s, b) => s + b.quantity, 0) * 2 }, batches, rounds: nRounds,
      images: [{ id: `${id}_img1`, kind: 'PROFILING', name: 'nursery-profile.jpg', at: createdAt, by: agent.userId }, ...nRounds.filter((r) => r.doneAt).map((r, k) => ({ id: `${id}_img${k + 2}`, kind: r.kind === 'PRIMARY' ? 'PRIMARY' as const : 'SECONDARY' as const, name: 'nursery-round.jpg', at: r.doneAt!, by: agent.userId }))],
      agreement: rng.chance(0.8) ? { name: 'nursery-agreement.pdf', at: createdAt, by: agent.userId } : undefined, status: 'ACTIVE', device: 'mobile',
    };
    out.nurseries.push(n);
    act('nursery', id, 'nursery.registered', { name: n.name }, agent.userId, createdAt, 'mobile');
    for (const r of nRounds.filter((x) => x.doneAt)) act('nursery', id, 'nursery.round', { round: r.kind === 'PRIMARY' ? 'PRIMARY' : `SECONDARY ${r.seq}` }, agent.userId, r.doneAt!, 'mobile');
  }

  // ---------- Seedling lots: from nurseries' batches and an external supplier ----------
  const makeLot = (sp: (typeof species)[number], quantity: number, at: number, src: Pick<SeedlingLot, 'source' | 'nurseryId' | 'batchId' | 'supplierName' | 'cost'>): SeedlingLot => {
    const codes = Array.from({ length: quantity }, () => issue('seedlingCode', at, sp.codePrefix));
    const lot: SeedlingLot = { id: `${o.orgId}_lot${out.lots.length + 1}`, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: o.officeUserId, number: issue('seedlingLot', at), speciesId: sp.id, quantity, receivedAt: day(at), codeFrom: codes[0]!, codeTo: codes.at(-1)!, codes, ...src };
    out.lots.push(lot);
    act('seedlingLot', lot.id, 'seedling.received', { number: lot.number, quantity }, o.officeUserId, lot.createdAt);
    return lot;
  };
  const lots: SeedlingLot[] = [];
  for (const n of out.nurseries) for (const b of n.batches) {
    if (!b.history.length || b.alive < 200) continue;
    const take = Math.min(b.alive - 50, rng.int(4, 12) * 25);
    const sp = species.find((s) => s.id === b.speciesId)!;
    const lot = makeLot(sp, take, new Date(b.history.at(-1)!.at).getTime() + 3 * DAY, { source: 'NURSERY', nurseryId: n.id, batchId: b.id });
    b.disbursed += take;
    lots.push(lot);
  }
  for (const sp of species.slice(0, 2)) {
    lots.push(makeLot(sp, rng.int(6, 10) * 50, now - rng.int(100, 160) * DAY, { source: 'EXTERNAL', supplierName: o.externalSupplier, cost: { amountMinor: 0, currency: settings.priceList[0]?.price.currency ?? 'GHS' } }));
  }
  for (const l of out.lots) if (l.cost) l.cost = { amountMinor: l.quantity * (l.cost.currency === 'XOF' ? 250 : 500), currency: l.cost.currency };

  // ---------- Allocations: lots → agents → farmers, which become trees ----------
  const farmersOf = (agentId: string) => {
    const comms = new Set(communitiesOf(agentId, agents.findIndex((a) => a.id === agentId)).map((c) => c.id));
    return ops.farmers.filter((f) => comms.has(f.communityId));
  };
  const allocate = (a: Omit<SeedlingAllocation, 'id' | 'orgId' | 'createdAt' | 'updatedAt'> & { at: number }): SeedlingAllocation => {
    const { at, ...rest } = a;
    const x: SeedlingAllocation = { id: `${o.orgId}_al${out.allocations.length + 1}`, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), ...rest };
    out.allocations.push(x);
    return x;
  };
  let planted = 0;
  for (const lot of lots) {
    const receivers = lot.source === 'NURSERY' ? [agents.find((a) => a.id === out.nurseries.find((n) => n.id === lot.nurseryId)?.agentId) ?? main] : [main, agents[1] ?? main];
    let left = [...lot.codes];
    for (const ag of receivers) {
      const share = receivers.length === 1 ? left.length : Math.floor(lot.codes.length / receivers.length);
      const codes = left.slice(0, share);
      left = left.slice(share);
      const at = new Date(lot.createdAt).getTime() + rng.int(1, 4) * DAY;
      allocate({ kind: 'TO_AGENT', speciesId: lot.speciesId, quantity: codes.length, codes, lotId: lot.id, agentId: ag.id, createdBy: o.officeUserId, at, device: 'web' });
      act('seedlingLot', lot.id, 'seedling.toAgent', { quantity: codes.length, agent: ag.userId }, o.officeUserId, iso(at));
      // The agent plants most of them with farmers; the journey agent keeps a stock in hand.
      const keep = ag.id === main.id ? Math.min(codes.length, 60) : Math.round(codes.length * 0.1);
      let pool = codes.slice(0, codes.length - keep);
      const farmers = rng.shuffle(farmersOf(ag.id));
      let k = 0;
      while (pool.length && k < farmers.length && planted < o.farmersPlanting) {
        const f = farmers[k++]!;
        const qty = Math.min(pool.length, rng.int(4, land.maxSeedlingsPerFarmer));
        const given = pool.slice(0, qty);
        pool = pool.slice(qty);
        const pAt = at + rng.int(3, 25) * DAY;
        if (pAt > now - DAY) break;
        const plot = plotOf.get(f.id);
        const al = allocate({ kind: 'TO_FARMER', speciesId: lot.speciesId, quantity: qty, codes: given, lotId: lot.id, agentId: ag.id, farmerId: f.id, communityId: f.communityId, plotId: plot?.id, createdBy: ag.userId, at: pAt, device: 'mobile' });
        planted++;
        const base = plot ? centroid(plot.polygon) : [byId.get(f.communityId)!.gps.lat, byId.get(f.communityId)!.gps.lng] as LatLng;
        for (const code of given) out.trees.push(tree(code, lot.speciesId, f.id, f.communityId, plot?.id, al.id, pAt, base, ag.userId));
      }
    }
  }

  function tree(code: string, speciesId: string, farmerId: string, communityId: string, plotId: string | undefined, allocationId: string, at: number, base: LatLng, by: string): Tree {
    const visits: TreeVisit[] = [];
    let state: TreeState = 'ALIVE';
    let height = rng.float(0.2, 0.4);
    let health = rng.int(60, 90);
    let issues: string[] = [];
    land.treeRoundDays.forEach((d, i) => {
      const vt = at + d * DAY + rng.int(-3, 10) * DAY;
      if (vt > now - DAY || state !== 'ALIVE') return;
      // Skip some visits for the journey agent so trees are due.
      if (by === main.userId && i === land.treeRoundDays.findIndex((x) => at + x * DAY > now - 40 * DAY)) return;
      const r = rng.next();
      state = r < 0.07 ? 'DEAD' : r < 0.09 ? 'NOT_FOUND' : 'ALIVE';
      height = state === 'ALIVE' ? height + rng.float(0.1, 0.5) * (i + 1) : height;
      health = state === 'ALIVE' ? Math.max(20, Math.min(100, health + rng.int(-15, 10))) : 0;
      issues = state === 'ALIVE' && rng.chance(0.25) ? [rng.pick(['termites', 'livestock', 'fire', 'mistletoe'])] : [];
      const cause = state === 'DEAD' ? rng.pick(['drought', 'fire', 'termites', 'grazing', 'cutting']) : undefined;
      visits.push({ id: `${code}_v${i + 1}`, at: iso(vt), by, round: i + 1, state, heightM: state === 'ALIVE' ? Math.round(height * 100) / 100 : undefined, health: state === 'ALIVE' ? health : undefined, issues, causeOfDeath: cause, answers: { alive: state === 'ALIVE', ...(cause ? { causeOfDeath: cause } : {}) }, photos: ['tree.jpg'], device: 'mobile' });
    });
    const last = visits.at(-1);
    const gps = { lat: Number((base[0] + rng.float(-0.0006, 0.0006)).toFixed(6)), lng: Number((base[1] + rng.float(-0.0006, 0.0006)).toFixed(6)), accuracy: rng.int(3, 8) };
    return {
      id: `${o.orgId}_t_${code}`, orgId: o.orgId, createdAt: iso(at), updatedAt: last?.at ?? iso(at), createdBy: by, code, speciesId, farmerId, communityId, plotId, allocationId, plantedAt: day(at), gps,
      state, heightM: last?.heightM ?? (visits.length ? undefined : 0.3), health: last?.health, issues: last?.issues ?? [], round: last?.round ?? 0, lastVisitAt: last?.at, visits,
    };
  }

  // ---------- EUDR lots and statements: cocoa dispatches with their plots ----------
  const eudrCommodities = new Set(settings.commodities.filter((c) => c.eudrRelevant).map((c) => c.id));
  const bagsByCode = new Map(ops.bags.map((b) => [b.code, b]));
  const plotByFarmer = new Map(out.plots.map((p) => [p.farmerId, p]));
  for (const d of o.dispatches.filter((x) => eudrCommodities.has(x.commodityId) && ['VERIFIED', 'DELIVERED', 'IN_TRANSIT'].includes(x.status))) {
    const pIds = new Set<string>();
    for (const c of d.bagCodes) bagsByCode.get(c)?.purchaseIds.forEach((p) => pIds.add(p));
    const req = new Set(d.requestIds);
    const purchases = ops.purchases.filter((p) => pIds.has(p.id) || req.has(p.requestId));
    const plotIds = [...new Set(purchases.map((p) => plotByFarmer.get(p.farmerId)?.id).filter(Boolean) as string[])];
    const at = new Date(d.createdAt).getTime() + DAY;
    const lot: EudrLot = { id: `${d.id}_lot`, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: o.officeUserId, number: issue('eudrLot', at), commodityId: d.commodityId, dispatchId: d.id, purchaseIds: purchases.map((p) => p.id), bagCodes: d.bagCodes, plotIds, kg: d.expectedKg };
    out.eudrLots.push(lot);
    if (d.status === 'VERIFIED') {
      const risk = plotIds.filter((id) => out.plots.find((p) => p.id === id)?.check?.result === 'RISK');
      const commodity = settings.commodities.find((c) => c.id === d.commodityId)!;
      const s: DueDiligenceStatement = {
        id: `${d.id}_dds`, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at + DAY), createdBy: o.officeUserId, number: issue('dds', at), dispatchId: d.id, lotId: lot.id, commodityId: d.commodityId,
        hsCode: commodity.hsCode, kg: d.verification?.deliveredKg ?? d.expectedKg, country: o.lang === 'fr' ? 'CI' : 'GH', operator: land.eudr.operator, plotIds, riskPlotIds: risk,
        risk: risk.length ? 'NON_NEGLIGIBLE' : 'NEGLIGIBLE', status: risk.length ? 'DRAFT' : 'SUBMITTED',
        ...(risk.length ? {} : { reference: `TRACES-${new Date(at).getFullYear()}-${String(rng.int(100_000, 999_999))}`, submittedAt: iso(at + DAY), submittedBy: o.officeUserId }),
      };
      out.statements.push(s);
      act('dispatchOrder', d.id, 'dds.generated', { number: s.number }, o.officeUserId, s.createdAt);
      if (s.status === 'SUBMITTED') act('dispatchOrder', d.id, 'dds.submitted', { number: s.number, reference: s.reference }, o.officeUserId, s.submittedAt!);
    }
  }

  // ---------- Carbon project: the trees in a few communities ----------
  const counts = new Map<string, number>();
  for (const t of out.trees) counts.set(t.communityId, (counts.get(t.communityId) ?? 0) + 1);
  const projComms = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
  const start = now - 200 * DAY;
  const project: CarbonProject = {
    id: `${o.orgId}_cp1`, orgId: o.orgId, createdAt: iso(start), updatedAt: iso(start), createdBy: o.officeUserId, number: issue('carbonProject', start), name: o.project.name, standard: o.project.standard,
    startDate: day(start), baselineT: o.project.baselineT, speciesTargets: species.slice(0, 3).map((s, i) => ({ speciesId: s.id, target: [1200, 600, 400][i]! })),
    communityIds: projComms, plotIds: out.plots.filter((p) => projComms.includes(p.communityId)).map((p) => p.id), monitoringPlan: o.project.plan,
    partner: { name: o.project.partner }, co2Factors: Object.fromEntries(species.map((s) => [s.id, s.co2KgPerYear])), status: 'ACTIVE',
  };
  out.projects.push(project);
  for (const t of out.trees) if (projComms.includes(t.communityId) && project.speciesTargets.some((x) => x.speciesId === t.speciesId)) t.projectId = project.id;
  act('carbonProject', project.id, 'carbon.created', { name: project.name }, o.officeUserId, project.createdAt);

  return out;
}
