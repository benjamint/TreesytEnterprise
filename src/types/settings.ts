import type { Lang, Money, WorkflowStep } from './core';
import type { QualityRule } from '@/engines/rules';
import type { NotificationRule } from '@/engines/notify';
import type { MessageTemplate } from '@/engines/templates';

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
  /** Counted in farmer and community scores. */
  inScoring?: boolean;
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
  /** Stored server-side in the full product; the prototype keeps masked demo values. */
  credentials?: { merchantId: string; apiKey: string };
  limits?: { perPaymentMinor: number; dailyMinor: number };
  /** Charge for the payee to cash out, added on top when "include withdrawal charges" is ticked. */
  withdrawal?: { type: 'percent' | 'flat'; value: number };
}

export interface ExtraCharge {
  id: string;
  name: string;
  amountMinor: number;
  payer: 'company' | 'payee';
  enabled: boolean;
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
  /** Which records an agent of this type sees: their own, their assigned areas, or everything. */
  visibility?: 'OWN' | 'AREAS' | 'ALL';
  requiredFields?: string[];
  scoreModel?: string;
  rateCard?: string;
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
  /** Where the line can be used: farmer-buying PREs, aggregator expenses (ACSPRE), or both. Default PRE. */
  appliesTo?: ('PRE' | 'ACSPRE')[];
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

export type MovementType = 'INBOUND' | 'TRANSFER' | 'STORAGE';

export interface InventoryRules {
  /** Allowed weight loss per commodity and movement type, in percent. */
  tolerances: { commodityId: string; movement: MovementType; pct: number }[];
  /** Allowed difference between transfer-out and transfer-in weights, in percent. */
  transferBoundsPct: number;
  autoWriteOff: boolean;
  stockCount: { frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY'; basis: 'FULL' | 'CYCLE'; blind: boolean };
  liability: { payer: 'AGENT' | 'TRANSPORTER' | 'COMPANY'; priceBasis: 'PURCHASE' | 'LIST'; includeLogistics: boolean };
  /** Warehouse expense types (PRD H5). */
  expenseTypes?: { id: string; name: Partial<Record<Lang, string>>; basis: 'PER_BAG' | 'PER_KG' | 'FLAT'; defaultRateMinor: number }[];
}

export type ImpactKpi = 'womenShare' | 'childrenPerFarmer' | 'treesPlanted' | 'plotsMapped' | 'eudr';

/** Sales contracts and dispatch (PRD H6–H7): terms, packaging, templates, what buyers see. */
export interface SalesSettings {
  paymentTerms: { id: string; name: Partial<Record<Lang, string>>; instalments: { pct: number; trigger: 'SIGNATURE' | 'DELIVERY' | 'AFTER_DELIVERY'; days: number }[] }[];
  packaging: { id: string; name: Partial<Record<Lang, string>> }[];
  templates: { id: string; name: string; commodityId: string; unitId: string; paymentTermId: string; packagingId: string; tolerancePct: number; deliveryPoint: string; clauses: string }[];
  impactKpis: ImpactKpi[];
  /** Certifications shown to buyers on Traceboard. */
  certifications: string[];
  /** Days before a shipment window ends when an open contract is flagged. */
  overdueAlertDays: number;
}

export interface SupportType {
  id: string;
  name: Partial<Record<Lang, string>>;
  code?: string;
  kind: 'CASH' | 'INPUT' | 'SERVICE';
  subTypes: string[];
  groupScoring: boolean;
  recoverable: boolean;
  maxAmountMinor: number;
  enabled: boolean;
  /** What the amount is measured in on each farmer line. */
  unit?: 'MONEY' | 'ACRES' | 'HA' | 'BAGS';
  needsProvider?: boolean;
  payout?: 'GROUP_WALLET' | 'FARMER_WALLET' | 'SUPPLIER' | 'IN_KIND';
  evidence?: { leaderVoice: boolean; witnessVoice: boolean; agreement: boolean; thumbprints: boolean; photo: boolean };
}

export interface SupportSettings {
  types: SupportType[];
  abilityToPay: string[];
  recoveryWindowDays: number;
  repaymentModes: ('CASH' | 'PRODUCE' | 'MIXED')[];
  blockOnDebt: boolean;
  minGroupScore: number;
  /** Activating a recovery creates a linked direct-payment purchase request (for excess produce). */
  linkPurchaseRequest?: boolean;
  /** Recovery experience question set (PRD F4). */
  feedback?: { experience: string[]; lendAgain: boolean };
}

export interface FieldTeamSettings {
  plan: { minDays: number; maxDays: number; planAheadWeeks: number };
  reportingLevels: number;
  costCategories: { id: string; name: string; maxPerDayMinor: number; maxPerWeekMinor: number; receiptRequired: boolean }[];
  /** Achievement bands (percent of plan) and the penalty applied to next week's budget. */
  penaltyBands: { id: string; fromPct: number; toPct: number; penaltyPct: number }[];
  carryForward: boolean;
  allowanceTypes: { id: string; name: string; amountMinor: number; frequency: 'WEEKLY' | 'MONTHLY' }[];
  unusedReasons: string[];
  issueCategories: { id: string; name: string; consequence: 'NOTE' | 'WARNING' | 'PENALTY' | 'SUSPENSION' }[];
}

/** Settings → Forms: which form is the profile form for each kind of record. */
export type FormBindingKey =
  | 'farmer' | 'community' | 'farmerGroup' | 'nursery' | 'plot' | 'plotMonitoring' | 'treeMonitoring'
  | 'nurseryMonitoring' | 'workshopFeedback' | 'recoveryFeedback' | 'agentReport';


export interface Biometrics {
  thumbprint: boolean;
  consentType: 'AUDIO' | 'SIGNATURE' | 'TICK';
  consentText: Partial<Record<Lang, string>>;
  nfcCards: boolean;
  cardKeyRotatedAt: string;
}

export interface Messaging {
  sms: { country: string; provider: string; senderId: string; enabled: boolean }[];
  otpExpiryMinutes: number;
  emailDomain: string;
  emailSender: string;
  domainVerified: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: string[];
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface WebhookDelivery {
  id: string;
  at: string;
  event: string;
  status: number;
  ms: number;
}

export interface Webhook {
  id: string;
  event: string;
  url: string;
  secret: string;
  enabled: boolean;
  deliveries: WebhookDelivery[];
}

export type RetentionKey = 'syncLogs' | 'payloads' | 'audio' | 'photos' | 'activity';

export interface PriceChange {
  id: string;
  entryId: string;
  at: string;
  by: string;
  fromMinor: number;
  toMinor: number;
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
  mobile: {
    otpLength: number;
    minAppVersion: string;
    loginMethod: 'PHONE_SMS' | 'PHONE_PIN' | 'EMAIL';
    offline: { maxDays: number; maxRecords: number; maxMediaMb: number };
  };
  security: {
    sessionMinutes: number;
    passwordPolicy: { minLength: number; requireNumber: boolean; requireSymbol: boolean; requireMixedCase: boolean };
    /** Role templates that must use 2-step sign-in. */
    twoFactorRoles: string[];
    sso: { enabled: boolean; protocol: 'SAML' | 'OIDC'; domain: string; idpName: string; metadata?: string };
    ipAllowList: string[];
  };
  makerChecker: boolean;
  /** Payments at or above this amount need a checker (0 = every payment). */
  makerCheckerMinMinor: number;
  bulkBatchSize: number;
  landUnitId: string;
  /** Sub-feature switches inside modules (Settings → Plan & modules). */
  features: Record<string, boolean>;
  extraCharges: ExtraCharge[];
  pricing: { changeApproval: boolean; premiums: { id: string; name: string; pct: number }[]; history: PriceChange[] };
  inventoryRules: InventoryRules;
  sales: SalesSettings;
  support: SupportSettings;
  fieldTeam: FieldTeamSettings;
  qualityRules: QualityRule[];
  formBindings: Partial<Record<FormBindingKey, string>>;
  biometrics: Biometrics;
  notificationRules: NotificationRule[];
  templates: MessageTemplate[];
  messaging: Messaging;
  integrations: { apiKeys: ApiKey[]; webhooks: Webhook[]; accounting: 'NONE' | 'XERO' | 'QUICKBOOKS' | 'SAGE' };
  privacy: { retentionDays: Record<RetentionKey, number>; exportRequestedAt?: string; deletionRequestedAt?: string };
}
