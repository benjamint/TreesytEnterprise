import type {
  AgentType, Commodity, ExpenseType, FeeTier, NumberingPattern, OrgSettings, PackagingProfile, PaymentProvider, WorkflowDefinition,
} from '@/types';
import { allModules } from '@/engines/permissions';
import { DEFAULT_UNITS } from '@/engines/units';
import { VITARA_LOAN_TERMS } from '@/engines/loans';
import { PROVIDER_CATALOG } from '@/data/catalogs/providers';

/**
 * Company settings templates. The Vitara template reproduces today's hard-coded behaviour as
 * editable settings (PRD principle 2); Kakao Ivoire shows how a second company differs.
 */

export const ORG = {
  treesyt: 'org_treesyt',
  vitara: 'org_vitara',
  kakao: 'org_kakao',
  nordic: 'org_nordic',
  afp: 'org_afp',
} as const;

export const roleId = (orgId: string, template: string) => `${orgId}_role_${template}`;

const sep = { requesterCannotApprove: true, sameUserNotTwoSteps: true };

const PR_STATUSES = [
  'PENDING', 'MANAGEMENT_APPROVED', 'FINANCE_APPROVED', 'RATE_CONFIRMED', 'PARTIAL_DISBURSEMENT', 'FULL_DISBURSEMENT',
  'FUNDS_RECEIVED', 'TICKET_ACTIVATED', 'RECONCILED', 'NOT_APPROVED', 'ON_HOLD', 'PRICE_UPDATE', 'ARCHIVED',
];

function vitaraWorkflows(): WorkflowDefinition[] {
  return [
    {
      id: 'wf_vit_pr', docType: 'purchaseRequest', statuses: PR_STATUSES,
      steps: [
        { id: 'mgmt', name: 'Management approval', roleIds: [], permission: 'purchaseRequests.approveManagement', slaHours: 24 },
        { id: 'fin', name: 'Finance approval', roleIds: [], permission: 'purchaseRequests.approveFinance', allowEditAmount: true, slaHours: 24 },
      ],
      stepStatus: { mgmt: 'MANAGEMENT_APPROVED', fin: 'FINANCE_APPROVED' },
      initialStatus: 'PENDING', approvedStatus: 'FINANCE_APPROVED', rejectedStatus: 'NOT_APPROVED', heldStatus: 'ON_HOLD',
      holdAllowed: true, rejectReasonRequired: true, resumeFrom: 'same', separation: sep,
    },
    {
      // Today: step 1 is approved automatically, then levels 2–4. On hold resumes from the previous step.
      id: 'wf_vit_pre', docType: 'preExpense', statuses: ['PENDING', 'LEVEL_1_APPROVED', 'LEVEL_2_APPROVED', 'LEVEL_3_APPROVED', 'APPROVED', 'REJECTED', 'ON_HOLD'],
      steps: [
        { id: 'l1', name: 'Level 1', roleIds: [], permission: 'expenses.approveLevel1', auto: true },
        { id: 'l2', name: 'Level 2 — Logistics', roleIds: [], permission: 'expenses.approveLevel2' },
        { id: 'l3', name: 'Level 3 — Operations', roleIds: [], permission: 'expenses.approveLevel3' },
        { id: 'l4', name: 'Level 4 — Finance', roleIds: [], permission: 'expenses.approveLevel4' },
      ],
      stepStatus: { l1: 'LEVEL_1_APPROVED', l2: 'LEVEL_2_APPROVED', l3: 'LEVEL_3_APPROVED', l4: 'APPROVED' },
      initialStatus: 'PENDING', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED', heldStatus: 'ON_HOLD',
      holdAllowed: true, rejectReasonRequired: true, resumeFrom: 'previous', separation: sep,
    },
    {
      id: 'wf_vit_acs', docType: 'aggregatorPurchase', statuses: ['PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'],
      steps: [{ id: 'ops', name: 'Operations approval', roleIds: [], permission: 'aggregators.approve' }],
      stepStatus: { ops: 'APPROVED' },
      initialStatus: 'PENDING', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED', heldStatus: 'ON_HOLD',
      holdAllowed: false, rejectReasonRequired: true, resumeFrom: 'same', separation: sep,
    },
  ];
}

function kakaoWorkflows(): WorkflowDefinition[] {
  const o = ORG.kakao;
  return [
    {
      id: 'wf_ki_pr', docType: 'purchaseRequest', statuses: ['PENDING', 'ZONE_APPROVED', 'OPS_APPROVED', ...PR_STATUSES.slice(2)],
      steps: [
        { id: 'zone', name: 'Superviseur de zone', roleIds: [roleId(o, 'fieldSupervisor')], permission: 'purchaseRequests.approveManagement' },
        { id: 'dirops', name: 'Directeur des opérations', roleIds: [roleId(o, 'operationsManager')], permission: 'purchaseRequests.approveManagement', condition: { field: 'total', op: '>', value: 2_000_000 } },
        { id: 'fin', name: 'Finance', roleIds: [], permission: 'purchaseRequests.approveFinance', allowEditAmount: true },
      ],
      stepStatus: { zone: 'ZONE_APPROVED', dirops: 'OPS_APPROVED', fin: 'FINANCE_APPROVED' },
      initialStatus: 'PENDING', approvedStatus: 'FINANCE_APPROVED', rejectedStatus: 'NOT_APPROVED', heldStatus: 'ON_HOLD',
      holdAllowed: true, rejectReasonRequired: true, resumeFrom: 'same', separation: sep,
    },
    {
      id: 'wf_ki_pre', docType: 'preExpense', statuses: ['PENDING', 'LEVEL_1_APPROVED', 'APPROVED', 'REJECTED', 'ON_HOLD'],
      steps: [
        { id: 'l1', name: 'Validation automatique', roleIds: [], permission: 'expenses.approveLevel1', auto: true },
        { id: 'fin', name: 'Finance', roleIds: [], permission: 'expenses.approveLevel4' },
      ],
      stepStatus: { l1: 'LEVEL_1_APPROVED', fin: 'APPROVED' },
      initialStatus: 'PENDING', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED', heldStatus: 'ON_HOLD',
      holdAllowed: true, rejectReasonRequired: true, resumeFrom: 'same', separation: sep,
    },
    {
      id: 'wf_ki_acs', docType: 'aggregatorPurchase', statuses: ['PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'],
      steps: [{ id: 'ops', name: 'Directeur des opérations', roleIds: [], permission: 'aggregators.approve' }],
      stepStatus: { ops: 'APPROVED' },
      initialStatus: 'PENDING', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED', heldStatus: 'ON_HOLD',
      holdAllowed: false, rejectReasonRequired: true, resumeFrom: 'same', separation: sep,
    },
  ];
}

const VITARA_NUMBERING: NumberingPattern[] = [
  { docType: 'purchaseRequest', prefix: 'CS', pattern: '{prefix}-{yymm}-{seq:4}', scope: 'month' },
  { docType: 'purchase', prefix: 'P', pattern: '{prefix}-{yymm}-{seq:5}', scope: 'month' },
  { docType: 'preExpense', prefix: 'PRE', pattern: '{prefix}-{yymm}-{seq:4}', scope: 'month' },
  { docType: 'aggregatorPurchase', prefix: 'ACS', pattern: '{prefix}-{yy}-{seq:4}', scope: 'year' },
  { docType: 'aggregatorExpense', prefix: 'ACSPRE', pattern: '{prefix}-{yy}-{seq:4}', scope: 'year' },
  { docType: 'warehouseExpense', prefix: 'WSPRE', pattern: '{prefix}-{yy}-{seq:4}', scope: 'year' },
  { docType: 'supportRequest', prefix: 'PF', pattern: '{prefix}-{yy}-{seq:4}', scope: 'year' },
  { docType: 'recoveryBatch', prefix: 'RR', pattern: '{prefix}-{seq:4}', scope: 'company' },
  { docType: 'salesContract', prefix: 'SC', pattern: '{prefix}-{yyyy}-{seq:3}', scope: 'year' },
  { docType: 'dispatchOrder', prefix: 'DO', pattern: '{prefix}-{yymm}-{seq:3}', scope: 'month' },
  { docType: 'saleNumber', prefix: 'SN', pattern: '{prefix}-{clientCode}-{seq:4}', scope: 'client' },
  { docType: 'weeklyBudget', prefix: 'WAB', pattern: '{prefix}-{yy}-{seq:5}', scope: 'year' },
  { docType: 'monthlyAllowance', prefix: 'MMA', pattern: '{prefix}-{yymm}-{seq:3}', scope: 'month' },
  { docType: 'bulkPayment', prefix: 'BLKPUR', pattern: '{prefix}-{yymm}-{seq:4}', scope: 'month' },
  { docType: 'payment', prefix: 'PAY', pattern: '{prefix}-{yymm}-{seq:5}', scope: 'month' },
  { docType: 'seedlingCode', prefix: 'TS', pattern: '{prefix}{seq:7}', scope: 'company' },
  { docType: 'nurseryBatch', prefix: 'NB', pattern: '{prefix}-{yy}-{seq:3}', scope: 'year' },
  { docType: 'farmerId', prefix: '', pattern: '{community}-{initials}-{seq}', scope: 'community' },
  { docType: 'communityCode', prefix: '', pattern: '{region}-{seq:3}', scope: 'company' },
  { docType: 'surveyResponse', prefix: 'SR', pattern: '{prefix}-{yymm}-{seq:5}', scope: 'month' },
];

const KAKAO_NUMBERING: NumberingPattern[] = VITARA_NUMBERING.map((p) => {
  switch (p.docType) {
    case 'purchaseRequest': return { ...p, prefix: 'DA', pattern: 'DA-{yy}-{seq:6}', scope: 'year' };
    case 'purchase': return { ...p, prefix: 'ACH', pattern: '{prefix}-{yymm}-{seq:5}' };
    case 'preExpense': return { ...p, prefix: 'DEP', pattern: '{prefix}-{yy}-{seq:4}', scope: 'year' };
    case 'farmerId': return { ...p, prefix: 'KI', pattern: 'KI-{region}-{seq:5}', scope: 'company' };
    case 'payment': return { ...p, prefix: 'PAI' };
    default: return p;
  }
});

const shea: Commodity = {
  id: 'com_shea', code: 'SHN', name: { en: 'Shea nuts', fr: 'Noix de karité' }, aliases: ['shea', 'nkuto', 'kpihi'], hsCode: '1207.99',
  defaultUnitId: 'kg', allowedUnitIds: ['kg', 'bag', 't'],
  quality: [{ key: 'moisture', label: 'Moisture', max: 8, unit: '%' }, { key: 'ffa', label: 'FFA', max: 3, unit: '%' }],
  grades: ['A', 'B'], aggregatorThresholdKg: 2000, farmerMaxKg: 1500, eudrRelevant: false, lossTolerancePct: 0.5, color: '#14583F',
};

const simple = (id: string, code: string, en: string, fr: string, color: string, extra: Partial<Commodity> = {}): Commodity => ({
  id, code, name: { en, fr }, aliases: [], hsCode: '', defaultUnitId: 'kg', allowedUnitIds: ['kg', 'bag', 't'],
  quality: [{ key: 'moisture', label: 'Moisture', max: 13, unit: '%' }], grades: ['A', 'B'], aggregatorThresholdKg: 3000,
  farmerMaxKg: 2500, eudrRelevant: false, lossTolerancePct: 0.5, color, ...extra,
});

const VITARA_COMMODITIES: Commodity[] = [
  shea,
  simple('com_soy', 'SOY', 'Soybeans', 'Soja', '#B8E05A', { hsCode: '1201.90' }),
  simple('com_maize', 'MAZ', 'Maize', 'Maïs', '#E0A94A', { hsCode: '1005.90' }),
  simple('com_gnut', 'GNT', 'Groundnuts', 'Arachides', '#B7791F', { hsCode: '1202.41' }),
  simple('com_sesame', 'SES', 'Sesame', 'Sésame', '#6A9BEA', { hsCode: '1207.40' }),
  simple('com_cowpea', 'CWP', 'Cowpea', 'Niébé', '#C0392B', { hsCode: '0713.35' }),
  simple('com_millet', 'WML', 'White millet', 'Mil blanc', '#93A39B', { hsCode: '1008.29' }),
];

const KAKAO_COMMODITIES: Commodity[] = [
  {
    id: 'com_cocoa', code: 'CAC', name: { en: 'Cocoa', fr: 'Cacao' }, aliases: ['cacao', 'fèves'], hsCode: '1801.00', defaultUnitId: 'kg',
    allowedUnitIds: ['kg', 'bag', 't'], quality: [{ key: 'moisture', label: 'Humidité', max: 8, unit: '%' }, { key: 'mouldy', label: 'Moisies', max: 3, unit: '%' }],
    grades: ['Grade I', 'Grade II'], aggregatorThresholdKg: 3000, farmerMaxKg: 5000, eudrRelevant: true, lossTolerancePct: 0.3, color: '#7A3E12',
  },
  simple('com_cashew', 'CAJ', 'Cashew nuts', 'Noix de cajou', '#B7791F', { hsCode: '0801.31', grades: ['Standard'] }),
];

const pack = (commodityId: string, name: string, minKg: number, maxKg: number): PackagingProfile => ({
  id: `pk_${commodityId}`, commodityId, name, minKg, maxKg, tareKg: 0.5, tag: 'QR', mode: 'PER_BAG',
});

const ghsTiers = (provider: string, pct: number, capMinor: number): FeeTier[] => [
  { id: `${provider}_t1`, providerId: provider, minAmount: 0, maxAmount: 5_000, type: 'flat', value: 50, payer: 'company' },
  { id: `${provider}_t2`, providerId: provider, minAmount: 5_001, maxAmount: 1e12, type: 'percent', value: pct, cap: capMinor, payer: 'company' },
];

const xofTiers = (provider: string, pct: number, cap: number, payer: 'company' | 'payee'): FeeTier[] => [
  { id: `${provider}_t1`, providerId: provider, minAmount: 0, maxAmount: 5_000, type: 'flat', value: 100, payer },
  { id: `${provider}_t2`, providerId: provider, minAmount: 5_001, maxAmount: 1e12, type: 'percent', value: pct, cap, payer },
];

const providers = (ids: [string, number][], walletPrefix: string): PaymentProvider[] =>
  ids.map(([id, share]) => {
    const p = PROVIDER_CATALOG.find((x) => x.id === id)!;
    return { ...p, share, walletName: p.kind === 'MOBILE_MONEY' ? `${walletPrefix} ${p.name}` : p.walletName };
  });

const VITARA_EXPENSES: ExpenseType[] = [
  { id: 'ex_bag', name: 'Empty sack', basis: 'PER_BAG', defaultRate: { amountMinor: 450, currency: 'GHS' }, requiresWallet: false, requiresBagScan: true, triggersInbound: false },
  { id: 'ex_load', name: 'Loading', basis: 'PER_BAG', defaultRate: { amountMinor: 200, currency: 'GHS' }, requiresWallet: true, requiresBagScan: false, triggersInbound: false },
  { id: 'ex_tricycle', name: 'Tricycle transport', basis: 'PER_BAG', defaultRate: { amountMinor: 350, currency: 'GHS' }, requiresWallet: true, requiresBagScan: false, triggersInbound: false },
  { id: 'ex_kia', name: 'Kia transport', basis: 'PER_TRIP', defaultRate: { amountMinor: 35_000, currency: 'GHS' }, requiresWallet: true, requiresBagScan: false, triggersInbound: true },
  { id: 'ex_council', name: 'Council ticket', basis: 'PER_TRIP', defaultRate: { amountMinor: 2_000, currency: 'GHS' }, requiresWallet: false, requiresBagScan: false, triggersInbound: false },
  { id: 'ex_wh', name: 'Transport to warehouse', basis: 'PER_BAG', defaultRate: { amountMinor: 600, currency: 'GHS' }, requiresWallet: true, requiresBagScan: true, triggersInbound: true },
];

const KAKAO_EXPENSES: ExpenseType[] = [
  { id: 'ex_sac', name: 'Sac de jute', basis: 'PER_BAG', defaultRate: { amountMinor: 500, currency: 'XOF' }, requiresWallet: false, requiresBagScan: true, triggersInbound: false },
  { id: 'ex_charg', name: 'Chargement', basis: 'PER_BAG', defaultRate: { amountMinor: 150, currency: 'XOF' }, requiresWallet: true, requiresBagScan: false, triggersInbound: false },
  { id: 'ex_camion', name: 'Transport camion vers magasin', basis: 'PER_TRIP', defaultRate: { amountMinor: 60_000, currency: 'XOF' }, requiresWallet: true, requiresBagScan: false, triggersInbound: true },
];

const VITARA_AGENT_TYPES: AgentType[] = [
  { id: 'at_ceo', code: 'CEO', name: { en: 'Community Engagement Officer', fr: "Agent d'engagement communautaire" }, budgetEligible: true, mobileTiles: ['profiling', 'farmers', 'groups', 'buying', 'support', 'recovery', 'surveys', 'workshops', 'budget'] },
  { id: 'at_cons', code: 'CONS', name: { en: 'Conservation agent', fr: 'Agent de conservation' }, budgetEligible: true, mobileTiles: ['farmers', 'trees', 'plots', 'surveys', 'workshops', 'budget'] },
  { id: 'at_wh', code: 'WH', name: { en: 'Warehouse officer', fr: 'Magasinier' }, budgetEligible: false, mobileTiles: ['warehouse'] },
];

const KAKAO_AGENT_TYPES: AgentType[] = [
  { id: 'at_del', code: 'DEL', name: { en: 'Délégué', fr: 'Délégué' }, budgetEligible: false, mobileTiles: ['profiling', 'farmers', 'groups', 'buying', 'plots', 'surveys', 'recovery'] },
  { id: 'at_mag', code: 'MAG', name: { en: 'Warehouse officer', fr: 'Magasinier' }, budgetEligible: false, mobileTiles: ['warehouse'] },
];

const baseRules = {
  partialDisbursements: true, maxPartialCount: 3, debtPolicy: 'block' as const,
  evidence: { scalePhoto: true, voiceNote: true, gps: true, signature: true }, priceOverrideReasonRequired: true,
};

export function vitaraSettings(): OrgSettings {
  return {
    orgId: ORG.vitara,
    modules: allModules(true),
    terminology: {},
    locationLevels: [
      { id: 'region', label: { en: 'Region', fr: 'Région' } },
      { id: 'district', label: { en: 'District', fr: 'District' } },
      { id: 'community', label: { en: 'Community', fr: 'Communauté' } },
    ],
    zones: [],
    commodities: VITARA_COMMODITIES,
    units: DEFAULT_UNITS,
    packaging: [pack('com_shea', 'Shea jute sack', 75, 120), ...VITARA_COMMODITIES.slice(1).map((c) => pack(c.id, 'PP sack', 45, 105))],
    priceList: [],
    workflows: vitaraWorkflows(),
    numbering: VITARA_NUMBERING,
    paymentProviders: providers([['mtn_gh', 0.75], ['telecel_gh', 0.2], ['airteltigo_gh', 0.05], ['bank_gh', 0], ['cash', 0]], 'Vitara'),
    feeTiers: [...ghsTiers('mtn_gh', 1, 1_500), ...ghsTiers('telecel_gh', 1, 1_000), ...ghsTiers('airteltigo_gh', 0.75, 1_000)],
    taxPct: 0,
    buyingRules: {
      ...baseRules,
      sourcingModels: Object.fromEntries(VITARA_COMMODITIES.map((c) => [c.id, ['CASH_ADVANCE', 'DIRECT_PAYMENT']])),
      reconToleranceMinor: 500, reconTolerancePct: 0.5, writeOffLimitMinor: 20_000, debtMinimumMinor: 5_000, agentCashLimitMinor: 1_000_000,
    },
    loanTerms: VITARA_LOAN_TERMS,
    agentTypes: VITARA_AGENT_TYPES,
    expenseTypes: VITARA_EXPENSES,
    mobile: { otpLength: 4, minAppVersion: '3.8.0' },
    security: { sessionMinutes: 60 },
    makerChecker: true,
    bulkBatchSize: 20,
    landUnitId: 'acre',
  };
}

export function kakaoSettings(): OrgSettings {
  const modules = allModules(true);
  modules.weeklyBudgets = false;
  modules.allowances = false;
  return {
    orgId: ORG.kakao,
    modules,
    terminology: {
      en: { agent: 'Délégué', agents: 'Délégués', community: 'Village', communities: 'Villages', farmerGroup: 'Cooperative section', farmerGroups: 'Cooperative sections' },
      fr: { agent: 'Délégué', agents: 'Délégués', community: 'Village', communities: 'Villages', purchaseRequest: "Demande d'achat", purchaseRequests: "Demandes d'achat", farmerGroup: 'Section coopérative', farmerGroups: 'Sections coopératives' },
    },
    locationLevels: [
      { id: 'district', label: { en: 'District', fr: 'District' } },
      { id: 'region', label: { en: 'Region', fr: 'Région' } },
      { id: 'department', label: { en: 'Department', fr: 'Département' } },
      { id: 'village', label: { en: 'Village', fr: 'Village' } },
    ],
    zones: [],
    commodities: KAKAO_COMMODITIES,
    units: DEFAULT_UNITS,
    packaging: [pack('com_cocoa', 'Sac jute cacao', 60, 70), pack('com_cashew', 'Sac jute cajou', 75, 85)],
    priceList: [],
    workflows: kakaoWorkflows(),
    numbering: KAKAO_NUMBERING,
    paymentProviders: providers([['orange_ci', 0.6], ['wave_ci', 0.25], ['mtn_ci', 0.15], ['bank_ci', 0], ['cash', 0]], 'Kakao Ivoire'),
    feeTiers: [...xofTiers('orange_ci', 1, 5_000, 'company'), ...xofTiers('wave_ci', 1, 3_000, 'payee'), ...xofTiers('mtn_ci', 1.5, 5_000, 'company')],
    taxPct: 0,
    buyingRules: {
      ...baseRules,
      debtPolicy: 'deduct',
      sourcingModels: { com_cocoa: ['DIRECT_PAYMENT', 'CASH_ADVANCE'], com_cashew: ['CASH_ADVANCE'] },
      reconToleranceMinor: 2_500, reconTolerancePct: 0.3, writeOffLimitMinor: 50_000, debtMinimumMinor: 5_000, agentCashLimitMinor: 15_000_000,
    },
    loanTerms: { ...VITARA_LOAN_TERMS, interestType: 'simple', rate: 0.02, penalty: { type: 'none', trigger: 'onCashRepayment', rate: 0 }, rounding: 'nearest' },
    agentTypes: KAKAO_AGENT_TYPES,
    expenseTypes: KAKAO_EXPENSES,
    mobile: { otpLength: 6, minAppVersion: '3.8.0' },
    security: { sessionMinutes: 30 },
    makerChecker: true,
    bulkBatchSize: 25,
    landUnitId: 'ha',
  };
}

/** Companies without operations (platform, buyers) still get a settings object. */
export function minimalSettings(orgId: string, modulesOn: string[], landUnitId = 'ha'): OrgSettings {
  const base = vitaraSettings();
  const modules = allModules(false);
  for (const m of modulesOn) modules[m as keyof typeof modules] = true;
  return {
    ...base,
    orgId,
    modules,
    commodities: [],
    packaging: [],
    workflows: [],
    paymentProviders: [],
    feeTiers: [],
    agentTypes: [],
    expenseTypes: [],
    landUnitId,
  };
}
