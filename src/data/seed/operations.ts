import type {
  ActivityEvent, Agent, AggregatorPurchase, AppNotification, Bag, Community, Disbursement, Farmer, FarmerGroup, GroupMembership,
  LocationNode, Money, OrgSettings, Payment, PaymentProvider, PreExpense, PriceListEntry, Purchase, PurchaseRequest, RiskFlag,
  SourcingModel, Supplier, Wallet, Warehouse, WorkflowDefinition, Membership, Role,
} from '@/types';
import { apply, getAllowedActions, start, type EngineEvent, type WorkflowRecord, type WorkflowUser } from '@/engines/workflow';
import { initialsOf, nextNumber } from '@/engines/numbering';
import { calculateFees, money, toMinor } from '@/engines/money';
import { ancestorAtLevel } from '@/engines/locations';
import { Rng, pad, type Clock } from './rng';

export interface GeoNode {
  name: string;
  code: string;
  lat: number;
  lng: number;
  children?: GeoNode[];
  /** Leaf nodes that are not communities (e.g. a port town). */
  noCommunity?: boolean;
}

export interface AgentSeed {
  userId: string;
  name: string;
  phone: string;
  agentTypeId: string;
  managerIds: string[];
  warehouseCode?: string;
}

type WfPlan = 'none' | 'first' | 'all' | 'reject' | 'rejectFirst' | 'hold';

export interface OpsConfig {
  orgId: string;
  idp: string;
  currency: string;
  settings: OrgSettings;
  geo: GeoNode[];
  levels: string[];
  zoneDepth: number;
  zoneName: (name: string) => string;
  regionLevel: string;
  bagPrefix: string;
  basePrices: Record<string, number>;
  zoneFactors: number[];
  commodityMix: [string, number][];
  farmers: {
    count: number;
    womenShare: number;
    female: string[];
    male: string[];
    surnames: string[];
    fixedCommunitySizes?: Record<string, number>;
    forced?: { communityName: string; seq: number; firstName: string; lastName: string; gender: 'F' | 'M' }[];
    custom: (rng: Rng, gender: 'F' | 'M', age: number) => Record<string, unknown>;
  };
  groups: { types: [FarmerGroup['type'], number][]; name: (type: FarmerGroup['type'], community: string, rng: Rng) => string; pendingReviewIndex?: number };
  agents: AgentSeed[];
  fieldAgentTypeIds: string[];
  warehouses: { code: string; name: string; type: Warehouse['type']; nodeCode: string; officerUserIds: string[]; capacityKg: number }[];
  requestPlan: [status: string, count: number, wf: WfPlan, sourcing?: SourcingModel][];
  volumeKg: [number, number];
  purchasesTotal: number;
  /** Agent whose open request carries a fixed cash gap (PRD 12.5: Yaw ≈ GHS 12,400). */
  cashGap?: { userId: string; gapMinor: number };
  /** Request statuses that sit in front of one approver, kept exact for demo queues. */
  preCount: number;
  prePlan: [status: string, count: number, steps: number, wf: 'approve' | 'reject' | 'hold'][];
  suppliers: { name: string; kind: Supplier['kind']; status: Supplier['status']; address: string }[];
  aggregatorPlan: [status: string, count: number][];
  financeUserId: string;
  checkerUserId: string;
  unknownPayment?: boolean;
  wallets: Record<string, [balanceMajor: number, thresholdMajor: number]>;
  dialPrefix: string;
  phoneLength: number;
  /** Côte d'Ivoire keeps the leading 0 after +225. */
  keepLeadingZero?: boolean;
}

export interface OpsResult {
  nodes: LocationNode[];
  communities: Community[];
  farmers: Farmer[];
  groups: FarmerGroup[];
  groupMemberships: GroupMembership[];
  agents: Agent[];
  warehouses: Warehouse[];
  requests: PurchaseRequest[];
  purchases: Purchase[];
  bags: Bag[];
  expenses: PreExpense[];
  suppliers: Supplier[];
  aggregatorPurchases: AggregatorPurchase[];
  payments: Payment[];
  wallets: Wallet[];
  activity: ActivityEvent[];
  notifications: AppNotification[];
  sequences: Record<string, number>;
}

export interface PeopleCtx {
  memberships: Membership[];
  roles: Role[];
}

const DAY = 86_400_000;

export function generateOperations(cfg: OpsConfig, rng: Rng, clock: Clock, people: PeopleCtx): OpsResult {
  const { orgId, idp, currency, settings } = cfg;
  const M = (minor: number): Money => money(minor, currency);
  const pattern = (docType: string) => settings.numbering.find((p) => p.docType === docType)!;
  let sequences: Record<string, number> = {};
  const issue = (docType: string, date: Date, ctx: Parameters<typeof nextNumber>[2] = {}) => {
    const r = nextNumber(pattern(docType), sequences, { date, ...ctx });
    sequences = r.sequences;
    return r.number;
  };
  const iso = (d: Date) => d.toISOString();
  const activity: ActivityEvent[] = [];
  let actSeq = 0;
  const logEvents = (entity: string, entityId: string, events: EngineEvent[], actorId: string, at: string) => {
    for (const e of events) {
      activity.push({ id: `${idp}_act_${++actSeq}`, orgId, entity, entityId, key: e.key, params: e.params, actorId, at });
    }
  };

  // ---------- Locations ----------
  const nodes: LocationNode[] = [];
  const leafNodes: { node: LocationNode; geo: GeoNode }[] = [];
  const walk = (g: GeoNode, depth: number, parentId: string | null) => {
    const node: LocationNode = { id: `${idp}_loc_${nodes.length + 1}`, orgId, levelId: cfg.levels[depth]!, parentId, name: g.name, code: g.code, center: { lat: g.lat, lng: g.lng } };
    nodes.push(node);
    if (g.children?.length) g.children.forEach((c) => walk(c, depth + 1, node.id));
    else if (!g.noCommunity && depth === cfg.levels.length - 1) leafNodes.push({ node, geo: g });
  };
  cfg.geo.forEach((g) => walk(g, 0, null));

  // Zones = nodes at zoneDepth (e.g. "Upper West zone")
  const zoneNodes = nodes.filter((n) => cfg.levels.indexOf(n.levelId) === cfg.zoneDepth);
  const descendantsOf = (id: string): string[] => nodes.filter((n) => n.parentId === id).flatMap((n) => [n.id, ...descendantsOf(n.id)]);
  settings.zones = zoneNodes.map((z) => ({ id: `${idp}_zone_${z.code.toLowerCase()}`, name: cfg.zoneName(z.name), nodeIds: [z.id, ...descendantsOf(z.id)] }));
  const zoneOf = (nodeId: string) => settings.zones.find((z) => z.nodeIds.includes(nodeId))!;

  // ---------- Price list ----------
  const priceList: PriceListEntry[] = [];
  settings.commodities.forEach((c) => {
    settings.zones.forEach((z, zi) => {
      const major = (cfg.basePrices[c.id] ?? 1) * (cfg.zoneFactors[zi] ?? 1);
      const minor = currency === 'XOF' ? Math.round(major / 5) * 5 : Math.round(major * 20) * 5;
      priceList.push({ id: `${idp}_pl_${c.code}_${zi}`, commodityId: c.id, zoneId: z.id, unitId: 'kg', price: M(minor), tolerancePct: 10, effectiveFrom: clock.day(clock.daysAgo(200)) });
    });
  });
  settings.priceList = priceList;
  const listPrice = (commodityId: string, nodeId: string) => priceList.find((p) => p.commodityId === commodityId && p.zoneId === zoneOf(nodeId).id)!.price;

  // ---------- Phones / providers ----------
  const mobileProviders = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY');
  const pickProvider = (): PaymentProvider => rng.weighted(mobileProviders.map((p) => [p, p.share ?? 0] as const));
  const phoneFor = (p: PaymentProvider) => {
    const pre = rng.pick(p.prefixes);
    const restLen = cfg.phoneLength - pre.length;
    let rest = '';
    for (let i = 0; i < restLen; i++) rest += rng.int(0, 9);
    return `${cfg.dialPrefix}${cfg.keepLeadingZero ? pre + rest : (pre + rest).replace(/^0/, '')}`;
  };
  const providerOfPhone = (phone: string) => {
    const local = (cfg.keepLeadingZero ? '' : '0') + phone.slice(cfg.dialPrefix.length);
    return mobileProviders.find((p) => p.prefixes.some((pre) => local.startsWith(pre))) ?? mobileProviders[0]!;
  };

  // ---------- Communities ----------
  const communities: Community[] = leafNodes.map(({ node, geo }) => {
    const region = ancestorAtLevel(nodes, node.id, cfg.regionLevel);
    const profiled = clock.daysAgo(rng.int(60, 700));
    const code = issue('communityCode', profiled, { region: region?.code ?? '' });
    const contactGender = rng.chance(0.5);
    return {
      id: `${idp}_com_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      orgId, createdAt: iso(profiled), updatedAt: iso(profiled), createdBy: 'system',
      code, name: geo.name, locationNodeId: node.id, population: rng.int(300, 5000), agentIds: [],
      gps: { lat: geo.lat, lng: geo.lng, accuracy: rng.int(3, 12) },
      contactPerson: {
        name: `${rng.pick(contactGender ? cfg.farmers.female : cfg.farmers.male)} ${rng.pick(cfg.farmers.surnames)}`,
        phone: phoneFor(pickProvider()),
      },
      profiledAt: iso(profiled), score: rng.int(28, 92), flags: rng.chance(0.08) ? ['missingDocuments'] : [],
      customFields: {
        organisedGroups: rng.chance(0.8), groupsCount: rng.int(0, 6), vslaAvailable: rng.chance(0.55), groupLeaders: rng.chance(0.7),
        membershipList: rng.chance(0.6), meetingRecords: rng.chance(0.5), contributionRecords: rng.chance(0.45), paymentRecords: rng.chance(0.4),
        partnershipAgreement: rng.chance(0.5), reliableWater: rng.chance(0.6), waterSource: rng.pick(['borehole', 'dam', 'river', 'well']),
        amenities: rng.sample(['school', 'clinic', 'market', 'mosque', 'church', 'electricity'], rng.int(1, 4)),
        landForNursery: rng.chance(0.5), landForTreePlanting: rng.chance(0.6),
      },
    };
  });

  // ---------- Agents ----------
  const warehouseIds: Record<string, string> = {};
  cfg.warehouses.forEach((w) => (warehouseIds[w.code] = `${idp}_wh_${w.code.toLowerCase()}`));
  const fieldSeeds = cfg.agents.filter((a) => cfg.fieldAgentTypeIds.includes(a.agentTypeId));
  const primaryType = cfg.fieldAgentTypeIds[0];
  const buyers = fieldSeeds.filter((a) => a.agentTypeId === primaryType);
  const shuffled = rng.shuffle(communities);
  const areas = new Map<string, string[]>();
  shuffled.forEach((c, i) => {
    const a = buyers[i % buyers.length]!;
    areas.set(a.userId, [...(areas.get(a.userId) ?? []), c.id]);
  });
  for (const a of fieldSeeds.filter((x) => x.agentTypeId !== primaryType)) areas.set(a.userId, rng.sample(communities, 5).map((c) => c.id));
  const agents: Agent[] = cfg.agents.map((a, i) => {
    const comIds = areas.get(a.userId) ?? [];
    comIds.forEach((cid) => communities.find((c) => c.id === cid)!.agentIds.push(`${idp}_agt_${a.userId}`));
    const created = clock.daysAgo(rng.int(120, 800));
    const prov = providerOfPhone(a.phone);
    return {
      id: `${idp}_agt_${a.userId}`, orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: 'system', userId: a.userId,
      agentTypeId: a.agentTypeId,
      areaNodeIds: comIds.map((cid) => communities.find((c) => c.id === cid)!.locationNodeId),
      managerIds: a.managerIds, warehouseId: a.warehouseCode ? warehouseIds[a.warehouseCode] : undefined,
      wallet: { providerId: prov.id, number: a.phone, verifiedName: a.name.toUpperCase() },
      status: 'ACTIVE', lastSyncAt: iso(new Date(clock.today.getTime() - rng.int(1, 72) * 3_600_000)),
      appVersion: i % 9 === 5 ? '3.7.1' : rng.pick(['3.9.2', '3.9.2', '3.9.0', '3.8.4']),
      weekTargetPct: rng.int(28, 112), score: rng.int(35, 94), flags: i % 11 === 7 ? ['openReport'] : [],
    };
  });
  const agentByUser = (userId: string) => agents.find((a) => a.userId === userId)!;

  // ---------- Farmers ----------
  const sizes = new Map<string, number>();
  const fixed = cfg.farmers.fixedCommunitySizes ?? {};
  let remaining = cfg.farmers.count - Object.values(fixed).reduce((s, n) => s + n, 0);
  const free = communities.filter((c) => fixed[c.name] == null);
  free.forEach((c) => sizes.set(c.id, 1));
  remaining -= free.length;
  while (remaining > 0) {
    const c = rng.pick(free);
    sizes.set(c.id, sizes.get(c.id)! + 1);
    remaining--;
  }
  communities.forEach((c) => fixed[c.name] != null && sizes.set(c.id, fixed[c.name]!));

  const farmers: Farmer[] = [];
  for (const c of communities) {
    const n = sizes.get(c.id) ?? 0;
    const comAgents = c.agentIds.length ? c.agentIds : [agents[0]!.id];
    const userOf = (agentId: string) => agents.find((a) => a.id === agentId)?.userId ?? 'system';
    for (let i = 1; i <= n; i++) {
      const forced = cfg.farmers.forced?.find((f) => f.communityName === c.name && f.seq === i);
      const gender: 'F' | 'M' = forced?.gender ?? (rng.chance(cfg.farmers.womenShare) ? 'F' : 'M');
      const firstName = forced?.firstName ?? rng.pick(gender === 'F' ? cfg.farmers.female : cfg.farmers.male);
      const lastName = forced?.lastName ?? rng.pick(cfg.farmers.surnames);
      const age = rng.int(19, 74);
      const reg = new Date(Math.max(new Date(c.profiledAt).getTime() + rng.int(0, 30) * DAY, clock.daysAgo(rng.int(5, 600)).getTime()));
      const region = ancestorAtLevel(nodes, c.locationNodeId, cfg.regionLevel);
      const code = issue('farmerId', reg, { community: c.code, initials: initialsOf(`${firstName} ${lastName}`), region: region?.code ?? '' });
      const consentType = rng.weighted([['AUDIO', 6], ['SIGNATURE', 2], ['TICK', 1]] as const);
      const dob = new Date(clock.today.getTime() - (age * 365.25 + rng.int(0, 364)) * DAY);
      farmers.push({
        id: `${idp}_far_${farmers.length + 1}`, orgId, createdAt: iso(reg), updatedAt: iso(reg), createdBy: userOf(rng.pick(comAgents)),
        farmerCode: code, firstName, lastName, gender, dateOfBirth: clock.day(dob), phone: phoneFor(pickProvider()),
        communityId: c.id, locationNodeId: c.locationNodeId, registeredAt: iso(reg), agentId: rng.pick(comAgents),
        primaryCrop: rng.weighted(cfg.commodityMix),
        identity: {
          photo: rng.chance(0.92), idCard: rng.chance(0.76), thumbprints: { left: rng.chance(0.72), right: rng.chance(0.7) },
          consent: rng.chance(0.86) ? { type: consentType, capturedAt: iso(reg) } : null,
          nfcCard: rng.chance(0.4) ? { number: `NFC-${pad(rng.int(1, 999999), 6)}`, status: rng.weighted([['ISSUED', 18], ['REPLACED', 1], ['REVOKED', 1]] as const) } : null,
        },
        qualityStatus: rng.chance(0.06) ? 'FLAGGED' : 'OK', score: rng.int(20, 95), version: rng.int(1, 3),
        customFields: cfg.farmers.custom(rng, gender, age),
      });
    }
  }
  const farmersByCommunity = new Map<string, Farmer[]>();
  farmers.forEach((f) => farmersByCommunity.set(f.communityId, [...(farmersByCommunity.get(f.communityId) ?? []), f]));

  // ---------- Groups ----------
  const groups: FarmerGroup[] = [];
  const groupMemberships: GroupMembership[] = [];
  const groupTypes = cfg.groups.types.flatMap(([t, n]) => Array.from({ length: n }, () => t));
  rng.shuffle(groupTypes).forEach((type, i) => {
    const c = communities[i % communities.length]!;
    const est = clock.daysAgo(rng.int(200, 2500));
    const g: FarmerGroup = {
      id: `${idp}_grp_${i + 1}`, orgId, createdAt: iso(est), updatedAt: iso(est), createdBy: agents.find((a) => a.id === c.agentIds[0])?.userId ?? 'system',
      name: cfg.groups.name(type, c.name, rng), type, communityId: c.id, established: clock.day(est),
      paymentOption: rng.weighted([['MOMO', 7], ['BANK', 2], ['CASH', 1]] as const), score: rng.int(30, 90),
      scoreStatus: i === cfg.groups.pendingReviewIndex ? 'PENDING_REVIEW' : 'COMPLETED', customFields: {},
    };
    const pool = farmersByCommunity.get(c.id) ?? [];
    const members = rng.sample(pool, Math.min(pool.length, rng.int(8, 22)));
    members.forEach((f, mi) => groupMemberships.push({
      id: `${g.id}_m${mi}`, orgId, groupId: g.id, farmerId: f.id, role: mi === 0 ? 'LEADER' : mi === 1 ? 'SECRETARY' : mi === 2 ? 'TREASURER' : 'MEMBER',
      joinedAt: clock.day(new Date(Math.max(est.getTime(), new Date(f.registeredAt).getTime()))),
    }));
    if (g.paymentOption === 'MOMO' && members[0]) {
      g.wallet = { provider: providerOfPhone(members[0].phone).id, number: members[0].phone, name: `${members[0].firstName} ${members[0].lastName}`.toUpperCase() };
    }
    groups.push(g);
  });

  // ---------- Warehouses ----------
  const warehouses: Warehouse[] = cfg.warehouses.map((w) => {
    const node = nodes.find((n) => n.code === w.nodeCode)!;
    const created = clock.daysAgo(rng.int(300, 900));
    return {
      id: warehouseIds[w.code]!, orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: 'system', name: w.name, type: w.type,
      locationNodeId: node.id, officerUserIds: w.officerUserIds, capacityKg: w.capacityKg, status: 'ACTIVE',
      gps: { lat: node.center!.lat, lng: node.center!.lng, accuracy: 5 },
    };
  });

  // ---------- Workflow helpers ----------
  const wfUsers: WorkflowUser[] = people.memberships
    .filter((m) => m.orgId === orgId)
    .map((m) => ({ id: m.userId, roleIds: m.roleIds, permissions: m.roleIds.flatMap((r) => people.roles.find((x) => x.id === r)?.permissions ?? []) }))
    // Prefer specialised approvers over company admins ('*').
    .sort((a, b) => Number(a.permissions.includes('*')) - Number(b.permissions.includes('*')));
  const def = (docType: string) => settings.workflows.find((w) => w.docType === docType) as WorkflowDefinition;

  function runWorkflow<T extends WorkflowRecord>(d: WorkflowDefinition, rec: T, actions: ('approve' | 'reject' | 'hold')[], at: Date, entity: string): T {
    const started = start(d, rec, iso(at));
    let r = started.record as unknown as T;
    logEvents(entity, rec.id, started.events, rec.createdBy, iso(at));
    let t = at.getTime();
    for (const a of actions) {
      t += rng.int(2, 30) * 3_600_000;
      const when = iso(new Date(Math.min(t, clock.today.getTime() - 3_600_000)));
      const action = a === 'approve' ? 'APPROVE' : a === 'reject' ? 'REJECT' : 'HOLD';
      const user = wfUsers.find((u) => getAllowedActions(r, d, u).some((x) => x.action === action && x.allowed));
      if (!user) break;
      const comment = a === 'reject' ? rng.pick(['Price above zone list without justification', 'Duplicate of an earlier request', 'Community already supplied this week']) : a === 'hold' ? rng.pick(['Waiting for rate confirmation from head office', 'Confirm bag count with logistics']) : undefined;
      const res = apply(r, d, action, user, { comment, at: when });
      r = res.record;
      logEvents(entity, rec.id, res.events, user.id, when);
    }
    return r;
  }
  const stepCount = (d: WorkflowDefinition, rec: Record<string, unknown>) =>
    d.steps.filter((s) => !s.auto && (!s.condition || (s.condition.op === '>' && Number((rec.total as Money | undefined)?.amountMinor ?? 0) > Number(s.condition.value)))).length;

  // ---------- Purchase requests ----------
  const requests: PurchaseRequest[] = [];
  const agentRequestCount = new Map<string, number>();
  const ageFor = (status: string): [number, number] => {
    switch (status) {
      case 'PENDING': return [0, 2];
      case 'MANAGEMENT_APPROVED': case 'ZONE_APPROVED': return [1, 3];
      case 'FINANCE_APPROVED': case 'RATE_CONFIRMED': return [2, 5];
      case 'PARTIAL_DISBURSEMENT': case 'FULL_DISBURSEMENT': return [3, 8];
      case 'FUNDS_RECEIVED': case 'TICKET_ACTIVATED': return [4, 18];
      case 'ON_HOLD': case 'PRICE_UPDATE': case 'NOT_APPROVED': return [2, 25];
      case 'ARCHIVED': return [170, 240];
      default: return [25, 165];
    }
  };
  const gapUser = cfg.cashGap?.userId;
  let gapAssigned = false;
  for (const [status, count, wfPlan, sourcingOpt] of cfg.requestPlan) {
    for (let k = 0; k < count; k++) {
      // Agent: the cash-gap agent gets exactly one open "funds received" request.
      let agentSeed = rng.pick(buyers);
      if (status === 'FUNDS_RECEIVED' && gapUser) {
        if (!gapAssigned) { agentSeed = buyers.find((b) => b.userId === gapUser)!; gapAssigned = true; }
        else while (agentSeed.userId === gapUser) agentSeed = rng.pick(buyers);
      }
      const agent = agentByUser(agentSeed.userId);
      const comId = rng.pick(areas.get(agentSeed.userId) ?? [communities[0]!.id]);
      const community = communities.find((c) => c.id === comId)!;
      const commodityId = rng.weighted(cfg.commodityMix);
      const [a0, a1] = ageFor(status);
      const created = new Date(clock.daysAgo(rng.int(a0, a1)).getTime() - rng.int(0, 8) * 3_600_000);
      const list = listPrice(commodityId, community.locationNodeId);
      const variance = Math.max(-0.06, Math.min(0.07, (rng.next() + rng.next() + rng.next() - 1.5) * 0.06));
      const unitMinor = currency === 'XOF' ? Math.round((list.amountMinor * (1 + variance)) / 5) * 5 : Math.round(list.amountMinor * (1 + variance));
      const isGap = status === 'FUNDS_RECEIVED' && agentSeed.userId === gapUser && !requests.some((r) => r.agentId === agent.id && r.status === 'FUNDS_RECEIVED');
      const volume = isGap ? 3200 : Math.round(rng.int(cfg.volumeKg[0], cfg.volumeKg[1]) / 50) * 50;
      const total = M(Math.round(unitMinor * volume));
      const sourcing: SourcingModel = sourcingOpt ?? (rng.chance(0.35) ? 'DIRECT_PAYMENT' : 'CASH_ADVANCE');
      const planned = new Date(created.getTime() + rng.int(1, 6) * DAY);
      const id = `${idp}_pr_${requests.length + 1}`;
      const base = {
        id, orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: agent.userId,
        number: issue('purchaseRequest', created), agentId: agent.id, communityId: community.id, commodityId, grade: 'A', unitId: 'kg',
        volume, plannedDate: clock.day(planned), unitPrice: M(unitMinor), listPrice: list,
        variancePct: Math.round(((unitMinor - list.amountMinor) / list.amountMinor) * 1000) / 10, total, sourcingModel: sourcing,
        disbursements: [] as Disbursement[], disbursementStatus: 'NONE' as const, fundsReceived: false,
        reconciliationStatus: 'OPEN' as PurchaseRequest['reconciliationStatus'], riskFlags: [] as RiskFlag[], archived: status === 'ARCHIVED',
      };
      const d = def('purchaseRequest');
      const n = stepCount(d, base);
      const actions: ('approve' | 'reject' | 'hold')[] =
        wfPlan === 'none' ? [] : wfPlan === 'first' ? ['approve'] : wfPlan === 'all' ? Array(n).fill('approve')
          : wfPlan === 'reject' ? [...Array(rng.int(0, n - 1)).fill('approve'), 'reject'] : wfPlan === 'rejectFirst' ? ['reject'] : [...Array(n - 1).fill('approve'), 'hold'];
      let rec = runWorkflow(d, base as unknown as PurchaseRequest & WorkflowRecord, actions, created, 'purchaseRequest') as unknown as PurchaseRequest;
      if (wfPlan === 'all' || status === 'PRICE_UPDATE') {
        rec = { ...rec, status, wf: { ...rec.wf, currentStepId: null } };
      }
      // Disbursements (cash advance only)
      const disb: Disbursement[] = [];
      const disbAt = new Date(created.getTime() + rng.int(20, 40) * 3_600_000);
      if (sourcing === 'CASH_ADVANCE' && ['PARTIAL_DISBURSEMENT', 'FULL_DISBURSEMENT', 'FUNDS_RECEIVED', 'RECONCILED', 'ARCHIVED'].includes(status)) {
        if (status === 'PARTIAL_DISBURSEMENT') {
          disb.push({ id: `${id}_d1`, amount: M(Math.round(total.amountMinor * rng.float(0.4, 0.7))), method: 'MOMO', at: iso(disbAt), by: cfg.financeUserId });
        } else if (rng.chance(0.25)) {
          const first = Math.round(total.amountMinor * 0.6);
          disb.push({ id: `${id}_d1`, amount: M(first), method: 'MOMO', at: iso(disbAt), by: cfg.financeUserId });
          disb.push({ id: `${id}_d2`, amount: M(total.amountMinor - first), method: rng.chance(0.8) ? 'MOMO' : 'MANUAL', at: iso(new Date(disbAt.getTime() + DAY)), by: cfg.financeUserId });
        } else {
          disb.push({ id: `${id}_d1`, amount: total, method: rng.chance(0.9) ? 'MOMO' : 'MANUAL', at: iso(disbAt), by: cfg.financeUserId });
        }
      }
      rec = {
        ...rec,
        disbursements: disb,
        disbursementStatus: disb.length === 0 ? 'NONE' : status === 'PARTIAL_DISBURSEMENT' ? 'PARTIAL' : 'FULL',
        fundsReceived: sourcing === 'CASH_ADVANCE' && ['FUNDS_RECEIVED', 'RECONCILED', 'ARCHIVED'].includes(status),
        reconciliationStatus: status === 'RECONCILED' || status === 'ARCHIVED' ? 'RECONCILED' : 'OPEN',
        updatedAt: iso(new Date(Math.min(clock.today.getTime(), created.getTime() + rng.int(1, 9) * DAY))),
      };
      requests.push(rec);
      agentRequestCount.set(agent.id, (agentRequestCount.get(agent.id) ?? 0) + 1);
    }
  }

  // ---------- Purchases & bags ----------
  const buyingStatuses = ['FUNDS_RECEIVED', 'TICKET_ACTIVATED', 'RECONCILED'];
  const eligible = requests.filter((r) => buyingStatuses.includes(r.status));
  const weights = eligible.map((r) => r.volume);
  const wSum = weights.reduce((s, w) => s + w, 0);
  const counts = eligible.map((_r, i) => Math.max(3, Math.floor((weights[i]! / wSum) * cfg.purchasesTotal)));
  let diff = cfg.purchasesTotal - counts.reduce((s, n) => s + n, 0);
  while (diff !== 0) {
    const i = rng.int(0, counts.length - 1);
    if (diff > 0) { counts[i]!++; diff--; } else if (counts[i]! > 3) { counts[i]!--; diff++; }
  }
  const purchases: Purchase[] = [];
  const bags: Bag[] = [];
  let bagSeq = 0;
  eligible.forEach((req, ri) => {
    const n = counts[ri]!;
    const pack = settings.packaging.find((p) => p.commodityId === req.commodityId)!;
    const nominal = Math.round((pack.minKg + pack.maxKg) / 2);
    const isGap = gapUser && req.status === 'FUNDS_RECEIVED' && req.agentId === agentByUser(gapUser).id;
    const fraction = req.status === 'RECONCILED' ? rng.float(0.975, 1.0) : req.status === 'FUNDS_RECEIVED' ? rng.float(0.86, 0.96) : rng.float(0.45, 0.8);
    const targetValue = isGap ? req.total.amountMinor - cfg.cashGap!.gapMinor : req.total.amountMinor * fraction;
    const targetKg = targetValue / req.unitPrice.amountMinor;
    const parts = Array.from({ length: n }, () => rng.float(0.5, 1.5));
    const pSum = parts.reduce((s, x) => s + x, 0);
    const pool = farmersByCommunity.get(req.communityId) ?? farmers;
    const startT = new Date(req.plannedDate).getTime();
    const endT = Math.min(clock.today.getTime() - 3_600_000, startT + 6 * DAY);
    let bag: Bag | null = null;
    const closeBag = () => { if (bag) bags.push(bag); bag = null; };
    const newBag = (): Bag => ({ id: `${idp}_bag_${++bagSeq}`, orgId, code: `${cfg.bagPrefix}${pad(bagSeq + 100_000, 6)}`, commodityId: req.commodityId, weightKg: 0, status: req.status === 'RECONCILED' ? 'IN_STOCK' : 'WITH_AGENT', purchaseIds: [] });
    let assignedKg = 0;
    for (let i = 0; i < n; i++) {
      const raw = i === n - 1 ? targetKg - assignedKg : Math.round(((parts[i]! / pSum) * targetKg) * 10) / 10;
      const qty = Math.max(5, Math.round(raw * 10) / 10);
      assignedKg += qty;
      const farmer = rng.pick(pool);
      const at = new Date(startT + ((endT - startT) * (i + rng.next())) / n);
      const amount = M(Math.round(qty * req.unitPrice.amountMinor));
      const pid = `${idp}_pur_${purchases.length + 1}`;
      const codes: string[] = [];
      let left = qty;
      let consolidated = false;
      while (left > 0.05) {
        if (!bag) bag = newBag();
        const b: Bag = bag;
        const take = Math.min(left, nominal - b.weightKg);
        b.weightKg = Math.round((b.weightKg + take) * 10) / 10;
        b.purchaseIds.push(pid);
        (b.contributions ??= []).push({ purchaseId: pid, kg: Math.round(take * 10) / 10 });
        if (b.purchaseIds.length > 1) consolidated = true;
        codes.push(b.code);
        left = Math.round((left - take) * 10) / 10;
        if (b.weightKg >= nominal - 0.05) closeBag();
      }
      const community = communities.find((c) => c.id === req.communityId)!;
      const direct = req.sourcingModel === 'DIRECT_PAYMENT';
      purchases.push({
        id: pid, orgId, number: issue('purchase', at), requestId: req.id, farmerId: farmer.id, agentId: req.agentId,
        commodityId: req.commodityId, quantity: qty, unitId: 'kg', unitPrice: req.unitPrice, amount, paidToFarmer: amount,
        bagCodes: codes, consolidationRef: consolidated ? codes[0] : undefined,
        evidence: {
          scalePhoto: `scale-${(purchases.length % 6) + 1}`, voiceNote: rng.chance(0.3) ? `voice-${(purchases.length % 3) + 1}` : undefined,
          gps: { lat: community.gps.lat + rng.float(-0.01, 0.01), lng: community.gps.lng + rng.float(-0.01, 0.01), accuracy: rng.int(3, 15) },
          signature: direct ? undefined : `sig-${(purchases.length % 4) + 1}`,
        },
        paymentStatus: direct ? 'PAID' : 'PAID', syncedFrom: rng.chance(0.93) ? 'MOBILE' : 'WEB', createdAt: iso(at), communityId: req.communityId,
      });
    }
    closeBag();
  });
  // Bags in stock sit at the agent's warehouse (or the first one).
  for (const b of bags) {
    if (b.status === 'IN_STOCK') {
      const p = purchases.find((x) => x.id === b.purchaseIds[0])!;
      const ag = agents.find((a) => a.id === p.agentId)!;
      b.warehouseId = ag.warehouseId ?? warehouses[0]?.id;
    }
  }

  // ---------- Expenses (PRE) ----------
  const expenses: PreExpense[] = [];
  const preEligible = requests.filter((r) => ['FUNDS_RECEIVED', 'TICKET_ACTIVATED', 'RECONCILED', 'FULL_DISBURSEMENT'].includes(r.status));
  let approvedSeen = 0;
  const approvedTotal = cfg.prePlan.filter(([s]) => s === 'APPROVED').reduce((n, [, c]) => n + c, 0);
  const prePlanFlat = cfg.prePlan.flatMap(([status, count, steps, wf]) => Array.from({ length: count }, () => ({ status, steps, wf })));
  // Most recent requests carry the open PREs.
  const byRecency = [...preEligible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  prePlanFlat.forEach((plan, i) => {
    const open = plan.status !== 'APPROVED';
    const req = open ? byRecency[i % Math.min(byRecency.length, 12)]! : rng.pick(preEligible);
    const agent = agents.find((a) => a.id === req.agentId)!;
    const bagsN = Math.max(4, Math.round(req.volume / 85 / rng.int(1, 3)));
    const types = rng.sample(settings.expenseTypes, rng.int(2, 4));
    const lines = types.map((t) => {
      const quantity = t.basis === 'PER_BAG' ? bagsN : t.basis === 'PER_KG' ? bagsN * 85 : 1;
      const rate = M(Math.round(t.defaultRate.amountMinor * rng.float(0.9, 1.15) / (currency === 'XOF' ? 25 : 5)) * (currency === 'XOF' ? 25 : 5));
      return { expenseTypeId: t.id, quantity, rate, amount: M(rate.amountMinor * quantity) };
    });
    const total = M(lines.reduce((s, l) => s + l.amount.amountMinor, 0));
    const created = open ? clock.daysAgo(rng.int(0, 4), -rng.int(0, 8)) : new Date(new Date(req.plannedDate).getTime() + rng.int(1, 5) * DAY);
    const createdAt = new Date(Math.min(created.getTime(), clock.today.getTime() - 3_600_000));
    const id = `${idp}_pre_${expenses.length + 1}`;
    const base = {
      id, orgId, createdAt: iso(createdAt), updatedAt: iso(createdAt), createdBy: agent.userId, number: issue('preExpense', createdAt),
      requestId: req.id, agentId: agent.id, bags: bagsN, costDiscussed: rng.chance(0.85), lines, total,
      payee: { name: agent.wallet.verifiedName, providerId: agent.wallet.providerId, number: agent.wallet.number },
      paymentStatus: 'NOT_PAID' as PreExpense['paymentStatus'],
    };
    const d = def('preExpense');
    const actions: ('approve' | 'reject' | 'hold')[] = plan.wf === 'approve' ? Array(plan.steps).fill('approve') : [...Array(plan.steps).fill('approve'), plan.wf];
    const rec = runWorkflow(d, base as unknown as PreExpense & WorkflowRecord, actions, createdAt, 'preExpense') as unknown as PreExpense;
    if (rec.status === 'APPROVED') approvedSeen++;
    // The six most recent approvals are still waiting for payment.
    const paid = rec.status === 'APPROVED' && approvedSeen <= approvedTotal - 6;
    expenses.push({ ...rec, paymentStatus: paid ? 'PAID' : 'NOT_PAID' });
  });

  // ---------- Suppliers & aggregator purchases ----------
  const suppliers: Supplier[] = cfg.suppliers.map((s, i) => {
    const created = clock.daysAgo(rng.int(60, 500));
    const prov = pickProvider();
    return {
      id: `${idp}_sup_${i + 1}`, orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: cfg.financeUserId, name: s.name, kind: s.kind,
      phone: phoneFor(prov), address: s.address, status: s.status,
      payout: s.kind === 'COMPANY' && i % 2 === 0 ? { method: 'BANK', providerOrBank: currency === 'XOF' ? 'SGBCI' : 'GCB Bank', number: `${pad(rng.int(1, 9999999999), 13)}` } : { method: 'MOMO', providerOrBank: prov.id, number: phoneFor(prov) },
    };
  });
  const aggregatorPurchases: AggregatorPurchase[] = [];
  const approvedSuppliers = suppliers.filter((s) => s.status === 'APPROVED');
  for (const [status, count] of cfg.aggregatorPlan) {
    for (let k = 0; k < count; k++) {
      const sup = rng.pick(approvedSuppliers);
      const commodityId = cfg.commodityMix[0]![0];
      const pack = settings.packaging.find((p) => p.commodityId === commodityId)!;
      const weightPerBag = Math.round((pack.minKg + pack.maxKg) / 2);
      const expectedBags = rng.int(60, 300);
      const expectedKg = expectedBags * weightPerBag;
      const usd = currency === 'GHS' && k === 1 && status === 'FUNDS_DISBURSED';
      const list = priceList.find((p) => p.commodityId === commodityId)!.price.amountMinor;
      const unitPrice = usd ? money(Math.round(list / 15.2), 'USD') : M(Math.round(list * rng.float(0.97, 1.04)));
      const created = status === 'PENDING' ? clock.daysAgo(1) : clock.daysAgo(rng.int(5, 120));
      const id = `${idp}_acs_${aggregatorPurchases.length + 1}`;
      const base = {
        id, orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: cfg.financeUserId, number: issue('aggregatorPurchase', created),
        poNumber: `PO-${pad(4100 + aggregatorPurchases.length * 7, 5)}`, supplierId: sup.id, commodityId,
        plannedDate: clock.day(new Date(created.getTime() + 5 * DAY)), weightPerBagKg: weightPerBag, expectedBags, expectedKg,
        unitPrice, total: money(unitPrice.amountMinor * expectedKg, unitPrice.currency), dealCurrency: unitPrice.currency,
        exchangeRate: usd ? 15.2 : 1, includesPre: rng.chance(0.4),
        orderStatus: (status === 'FUNDS_DISBURSED' ? (k % 3 === 0 ? 'IN_TRANSIT' : 'DELIVERED') : 'NONE') as AggregatorPurchase['orderStatus'],
        paymentStatus: (status === 'FUNDS_DISBURSED' && k % 3 !== 0 ? rng.pick(['RECONCILED', 'FULFILLED', 'RECEIVE_REFUND', 'REFUND_SUPPLIER']) : 'NONE') as AggregatorPurchase['paymentStatus'],
      };
      const d = def('aggregatorPurchase');
      const actions: ('approve' | 'reject')[] = status === 'PENDING' ? [] : status === 'REJECTED' ? ['reject'] : ['approve'];
      let rec = runWorkflow(d, base as unknown as AggregatorPurchase & WorkflowRecord, actions, created, 'aggregatorPurchase') as unknown as AggregatorPurchase;
      if (!['PENDING', 'REJECTED', 'APPROVED'].includes(status)) rec = { ...rec, status };
      aggregatorPurchases.push(rec);
    }
  }

  // ---------- Payments ----------
  const payments: Payment[] = [];
  const failureReasons = ['Wallet not registered for this name', 'Payee wallet limit reached', 'Provider timeout', 'Insufficient float in company wallet'];
  const pay = (p: { type: Payment['payableType']; payableId: string; name: string; number: string; amount: Money; at: Date; forceStatus?: Payment['status'] }) => {
    const prov = providerOfPhone(p.number);
    const quote = calculateFees(p.amount, settings.feeTiers, prov.id, { taxPct: settings.taxPct });
    const mk = (status: Payment['status'], when: Date, failureReason?: string): Payment => {
      // Never in the future (a PRE paid "two days later" may still be today).
      const at = new Date(Math.min(when.getTime(), clock.today.getTime() - 3_600_000));
      return {
      id: `${idp}_pay_${payments.length + 1}`, orgId, reference: issue('payment', at), payableType: p.type, payableId: p.payableId,
      payee: { name: p.name, number: p.number }, providerId: prov.id, amount: p.amount, fee: quote.fee, tax: quote.tax, total: quote.total, received: quote.received,
      status, failureReason, initiatedBy: cfg.financeUserId,
      approvedBy: settings.makerChecker && p.amount.amountMinor > toMinor(currency === 'XOF' ? 500_000 : 5_000, currency) ? cfg.checkerUserId : undefined,
      createdAt: iso(at),
      };
    };
    if (p.forceStatus) { payments.push(mk(p.forceStatus, p.at)); return p.forceStatus; }
    if (rng.chance(1 / 12)) {
      payments.push(mk('FAILED', p.at, rng.pick(failureReasons)));
      payments.push(mk('SUCCESSFUL', new Date(p.at.getTime() + rng.int(10, 240) * 60_000)));
    } else payments.push(mk('SUCCESSFUL', p.at));
    return 'SUCCESSFUL';
  };
  for (const r of requests) {
    const ag = agents.find((a) => a.id === r.agentId)!;
    const u = cfg.agents.find((a) => a.userId === ag.userId)!;
    for (const d of r.disbursements.filter((x) => x.method === 'MOMO')) {
      pay({ type: 'AGENT_CASH_ADVANCE', payableId: r.id, name: u.name.toUpperCase(), number: ag.wallet.number, amount: d.amount, at: new Date(d.at) });
      d.paymentId = payments[payments.length - 1]!.id;
    }
  }
  const directPurchases = purchases.filter((p) => requests.find((r) => r.id === p.requestId)!.sourcingModel === 'DIRECT_PAYMENT');
  const unknownTarget = cfg.unknownPayment ? directPurchases[directPurchases.length - 1] : undefined;
  for (const p of directPurchases) {
    const f = farmers.find((x) => x.id === p.farmerId)!;
    const status = pay({
      type: 'FARMER_PURCHASE', payableId: p.id, name: `${f.firstName} ${f.lastName}`.toUpperCase(), number: f.phone, amount: p.amount,
      at: new Date(new Date(p.createdAt).getTime() + rng.int(1, 20) * 60_000), forceStatus: p === unknownTarget ? 'UNKNOWN' : undefined,
    });
    if (status === 'UNKNOWN') p.paymentStatus = 'PENDING';
  }
  for (const e of expenses.filter((x) => x.paymentStatus === 'PAID')) {
    pay({ type: 'PRE_EXPENSE', payableId: e.id, name: e.payee.name, number: e.payee.number, amount: e.total, at: new Date(new Date(e.createdAt).getTime() + 2 * DAY) });
  }
  for (const a of aggregatorPurchases.filter((x) => ['PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'].includes(x.status))) {
    const sup = suppliers.find((s) => s.id === a.supplierId)!;
    if (sup.payout.method !== 'MOMO') continue;
    const amt = a.status === 'PARTIALLY_DISBURSED' ? Math.round(a.total.amountMinor * 0.5) : a.total.amountMinor;
    const company = money(Math.round(amt * a.exchangeRate), currency);
    pay({ type: 'AGGREGATOR_PURCHASE', payableId: a.id, name: sup.name.toUpperCase(), number: sup.payout.number, amount: company, at: new Date(new Date(a.createdAt).getTime() + 2 * DAY) });
  }
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const wallets: Wallet[] = mobileProviders.map((p) => {
    const [bal, thr] = cfg.wallets[p.id] ?? [10_000, 1_000];
    return { id: `${idp}_wal_${p.id}`, orgId, providerId: p.id, name: p.walletName, balance: M(toMinor(bal, currency)), lowBalanceThreshold: M(toMinor(thr, currency)), lastTopUpAt: iso(clock.daysAgo(rng.int(1, 12))) };
  });

  // ---------- Risk flags ----------
  const cashHeld = new Map<string, number>();
  for (const r of requests.filter((x) => x.fundsReceived && x.reconciliationStatus !== 'RECONCILED')) {
    const given = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
    const bought = purchases.filter((p) => p.requestId === r.id).reduce((s, p) => s + p.amount.amountMinor, 0);
    cashHeld.set(r.agentId, (cashHeld.get(r.agentId) ?? 0) + given - bought);
  }
  for (const r of requests) {
    const flags: RiskFlag[] = [];
    if (r.variancePct > 15) flags.push({ key: 'priceAboveList', severity: 'HIGH', params: { pct: r.variancePct } });
    else if (r.variancePct > 5) flags.push({ key: 'priceAboveList', severity: 'MEDIUM', params: { pct: r.variancePct } });
    const held = cashHeld.get(r.agentId) ?? 0;
    if (r.status !== 'RECONCILED' && held > settings.buyingRules.agentCashLimitMinor) flags.push({ key: 'agentCashHigh', severity: 'MEDIUM', params: { held: M(held) } });
    const ag = agents.find((a) => a.id === r.agentId);
    if (ag?.flags.length) flags.push({ key: 'agentFlagged', severity: 'MEDIUM', params: {} });
    r.riskFlags = flags;
  }

  return {
    nodes, communities, farmers, groups, groupMemberships, agents, warehouses, requests, purchases, bags, expenses, suppliers,
    aggregatorPurchases, payments, wallets, activity, notifications: [], sequences,
  };
}

/** Recompute risk flags after a demo-moment adjustment to a request's price. */
export function priceRisk(variancePct: number): RiskFlag[] {
  if (variancePct > 15) return [{ key: 'priceAboveList', severity: 'HIGH', params: { pct: variancePct } }];
  if (variancePct > 5) return [{ key: 'priceAboveList', severity: 'MEDIUM', params: { pct: variancePct } }];
  return [];
}
