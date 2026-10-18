import type { AgentType, Commodity, ExpenseType, Lang, ModuleKey, NumberingPattern, OrgSettings, OrgType, PaymentProvider, WorkflowDefinition } from '@/types';
import { ALL_MODULE_KEYS, allModules } from '@/engines/permissions';
import { toMinor } from '@/engines/money';
import { COUNTRIES } from '@/data/catalogs/countries';
import { PROVIDER_CATALOG } from '@/data/catalogs/providers';
import {
  KAKAO_COMMODITIES, PR_STATUSES, VITARA_AGENT_TYPES, VITARA_COMMODITIES, VITARA_EXPENSES, VITARA_NUMBERING, pack, roleId, simple,
  vitaraSettings, vitaraWorkflows,
} from '@/data/seed/templates';

/**
 * Company templates for the add-company wizard and sign-up (PRD A3 step 4): start from the Vitara
 * template, blank, or a sector template (cocoa, cashew, shea, grains, coffee).
 */
export const TEMPLATE_KEYS = ['vitara', 'blank', 'cocoa', 'cashew', 'shea', 'grains', 'coffee'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Global commodity library the wizard picks from. */
export const COMMODITY_LIBRARY: Commodity[] = [
  ...VITARA_COMMODITIES,
  ...KAKAO_COMMODITIES,
  simple('com_coffee', 'COF', 'Coffee (green)', 'Café vert', '#4A3424', { hsCode: '0901.11', eudrRelevant: true, grades: ['Grade 1', 'Grade 2'], quality: [{ key: 'moisture', label: 'Moisture', max: 12.5, unit: '%' }] }),
  simple('com_sorghum', 'SOR', 'Sorghum', 'Sorgho', '#A0522D', { hsCode: '1007.90' }),
  simple('com_rice', 'RIC', 'Paddy rice', 'Riz paddy', '#E8D6A0', { hsCode: '1006.10' }),
];

export const TEMPLATE_COMMODITIES: Record<TemplateKey, string[]> = {
  vitara: VITARA_COMMODITIES.map((c) => c.id),
  blank: [],
  cocoa: ['com_cocoa'],
  cashew: ['com_cashew'],
  shea: ['com_shea'],
  grains: ['com_maize', 'com_soy', 'com_millet', 'com_sorghum'],
  coffee: ['com_coffee'],
};

export type ApprovalChoice = 'one' | 'two' | 'threeThreshold';

export interface CompanyDraft {
  description: string;
  name: string;
  legalName: string;
  type: OrgType;
  countries: string[];
  currency: string;
  language: Lang;
  timezone: string;
  weekStart: 0 | 1 | 6;
  planId: string;
  modules: ModuleKey[];
  template: TemplateKey;
  commodityIds: string[];
  approvals: ApprovalChoice;
  thresholdMajor: number;
  requesterCannotApprove: boolean;
  admins: { name: string; email: string }[];
}

export function countryDefaults(code: string) {
  const c = COUNTRIES.find((x) => x.code === code);
  return { currency: c?.currency ?? 'USD', language: c?.defaultLanguage ?? 'en', timezone: c?.timezone ?? 'UTC' };
}

export function emptyDraft(): CompanyDraft {
  return {
    description: '', name: '', legalName: '', type: 'SUPPLIER', countries: ['GH'], currency: 'GHS', language: 'en', timezone: 'Africa/Accra',
    weekStart: 1, planId: 'plan_growth', modules: [], template: 'blank', commodityIds: [], approvals: 'two', thresholdMajor: 50_000,
    requesterCannotApprove: true, admins: [{ name: '', email: '' }],
  };
}

/** Plan modules expanded ('*' = every module). */
export function planModules(planModuleKeys: string[]): ModuleKey[] {
  return planModuleKeys.includes('*') ? [...ALL_MODULE_KEYS] : (planModuleKeys.filter((m) => (ALL_MODULE_KEYS as string[]).includes(m)) as ModuleKey[]);
}

function prWorkflow(orgId: string, choice: ApprovalChoice, thresholdMinor: number, requesterCannotApprove: boolean): WorkflowDefinition {
  const steps: WorkflowDefinition['steps'] = [{ id: 'mgmt', name: 'Operations approval', roleIds: [], permission: 'purchaseRequests.approveManagement', slaHours: 24 }];
  const stepStatus: Record<string, string> = { mgmt: 'MANAGEMENT_APPROVED' };
  if (choice === 'threeThreshold') {
    steps.push({ id: 'director', name: 'Director approval', roleIds: [roleId(orgId, 'companyAdmin')], permission: 'purchaseRequests.approveManagement', condition: { field: 'total', op: '>', value: thresholdMinor } });
    stepStatus.director = 'OPS_APPROVED';
  }
  if (choice !== 'one') {
    steps.push({ id: 'fin', name: 'Finance approval', roleIds: [], permission: 'purchaseRequests.approveFinance', allowEditAmount: true, slaHours: 24 });
    stepStatus.fin = 'FINANCE_APPROVED';
  }
  return {
    id: `wf_${orgId}_pr`, docType: 'purchaseRequest', statuses: PR_STATUSES, steps, stepStatus, initialStatus: 'PENDING',
    approvedStatus: choice === 'one' ? 'MANAGEMENT_APPROVED' : 'FINANCE_APPROVED', rejectedStatus: 'NOT_APPROVED', heldStatus: 'ON_HOLD',
    holdAllowed: true, rejectReasonRequired: true, resumeFrom: 'same', separation: { requesterCannotApprove, sameUserNotTwoSteps: requesterCannotApprove },
  };
}

function genericWorkflows(orgId: string, d: CompanyDraft): WorkflowDefinition[] {
  const s = { requesterCannotApprove: d.requesterCannotApprove, sameUserNotTwoSteps: d.requesterCannotApprove };
  return [
    prWorkflow(orgId, d.approvals, toMinor(d.thresholdMajor, d.currency), d.requesterCannotApprove),
    {
      id: `wf_${orgId}_pre`, docType: 'preExpense', statuses: ['PENDING', 'LEVEL_1_APPROVED', 'APPROVED', 'REJECTED', 'ON_HOLD'],
      steps: [
        { id: 'l1', name: 'Level 1', roleIds: [], permission: 'expenses.approveLevel1', auto: true },
        { id: 'fin', name: 'Finance approval', roleIds: [], permission: 'expenses.approveLevel4' },
      ],
      stepStatus: { l1: 'LEVEL_1_APPROVED', fin: 'APPROVED' }, initialStatus: 'PENDING', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED',
      heldStatus: 'ON_HOLD', holdAllowed: true, rejectReasonRequired: true, resumeFrom: 'same', separation: s,
    },
    {
      id: `wf_${orgId}_acs`, docType: 'aggregatorPurchase', statuses: ['PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'],
      steps: [{ id: 'ops', name: 'Operations approval', roleIds: [], permission: 'aggregators.approve' }],
      stepStatus: { ops: 'APPROVED' }, initialStatus: 'PENDING', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED', heldStatus: 'ON_HOLD',
      holdAllowed: false, rejectReasonRequired: true, resumeFrom: 'same', separation: s,
    },
  ];
}

const GENERIC_AGENT_TYPES: AgentType[] = [
  { id: 'at_field', code: 'FLD', name: { en: 'Field agent', fr: 'Agent terrain' }, budgetEligible: true, mobileTiles: ['profiling', 'farmers', 'groups', 'buying', 'surveys', 'workshops'] },
  { id: 'at_wh', code: 'WH', name: { en: 'Warehouse officer', fr: 'Magasinier' }, budgetEligible: false, mobileTiles: ['warehouse'] },
];

function genericExpenses(currency: string): ExpenseType[] {
  const m = (major: number) => ({ amountMinor: toMinor(major, currency), currency });
  const k = currency === 'XOF' ? 100 : 1;
  return [
    { id: 'ex_bag', name: 'Empty sack', basis: 'PER_BAG', defaultRate: m(4 * k), requiresWallet: false, requiresBagScan: true, triggersInbound: false },
    { id: 'ex_load', name: 'Loading', basis: 'PER_BAG', defaultRate: m(2 * k), requiresWallet: true, requiresBagScan: false, triggersInbound: false },
    { id: 'ex_truck', name: 'Transport to warehouse', basis: 'PER_TRIP', defaultRate: m(300 * k), requiresWallet: true, requiresBagScan: false, triggersInbound: true },
  ];
}

function numberingFor(template: TemplateKey): NumberingPattern[] {
  if (template === 'vitara') return VITARA_NUMBERING.map((p) => ({ ...p }));
  return VITARA_NUMBERING.map((p) => (p.docType === 'farmerId' ? { ...p, pattern: '{orgCode}-{seq:5}', scope: 'company' as const } : { ...p }));
}

function providersFor(country: string): PaymentProvider[] {
  const list = PROVIDER_CATALOG.filter((p) => p.country === country || p.country === '*');
  const mm = list.filter((p) => p.kind === 'MOBILE_MONEY');
  return list.map((p) => ({ ...p, share: p.kind === 'MOBILE_MONEY' ? 1 / mm.length : 0 }));
}

/** Build a new company's settings from a template and the wizard answers. */
export function buildCompanySettings(orgId: string, d: CompanyDraft): OrgSettings {
  const base = vitaraSettings();
  const country = COUNTRIES.find((c) => c.code === d.countries[0]);
  const modules = allModules(false);
  for (const m of d.modules) modules[m] = true;
  for (const core of ['dashboard', 'reports', 'notifications', 'system'] as ModuleKey[]) modules[core] = true;
  const commodities = COMMODITY_LIBRARY.filter((c) => d.commodityIds.includes(c.id));
  const providers = providersFor(d.countries[0] ?? 'GH');
  const isVitara = d.template === 'vitara';
  return {
    ...base,
    orgId,
    modules,
    terminology: {},
    locationLevels: (country?.locationLevels ?? [{ en: 'Region', fr: 'Région' }, { en: 'Community', fr: 'Communauté' }]).map((l, i) => ({ id: `level_${i}`, label: l })),
    zones: [],
    commodities,
    packaging: commodities.map((c) => (c.id === 'com_shea' ? pack(c.id, 'Shea jute sack', 75, 120) : c.id === 'com_cocoa' ? pack(c.id, 'Cocoa jute sack', 60, 70) : pack(c.id, 'PP sack', 45, 100))),
    priceList: [],
    workflows: isVitara ? vitaraWorkflows().map((w) => ({ ...w, id: `${w.id}_${orgId}` })) : genericWorkflows(orgId, d),
    numbering: numberingFor(d.template),
    paymentProviders: providers,
    feeTiers: providers
      .filter((p) => p.kind === 'MOBILE_MONEY')
      .map((p) => ({ id: `${p.id}_t1`, providerId: p.id, minAmount: 0, maxAmount: 1e12, type: 'percent' as const, value: 1, cap: toMinor(d.currency === 'XOF' ? 5000 : 15, d.currency), payer: 'company' as const })),
    buyingRules: {
      ...base.buyingRules,
      sourcingModels: Object.fromEntries(commodities.map((c) => [c.id, ['CASH_ADVANCE', 'DIRECT_PAYMENT']])),
      reconToleranceMinor: toMinor(d.currency === 'XOF' ? 2500 : 5, d.currency),
      writeOffLimitMinor: toMinor(d.currency === 'XOF' ? 50000 : 200, d.currency),
      debtMinimumMinor: toMinor(d.currency === 'XOF' ? 5000 : 50, d.currency),
      agentCashLimitMinor: toMinor(d.currency === 'XOF' ? 5_000_000 : 10_000, d.currency),
    },
    agentTypes: isVitara ? VITARA_AGENT_TYPES : GENERIC_AGENT_TYPES,
    expenseTypes: isVitara ? VITARA_EXPENSES.map((e) => ({ ...e, defaultRate: { ...e.defaultRate, currency: d.currency } })) : genericExpenses(d.currency),
    security: { ...base.security, sso: { enabled: false, protocol: 'SAML', domain: '', idpName: '' }, twoFactorRoles: [] },
    landUnitId: isVitara ? 'acre' : 'ha',
  } as OrgSettings;
}
