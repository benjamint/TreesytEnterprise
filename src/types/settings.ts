import type { Lang, Money, WorkflowStep } from './core';

export type ModuleKey =
  | 'dashboard' | 'ai' | 'farmers' | 'dataQuality' | 'imports' | 'buying' | 'aggregators' | 'payments'
  | 'support' | 'recovery' | 'inventory' | 'dispatch' | 'salesContracts' | 'traceboard' | 'nurseries'
  | 'trees' | 'plots' | 'eudr' | 'carbon' | 'forms' | 'workshops' | 'fieldTeam' | 'weeklyBudgets'
  | 'allowances' | 'commissions' | 'reports' | 'notifications' | 'system';

export type TermKey =
  | 'agent' | 'agents' | 'community' | 'communities' | 'farmer' | 'farmers' | 'farmerGroup' | 'farmerGroups'
  | 'purchaseRequest' | 'purchaseRequests' | 'pre' | 'pres' | 'ticket' | 'warehouseOfficer' | 'supervisor';

export type Terminology = Partial<Record<Lang, Partial<Record<TermKey, string>>>>;

export interface LocationLevel {
  id: string;
  label: Partial<Record<Lang, string>>;
  codeLength?: number;
}

export interface Commodity {
  id: string;
  code: string;
  name: Partial<Record<Lang, string>>;
  aliases: string[];
  hsCode: string;
  defaultUnitId: string;
  allowedUnitIds: string[];
  quality: { key: string; label: string; min?: number; max?: number; unit: string }[];
  grades: string[];
  aggregatorThresholdKg: number;
  farmerMaxKg: number;
  eudrRelevant: boolean;
  lossTolerancePct: number;
  color: string;
}

export interface Unit {
  id: string;
  code: string;
  kind: 'mass' | 'area' | 'count';
  /** Factor to the base unit of its kind (kg, ha). Count units convert via packaging. */
  toBase: number;
}

export interface PackagingProfile {
  id: string;
  commodityId: string;
  name: string;
  minKg: number;
  maxKg: number;
  tareKg: number;
  tag: 'QR' | 'NFC' | 'NONE';
  mode: 'PER_BAG' | 'LOT';
}

export interface PriceListEntry {
  id: string;
  commodityId: string;
  zoneId: string;
  grade?: string;
  unitId: string;
  price: Money;
  tolerancePct: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface Zone {
  id: string;
  name: string;
  nodeIds: string[];
}

export type DocType =
  | 'purchaseRequest' | 'preExpense' | 'aggregatorPurchase' | 'aggregatorExpense' | 'supportRequest'
  | 'recoveryRequest' | 'inventoryRepayment' | 'warehouseExpense' | 'dispatchOrder' | 'salesContract'
  | 'weeklyBudget' | 'retirementReview' | 'monthlyAllowance' | 'commissionPeriod' | 'surveyPublish'
  | 'groupScoreReview' | 'userInvite' | 'plotVerification';

export interface WorkflowDefinition {
  id: string;
  docType: DocType;
  /** Status keys in display order. */
  statuses: string[];
  steps: WorkflowStep[];
  /** Status set once each step is approved (by step id). */
  stepStatus: Record<string, string>;
  initialStatus: string;
  approvedStatus: string;
  rejectedStatus: string;
  heldStatus: string;
  holdAllowed: boolean;
  rejectReasonRequired: boolean;
  /** Where a held record resumes: the step it was held at, or the step before. */
  resumeFrom: 'same' | 'previous';
  separation: { requesterCannotApprove: boolean; sameUserNotTwoSteps: boolean };
}

export type SequenceScope = 'company' | 'year' | 'month' | 'client' | 'agent' | 'community';

export interface NumberingPattern {
  docType: string;
  prefix: string;
  pattern: string;
  scope: SequenceScope;
}

export interface PaymentProvider {
  id: string;
  name: string;
  country: string;
  kind: 'MOBILE_MONEY' | 'BANK' | 'CASH';
  enabled: boolean;
  walletName: string;
  /** Number prefixes used to auto-detect the network from a wallet number. */
  prefixes: string[];
  share?: number;
}

export interface FeeTier {
  id: string;
  providerId: string;
  minAmount: number;
  maxAmount: number;
  type: 'percent' | 'flat';
  value: number;
  cap?: number;
  payer: 'company' | 'payee';
}

export interface LoanTerms {
  interestType: 'none' | 'simple' | 'compound';
  period: 'daily' | 'monthly';
  /** Rate per period as a fraction (0.05 = 5%). */
  rate: number;
  graceStarts: 'windowEnd' | 'disbursement';
  penalty: { type: 'none' | 'one-time-percent' | 'late-percent' | 'flat'; trigger: 'onCashRepayment' | 'onLate'; rate: number };
  waterfall: ('penalty' | 'interest' | 'principal')[];
  settlementTolerance: number;
  rounding: 'up' | 'nearest';
  maxCycles: number;
}

export interface AgentType {
  id: string;
  name: Partial<Record<Lang, string>>;
  code: string;
  budgetEligible: boolean;
  mobileTiles: string[];
}

export interface ExpenseType {
  id: string;
  name: string;
  basis: 'PER_BAG' | 'PER_TRIP' | 'PER_KG' | 'FLAT';
  defaultRate: Money;
  cap?: Money;
  requiresWallet: boolean;
  requiresBagScan: boolean;
  triggersInbound: boolean;
}

export interface BuyingRules {
  sourcingModels: Record<string, ('CASH_ADVANCE' | 'DIRECT_PAYMENT')[]>;
  partialDisbursements: boolean;
  maxPartialCount: number;
  reconToleranceMinor: number;
  reconTolerancePct: number;
  writeOffLimitMinor: number;
  debtPolicy: 'block' | 'warn' | 'deduct';
  debtMinimumMinor: number;
  evidence: { scalePhoto: boolean; voiceNote: boolean; gps: boolean; signature: boolean };
  priceOverrideReasonRequired: boolean;
  agentCashLimitMinor: number;
}

export interface OrgSettings {
  orgId: string;
  modules: Record<ModuleKey, boolean>;
  terminology: Terminology;
  locationLevels: LocationLevel[];
  zones: Zone[];
  commodities: Commodity[];
  units: Unit[];
  packaging: PackagingProfile[];
  priceList: PriceListEntry[];
  workflows: WorkflowDefinition[];
  numbering: NumberingPattern[];
  paymentProviders: PaymentProvider[];
  feeTiers: FeeTier[];
  taxPct: number;
  buyingRules: BuyingRules;
  loanTerms: LoanTerms;
  agentTypes: AgentType[];
  expenseTypes: ExpenseType[];
  mobile: { otpLength: number; minAppVersion: string };
  security: { sessionMinutes: number };
  makerChecker: boolean;
  bulkBatchSize: number;
  landUnitId: string;
}
