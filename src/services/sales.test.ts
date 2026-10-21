import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSalesStore } from '@/stores/salesStore';
import { useLandStore } from '@/stores/landStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { act } from './workflowService';
import {
  advanceShipment, buildSchedule, buyerDispatches, contractValue, createDispatch, fulfilment, logDownload, markInstalmentReceived, pendingOutbounds, saveContract,
  setGrantScopes, traceOf, verifyDispatch,
} from './salesService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }) }));

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, grants: s.grants, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses, seeded: true });
  useSupportStore.setState({ providers: s.providers, requests: s.supportRequests, windows: s.recoveryWindows, recoveries: s.recoveryRequests, repayments: s.repayments, refunds: s.loanRefunds, legacy: s.legacyAllocations, seeded: true });
  useWarehouseStore.setState({ warehouses: s.warehouses, inbounds: s.inbounds, discrepancies: s.discrepancies, agentRepayments: s.agentRepayments, movements: s.movements, transfers: s.transfers, stockCounts: s.stockCounts, warehouseExpenses: s.warehouseExpenses, seeded: true });
  useSalesStore.setState({ clients: s.clients, contracts: s.salesContracts, dispatches: s.dispatches, insights: s.insights, seeded: true });
  useLandStore.setState({ plots: s.plots, trees: s.trees, nurseries: s.nurseries, lots: s.seedlingLots, allocations: s.seedlingAllocations, lossZones: s.lossZones, eudrLots: s.eudrLots, statements: s.statements, projects: s.carbonProjects, seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}

const S = () => useSalesStore.getState();
const nsb = () => S().clients.find((c) => c.orgId === ORG.vitara && c.code === 'NSB')!;
const lenaNotes = () => useNotificationStore.getState().notifications.filter((n) => n.userId === 'u_lena').map((n) => n.key);

describe('Journey 5: dispatch to buyer', () => {
  beforeAll(load);
  let id = '';
  let contractId = '';

  it('Kojo creates a dispatch from a pending shea outbound against the agreed Nordic contract', () => {
    const contract = S().contracts.find((c) => c.orgId === ORG.vitara && c.clientId === nsb().id && c.status === 'AGREED')!;
    contractId = contract.id;
    const outbound = pendingOutbounds(ORG.vitara, 'com_shea')[0]!;
    expect(outbound).toBeTruthy();
    expect(() => createDispatch({ orgId: ORG.vitara, kind: 'INVENTORY', clientId: nsb().id, contractId, commodityId: 'com_maize', outboundIds: [outbound.id], loading: { place: 'Wa' }, driver: { name: 'D', phone: '1' }, truck: { plate: 'P' }, waybill: 'W', actorId: 'u_kojo' })).toThrow();
    const d = createDispatch({ orgId: ORG.vitara, kind: 'INVENTORY', clientId: nsb().id, contractId, commodityId: 'com_shea', outboundIds: [outbound.id], loading: { warehouseId: outbound.fromWarehouseId, place: 'Wa Aggregation Hub' }, driver: { name: 'Kwesi Ankrah', phone: '+233244111222', licence: 'licence.jpg' }, truck: { plate: 'UW 4421-22', image: 'truck.jpg' }, waybill: 'WB-1001', actorId: 'u_kojo' });
    id = d.id;
    expect(d.status).toBe('PENDING_APPROVAL');
    expect(d.expectedKg).toBe(outbound.sentKg);
    expect(d.impact.farmers).toBeGreaterThan(0);
    expect(useWarehouseStore.getState().transfers.find((t) => t.id === outbound.id)!.dispatchId).toBe(id);
    expect(S().contracts.find((c) => c.id === contractId)!.status).toBe('ORDER_CREATED');
  });

  it('the creator cannot approve; Ibrahim approves', () => {
    expect(act(ORG.vitara, 'dispatchOrder', id, 'APPROVE', 'u_kojo').ok).toBe(false);
    expect(act(ORG.vitara, 'dispatchOrder', id, 'APPROVE', 'u_ibrahim').ok).toBe(true);
    expect(S().dispatches.find((d) => d.id === id)!.status).toBe('PENDING');
  });

  it('in transit → arrived → delivered, with position updates; Lena is told', () => {
    expect(advanceShipment(id, 'u_kojo', { lat: 9.1, lng: -1.8, eta: '2026-10-20T10:00:00Z' }).status).toBe('IN_TRANSIT');
    expect(lenaNotes()).toContain('shipmentInTransit');
    advanceShipment(id, 'u_kojo');
    expect(advanceShipment(id, 'u_kojo').status).toBe('DELIVERED');
    expect(lenaNotes()).toContain('shipmentDelivered');
    expect(S().dispatches.find((d) => d.id === id)!.position?.lat).toBe(9.1);
  });

  it('verification issues the client sale number, updates the contract and tells Lena', () => {
    const d = S().dispatches.find((x) => x.id === id)!;
    const before = fulfilment(S().contracts.find((c) => c.id === contractId)!).deliveredKg;
    const v = verifyDispatch(id, { weighbridge: 'wb.pdf', invoice: 'inv.pdf', deliveredKg: d.expectedKg - 4, bagsDelivered: d.bagCodes.length, unitPriceMinor: 49_000, currency: 'EUR' }, 'u_kojo');
    expect(v.verification!.saleNumber).toMatch(/^SN-NSB-\d{4}$/);
    expect(v.verification!.amount.amountMinor).toBe(Math.round(((d.expectedKg - 4) / 1000) * 49_000));
    const c = S().contracts.find((x) => x.id === contractId)!;
    expect(fulfilment(c).deliveredKg).toBeCloseTo(before + d.expectedKg - 4, 1);
    expect(c.schedule.find((p) => p.trigger === 'AFTER_DELIVERY')!.dueDate).toBeTruthy();
    expect(lenaNotes()).toContain('shipmentVerified');
  });

  it('Lena sees the order with trace to source; Accra Food Processors does not; download is logged', () => {
    const mine = buyerDispatches(ORG.nordic);
    expect(mine.some((d) => d.id === id)).toBe(true);
    expect(mine.every((d) => d.clientId === nsb().id)).toBe(true);
    expect(buyerDispatches(ORG.afp).some((d) => d.id === id)).toBe(false);
    const t = traceOf(S().dispatches.find((d) => d.id === id)!);
    expect(t.farmers.length).toBeGreaterThan(0);
    expect(t.communities.length).toBeGreaterThan(0);
    expect(t.plots.length).toBeGreaterThan(0);
    const d = S().dispatches.find((x) => x.id === id)!;
    logDownload(id, d.documents[0]!.id, 'u_lena', ORG.nordic);
    expect(S().dispatches.find((x) => x.id === id)!.downloads.at(-1)).toMatchObject({ userId: 'u_lena', orgId: ORG.nordic });
  });

  it('turning off order sharing hides the orders from the buyer', () => {
    const g = usePlatformStore.getState().grants.find((x) => x.fromOrgId === ORG.vitara && x.toOrgId === ORG.nordic)!;
    setGrantScopes(g.id, ['traceability', 'impact'], 'u_ama');
    expect(buyerDispatches(ORG.nordic)).toHaveLength(0);
    setGrantScopes(g.id, ['orders', 'traceability', 'impact'], 'u_ama');
  });
});

describe('sales contracts', () => {
  beforeAll(load);
  it('the schedule follows the payment terms and adds up to the contract value', () => {
    const settings = useSettingsStore.getState().settings[ORG.vitara]!;
    const total = contractValue({ quantity: 33, pricePerUnit: { amountMinor: 48_333, currency: 'EUR' } });
    const s = buildSchedule(settings, 'pt_3070', total, '2026-10-01T00:00:00Z');
    expect(s.map((p) => p.pct)).toEqual([30, 70]);
    expect(s.reduce((a, p) => a + p.amount.amountMinor, 0)).toBe(total.amountMinor);
    expect(s[0]!.dueDate).toBe('2026-10-08');
  });

  it('a new contract takes its quality spec from the commodity; payments can be marked received', () => {
    const c = saveContract({ orgId: ORG.vitara, clientId: nsb().id, commodityId: 'com_shea', quantity: 10, unitId: 't', pricePerUnitMinor: 50_000, currency: 'EUR', paymentTermId: 'pt_5050', packagingId: 'pk_jute', shipmentWindow: { start: '2026-11-01', end: '2026-12-31' }, deliveryPoint: 'Tema Port', officerUserId: 'u_kojo', tolerancePct: 2, status: 'AGREED', actorId: 'u_kojo' });
    expect(c.number).toMatch(/^SC-2026-\d{3}$/);
    expect(c.qualitySpec.some((q) => q.key === 'moisture' && q.max === 8)).toBe(true);
    markInstalmentReceived(c.id, c.schedule[0]!.id, 'TT-1', 'u_efua');
    expect(S().contracts.find((x) => x.id === c.id)!.schedule[0]!.received?.reference).toBe('TT-1');
  });

  it('the fulfilled seeded contract is within tolerance', () => {
    const c = S().contracts.find((x) => x.orgId === ORG.vitara && x.status === 'FULFILLED')!;
    expect(fulfilment(c).fulfilled).toBe(true);
  });
});
