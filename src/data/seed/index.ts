import type {
  FormRecord, OptionList, SurveyResponse,
  FieldTask, Leader, QualityIssue, RecordDocument, SavingsEntry,
  ActivityEvent, Agent, AggregatorPurchase, AppNotification, Bag, Community, Country, Currency, DataSharingGrant, Farmer, FarmerGroup,
  AuditEntry, GroupMembership, Invite, Lead, LoanAccount, ResetToken, Session, LocationNode, Membership, Organisation, OrgSettings, OutboxMessage, Payment, Plan, PreExpense,
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
import { assignIdNumbers, scoreGroups, seedDocuments, seedIssues, seedLeaders, seedSavings } from './records';

export const SEED_VERSION = 6;
export const SEED = 20261018;

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
  payments: Payment[];
  wallets: Wallet[];
  loans: LoanAccount[];
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
  const extra = { leaders: [] as Leader[], documents: [] as RecordDocument[], qualityIssues: [] as QualityIssue[], savings: [] as SavingsEntry[], forms: [] as FormRecord[], optionLists: [] as OptionList[], responses: [] as SurveyResponse[], fieldTasks: [] as FieldTask[] };
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

  const ops = [vit, ki];
  const cat = <K extends keyof OpsResult>(k: K) => ops.flatMap((o) => o[k] as unknown[]) as OpsResult[K];
  return {
    orgs, plans: PLANS, countries: COUNTRIES, currencies: CURRENCIES, leads: leads(clock), grants: grants(clock), users, memberships, roles, settings,
    invites: invites(clock), sessions: sessions(users, memberships, clock), resetTokens: [], audit: auditSeed(clock),
    questionTypes: Object.fromEntries(QUESTION_TYPES.map((q) => [q, true])),
    sequences: { [ORG.vitara]: vit.sequences, [ORG.kakao]: ki.sequences },
    nodes: cat('nodes'), communities: cat('communities'), farmers: cat('farmers'), groups: cat('groups'), groupMemberships: cat('groupMemberships'),
    agents: cat('agents'), warehouses: cat('warehouses'), requests: cat('requests'), purchases: cat('purchases'), bags: cat('bags'),
    expenses: cat('expenses'), suppliers: cat('suppliers'), aggregatorPurchases: cat('aggregatorPurchases'), payments: cat('payments'),
    wallets: cat('wallets'), loans, activity: cat('activity'), notifications, outbox: [], ...extra,
  };
}

let cached: SeedData | null = null;
/** Memoised seed for store initial state. */
export function getSeed(): SeedData {
  if (!cached) cached = buildSeed();
  return cached;
}

export { ORG, roleId, pad };
