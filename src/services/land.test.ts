import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { NEW_FARM_OFFSET } from '@/data/seed/land';
import { walkBoundary } from '@/engines/geo';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLandStore } from '@/stores/landStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSalesStore } from '@/stores/salesStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  agentStock, answerTransfer, assignToFarmer, assignTreesToProject, ddsGeoJson, excludePlots, farmerSeedlings, generateDds, nurseryTotals, parseGeometryFile, projectStats,
  receiveLot, recordRound, recordTreeVisit, runDeforestationCheck, savePlot, seedlingStock, submitDds, transferToCompany, treeDashboard, treesDue,
} from './landService';

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, grants: s.grants, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses, seeded: true });
  useSalesStore.setState({ clients: s.clients, contracts: s.salesContracts, dispatches: s.dispatches, insights: s.insights, seeded: true });
  useLandStore.setState({ plots: s.plots, trees: s.trees, nurseries: s.nurseries, lots: s.seedlingLots, allocations: s.seedlingAllocations, lossZones: s.lossZones, eudrLots: s.eudrLots, statements: s.statements, projects: s.carbonProjects, seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
  return s;
}

const Ld = () => useLandStore.getState();
const agentOf = (userId: string) => useAgentStore.getState().agents.find((a) => a.userId === userId)!;

describe('Journey 11: EUDR', () => {
  beforeAll(load);
  let plotId = '';

  it('Moussa walks a plot boundary: the plot appears with its area and passes validation', () => {
    const moussa = agentOf('u_moussa');
    const home = useCommunityStore.getState().communities.find((c) => c.agentIds.includes(moussa.id))!;
    const farmer = useFarmerStore.getState().farmers.find((f) => f.communityId === home.id && !Ld().plots.some((p) => p.farmerId === f.id))!;
    const ring = walkBoundary({ lat: home.gps.lat + NEW_FARM_OFFSET[0], lng: home.gps.lng + NEW_FARM_OFFSET[1] }, { seed: 11 });
    const p = savePlot({ orgId: ORG.kakao, farmerId: farmer.id, typeId: 'pt_cocoa', polygon: ring, gpsAccuracyM: 4, agreement: 'accord.jpg', images: ['parcelle.jpg'], actorId: 'u_moussa', agentId: moussa.id, device: 'mobile' });
    plotId = p.id;
    expect(p.code).toMatch(/^PLT-\d{5}$/);
    expect(p.areaHa).toBeGreaterThan(1);
    expect(p.validation).toMatchObject({ closed: true, selfIntersects: false, precisionOk: true });
    expect(p.check?.result).toBe('NOT_CHECKED');
  });

  it('running the deforestation check finds one Risk: the new plot', () => {
    const r = runDeforestationCheck(ORG.kakao, 'u_aicha');
    expect(r.checked).toBe(1);
    expect(r.risk).toBe(1);
    expect(Ld().plots.find((p) => p.id === plotId)).toMatchObject({ eudrStatus: 'AT_RISK', check: { result: 'RISK' } });
    expect(useNotificationStore.getState().notifications.some((n) => n.key === 'eudrRisk')).toBe(true);
  });

  it('a due diligence statement for a cocoa dispatch lists its plots; risk plots block submission until excluded', () => {
    const d = useSalesStore.getState().dispatches.find((x) => x.orgId === ORG.kakao && x.commodityId === 'com_cocoa' && x.status === 'VERIFIED' && !Ld().statements.some((s) => s.dispatchId === x.id))
      ?? useSalesStore.getState().dispatches.find((x) => x.orgId === ORG.kakao && x.commodityId === 'com_cocoa' && x.status === 'VERIFIED')!;
    const dds = generateDds({ orgId: ORG.kakao, dispatchId: d.id, actorId: 'u_aicha' });
    expect(dds.number).toMatch(/^DDS-\d{4}-\d{4}$/);
    expect(dds.plotIds.length).toBeGreaterThan(0);
    expect(dds.hsCode).toBeTruthy();
    expect(dds.country).toBe('CI');
    const geo = ddsGeoJson(dds);
    expect(geo.features).toHaveLength(dds.plotIds.length);
    expect(geo.features[0]!.geometry.type).toBe('Polygon');
    if (dds.riskPlotIds.length) {
      expect(() => submitDds(dds.id, 'u_aicha')).toThrow('riskPlots');
      excludePlots(dds.id, dds.riskPlotIds, 'u_aicha');
    }
    const done = submitDds(dds.id, 'u_aicha');
    expect(done.status).toBe('SUBMITTED');
    expect(done.reference).toMatch(/^TRACES-\d{4}-\d{6}$/);
  });

  it('shea is not EUDR-relevant: no statement for a Vitara dispatch', () => {
    const d = useSalesStore.getState().dispatches.find((x) => x.orgId === ORG.vitara && x.status === 'VERIFIED')!;
    expect(() => generateDds({ orgId: ORG.vitara, dispatchId: d.id, actorId: 'u_naa' })).toThrow('notRelevant');
  });

  it('imports GeoJSON and KML', () => {
    const gj = parseGeometryFile(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Polygon', coordinates: [[[-6.6, 6.1], [-6.599, 6.1], [-6.599, 6.101], [-6.6, 6.1]]] } }] }));
    expect(gj[0]!.polygon).toHaveLength(3);
    expect(gj[0]!.polygon[0]).toEqual([6.1, -6.6]);
    const kml = parseGeometryFile('<kml><coordinates>-6.6,6.1 -6.599,6.1 -6.599,6.101 -6.6,6.1</coordinates></kml>');
    expect(kml[0]!.polygon).toHaveLength(3);
  });
});

describe('Journey 14: trees', () => {
  beforeAll(load);

  it('Mariama does the overdue primary round of her nursery', () => {
    const n = Ld().nurseries.find((x) => x.id === `${ORG.vitara}_nur1`)!;
    const primary = n.rounds.find((r) => r.kind === 'PRIMARY')!;
    expect(primary.doneAt).toBeUndefined();
    const after = recordRound(n.id, primary.id, n.batches.map((b) => ({ batchId: b.id, polyBags: b.quantity, potted: b.quantity - 20, germinated: Math.round((b.quantity - 20) * 0.8) })), { photos: ['round.jpg'], actorId: 'u_mariama', device: 'mobile' });
    const t = nurseryTotals(after);
    expect(t.germinationPct).toBeCloseTo(80, 0);
    expect(after.rounds.find((r) => r.id === primary.id)!.doneAt).toBeTruthy();
    expect(() => recordRound(n.id, primary.id, [], { actorId: 'u_mariama' })).toThrow('roundDone');
  });

  it('she gives seedlings from her stock to a farmer; each code becomes a tree; the max per farmer holds', () => {
    const mariama = agentOf('u_mariama');
    const stock = agentStock(ORG.vitara, mariama.id);
    const sp = stock[0]!;
    const farmer = useFarmerStore.getState().farmers.find((f) => f.orgId === ORG.vitara && farmerSeedlings(ORG.vitara, f.id) === 0)!;
    expect(() => assignToFarmer({ orgId: ORG.vitara, farmerId: farmer.id, speciesId: sp.speciesId, codes: sp.codes.slice(0, 3), quantity: 4, agentId: mariama.id, actorId: 'u_mariama' })).toThrow('countMismatch');
    expect(() => assignToFarmer({ orgId: ORG.vitara, farmerId: farmer.id, speciesId: sp.speciesId, codes: ['XX0000001'], quantity: 1, agentId: mariama.id, actorId: 'u_mariama' })).toThrow('codeNotHeld');
    const r = assignToFarmer({ orgId: ORG.vitara, farmerId: farmer.id, speciesId: sp.speciesId, codes: sp.codes.slice(0, 8), quantity: 8, agentId: mariama.id, actorId: 'u_mariama', device: 'mobile' });
    expect(r.trees).toHaveLength(8);
    expect(agentStock(ORG.vitara, mariama.id, sp.speciesId)[0]!.codes.length).toBe(sp.codes.length - 8);
    expect(() => assignToFarmer({ orgId: ORG.vitara, farmerId: farmer.id, speciesId: sp.speciesId, codes: sp.codes.slice(8, 21), quantity: 13, agentId: mariama.id, actorId: 'u_mariama' })).toThrow('maxPerFarmer');
  });

  it('a monitoring visit records a dead tree with its cause; the dashboard updates', () => {
    const due = treesDue(ORG.vitara, 'u_mariama');
    expect(due.length).toBeGreaterThan(0);
    const trees = () => Ld().trees.filter((t) => t.orgId === ORG.vitara);
    const before = treeDashboard(trees(), Ld().allocations.filter((a) => a.orgId === ORG.vitara));
    expect(() => recordTreeVisit(due[0]!.id, { state: 'DEAD', issues: [], photos: ['t.jpg'], actorId: 'u_mariama' })).toThrow('causeRequired');
    const t = recordTreeVisit(due[0]!.id, { state: 'DEAD', causeOfDeath: 'fire', issues: [], photos: ['t.jpg'], actorId: 'u_mariama', device: 'mobile' });
    expect(t).toMatchObject({ state: 'DEAD', round: due[0]!.round + 1 });
    const after = treeDashboard(trees(), Ld().allocations.filter((a) => a.orgId === ORG.vitara));
    expect(after.dead).toBe(before.dead + 1);
    expect(after.alivePct).toBeLessThan(before.alivePct);
    expect(after.causes.find(([c]) => c === 'fire')![1]).toBeGreaterThan(before.causes.find(([c]) => c === 'fire')?.[1] ?? 0);
    const alive = recordTreeVisit(due[1]!.id, { state: 'ALIVE', heightM: 1.2, rating: 4, issues: ['termites'], photos: ['t.jpg'], actorId: 'u_mariama' });
    expect(alive.health).toBe(65);
  });

  it('a lot of seedlings gets consecutive codes; stock adds up; a transfer waits for consent', () => {
    const before = seedlingStock(ORG.vitara).find((x) => x.speciesId === 'sp_mango')!;
    const lot = receiveLot({ orgId: ORG.vitara, source: 'EXTERNAL', supplierName: 'Savannah Tree Seed Centre, Bolgatanga', speciesId: 'sp_mango', quantity: 50, receivedAt: '2026-10-18', costMinor: 25_000, currency: 'GHS', actorId: 'u_naa' });
    expect(lot.codes).toHaveLength(50);
    expect(lot.codeFrom).toMatch(/^MGO\d{7}$/);
    expect(seedlingStock(ORG.vitara).find((x) => x.speciesId === 'sp_mango')!.sourced).toBe(before.sourced + 50);
    const tr = transferToCompany(lot.id, ORG.kakao, 20, 'u_naa');
    expect(tr.consent?.status).toBe('PENDING');
    const got = answerTransfer(tr.id, true, 'u_aicha')!;
    expect(got.orgId).toBe(ORG.kakao);
    expect(got.codes).toEqual(tr.codes);
  });

  it('carbon project: trees assigned, survival and CO₂ estimate', () => {
    const p = Ld().projects.find((x) => x.orgId === ORG.vitara)!;
    const s0 = projectStats(p);
    expect(s0.trees).toBeGreaterThan(0);
    expect(s0.tPerYear).toBeGreaterThan(0);
    assignTreesToProject(p.id, 'sp_sheag', 5, 'u_naa');
    expect(projectStats(p).trees).toBeGreaterThanOrEqual(s0.trees);
  });
});
