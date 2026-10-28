import type {
  WeeklyPlan, BudgetRequest, Retirement, CarryForward, PenaltyRun, AllowanceRun, CommissionPeriod, AgentReport,
  AgentRepayment, Client, DispatchOrder, InsightRequest, Plot, SalesContract, Discrepancy, Inbound, StockCount, StockMovement, Transfer, WarehouseExpense,
  FormRecord, OptionList, SurveyResponse, CarbonProject, DueDiligenceStatement, TrainingTopic, Workshop, EudrLot, ForestLossZone, Nursery, SeedlingAllocation, SeedlingLot, Tree,
  FieldTask, Leader, QualityIssue, RecordDocument, SavingsEntry,
  ActivityEvent, Agent, AggregatorExpense, AggregatorPurchase, AppNotification, Bag, Community, Country, Currency, DataSharingGrant, Farmer, FarmerGroup,
  AuditEntry, Device, JobRun, KbArticle, SavedReport, SyncLog, GroupMembership, LegacyAllocation, LoanRefund, RecoveryRequest, RecoveryWindow, Repayment, ServiceProvider, SupportRequest, Invite, Lead, LoanAccount, ResetToken, Session, LocationNode, Membership, Organisation, OrgSettings, OutboxMessage, Payment, Plan, PreExpense,
  Purchase, PurchaseRequest, Role, Supplier, User, Wallet, Warehouse, WorkflowDefinition,
} from '@/types';
import { canAct, type WorkflowRecord, type WorkflowUser } from '@/engines/workflow';
import { COUNTRIES, CURRENCIES } from '@/data/catalogs/countries';
import { Rng, makeClock, pad } from './rng';
import { ORG, kakaoSettings, minimalSettings, roleId, vitaraSettings } from './templates';
import { PERSONAS, PLANS, STAFF, auditSeed, extraMemberships, grants, invites, leads, makeMembership, makeUser, organisations, rolesFor, sessions, type PersonaSeed } from './platform';
import { QUESTION_TYPES } from '@/engines/forms';
import { generateOperations, priceRisk, type AgentSeed, type OpsResult } from './operations';
import { vitaraAgents, vitaraConfig } from './vitara';
import { kakaoAgents, kakaoConfig } from './kakao';
import { seedFormData } from './forms';
import { enrichBuying, enrichPayments } from './buying';
import { enrichAggregators } from './aggregators';
import { seedSupport, type SupportSeed } from './support';
import { seedInventory } from './inventory';
import { seedSales } from './sales';
import { seedLand } from './land';
import { seedTraining } from './training';
import { seedFieldTeam } from './fieldTeam';
import { VITARA_SUPERVISORS } from './vitara';
import { seedSystem } from './system';
import { formId } from '@/data/forms/library';
import { assignIdNumbers, scoreGroups, seedDocuments, seedIssues, seedLeaders, seedSavings } from './records';

import { SEED, SEED_VERSION } from './version';
export { SEED, SEED_VERSION };

export interface SeedData {
  orgs: Organisation[];
  plans: Plan[];
  countries: Country[];
  currencies: Currency[];
  leads: Lead[];
  grants: DataSharingGrant[];
  users: User[];
  memberships: Membership[];
  roles: Role[];
  invites: Invite[];
  sessions: Session[];
  resetTokens: ResetToken[];
  audit: AuditEntry[];
  questionTypes: Record<string, boolean>;
  settings: Record<string, OrgSettings>;
  sequences: Record<string, Record<string, number>>;
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
  aggregatorExpenses: AggregatorExpense[];
  payments: Payment[];
  wallets: Wallet[];
  loans: LoanAccount[];
  providers: ServiceProvider[];
  supportRequests: SupportRequest[];
  recoveryWindows: RecoveryWindow[];
  recoveryRequests: RecoveryRequest[];
  repayments: Repayment[];
  loanRefunds: LoanRefund[];
  legacyAllocations: LegacyAllocation[];
  inbounds: Inbound[];
  discrepancies: Discrepancy[];
  agentRepayments: AgentRepayment[];
  movements: StockMovement[];
  transfers: Transfer[];
  stockCounts: StockCount[];
  warehouseExpenses: WarehouseExpense[];
  clients: Client[];
  salesContracts: SalesContract[];
  dispatches: DispatchOrder[];
  insights: InsightRequest[];
  plots: Plot[];
  nurseries: Nursery[];
  seedlingLots: SeedlingLot[];
  seedlingAllocations: SeedlingAllocation[];
  trees: Tree[];
  lossZones: ForestLossZone[];
  eudrLots: EudrLot[];
  statements: DueDiligenceStatement[];
  carbonProjects: CarbonProject[];
  trainingTopics: TrainingTopic[];
  workshops: Workshop[];
  weeklyPlans: WeeklyPlan[];
  budgets: BudgetRequest[];
  retirements: Retirement[];
  carryForwards: CarryForward[];
  penaltyRuns: PenaltyRun[];
  allowanceRuns: AllowanceRun[];
  commissionPeriods: CommissionPeriod[];
  agentReports: AgentReport[];
  activity: ActivityEvent[];
  notifications: AppNotification[];
  outbox: OutboxMessage[];
  leaders: Leader[];
  documents: RecordDocument[];
  qualityIssues: QualityIssue[];
  fieldTasks: FieldTask[];
  forms: FormRecord[];
  optionLists: OptionList[];
  responses: SurveyResponse[];
  savings: SavingsEntry[];
  syncLogs: SyncLog[];
  devices: Device[];
  savedReports: SavedReport[];
  jobRuns: JobRun[];
  articles: KbArticle[];
}

function phoneMaker(rng: Rng, dial: string, prefixes: string[], keepZero = false) {
  return () => {
    const pre = rng.pick(prefixes);
    let rest = '';
    for (let i = 0; i < 10 - pre.length; i++) rest += rng.int(0, 9);
    return `${dial}${keepZero ? pre + rest : (pre + rest).replace(/^0/, '')}`;
  };
}

function agentPersonas(agents: AgentSeed[], orgId: string, lang: 'en' | 'fr', settings: OrgSettings): PersonaSeed[] {
  return agents
    .filter((a) => !PERSONAS.some((p) => p.id === a.userId))
    .map((a) => ({
      id: a.userId, name: a.name, orgId, language: lang, phone: a.phone,
      template: a.agentTypeId === 'at_wh' || a.agentTypeId === 'at_mag' ? 'warehouseOfficer' : 'fieldAgent',
      title: settings.agentTypes.find((t) => t.id === a.agentTypeId)?.name[lang],
    }));
}

/** Build the full demo dataset. Deterministic for a given day. */
export function buildSeed(now = new Date()): SeedData {
  const rng = new Rng(SEED);
  const clock = makeClock(now);
  const orgs = organisations(clock);

  const settings: Record<string, OrgSettings> = {
    [ORG.treesyt]: minimalSettings(ORG.treesyt, ['dashboard', 'reports', 'notifications', 'system']),
    [ORG.vitara]: vitaraSettings(),
    [ORG.kakao]: kakaoSettings(),
    [ORG.nordic]: minimalSettings(ORG.nordic, ['traceboard']),
    [ORG.afp]: minimalSettings(ORG.afp, ['traceboard']),
  };

  const roles = [
    ...rolesFor(ORG.treesyt, 'platform'),
    ...rolesFor(ORG.vitara, 'supplier'),
    ...rolesFor(ORG.kakao, 'supplier'),
    ...rolesFor(ORG.nordic, 'buyer'),
    ...rolesFor(ORG.afp, 'buyer'),
  ];

  const vitAgents = vitaraAgents(rng, phoneMaker(rng, '+233', ['024', '054', '055', '059', '024', '054', '020', '050', '026']));
  const kiAgents = kakaoAgents(rng, phoneMaker(rng, '+225', ['07', '07', '07', '01', '05'], true));
  const allPeople = [
    ...PERSONAS,
    ...STAFF,
    ...agentPersonas(vitAgents, ORG.vitara, 'en', settings[ORG.vitara]!),
    ...agentPersonas(kiAgents, ORG.kakao, 'fr', settings[ORG.kakao]!),
  ];
  const users: User[] = allPeople.map((p, i) =>
    makeUser(p, i, PERSONAS.some((x) => x.id === p.id), clock.iso(new Date(clock.today.getTime() - rng.int(1, 96) * 3_600_000))),
  );
  const memberships: Membership[] = [...allPeople.map(makeMembership), ...extraMemberships()];
  // Persona titles from agent types.
  for (const m of memberships) {
    if (!m.title) {
      const a = [...vitAgents, ...kiAgents].find((x) => x.userId === m.userId);
      if (a) m.title = settings[m.orgId]!.agentTypes.find((t) => t.id === a.agentTypeId)?.name[m.orgId === ORG.kakao ? 'fr' : 'en'];
    }
  }

  const people = { memberships, roles };
  const vit = generateOperations(vitaraConfig(settings[ORG.vitara]!, vitAgents), rng, clock, people);
  const ki = generateOperations(kakaoConfig(settings[ORG.kakao]!, kiAgents), rng, clock, people);

  enrichBuying(vit, settings[ORG.vitara]!, 'u_efua', clock.today, 'en');
  enrichBuying(ki, settings[ORG.kakao]!, 'u_jeanmarc', clock.today, 'fr');
  enrichPayments(vit, settings[ORG.vitara]!, { financeUserId: 'u_efua', gapAgentUserId: 'u_yaw', today: clock.today });
  enrichPayments(ki, settings[ORG.kakao]!, { financeUserId: 'u_jeanmarc', today: clock.today });
  const aggDocs = [
    ...enrichAggregators(vit, settings[ORG.vitara]!, { creatorId: 'u_ibrahim', opsUserId: 'u_kwame', financeUserId: 'u_efua', today: clock.today, lang: 'en', customer: 'Vitara Central Warehouse, Tamale' }),
    ...enrichAggregators(ki, settings[ORG.kakao]!, { creatorId: 'u_aicha', opsUserId: 'u_serge', financeUserId: 'u_jeanmarc', today: clock.today, lang: 'fr', customer: 'Magasin central Kakao Ivoire, Daloa' }),
  ];

  // ---- Fixed demo moments (PRD 12.5) ----
  // 1. A Vitara request priced 18% above list → HIGH risk, waiting in Kwame's queue.
  const risky = vit.requests.find((r) => r.status === 'PENDING')!;
  const unit = Math.round(risky.listPrice.amountMinor * 1.18);
  risky.unitPrice = { ...risky.unitPrice, amountMinor: unit };
  risky.total = { ...risky.total, amountMinor: unit * risky.volume };
  risky.variancePct = 18;
  risky.riskFlags = priceRisk(18);
  risky.notes = 'Farmers in this community are asking for a higher price this week.';

  // 2. Abena Issah (Daffiama) has an overdue loan of GHS 840 → blocked from selling.
  const abena = vit.farmers.find((f) => f.firstName === 'Abena' && f.lastName === 'Issah' && f.farmerCode.endsWith('-0023'))!;
  const loans: LoanAccount[] = [{
    id: 'vit_loan_abena', orgId: ORG.vitara, createdAt: clock.iso(clock.daysAgo(200)), updatedAt: clock.iso(clock.daysAgo(60)), createdBy: 'u_efua',
    farmerId: abena.id, principal: { amountMinor: 120_000, currency: 'GHS' }, disbursedAt: clock.day(clock.daysAgo(200)),
    window: { start: clock.day(clock.daysAgo(200)), end: clock.day(clock.daysAgo(20)) },
    repayments: [{ date: clock.day(clock.daysAgo(60)), amount: { amountMinor: 36_000, currency: 'GHS' }, mode: 'PRODUCE' }],
    status: 'ACTIVE',
  }];

  // ---- Notifications: one per item waiting in each office user's approval queue ----
  const notifications: AppNotification[] = [];
  const queueSources = (ops: OpsResult, orgId: string) => {
    const s = settings[orgId]!;
    const wf = (t: string) => s.workflows.find((w) => w.docType === t) as WorkflowDefinition;
    return [
      ...ops.requests.map((r) => ({ r: r as unknown as WorkflowRecord, def: wf('purchaseRequest'), type: 'purchaseRequest', number: r.number, link: `/app/purchase-requests?open=${r.id}` })),
      ...ops.expenses.map((r) => ({ r: r as unknown as WorkflowRecord, def: wf('preExpense'), type: 'preExpense', number: r.number, link: `/app/expenses?open=${r.id}` })),
      ...ops.aggregatorPurchases.map((r) => ({ r: r as unknown as WorkflowRecord, def: wf('aggregatorPurchase'), type: 'aggregatorPurchase', number: r.number, link: `/app/aggregators?open=${r.id}` })),
      ...ops.aggregatorExpenses.map((r) => ({ r: r as unknown as WorkflowRecord, def: wf('aggregatorExpense'), type: 'aggregatorExpense', number: r.number, link: `/app/aggregators/expenses?open=${r.id}` })),
    ];
  };
  for (const [ops, orgId] of [[vit, ORG.vitara], [ki, ORG.kakao]] as const) {
    const sources = queueSources(ops, orgId);
    for (const m of memberships.filter((x) => x.orgId === orgId)) {
      const role = roles.find((r) => r.id === m.roleIds[0])!;
      if (role.mobile || role.template === 'companyAdmin') continue;
      const user: WorkflowUser = { id: m.userId, roleIds: m.roleIds, permissions: role.permissions };
      sources.filter((x) => canAct(x.r, x.def, user)).slice(0, 12).forEach((x, i) => {
        notifications.push({
          id: `ntf_${m.userId}_${i}`, orgId, userId: m.userId, kind: 'APPROVAL', key: 'approvalNeeded',
          params: { docType: x.type, number: x.number }, link: x.link, read: false,
          at: clock.iso(new Date(new Date(x.r.createdAt as string).getTime() + 3_600_000)),
        });
      });
    }
  }
  const unknown = vit.payments.find((p) => p.status === 'UNKNOWN')!;
  notifications.push(
    { id: 'ntf_efua_unknown', orgId: ORG.vitara, userId: 'u_efua', kind: 'PAYMENT', key: 'paymentUnknown', params: { reference: unknown.reference }, link: `/app/payments?open=${unknown.id}`, read: false, at: unknown.createdAt },
    { id: 'ntf_efua_wallet', orgId: ORG.vitara, userId: 'u_efua', kind: 'ALERT', key: 'walletLow', params: { wallet: 'AirtelTigo Money' }, link: '/app/payments/wallets', read: false, at: clock.iso(clock.daysAgo(1)) },
    { id: 'ntf_kwame_risk', orgId: ORG.vitara, userId: 'u_kwame', kind: 'ALERT', key: 'riskHigh', params: { number: risky.number, pct: 18 }, link: `/app/purchase-requests?open=${risky.id}`, read: false, at: risky.createdAt },
    ...leads(clock).map((l, i) => ({ id: `ntf_ben_lead_${i}`, orgId: ORG.treesyt, userId: 'u_benjamin', kind: 'ALERT' as const, key: 'leadNew', params: { business: l.businessName }, link: '/app/platform/leads', read: i > 0, at: l.createdAt })),
  );

  // ---- Phase 5: ID numbers, leaders, documents, savings, data-quality issues ----
  const extra = { leaders: [] as Leader[], documents: [...aggDocs] as RecordDocument[], qualityIssues: [] as QualityIssue[], savings: [] as SavingsEntry[], forms: [] as FormRecord[], optionLists: [] as OptionList[], responses: [] as SurveyResponse[], fieldTasks: [] as FieldTask[] };
  for (const [o, orgId, lang, currency] of [[vit, ORG.vitara, 'en', 'GHS'], [ki, ORG.kakao, 'fr', 'XOF']] as const) {
    assignIdNumbers(o.farmers);
    const agentUser = new Map(o.agents.map((a) => [a.id, a.userId]));
    extra.leaders.push(...seedLeaders(orgId, lang, o.communities, o.groups, o.groupMemberships, o.farmers, clock.iso(clock.daysAgo(90))));
    extra.documents.push(...seedDocuments(orgId, o.communities, o.groups, o.groups.find((g) => g.scoreStatus === 'PENDING_REVIEW')?.id, (c) => agentUser.get(c.agentIds[0] ?? '') ?? 'system'));
    scoreGroups(o.groups, o.groupMemberships, o.farmers, o.purchases, clock.iso(clock.daysAgo(40)));
    extra.savings.push(...seedSavings(orgId, currency, o.groups, o.groupMemberships, clock.today));
    extra.qualityIssues.push(...seedIssues(orgId, settings[orgId]!, o.farmers, o.communities, clock.today));
    // ---- Phase 6: forms, option lists, responses; survey fixes waiting on agents' phones ----
    const owner = orgId === ORG.vitara ? 'u_ama' : 'u_aicha';
    const fd = seedFormData({
      orgId, prefix: orgId === ORG.vitara ? 'vit' : 'ki', ownerId: owner, now: clock.today, seed: orgId === ORG.vitara ? 6061 : 6062,
      pattern: settings[orgId]!.numbering.find((p) => p.docType === 'surveyResponse')!, sequences: o.sequences,
      farmers: o.farmers, communities: o.communities, groups: o.groups, agents: o.agents,
    });
    o.sequences = fd.sequences;
    extra.forms.push(...fd.forms);
    extra.optionLists.push(...fd.optionLists);
    extra.responses.push(...fd.responses);
    for (const r of fd.responses.filter((x) => x.status === 'NEEDS_FIX' && x.agentId)) {
      extra.fieldTasks.push({ id: `task_${r.id}`, orgId, agentId: r.agentId!, userId: r.userId, kind: 'surveyFix', entity: 'response', recordId: r.id, issueIds: [], fields: [], note: r.reviews[0]?.comment, status: 'OPEN', createdAt: r.reviews[0]?.at ?? r.submittedAt, createdBy: owner });
    }
  }

  // ---- Phase 11: farmer support and recovery (PRD F, Journey 6) ----
  // Journey 6 group: Daffiama Farmers Cooperative, now in Yaw's area, with Abena (overdue loan) as a
  // member and a new meeting record waiting for a manual score (the support scoring gate).
  const yawAgent = vit.agents.find((a) => a.userId === 'u_yaw')!;
  const daffiama = vit.communities.find((c) => c.id === abena.communityId)!;
  if (!daffiama.agentIds.includes(yawAgent.id)) daffiama.agentIds = [...daffiama.agentIds, yawAgent.id];
  const jGroup = vit.groups.find((g) => g.communityId === daffiama.id)!;
  if (!vit.groupMemberships.some((m) => m.groupId === jGroup.id && m.farmerId === abena.id))
    vit.groupMemberships.push({ id: 'vit_gm_abena', orgId: ORG.vitara, groupId: jGroup.id, farmerId: abena.id, role: 'MEMBER', joinedAt: clock.day(clock.daysAgo(400)) });
  jGroup.scoreStatus = 'PENDING_REVIEW';
  jGroup.customFields = { ...jGroup.customFields, manualScores: { ...((jGroup.customFields.manualScores as Record<string, unknown>) ?? {}), meetings: null } };
  extra.documents.unshift({ id: `${jGroup.id}_doc_meeting_j6`, orgId: ORG.vitara, entity: 'farmerGroup', entityId: jGroup.id, type: 'meetingRecords', name: `${jGroup.name} — meeting minutes (October).pdf`, mime: 'application/pdf', size: 131_000, uploadedBy: 'u_yaw', uploadedAt: clock.iso(clock.daysAgo(2)) });
  if (!jGroup.wallet) jGroup.wallet = { provider: 'mtn_gh', number: '+233245770011', name: jGroup.name.toUpperCase() };
  loans[0]!.groupId = jGroup.id;
  const priceOf = (o: OpsResult, commodityId: string) => o.requests.find((r) => r.commodityId === commodityId)?.unitPrice.amountMinor ?? 100;
  const sup: SupportSeed[] = [
    seedSupport(vit, settings[ORG.vitara]!, { orgId: ORG.vitara, seed: 1111, today: clock.today, lang: 'en', currency: 'GHS', commodityId: 'com_shea', opsUserId: 'u_kwame', financeUserId: 'u_efua', journeyGroupId: jGroup.id, produceUnitPriceMinor: priceOf(vit, 'com_shea') }),
    seedSupport(ki, settings[ORG.kakao]!, { orgId: ORG.kakao, seed: 2222, today: clock.today, lang: 'fr', currency: 'XOF', commodityId: 'com_cocoa', opsUserId: 'u_serge', financeUserId: 'u_jeanmarc', produceUnitPriceMinor: priceOf(ki, 'com_cocoa') }),
  ];
  loans.push(...sup.flatMap((x) => x.loans));
  extra.documents.push(...sup.flatMap((x) => x.documents));
  vit.activity.push(...sup[0]!.activity);
  ki.activity.push(...sup[1]!.activity);
  const supportData = {
    providers: sup.flatMap((x) => x.providers), supportRequests: sup.flatMap((x) => x.requests), recoveryWindows: sup.flatMap((x) => x.windows), recoveryRequests: sup.flatMap((x) => x.recoveries),
    repayments: sup.flatMap((x) => x.repayments), loanRefunds: sup.flatMap((x) => x.refunds), legacyAllocations: sup.flatMap((x) => x.legacy),
  };

  // ---- Phase 12: inventory (PRD H, Journey 4). Yaw's bags stay with him for the live PRE. ----
  const inv = [
    seedInventory(vit, settings[ORG.vitara]!, { orgId: ORG.vitara, seed: 1212, today: clock.today, lang: 'en', currency: 'GHS', approvers: ['u_adwoa', 'u_ibrahim', 'u_kwame', 'u_efua'], financeUserId: 'u_efua', keepAgentIds: [yawAgent.id] }),
    seedInventory(ki, settings[ORG.kakao]!, { orgId: ORG.kakao, seed: 2323, today: clock.today, lang: 'fr', currency: 'XOF', approvers: ['u_aicha', 'u_jeanmarc'], financeUserId: 'u_jeanmarc', keepAgentIds: [] }),
  ];
  vit.activity.push(...inv[0]!.activity);
  ki.activity.push(...inv[1]!.activity);
  const inventoryData = {
    inbounds: inv.flatMap((x) => x.inbounds), discrepancies: inv.flatMap((x) => x.discrepancies), agentRepayments: inv.flatMap((x) => x.agentRepayments),
    movements: inv.flatMap((x) => x.movements), transfers: inv.flatMap((x) => x.transfers), stockCounts: inv.flatMap((x) => x.stockCounts), warehouseExpenses: inv.flatMap((x) => x.warehouseExpenses),
  };

  // ---- Phase 13: clients, sales contracts, dispatch orders, plots, Traceboard (PRD H6–H8, Journey 5) ----
  const allTransfers = inventoryData.transfers;
  const sal = [
    seedSales(vit, settings[ORG.vitara]!, allTransfers, {
      orgId: ORG.vitara, seed: 1313, today: clock.today, lang: 'en', officerUserId: 'u_kojo', approverUserId: 'u_ibrahim', financeUserId: 'u_efua', port: { lat: 5.64, lng: 0.01, name: 'Tema Port' },
      clients: [
        { code: 'NSB', name: 'Nordic Shea Butter AB', country: 'SE', buyerOrgId: ORG.nordic, contactName: 'Lena Hartmann' },
        { code: 'AFP', name: 'Accra Food Processors Ltd', country: 'GH', buyerOrgId: ORG.afp, contactName: 'Esi Quaye' },
        { code: 'HOG', name: 'Hamburg Oilseeds GmbH', country: 'DE', contactName: 'Jonas Becker' },
        { code: 'LAT', name: 'Lomé Agro Trading', country: 'TG', contactName: 'Edem Agbeko' },
      ],
      contracts: [
        { client: 'NSB', commodityId: 'com_shea', quantityT: 60, pricePerT: 48_000, currency: 'EUR', term: 'pt_5050', packaging: 'pk_jute', status: 'ORDER_CREATED', windowDays: [90, 60], deliveryPoint: 'Tema Port', dispatches: [['DIRECT', 'VERIFIED', 70], ['INVENTORY', 'VERIFIED', 40], ['INVENTORY', 'IN_TRANSIT', 9]] },
        { client: 'AFP', commodityId: 'com_shea', pricePerT: 650_000, currency: 'GHS', term: 'pt_on', packaging: 'pk_pp', status: 'FULFILLED', windowDays: [170, -20], deliveryPoint: 'AFP factory, Tema', dispatches: [['DIRECT', 'VERIFIED', 150], ['DIRECT', 'VERIFIED', 120], ['DIRECT', 'VERIFIED', 95]] },
        { client: 'HOG', commodityId: 'com_sesame', quantityT: 25, pricePerT: 120_000, currency: 'EUR', term: 'pt_3070', packaging: 'pk_pp', status: 'ORDER_CREATED', windowDays: [75, 45], deliveryPoint: 'Tema Port', dispatches: [['DIRECT', 'VERIFIED', 60], ['DIRECT', 'DELIVERED', 4]] },
        { client: 'LAT', commodityId: 'com_maize', quantityT: 30, pricePerT: 320_000, currency: 'GHS', term: 'pt_after', packaging: 'pk_pp', status: 'DRAFT', windowDays: [-10, 70], deliveryPoint: 'Lomé, Togo', dispatches: [] },
        { client: 'NSB', commodityId: 'com_shea', quantityT: 25, pricePerT: 49_000, currency: 'EUR', term: 'pt_3070', packaging: 'pk_jute', status: 'AGREED', windowDays: [5, 75], deliveryPoint: 'Tema Port', dispatches: [] },
      ],
      loose: [
        ['AFP', 'com_gnut', 'VERIFIED', 200], ['LAT', 'com_maize', 'VERIFIED', 180], ['HOG', 'com_soy', 'VERIFIED', 140], ['LAT', 'com_gnut', 'VERIFIED', 160], ['LAT', 'com_maize', 'VERIFIED', 110],
        ['AFP', 'com_cowpea', 'VERIFIED', 85], ['AFP', 'com_millet', 'VERIFIED', 50], ['HOG', 'com_sesame', 'VERIFIED', 220], ['AFP', 'com_gnut', 'REJECTED', 30],
        ['HOG', 'com_cowpea', 'PENDING', 3], ['AFP', 'com_soy', 'ARRIVED', 2], ['LAT', 'com_maize', 'PENDING_APPROVAL', 1],
      ],
      insights: [
        { buyerOrgId: ORG.nordic, userId: 'u_lena', topic: 'Women in the supply base', message: 'Could you break down the women supplier share by community for last season?', answer: 'Attached by community: 61% across 14 communities; Daffiama and Busa are above 70%.' },
        { buyerOrgId: ORG.nordic, userId: 'u_lena', topic: 'Plot maps for the next shipment', message: 'Please share the plot polygons for the farmers in the next shea shipment.' },
      ],
    }),
    seedSales(ki, settings[ORG.kakao]!, allTransfers, {
      orgId: ORG.kakao, seed: 2424, today: clock.today, lang: 'fr', officerUserId: 'u_aicha', approverUserId: 'u_serge', financeUserId: 'u_jeanmarc', port: { lat: 4.75, lng: -6.64, name: 'Port de San-Pédro' },
      clients: [
        { code: 'HKG', name: 'Hanse Kakao GmbH', country: 'DE', contactName: 'Mareike Vogt' },
        { code: 'ECS', name: 'Ébène Cacao SARL', country: 'CI', contactName: 'Adjoua Kouamé' },
      ],
      contracts: [
        { client: 'HKG', commodityId: 'com_cocoa', quantityT: 50, pricePerT: 280_000, currency: 'EUR', term: 'pt_3070', packaging: 'pk_jute', status: 'ORDER_CREATED', windowDays: [60, 50], deliveryPoint: 'Port de San-Pédro', dispatches: [['DIRECT', 'VERIFIED', 45], ['INVENTORY', 'IN_TRANSIT', 4]] },
        { client: 'ECS', commodityId: 'com_cocoa', pricePerT: 1_500_000, currency: 'XOF', term: 'pt_on', packaging: 'pk_jute', status: 'FULFILLED', windowDays: [150, -15], deliveryPoint: 'Abidjan', dispatches: [['DIRECT', 'VERIFIED', 120], ['DIRECT', 'VERIFIED', 90]] },
        { client: 'HKG', commodityId: 'com_cocoa', quantityT: 40, pricePerT: 285_000, currency: 'EUR', term: 'pt_5050', packaging: 'pk_jute', status: 'DRAFT', windowDays: [-20, 90], deliveryPoint: 'Port de San-Pédro', dispatches: [] },
      ],
      loose: [['ECS', 'com_cashew', 'VERIFIED', 70], ['ECS', 'com_cocoa', 'VERIFIED', 160], ['HKG', 'com_cocoa', 'PENDING_APPROVAL', 1]],
    }),
  ];
  vit.activity.push(...sal[0]!.activity);
  ki.activity.push(...sal[1]!.activity);
  const salesData = {
    clients: sal.flatMap((x) => x.clients), salesContracts: sal.flatMap((x) => x.contracts), dispatches: sal.flatMap((x) => x.dispatches),
    insights: sal.flatMap((x) => x.insights),
  };

  // ---- Phase 14: nurseries, seedlings, trees, plots, EUDR, carbon (PRD I1–I6, Journeys 11 and 14) ----
  const lnd = [
    seedLand(vit, settings[ORG.vitara]!, sal[0]!.plots, {
      orgId: ORG.vitara, seed: 1414, today: clock.today, lang: 'en', agentTypeId: 'at_cons', mainUserId: 'u_mariama', nurseries: 10, farmersPlanting: 90,
      externalSupplier: 'Savannah Tree Seed Centre, Bolgatanga', officeUserId: 'u_naa', dispatches: sal[0]!.dispatches, checkedShare: 0.85,
      project: { name: 'Upper West Shea Parkland Restoration', standard: 'PLAN_VIVO', partner: 'Northern Savannah Trust', plan: 'Survival count every 6 months; height sample of 10% of trees; annual Plan Vivo report.', baselineT: 1250 },
    }),
    seedLand(ki, settings[ORG.kakao]!, sal[1]!.plots, {
      orgId: ORG.kakao, seed: 2525, today: clock.today, lang: 'fr', agentTypeId: 'at_del', mainUserId: 'u_moussa', mapperUserId: 'u_moussa', nurseries: 4, farmersPlanting: 40,
      externalSupplier: 'Pépinière CNRA, Divo', officeUserId: 'u_aicha', dispatches: sal[1]!.dispatches, checkedShare: 1,
      project: { name: 'Ombrage cacao Soubré', standard: 'INTERNAL', partner: 'Hanse Kakao GmbH', plan: 'Comptage des arbres d’ombrage une fois par an ; rapport au client.', baselineT: 600 },
    }),
  ];
  vit.activity.push(...lnd[0]!.activity);
  ki.activity.push(...lnd[1]!.activity);

  // ---- Phase 15: training catalogue and workshops (PRD G3, M10) ----
  const trn = [
    seedTraining(vit, settings[ORG.vitara]!, {
      orgId: ORG.vitara, seed: 1515, today: clock.today, lang: 'en', officeUserId: 'u_salamatu', agentTypeIds: ['at_ceo', 'at_cons'], journeyUserId: 'u_yaw',
      held: 15, archived: 2, cancelled: 1, planned: 2, feedbackFormId: formId(ORG.vitara, 'workshop'), responses: extra.responses,
      topics: [
        ['Shea parkland management', 'Gestion des parcs à karité', 'CONSERVATION', 120, 'FARMERS', ['Parkland poster']],
        ['Good collection and drying of shea nuts', 'Bonne collecte et séchage des noix de karité', 'QUALITY', 90, 'FARMERS', ['Drying mat demo']],
        ['Bushfire prevention and control', 'Prévention et lutte contre les feux de brousse', 'CONSERVATION', 90, 'FARMERS', ['Fire-belt guide']],
        ['Seedling care and transplanting', 'Soins et repiquage des plants', 'AGRONOMY', 120],
        ['Grafting shea trees', 'Greffage du karité', 'AGRONOMY', 180, 'FARMERS', ['Grafting knives', 'Budding tape']],
        ['Safe storage and moisture control', 'Stockage et contrôle de l’humidité', 'QUALITY', 60, 'FARMERS', ['Moisture meter']],
        ['Safe use of farm chemicals', 'Utilisation sûre des produits chimiques', 'SAFETY', 90, 'FARMERS', ['PPE kit']],
        ['VSLA savings and loans', 'Épargne et crédit en AVEC', 'FINANCE', 120, 'GROUPS', ['VSLA box', 'Passbooks']],
        ['Farm record keeping', 'Tenue des registres de l’exploitation', 'FINANCE', 60, 'FARMERS', ['Record book']],
        ['Household budgeting for women’s groups', 'Budget du ménage pour les groupements de femmes', 'FINANCE', 90, 'GROUPS'],
        ['Child protection on the farm', 'Protection de l’enfant à la ferme', 'SOCIAL', 60],
        ['First aid in the field', 'Premiers secours au champ', 'SAFETY', 60, 'STAFF', ['First aid kit']],
        ['Composting and soil fertility', 'Compostage et fertilité des sols', 'AGRONOMY', 90],
        ['Beekeeping for extra income', 'Apiculture pour un revenu en plus', 'AGRONOMY', 120, 'FARMERS', ['Hive model']],
      ],
    }),
    seedTraining(ki, settings[ORG.kakao]!, {
      orgId: ORG.kakao, seed: 2626, today: clock.today, lang: 'fr', officeUserId: 'u_aicha', agentTypeIds: ['at_del'],
      held: 5, archived: 1, cancelled: 1, planned: 1, feedbackFormId: formId(ORG.kakao, 'workshop'), responses: extra.responses,
      topics: [
        ['Pruning cocoa trees', 'Taille du cacaoyer', 'AGRONOMY', 120, 'FARMERS', ['Scie d’élagage']],
        ['Swollen shoot: spot and report', 'Swollen shoot : repérer et signaler', 'AGRONOMY', 90],
        ['Fermentation and drying', 'Fermentation et séchage', 'QUALITY', 90],
        ['Shade trees and agroforestry', 'Arbres d’ombrage et agroforesterie', 'CONSERVATION', 120],
        ['EUDR traceability and mapping', 'Traçabilité RDUE et cartographie', 'QUALITY', 60],
        ['Pesticide safety', 'Sécurité des pesticides', 'SAFETY', 90, 'FARMERS', ['Kit EPI']],
        ['Child labour awareness', 'Sensibilisation au travail des enfants', 'SOCIAL', 60],
        ['Cooperative financial management', 'Gestion financière de la coopérative', 'FINANCE', 120, 'STAFF'],
      ],
    }),
  ];
  vit.activity.push(...trn[0]!.activity);
  ki.activity.push(...trn[1]!.activity);
  const trainingData = { trainingTopics: trn.flatMap((x) => x.topics), workshops: trn.flatMap((x) => x.workshops) };

  // ---- Phase 16: field team (PRD J, Journeys 7–8) ----
  const fld = [
    seedFieldTeam(vit, settings[ORG.vitara]!, {
      orgId: ORG.vitara, seed: 1616, today: clock.today, lang: 'en', currency: 'GHS', supervisors: VITARA_SUPERVISORS, journeySupervisor: 'u_fuseini', journeyUserId: 'u_yaw',
      financeUserId: 'u_efua', opsUserId: 'u_kwame', weeks: 6, activityIds: ['act_profile', 'act_shea', 'act_group', 'act_survey', 'act_workshop', 'act_treemon', 'act_seedlings', 'act_meeting'],
      reports: [
        { index: 2, categoryId: 'ic_price', reason: 'Two farmers in Daffiama were paid below the list price on market day.', status: 'OPEN' },
        { index: 5, categoryId: 'ic_cash', reason: 'Cash advance from last month still not reconciled.', status: 'IN_PROGRESS' },
        { index: 8, categoryId: 'ic_absent', reason: 'Not seen in the planned community on Tuesday.', status: 'RESOLVED' },
        { index: 11, categoryId: 'ic_late', reason: 'Phone not synced for six days.', status: 'OPEN' },
        { index: 14, categoryId: 'ic_receipt', reason: 'Fuel receipt dated after the trip.', status: 'RESOLVED' },
      ],
    }),
    seedFieldTeam(ki, settings[ORG.kakao]!, {
      orgId: ORG.kakao, seed: 2727, today: clock.today, lang: 'fr', currency: 'XOF', supervisors: ['u_koffi', 'u_lassina'], journeySupervisor: '', financeUserId: 'u_jeanmarc', opsUserId: 'u_serge',
      weeks: 4, activityIds: ['act_cocoa', 'act_profile', 'act_farmland', 'act_buyers', 'act_meeting'],
      reports: [
        { index: 1, categoryId: 'ic_absent', reason: 'Absent du village de Gagnoa prévu jeudi.', status: 'OPEN' },
        { index: 3, categoryId: 'ic_late', reason: 'Téléphone non synchronisé depuis une semaine.', status: 'RESOLVED' },
      ],
    }),
  ];
  vit.activity.push(...fld[0]!.activity);
  ki.activity.push(...fld[1]!.activity);
  const fieldData = {
    weeklyPlans: fld.flatMap((x) => x.plans), budgets: fld.flatMap((x) => x.budgets), retirements: fld.flatMap((x) => x.retirements), carryForwards: fld.flatMap((x) => x.carryForwards),
    penaltyRuns: fld.flatMap((x) => x.penaltyRuns), allowanceRuns: fld.flatMap((x) => x.allowanceRuns), commissionPeriods: fld.flatMap((x) => x.commissions), agentReports: fld.flatMap((x) => x.reports),
  };
  const landData = {
    plots: lnd.flatMap((x) => x.plots), nurseries: lnd.flatMap((x) => x.nurseries), seedlingLots: lnd.flatMap((x) => x.lots), seedlingAllocations: lnd.flatMap((x) => x.allocations),
    trees: lnd.flatMap((x) => x.trees), lossZones: lnd.flatMap((x) => x.lossZones), eudrLots: lnd.flatMap((x) => x.eudrLots), statements: lnd.flatMap((x) => x.statements), carbonProjects: lnd.flatMap((x) => x.projects),
  };

  // ---- Phase 17: a multi-company agent — a Vitara CEO agent who also buys cocoa for Kakao Ivoire ----
  const multi = vit.agents.find((a) => a.userId === 'u_vit_ag4')!;
  const kiTemplate = ki.agents.find((a) => a.agentTypeId === 'at_del' && a.status === 'ACTIVE')!;
  const kiMulti: Agent = {
    ...kiTemplate, id: 'ki_ag_multi', userId: multi.userId, managerIds: ['u_koffi'], wallet: { providerId: 'orange_ci', number: '+2250707445566', verifiedName: users.find((u) => u.id === multi.userId)!.name.toUpperCase() },
    weekTargetPct: 0, score: 0, flags: [], appVersion: multi.appVersion, lastSyncAt: multi.lastSyncAt,
  };
  ki.agents.push(kiMulti);
  for (const c of ki.communities.filter((x) => x.agentIds.includes(kiTemplate.id)).slice(0, 2)) c.agentIds = [...c.agentIds, kiMulti.id];
  memberships.push({ id: `mem_${multi.userId}_org_kakao`, userId: multi.userId, orgId: ORG.kakao, roleIds: [roleId(ORG.kakao, 'fieldAgent')], status: 'ACTIVE', title: settings[ORG.kakao]!.agentTypes.find((t) => t.id === 'at_del')?.name.fr });

  // ---- Phase 18: Vitara shares two communities and their farmers with Kakao Ivoire (PRD A5) ----
  const sharedCommunities = vit.communities.slice(0, 2).map((c) => c.id);

  const ops = [vit, ki];
  const cat = <K extends keyof OpsResult>(k: K) => ops.flatMap((o) => o[k] as unknown[]) as OpsResult[K];
  const sys = seedSystem({ clock, users, memberships, roles, agents: cat('agents'), settings, farmers: cat('farmers'), purchases: cat('purchases'), payments: cat('payments') });
  return {
    orgs, plans: PLANS, countries: COUNTRIES, currencies: CURRENCIES, leads: leads(clock), grants: [...grants(clock), { id: 'grant_vit_ki', fromOrgId: ORG.vitara, toOrgId: ORG.kakao, scopes: ['communities', 'farmers'], communityIds: sharedCommunities, note: 'Joint women’s savings programme', createdAt: clock.iso(clock.daysAgo(25)), status: 'ACTIVE' }], users, memberships, roles, settings,
    invites: invites(clock), sessions: sessions(users, memberships, clock), resetTokens: [], audit: [...sys.audit, ...auditSeed(clock)].sort((a, b) => b.at.localeCompare(a.at)),
    questionTypes: Object.fromEntries(QUESTION_TYPES.map((q) => [q, true])),
    sequences: { [ORG.vitara]: vit.sequences, [ORG.kakao]: ki.sequences },
    nodes: cat('nodes'), communities: cat('communities'), farmers: cat('farmers'), groups: cat('groups'), groupMemberships: cat('groupMemberships'),
    agents: cat('agents'), warehouses: cat('warehouses'), requests: cat('requests'), purchases: cat('purchases'), bags: cat('bags'),
    expenses: cat('expenses'), suppliers: cat('suppliers'), aggregatorPurchases: cat('aggregatorPurchases'), aggregatorExpenses: cat('aggregatorExpenses'), payments: cat('payments'),
    wallets: cat('wallets'), loans, activity: cat('activity'), notifications, outbox: sys.outbox, ...extra, ...supportData, ...inventoryData, ...salesData, ...landData, ...trainingData, ...fieldData,
    syncLogs: sys.syncLogs, devices: sys.devices, savedReports: sys.savedReports, jobRuns: sys.jobRuns, articles: sys.articles,
  };
}

let cached: SeedData | null = null;
/** Memoised seed for store initial state. */
export function getSeed(): SeedData {
  if (!cached) cached = buildSeed();
  return cached;
}

export { ORG, roleId, pad };
