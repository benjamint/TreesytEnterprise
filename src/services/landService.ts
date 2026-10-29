import type {
  CarbonProject, DispatchOrder, DueDiligenceStatement, EudrLot, Nursery, NurseryBatch, NurseryRound, NurseryRoundValues, OrgSettings, Plot, PlotVisit,
  SeedlingAllocation, SeedlingLot, Species, Tree, TreeState, TreeVisit,
} from '@/types';
import { makeEvent } from '@/engines/activity';
import { nextNumber } from '@/engines/numbering';
import { centroid, overlapShare, polygonAreaHa, validateGeometry, type LatLng } from '@/engines/geo';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLandStore } from '@/stores/landStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSalesStore } from '@/stores/salesStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Trees, land and climate (PRD I1–I6): community nurseries and their monitoring rounds, seedling
 * lots with generated codes, allocations to agents, farmers and other companies, tree monitoring,
 * plot mapping with validation, the deforestation check against the bundled forest-loss layer,
 * EUDR lots and due-diligence statements, and carbon projects.
 */

const L = () => useLandStore.getState();
const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const DAY = 86_400_000;
type Device = 'web' | 'mobile';
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device: Device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
const issue = (orgId: string, docType: string) => useSettingsStore.getState().issueNumber(orgId, docType, { date: new Date() });

/** Seedling codes: the company's seedling pattern with the species prefix, consecutive. */
export function issueSeedlingCodes(orgId: string, speciesId: string, quantity: number): string[] {
  const st = useSettingsStore.getState();
  const s = settingsOf(orgId);
  const base = s.numbering.find((p) => p.docType === 'seedlingCode')!;
  const sp = s.land.species.find((x) => x.id === speciesId);
  let seqs = st.sequences[orgId] ?? {};
  const codes: string[] = [];
  for (let i = 0; i < quantity; i++) {
    const r = nextNumber({ ...base, prefix: sp?.codePrefix ?? base.prefix }, seqs, { date: new Date() });
    seqs = r.sequences;
    codes.push(r.number);
  }
  useSettingsStore.setState((x) => ({ sequences: { ...x.sequences, [orgId]: seqs } }));
  return codes;
}

export const speciesOf = (orgId: string, id: string): Species | undefined => settingsOf(orgId).land.species.find((s) => s.id === id);

// ---------------------------------------------------------------- Nurseries (I1)

export interface NurseryInput {
  orgId: string; name: string; communityId: string; agentId?: string; gps: { lat: number; lng: number; accuracy?: number }; fenced: boolean; waterSource: string; material: string;
  representative: Nursery['representative']; profile?: Record<string, unknown>; agreement?: string; images?: string[];
  batches: { speciesId: string; quantity: number; sownAt: string }[]; actorId: string; device?: Device;
}

/** Monitoring rounds for a nursery from the company's round plan, counted from the first sowing. */
export function scheduleRounds(orgId: string, sownAt: string): NurseryRound[] {
  let secondary = 0;
  return settingsOf(orgId).land.nurseryRounds.map((d) => {
    if (d.kind === 'SECONDARY') secondary++;
    return { id: uid('nr'), defId: d.id, seq: d.kind === 'SECONDARY' ? secondary : 0, kind: d.kind, dueDate: new Date(new Date(sownAt).getTime() + d.dueDays * DAY).toISOString().slice(0, 10), values: [], photos: [] };
  });
}

export function createNursery(input: NurseryInput): Nursery {
  const at = now();
  const device = input.device ?? 'web';
  const id = uid('nur');
  const batches: NurseryBatch[] = input.batches.map((b) => ({ id: uid('nb'), number: issue(input.orgId, 'nurseryBatch'), speciesId: b.speciesId, sownAt: b.sownAt, quantity: b.quantity, potted: 0, germinated: 0, alive: 0, disbursed: 0, history: [] }));
  const first = [...input.batches.map((b) => b.sownAt)].sort()[0] ?? today();
  const n: Nursery = {
    id, orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, code: issue(input.orgId, 'nursery'), name: input.name, communityId: input.communityId, agentId: input.agentId,
    gps: input.gps, fenced: input.fenced, waterSource: input.waterSource, material: input.material, representative: input.representative, profile: input.profile ?? {},
    batches, rounds: scheduleRounds(input.orgId, first),
    images: (input.images ?? []).map((name) => ({ id: uid('img'), kind: 'PROFILING' as const, name, at, by: input.actorId })),
    agreement: input.agreement ? { name: input.agreement, at, by: input.actorId } : undefined, status: 'ACTIVE', device,
  };
  L().saveNursery(n);
  log(input.orgId, 'nursery', id, 'nursery.registered', { name: n.name }, input.actorId, device);
  return n;
}

export function addBatch(nurseryId: string, b: { speciesId: string; quantity: number; sownAt: string }, actorId: string) {
  const n = L().nurseries.find((x) => x.id === nurseryId)!;
  const batch: NurseryBatch = { id: uid('nb'), number: issue(n.orgId, 'nurseryBatch'), ...b, potted: 0, germinated: 0, alive: 0, disbursed: 0, history: [] };
  L().updateNursery(nurseryId, { batches: [...n.batches, batch] });
  log(n.orgId, 'nursery', nurseryId, 'nursery.batchAdded', { number: batch.number, quantity: b.quantity }, actorId);
  return batch;
}

/** Record a monitoring round: Primary sets poly bags, potted and germinated; Secondary sets alive, dead and new germinations. */
export function recordRound(nurseryId: string, roundId: string, values: NurseryRoundValues[], v: { photos?: string[]; notes?: string; actorId: string; device?: Device }) {
  const n = L().nurseries.find((x) => x.id === nurseryId)!;
  const r = n.rounds.find((x) => x.id === roundId)!;
  if (r.doneAt) throw new Error('roundDone');
  const at = now();
  const batches = n.batches.map((b) => {
    const val = values.find((x) => x.batchId === b.id);
    if (!val) return b;
    const next = { ...b };
    if (r.kind === 'PRIMARY') {
      next.quantity = val.polyBags ?? b.quantity;
      next.potted = Math.min(next.quantity, val.potted ?? b.potted);
      next.germinated = Math.min(next.potted, val.germinated ?? b.germinated);
      next.alive = next.germinated;
    } else {
      const fresh = val.newGerminations ?? 0;
      next.germinated = Math.min(b.potted, b.germinated + fresh);
      next.alive = val.alive ?? Math.max(0, b.alive - (val.dead ?? 0) + fresh);
    }
    next.history = [...b.history, { roundId, at, germinated: next.germinated, alive: next.alive }];
    return next;
  });
  const device = v.device ?? 'web';
  L().updateNursery(nurseryId, {
    batches, rounds: n.rounds.map((x) => (x.id === roundId ? { ...x, doneAt: at, by: v.actorId, device, values, photos: v.photos ?? [], notes: v.notes } : x)),
    images: [...n.images, ...(v.photos ?? []).map((name) => ({ id: uid('img'), kind: r.kind === 'PRIMARY' ? 'PRIMARY' as const : 'SECONDARY' as const, name, at, by: v.actorId }))],
  });
  log(n.orgId, 'nursery', nurseryId, 'nursery.round', { round: r.kind === 'PRIMARY' ? 'PRIMARY' : `SECONDARY ${r.seq}` }, v.actorId, device);
  return L().nurseries.find((x) => x.id === nurseryId)!;
}

export function addNurseryImage(nurseryId: string, kind: 'PROFILING' | 'PRIMARY' | 'SECONDARY', name: string, actorId: string) {
  const n = L().nurseries.find((x) => x.id === nurseryId)!;
  L().updateNursery(nurseryId, { images: [...n.images, { id: uid('img'), kind, name, at: now(), by: actorId }] });
}

export function setNurseryAgreement(nurseryId: string, name: string, actorId: string) {
  const n = L().nurseries.find((x) => x.id === nurseryId)!;
  L().updateNursery(nurseryId, { agreement: { name, at: now(), by: actorId } });
  log(n.orgId, 'nursery', nurseryId, 'nursery.agreement', { name }, actorId);
}

/** Potted, germinated, alive; germination % = germinated / potted, survival % = alive / germinated. */
export function nurseryTotals(n: Pick<Nursery, 'batches'>) {
  const potted = n.batches.reduce((s, b) => s + b.potted, 0);
  const germinated = n.batches.reduce((s, b) => s + b.germinated, 0);
  const alive = n.batches.reduce((s, b) => s + b.alive, 0);
  const disbursed = n.batches.reduce((s, b) => s + b.disbursed, 0);
  return { potted, germinated, alive, disbursed, inStock: Math.max(0, alive - disbursed), germinationPct: potted ? Math.round((germinated / potted) * 1000) / 10 : 0, survivalPct: germinated ? Math.round((alive / germinated) * 1000) / 10 : 0 };
}

export const roundsDue = (n: Nursery, on = today()) => n.rounds.filter((r) => !r.doneAt && r.dueDate <= on);
/** The next round to do (overdue or upcoming). */
export const nextRound = (n: Nursery) => n.rounds.filter((r) => !r.doneAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

// ---------------------------------------------------------------- Seedlings (I2)

export interface LotInput { orgId: string; source: SeedlingLot['source']; speciesId: string; quantity: number; receivedAt: string; supplierName?: string; nurseryId?: string; batchId?: string; costMinor?: number; currency?: string; actorId: string }

/** Seedlings received: codes are generated in the background (the screen shows progress). */
export function receiveLot(input: LotInput): SeedlingLot {
  if (input.quantity <= 0) throw new Error('quantity');
  const at = now();
  if (input.source === 'NURSERY') {
    const n = L().nurseries.find((x) => x.id === input.nurseryId)!;
    const b = n.batches.find((x) => x.id === input.batchId)!;
    if (input.quantity > b.alive - b.disbursed) throw new Error('moreThanAlive');
    L().updateNursery(n.id, { batches: n.batches.map((x) => (x.id === b.id ? { ...x, disbursed: x.disbursed + input.quantity } : x)) });
  }
  const codes = issueSeedlingCodes(input.orgId, input.speciesId, input.quantity);
  const lot: SeedlingLot = {
    id: uid('lot'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(input.orgId, 'seedlingLot'), source: input.source, nurseryId: input.nurseryId, batchId: input.batchId,
    supplierName: input.supplierName, speciesId: input.speciesId, quantity: input.quantity, receivedAt: input.receivedAt,
    cost: input.costMinor ? { amountMinor: input.costMinor, currency: input.currency ?? 'GHS' } : undefined, codeFrom: codes[0]!, codeTo: codes.at(-1)!, codes,
  };
  L().saveLot(lot);
  log(input.orgId, 'seedlingLot', lot.id, 'seedling.received', { number: lot.number, quantity: lot.quantity }, input.actorId);
  return lot;
}

/** Codes given out from a lot (to agents, farmers or another company). */
const codesOut = (orgId: string) => {
  const out = new Set<string>();
  for (const a of L().allocations) {
    if (a.orgId !== orgId) continue;
    const fromLot = a.kind === 'TO_AGENT' || (a.kind === 'TO_COMPANY' && a.consent?.status !== 'DECLINED') || (a.kind === 'TO_FARMER' && !a.agentId);
    if (fromLot) a.codes.forEach((c) => out.add(c));
  }
  return out;
};

/** Codes in a lot not yet handed to anyone. */
export function lotAvailable(lot: SeedlingLot): string[] {
  const out = codesOut(lot.orgId);
  return lot.codes.filter((c) => !out.has(c));
}

/** Codes an agent holds: given to them, not yet given to farmers. */
export function agentStock(orgId: string, agentId: string, speciesId?: string): { speciesId: string; codes: string[] }[] {
  const al = L().allocations.filter((a) => a.orgId === orgId && a.agentId === agentId);
  const given = new Set(al.filter((a) => a.kind === 'TO_FARMER').flatMap((a) => a.codes));
  const by = new Map<string, string[]>();
  for (const a of al.filter((x) => x.kind === 'TO_AGENT' && (!speciesId || x.speciesId === speciesId))) for (const c of a.codes) if (!given.has(c)) by.set(a.speciesId, [...(by.get(a.speciesId) ?? []), c]);
  return [...by.entries()].map(([s, codes]) => ({ speciesId: s, codes }));
}

export function assignToAgent(lotId: string, agentId: string, quantity: number, actorId: string): SeedlingAllocation {
  const lot = L().lots.find((x) => x.id === lotId)!;
  const free = lotAvailable(lot);
  if (quantity <= 0 || quantity > free.length) throw new Error('notEnough');
  const at = now();
  const a: SeedlingAllocation = { id: uid('al'), orgId: lot.orgId, createdAt: at, updatedAt: at, createdBy: actorId, kind: 'TO_AGENT', speciesId: lot.speciesId, quantity, codes: free.slice(0, quantity), lotId, agentId, device: 'web' };
  L().saveAllocation(a);
  log(lot.orgId, 'seedlingLot', lotId, 'seedling.toAgent', { quantity, agent: agentId }, actorId);
  return a;
}

/** Seedlings a farmer has had (for the max-per-farmer rule). */
export const farmerSeedlings = (orgId: string, farmerId: string) => L().allocations.filter((a) => a.orgId === orgId && a.kind === 'TO_FARMER' && a.farmerId === farmerId).reduce((s, a) => s + a.quantity, 0);

export interface FarmerAllocationInput {
  orgId: string; farmerId: string; speciesId: string; codes: string[]; quantity: number; agentId?: string; lotId?: string; nurseryId?: string; batchId?: string; plotId?: string;
  gps?: { lat: number; lng: number; accuracy?: number }; actorId: string; device?: Device;
}

/**
 * Seedlings to a farmer: from the agent's stock (codes scanned or entered, count must match),
 * from a lot, or straight from a nursery batch (codes generated). Each code becomes a tree.
 */
export function assignToFarmer(input: FarmerAllocationInput): { allocation: SeedlingAllocation; trees: Tree[] } {
  const { orgId } = input;
  const land = settingsOf(orgId).land;
  const farmer = useFarmerStore.getState().farmers.find((f) => f.id === input.farmerId);
  if (!farmer) throw new Error('farmer');
  if (input.quantity <= 0) throw new Error('quantity');
  if (farmerSeedlings(orgId, input.farmerId) + input.quantity > land.maxSeedlingsPerFarmer) throw new Error('maxPerFarmer');
  let codes = input.codes;
  if (input.batchId) {
    const n = L().nurseries.find((x) => x.id === input.nurseryId)!;
    const b = n.batches.find((x) => x.id === input.batchId)!;
    if (input.quantity > b.alive - b.disbursed) throw new Error('moreThanAlive');
    L().updateNursery(n.id, { batches: n.batches.map((x) => (x.id === b.id ? { ...x, disbursed: x.disbursed + input.quantity } : x)) });
    codes = codes.length ? codes : issueSeedlingCodes(orgId, input.speciesId, input.quantity);
  } else if (input.agentId) {
    const held = new Set(agentStock(orgId, input.agentId, input.speciesId).flatMap((x) => x.codes));
    if (codes.some((c) => !held.has(c))) throw new Error('codeNotHeld');
  }
  if (codes.length !== input.quantity) throw new Error('countMismatch');
  if (new Set(codes).size !== codes.length) throw new Error('duplicateCode');
  const at = now();
  const plot = input.plotId ? L().plots.find((p) => p.id === input.plotId) : L().plots.find((p) => p.orgId === orgId && p.farmerId === input.farmerId);
  const a: SeedlingAllocation = {
    id: uid('al'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, kind: 'TO_FARMER', speciesId: input.speciesId, quantity: input.quantity, codes, lotId: input.lotId,
    nurseryId: input.nurseryId, batchId: input.batchId, agentId: input.agentId, farmerId: input.farmerId, communityId: farmer.communityId, plotId: plot?.id, device: input.device ?? 'web',
  };
  L().saveAllocation(a);
  const community = useCommunityStore.getState().communities.find((c) => c.id === farmer.communityId);
  const base: LatLng = input.gps ? [input.gps.lat, input.gps.lng] : plot?.polygon.length ? centroid(plot.polygon) : [community?.gps.lat ?? 0, community?.gps.lng ?? 0];
  const trees: Tree[] = codes.map((code, i) => ({
    id: uid('tree'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, code, speciesId: input.speciesId, farmerId: input.farmerId, communityId: farmer.communityId, plotId: plot?.id, allocationId: a.id,
    plantedAt: today(), gps: { lat: Number((base[0] + Math.sin(i) * 0.0002).toFixed(6)), lng: Number((base[1] + Math.cos(i) * 0.0002).toFixed(6)), accuracy: input.gps?.accuracy ?? 6 },
    state: 'ALIVE', heightM: 0.3, issues: [], round: 0, visits: [],
  }));
  L().saveTrees(trees);
  log(orgId, 'farmer', input.farmerId, 'seedling.toFarmer', { quantity: input.quantity, species: speciesOf(orgId, input.speciesId)?.name.en ?? input.speciesId }, input.actorId, input.device);
  return { allocation: a, trees };
}

/** Transfer to another company: waits for that company's consent. */
export function transferToCompany(lotId: string, toOrgId: string, quantity: number, actorId: string): SeedlingAllocation {
  const lot = L().lots.find((x) => x.id === lotId)!;
  const free = lotAvailable(lot);
  if (quantity <= 0 || quantity > free.length) throw new Error('notEnough');
  const at = now();
  const a: SeedlingAllocation = { id: uid('al'), orgId: lot.orgId, createdAt: at, updatedAt: at, createdBy: actorId, kind: 'TO_COMPANY', speciesId: lot.speciesId, quantity, codes: free.slice(0, quantity), lotId, toOrgId, consent: { status: 'PENDING' }, device: 'web' };
  L().saveAllocation(a);
  log(lot.orgId, 'seedlingLot', lotId, 'seedling.toCompany', { quantity }, actorId);
  return a;
}

/** The receiving company accepts: the seedlings arrive there as a lot with the same codes. */
export function answerTransfer(allocationId: string, accept: boolean, actorId: string): SeedlingLot | undefined {
  const a = L().allocations.find((x) => x.id === allocationId)!;
  L().updateAllocation(allocationId, { consent: { status: accept ? 'ACCEPTED' : 'DECLINED', at: now(), by: actorId } });
  if (!accept) return undefined;
  const at = now();
  const from = L().lots.find((x) => x.id === a.lotId);
  const lot: SeedlingLot = {
    id: uid('lot'), orgId: a.toOrgId!, createdAt: at, updatedAt: at, createdBy: actorId, number: issue(a.toOrgId!, 'seedlingLot'), source: 'EXTERNAL', supplierName: from ? `${from.number}` : undefined,
    speciesId: a.speciesId, quantity: a.quantity, receivedAt: today(), codeFrom: a.codes[0]!, codeTo: a.codes.at(-1)!, codes: a.codes,
  };
  L().saveLot(lot);
  return lot;
}

/** Stock by species: sourced, in nursery, with agents, with farmers, planted, alive, unassigned. */
export function seedlingStock(orgId: string) {
  const s = settingsOf(orgId).land;
  const lots = L().lots.filter((x) => x.orgId === orgId);
  const al = L().allocations.filter((x) => x.orgId === orgId);
  const trees = L().trees.filter((x) => x.orgId === orgId);
  const nurseries = L().nurseries.filter((x) => x.orgId === orgId);
  return s.species.map((sp) => {
    const sourced = lots.filter((x) => x.speciesId === sp.id).reduce((t, x) => t + x.quantity, 0);
    const inNursery = nurseries.flatMap((n) => n.batches).filter((b) => b.speciesId === sp.id).reduce((t, b) => t + Math.max(0, b.alive - b.disbursed), 0);
    const toAgents = al.filter((x) => x.kind === 'TO_AGENT' && x.speciesId === sp.id).reduce((t, x) => t + x.quantity, 0);
    const toFarmers = al.filter((x) => x.kind === 'TO_FARMER' && x.speciesId === sp.id).reduce((t, x) => t + x.quantity, 0);
    const fromAgents = al.filter((x) => x.kind === 'TO_FARMER' && x.agentId && x.speciesId === sp.id && !x.batchId).reduce((t, x) => t + x.quantity, 0);
    const toCompanies = al.filter((x) => x.kind === 'TO_COMPANY' && x.speciesId === sp.id && x.consent?.status !== 'DECLINED').reduce((t, x) => t + x.quantity, 0);
    const directFromLots = al.filter((x) => x.kind === 'TO_FARMER' && !x.agentId && !x.batchId && x.speciesId === sp.id).reduce((t, x) => t + x.quantity, 0);
    const planted = trees.filter((t) => t.speciesId === sp.id).length;
    const alive = trees.filter((t) => t.speciesId === sp.id && t.state === 'ALIVE').length;
    return { speciesId: sp.id, sourced, inNursery, withAgents: Math.max(0, toAgents - fromAgents), allocated: toFarmers, planted, alive, unassigned: Math.max(0, sourced - toAgents - toCompanies - directFromLots) };
  });
}

// ---------------------------------------------------------------- Trees (I3)

/** The round a tree is due for, if any (rounds are days after planting). */
export function treeDue(t: Tree, settings: OrgSettings, on = Date.now()): number | null {
  if (t.state !== 'ALIVE') return null;
  const next = settings.land.treeRoundDays[t.round];
  if (next == null) return null;
  return new Date(t.plantedAt).getTime() + next * DAY <= on ? t.round + 1 : null;
}

export function treesDue(orgId: string, agentUserId?: string): Tree[] {
  const s = settingsOf(orgId);
  return L().trees.filter((t) => t.orgId === orgId && (!agentUserId || t.createdBy === agentUserId) && treeDue(t, s) != null);
}

/** Health from the visit: the form's rating (1–5 → 20–100) less 15 for each issue. */
export function healthScore(v: { rating?: number; issues: string[]; state: TreeState }) {
  if (v.state !== 'ALIVE') return 0;
  return Math.max(0, Math.min(100, (v.rating ?? 3) * 20 - v.issues.filter((x) => x !== 'none').length * 15));
}

export interface VisitInput { state: TreeState; heightM?: number; rating?: number; issues: string[]; causeOfDeath?: string; answers?: Record<string, unknown>; photos: string[]; gps?: { lat: number; lng: number; accuracy?: number }; actorId: string; device?: Device }

export function recordTreeVisit(treeId: string, v: VisitInput): Tree {
  const t = L().trees.find((x) => x.id === treeId)!;
  if (t.state !== 'ALIVE') throw new Error('notAlive');
  if (v.state === 'DEAD' && !v.causeOfDeath) throw new Error('causeRequired');
  const at = now();
  const issues = v.issues.filter((x) => x !== 'none');
  const visit: TreeVisit = {
    id: uid('tv'), at, by: v.actorId, round: t.round + 1, state: v.state, heightM: v.state === 'ALIVE' ? v.heightM : undefined, health: healthScore({ ...v, issues }), issues,
    causeOfDeath: v.state === 'DEAD' ? v.causeOfDeath : undefined, answers: v.answers ?? {}, photos: v.photos, gps: v.gps, device: v.device ?? 'web',
  };
  L().updateTree(treeId, { state: v.state, heightM: visit.heightM ?? t.heightM, health: visit.health, issues, round: visit.round, lastVisitAt: at, visits: [...t.visits, visit] });
  log(t.orgId, 'tree', treeId, v.state === 'DEAD' ? 'tree.dead' : v.state === 'NOT_FOUND' ? 'tree.notFound' : 'tree.visited', { code: t.code, cause: v.causeOfDeath ?? '' }, v.actorId, v.device);
  return L().trees.find((x) => x.id === treeId)!;
}

/** Tree dashboard: disbursed, planted, farmers, alive %, average height, survival by cohort / species / round. */
export function treeDashboard(trees: Tree[], allocations: SeedlingAllocation[]) {
  const alive = trees.filter((t) => t.state === 'ALIVE');
  const visited = trees.filter((t) => t.visits.length);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const heights = alive.map((t) => t.heightM ?? 0).filter((h) => h > 0);
  const group = (key: (t: Tree) => string) => {
    const m = new Map<string, { planted: number; alive: number }>();
    for (const t of trees) { const k = key(t); const x = m.get(k) ?? { planted: 0, alive: 0 }; x.planted++; if (t.state === 'ALIVE') x.alive++; m.set(k, x); }
    return [...m.entries()].map(([k, x]) => ({ key: k, ...x, survivalPct: pct(x.alive, x.planted) })).sort((a, b) => a.key.localeCompare(b.key));
  };
  const rounds = new Map<number, { visits: number; alive: number }>();
  for (const t of trees) for (const v of t.visits) { const x = rounds.get(v.round) ?? { visits: 0, alive: 0 }; x.visits++; if (v.state === 'ALIVE') x.alive++; rounds.set(v.round, x); }
  return {
    disbursed: allocations.filter((a) => a.kind === 'TO_FARMER').reduce((s, a) => s + a.quantity, 0),
    planted: trees.length, farmers: new Set(trees.map((t) => t.farmerId)).size, alivePct: pct(alive.length, trees.length), dead: trees.filter((t) => t.state === 'DEAD').length,
    notFound: trees.filter((t) => t.state === 'NOT_FOUND').length, visited: visited.length, avgHeightM: heights.length ? Math.round((heights.reduce((s, h) => s + h, 0) / heights.length) * 100) / 100 : 0,
    byCohort: group((t) => t.plantedAt.slice(0, 7)), bySpecies: group((t) => t.speciesId),
    byRound: [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([round, x]) => ({ round, ...x, survivalPct: pct(x.alive, x.visits) })),
    causes: Object.entries(trees.flatMap((t) => t.visits).filter((v) => v.causeOfDeath).reduce<Record<string, number>>((m, v) => ({ ...m, [v.causeOfDeath!]: (m[v.causeOfDeath!] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]),
  };
}

// ---------------------------------------------------------------- Plots (I4)

export interface PlotInput {
  orgId: string; farmerId: string; typeId: string; polygon: LatLng[]; point?: LatLng; declaredAreaHa?: number; gpsAccuracyM?: number; crop?: string;
  agreement?: string; images?: string[]; source?: Plot['source']; actorId: string; agentId?: string; device?: Device;
}

const othersFor = (orgId: string, except?: string) => L().plots.filter((p) => p.orgId === orgId && p.id !== except && p.polygon.length >= 3).map((p) => ({ id: p.id, polygon: p.polygon }));

/** Validation for a geometry before saving (phone and web show it live). */
export function checkGeometry(orgId: string, g: { polygon: LatLng[]; point?: LatLng; declaredAreaHa?: number }, except?: string) {
  return validateGeometry(g, settingsOf(orgId).land.eudr, othersFor(orgId, except));
}

export function savePlot(input: PlotInput): Plot {
  const { orgId } = input;
  const s = settingsOf(orgId).land;
  const type = s.plotTypes.find((x) => x.id === input.typeId);
  if (type?.requiresFarmer && !input.farmerId) throw new Error('farmerRequired');
  if (input.polygon.length && input.polygon.length < 3) throw new Error('notClosed');
  if (!input.polygon.length && !input.point) throw new Error('noGeometry');
  const farmer = useFarmerStore.getState().farmers.find((f) => f.id === input.farmerId);
  const at = now();
  const validation = checkGeometry(orgId, input);
  const areaHa = input.polygon.length ? polygonAreaHa(input.polygon) : input.declaredAreaHa ?? 0;
  const p: Plot = {
    id: uid('plot'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, code: issue(orgId, 'plot'), typeId: input.typeId, farmerId: input.farmerId, communityId: farmer?.communityId ?? '',
    geometry: input.polygon.length ? 'POLYGON' : 'POINT', polygon: input.polygon, point: input.point, areaHa, declaredAreaHa: input.declaredAreaHa, gpsAccuracyM: input.gpsAccuracyM,
    eudrStatus: 'PENDING', check: { result: 'NOT_CHECKED' }, validation, crop: input.crop ?? farmer?.primaryCrop ?? '',
    agreement: input.agreement ? { name: input.agreement, at, by: input.actorId } : undefined,
    images: (input.images ?? []).map((name) => ({ id: uid('img'), kind: 'PLOT' as const, name, at, by: input.actorId })), visits: [], agentId: input.agentId, device: input.device ?? 'web', source: input.source ?? 'MAPPED',
  };
  L().savePlot(p);
  log(orgId, 'plot', p.id, 'plot.mapped', { area: areaHa }, input.actorId, input.device);
  return p;
}

/** Edit vertices on the web: area and validation recalculated; a previous check no longer applies. */
export function updatePlotGeometry(plotId: string, polygon: LatLng[], actorId: string) {
  const p = L().plots.find((x) => x.id === plotId)!;
  const validation = checkGeometry(p.orgId, { polygon }, plotId);
  L().updatePlot(plotId, { polygon, areaHa: polygonAreaHa(polygon), validation, check: { result: 'NOT_CHECKED' }, eudrStatus: 'PENDING', geometry: 'POLYGON' });
  log(p.orgId, 'plot', plotId, 'plot.edited', { area: polygonAreaHa(polygon) }, actorId);
}

/** GeoJSON (Polygon / Point features) or a simple KML <coordinates> list → rings in [lat, lng]. */
export function parseGeometryFile(text: string): { polygon: LatLng[]; point?: LatLng; name?: string }[] {
  const t = text.trim();
  if (t.startsWith('{')) {
    const g = JSON.parse(t) as { type: string; features?: { geometry: { type: string; coordinates: unknown }; properties?: { name?: string } }[]; geometry?: unknown; coordinates?: unknown };
    const features = g.type === 'FeatureCollection' ? g.features ?? [] : g.type === 'Feature' ? [g as never] : [{ geometry: g as never }];
    return features.map((f) => {
      const geom = f.geometry as { type: string; coordinates: number[][][] | number[] };
      if (geom.type === 'Point') { const [lng, lat] = geom.coordinates as number[]; return { polygon: [], point: [lat!, lng!] as LatLng, name: f.properties?.name }; }
      const ring = (geom.coordinates as number[][][])[0]!.map(([lng, lat]) => [lat!, lng!] as LatLng);
      const open = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
      return { polygon: open, name: f.properties?.name };
    });
  }
  const blocks = [...t.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)].map((m) => m[1]!.trim().split(/\s+/).map((c) => { const [lng, lat] = c.split(',').map(Number); return [lat!, lng!] as LatLng; }));
  return blocks.map((ring) => (ring.length === 1 ? { polygon: [], point: ring[0] } : { polygon: ring.length > 1 && ring[0]![0] === ring.at(-1)![0] ? ring.slice(0, -1) : ring }));
}

export function setPlotAgreement(plotId: string, name: string, actorId: string) {
  const p = L().plots.find((x) => x.id === plotId)!;
  L().updatePlot(plotId, { agreement: { name, at: now(), by: actorId } });
  log(p.orgId, 'plot', plotId, 'plot.agreement', { name }, actorId);
}

export function recordPlotVisit(plotId: string, v: { answers: PlotVisit['answers']; photos: string[]; actorId: string; device?: Device }) {
  const p = L().plots.find((x) => x.id === plotId)!;
  const visit: PlotVisit = { id: uid('pv'), at: now(), by: v.actorId, answers: v.answers, photos: v.photos, device: v.device ?? 'web' };
  L().updatePlot(plotId, { visits: [...(p.visits ?? []), visit] });
  log(p.orgId, 'plot', plotId, 'plot.monitored', {}, v.actorId, v.device);
  return visit;
}

/** Plots whose monitoring is due (never visited, or last visit older than the company interval). */
export function plotsDueMonitoring(orgId: string, agentId?: string) {
  const days = settingsOf(orgId).land.plotMonitoringDays;
  const cut = Date.now() - days * DAY;
  return L().plots.filter((p) => p.orgId === orgId && (!agentId || p.agentId === agentId) && (!p.visits?.length || new Date(p.visits.at(-1)!.at).getTime() < cut));
}

export const plotTrees = (plotId: string) => L().trees.filter((t) => t.plotId === plotId);
/** Trees on a plot: linked seedlings, or the species density estimate when none are recorded. */
export function treesOnPlot(p: Plot): { count: number; estimated: boolean } {
  const n = plotTrees(p.id).length;
  if (n || !p.typeId) return { count: n, estimated: false };
  const sp = settingsOf(p.orgId).land.species[0];
  return { count: Math.round((sp?.densityPerHa[p.typeId] ?? 0) * p.areaHa), estimated: true };
}

// ---------------------------------------------------------------- EUDR (I5)

/** Deforestation check (simulated overlay with the bundled forest-loss layer). Unchecked plots by default. */
export function runDeforestationCheck(orgId: string, actorId: string, plotIds?: string[]) {
  const zones = L().lossZones.filter((z) => z.orgId === orgId);
  const targets = L().plots.filter((p) => p.orgId === orgId && (plotIds ? plotIds.includes(p.id) : p.check?.result !== 'CLEAR' && p.check?.result !== 'RISK') && p.polygon.length >= 3);
  const at = now();
  const results: { plotId: string; result: 'CLEAR' | 'RISK'; lossHa: number }[] = [];
  for (const p of targets) {
    const hit = zones.map((z) => ({ z, share: overlapShare(p.polygon, z.polygon) })).find((x) => x.share > 0);
    const result = hit ? 'RISK' as const : 'CLEAR' as const;
    const lossHa = hit ? Math.round(p.areaHa * hit.share * 100) / 100 : 0;
    results.push({ plotId: p.id, result, lossHa });
    L().updatePlot(p.id, { check: { result, at, by: actorId, lossHa, zoneId: hit?.z.id }, eudrStatus: result === 'RISK' ? 'AT_RISK' : 'COMPLIANT' });
    log(orgId, 'plot', p.id, result === 'RISK' ? 'plot.checkRisk' : 'plot.checkClear', { loss: lossHa }, actorId);
  }
  const risk = results.filter((r) => r.result === 'RISK');
  if (risk.length) {
    useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId: actorId, kind: 'ALERT', key: 'eudrRisk', params: { count: risk.length }, link: '/app/eudr?tab=plots&risk=1', read: false, at });
  }
  return { checked: results.length, risk: risk.length, clear: results.length - risk.length, results };
}

/** Compliance overview for an EUDR-relevant commodity. */
export function complianceOverview(orgId: string, commodityId: string) {
  const purchases = useBuyingStore.getState().purchases.filter((p) => p.orgId === orgId && p.commodityId === commodityId);
  const plots = L().plots.filter((p) => p.orgId === orgId);
  const withPlot = new Set(plots.map((p) => p.farmerId));
  const kg = purchases.reduce((s, p) => s + p.quantity, 0);
  const traceKg = purchases.filter((p) => withPlot.has(p.farmerId)).reduce((s, p) => s + p.quantity, 0);
  const farmers = new Set(purchases.map((p) => p.farmerId));
  const relevant = plots.filter((p) => farmers.has(p.farmerId));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    kg, traceKg, tracePct: pct(traceKg, kg), plots: relevant.length,
    validPct: pct(relevant.filter((p) => p.validation?.ok).length, relevant.length),
    checkedPct: pct(relevant.filter((p) => p.check && p.check.result !== 'NOT_CHECKED').length, relevant.length),
    risk: relevant.filter((p) => p.check?.result === 'RISK'),
    notChecked: relevant.filter((p) => !p.check || p.check.result === 'NOT_CHECKED').length,
  };
}

/** The purchases and plots behind a dispatch (bags' purchases, or the requests bought direct). */
export function dispatchSources(d: Pick<DispatchOrder, 'orgId' | 'bagCodes' | 'requestIds'>) {
  const { bags, purchases } = useBuyingStore.getState();
  const codes = new Set(d.bagCodes);
  const ids = new Set<string>();
  for (const b of bags) if (b.orgId === d.orgId && codes.has(b.code)) b.purchaseIds.forEach((x) => ids.add(x));
  const req = new Set(d.requestIds);
  const list = purchases.filter((p) => p.orgId === d.orgId && (ids.has(p.id) || req.has(p.requestId)));
  const farmers = new Set(list.map((p) => p.farmerId));
  const plots = L().plots.filter((p) => p.orgId === d.orgId && farmers.has(p.farmerId));
  return { purchases: list, plots };
}

/** Lot for a dispatch: purchases → bags → dispatch, with the plots it came from (made once). */
export function lotForDispatch(dispatchId: string, actorId: string): EudrLot {
  const existing = L().eudrLots.find((l) => l.dispatchId === dispatchId);
  const d = useSalesStore.getState().dispatches.find((x) => x.id === dispatchId)!;
  const src = dispatchSources(d);
  const at = now();
  const lot: EudrLot = existing
    ? { ...existing, purchaseIds: src.purchases.map((p) => p.id), plotIds: src.plots.map((p) => p.id), updatedAt: at }
    : { id: uid('elot'), orgId: d.orgId, createdAt: at, updatedAt: at, createdBy: actorId, number: issue(d.orgId, 'eudrLot'), commodityId: d.commodityId, dispatchId, purchaseIds: src.purchases.map((p) => p.id), bagCodes: d.bagCodes, plotIds: src.plots.map((p) => p.id), kg: d.verification?.deliveredKg ?? d.expectedKg };
  L().saveEudrLot(lot);
  return lot;
}

/** Due diligence statement for a dispatch (or a lot): operator, commodity, HS code, quantity, plots, risk. */
export function generateDds(input: { orgId: string; dispatchId?: string; lotId?: string; actorId: string }): DueDiligenceStatement {
  const lot = input.lotId ? L().eudrLots.find((l) => l.id === input.lotId)! : lotForDispatch(input.dispatchId!, input.actorId);
  const s = settingsOf(input.orgId);
  const commodity = s.commodities.find((c) => c.id === lot.commodityId);
  if (!commodity?.eudrRelevant) throw new Error('notRelevant');
  const plots = L().plots.filter((p) => lot.plotIds.includes(p.id));
  if (!plots.length) throw new Error('noPlots');
  const riskPlotIds = plots.filter((p) => p.check?.result === 'RISK').map((p) => p.id);
  const unchecked = plots.filter((p) => !p.check || p.check.result === 'NOT_CHECKED').length;
  const at = now();
  const dds: DueDiligenceStatement = {
    id: uid('dds'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(input.orgId, 'dds'), dispatchId: lot.dispatchId, lotId: lot.id, commodityId: lot.commodityId,
    hsCode: commodity.hsCode, kg: lot.kg, country: countryOf(input.orgId), operator: s.land.eudr.operator,
    plotIds: plots.map((p) => p.id), riskPlotIds, risk: riskPlotIds.length || unchecked ? 'NON_NEGLIGIBLE' : 'NEGLIGIBLE', status: 'DRAFT',
  };
  L().saveStatement(dds);
  if (lot.dispatchId) log(input.orgId, 'dispatchOrder', lot.dispatchId, 'dds.generated', { number: dds.number }, input.actorId);
  return dds;
}

const countryOf = (orgId: string) => usePlatformStore.getState().orgs.find((o) => o.id === orgId)?.countries[0] ?? '';

/** GeoJSON for the statement: one feature per plot with its code, area and check result. */
export function ddsGeoJson(dds: DueDiligenceStatement) {
  const plots = L().plots.filter((p) => dds.plotIds.includes(p.id));
  return {
    type: 'FeatureCollection',
    features: plots.map((p) => ({
      type: 'Feature',
      properties: { plot: p.code ?? p.id, areaHa: p.areaHa, producerCountry: dds.country, deforestation: p.check?.result ?? 'NOT_CHECKED' },
      geometry: p.polygon.length >= 3 ? { type: 'Polygon', coordinates: [[...p.polygon, p.polygon[0]!].map(([la, lo]) => [lo, la])] } : { type: 'Point', coordinates: [p.point?.[1] ?? 0, p.point?.[0] ?? 0] },
    })),
  };
}

/** Simulated EU TRACES submission: blocked while any plot is at risk or unchecked; returns a reference. */
export function submitDds(id: string, actorId: string): DueDiligenceStatement {
  const d = L().statements.find((x) => x.id === id)!;
  if (d.status === 'SUBMITTED') return d;
  const plots = L().plots.filter((p) => d.plotIds.includes(p.id));
  if (plots.some((p) => p.check?.result === 'RISK')) throw new Error('riskPlots');
  if (plots.some((p) => !p.check || p.check.result === 'NOT_CHECKED')) throw new Error('uncheckedPlots');
  const at = now();
  const reference = `TRACES-${new Date().getFullYear()}-${String(Math.floor(100_000 + Math.random() * 900_000))}`;
  L().updateStatement(id, { status: 'SUBMITTED', reference, submittedAt: at, submittedBy: actorId, risk: 'NEGLIGIBLE', riskPlotIds: [] });
  if (d.dispatchId) log(d.orgId, 'dispatchOrder', d.dispatchId, 'dds.submitted', { number: d.number, reference }, actorId);
  return L().statements.find((x) => x.id === id)!;
}

/** Take risk plots out of the statement's lot (e.g. their produce is kept back), then it can be submitted. */
export function excludePlots(id: string, plotIds: string[], actorId: string) {
  const d = L().statements.find((x) => x.id === id)!;
  const keep = d.plotIds.filter((p) => !plotIds.includes(p));
  L().updateStatement(id, { plotIds: keep, riskPlotIds: d.riskPlotIds.filter((p) => !plotIds.includes(p)) });
  if (d.dispatchId) log(d.orgId, 'dispatchOrder', d.dispatchId, 'dds.excluded', { count: plotIds.length }, actorId);
}

// ---------------------------------------------------------------- Carbon (I6)

export interface ProjectInput {
  orgId: string; name: string; standard: CarbonProject['standard']; startDate: string; baselineT: number; speciesTargets: CarbonProject['speciesTargets'];
  communityIds: string[]; plotIds?: string[]; monitoringPlan: string; partner?: CarbonProject['partner']; actorId: string;
}

/** A project inside the company (not a new company — PRD I6 audit note), permission checked by the caller. */
export function createProject(input: ProjectInput): CarbonProject {
  const at = now();
  const s = settingsOf(input.orgId).land;
  const p: CarbonProject = {
    id: uid('cp'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(input.orgId, 'carbonProject'), name: input.name, standard: input.standard,
    startDate: input.startDate, baselineT: input.baselineT, speciesTargets: input.speciesTargets, communityIds: input.communityIds,
    plotIds: input.plotIds ?? L().plots.filter((x) => x.orgId === input.orgId && input.communityIds.includes(x.communityId)).map((x) => x.id),
    monitoringPlan: input.monitoringPlan, partner: input.partner, co2Factors: Object.fromEntries(s.species.map((sp) => [sp.id, sp.co2KgPerYear])), status: 'ACTIVE',
  };
  L().saveProject(p);
  log(input.orgId, 'carbonProject', p.id, 'carbon.created', { name: p.name }, input.actorId);
  return p;
}

/** Assign trees to a project: alive trees of the species in its communities that are in no project yet. */
export function assignTreesToProject(projectId: string, speciesId: string, quantity: number, actorId: string) {
  const p = L().projects.find((x) => x.id === projectId)!;
  const pick = L().trees.filter((t) => t.orgId === p.orgId && !t.projectId && t.speciesId === speciesId && t.state === 'ALIVE' && p.communityIds.includes(t.communityId)).slice(0, quantity);
  const ids = new Set(pick.map((t) => t.id));
  useLandStore.setState((st) => ({ trees: st.trees.map((t) => (ids.has(t.id) ? { ...t, projectId } : t)) }));
  log(p.orgId, 'carbonProject', projectId, 'carbon.assigned', { quantity: pick.length }, actorId);
  return pick.length;
}

export function setCo2Factor(projectId: string, speciesId: string, kg: number) {
  const p = L().projects.find((x) => x.id === projectId)!;
  L().updateProject(projectId, { co2Factors: { ...p.co2Factors, [speciesId]: kg } });
}

/** Trees, survival and estimated CO₂ (factor per species × alive trees × years since planting). */
export function projectStats(p: CarbonProject, trees = L().trees) {
  const mine = trees.filter((t) => t.projectId === p.id);
  const alive = mine.filter((t) => t.state === 'ALIVE');
  const yearKg = alive.reduce((s, t) => s + (p.co2Factors[t.speciesId] ?? 0), 0);
  const toDate = alive.reduce((s, t) => s + (p.co2Factors[t.speciesId] ?? 0) * Math.max(0, (Date.now() - new Date(t.plantedAt).getTime()) / (365 * DAY)), 0);
  const bySpecies = p.speciesTargets.map((x) => ({ ...x, assigned: mine.filter((t) => t.speciesId === x.speciesId).length, alive: alive.filter((t) => t.speciesId === x.speciesId).length }));
  return { trees: mine.length, alive: alive.length, survivalPct: mine.length ? Math.round((alive.length / mine.length) * 1000) / 10 : 0, tPerYear: Math.round(yearKg / 100) / 10, tToDate: Math.round(toDate / 100) / 10, bySpecies };
}
