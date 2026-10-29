import type { ApprovalRecord, Money, OrgEntity, WorkflowState } from './core';

/** Field team (PRD J1–J11, M11–M12): plans, budgets, retirements, carry-forwards, allowances, commissions, reports. */

/** The data a metric counts (PRD 8.5); each is read from the company's own records. */
export type MetricSource =
  | 'farmers' | 'communities' | 'groups' | 'purchases' | 'responses' | 'workshops' | 'attendance' | 'treeVisits'
  | 'plots' | 'seedlings' | 'nurseryRounds' | 'repayments' | 'manual';

export interface ActivityMetric {
  source: MetricSource;
  aggregate: 'count' | 'sum' | 'distinct';
  field?: string;
  filter?: { field: string; op: 'equals' | 'in' | 'gt' | 'lt'; value: unknown }[];
  attribution: 'plannedCommunities' | 'anywhere';
}

/** Activity catalogue entry (Settings → Field team). */
export interface FieldActivity {
  id: string;
  name: Partial<Record<'en' | 'fr', string>>;
  unit: string;
  needsCommunity: boolean;
  metric: ActivityMetric;
  active: boolean;
}

export type PlanStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface PlanActivity {
  activityId: string;
  /** Same target for everyone, unless overridden per agent. */
  target: number;
  perAgent?: Record<string, number>;
}

export interface WeeklyPlan extends OrgEntity {
  number: string;
  /** Monday of the week (YYYY-MM-DD). */
  weekStart: string;
  dates: string[];
  managerId: string;
  activities: PlanActivity[];
  assignees: { kind: 'team' | 'agentType' | 'agents'; ids: string[] };
  agentIds: string[];
  /** Communities each agent plans to visit (attribution for "planned communities" metrics). */
  communities: Record<string, string[]>;
  status: PlanStatus;
  version: number;
  history: { version: number; at: string; by: string; note?: string }[];
  publishedAt?: string;
  closedAt?: string;
}

export interface Trip {
  id: string;
  date: string;
  communityId: string;
  activities: { activityId: string; target: number }[];
  /** Cost per category (minor units). */
  costs: Record<string, number>;
}

export type BudgetPayStatus = 'UNPAID' | 'PROCESSING' | 'PAID' | 'ABSORBED';

export interface BudgetRequest extends OrgEntity {
  number: string;
  agentId: string;
  planId: string;
  weekStart: string;
  trips: Trip[];
  total: Money;
  /** Finance can override the amount with a reason. */
  approvedTotal?: Money;
  overrideReason?: string;
  deductions: { carryForwardId: string; amountMinor: number }[];
  net: Money;
  wallet: { providerId: string; number: string; name: string };
  status: string;
  approvals: ApprovalRecord[];
  wf: WorkflowState;
  /** 1 when an open agent report needs an extra approval step (PRD J10). */
  extraApproval: number;
  payStatus: BudgetPayStatus;
  paymentId?: string;
  paidAt?: string;
  retirementId?: string;
  device?: 'web' | 'mobile';
}

export type ReceiptStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Receipt {
  id: string;
  categoryId: string;
  amountMinor: number;
  date: string;
  file: string;
  status: ReceiptStatus;
  reason?: string;
  /** Possible duplicate (same amount and date in another receipt). */
  duplicateOf?: string;
  replaces?: string;
  at: string;
}

export type RetirementStatus = 'PENDING_SUBMISSION' | 'PENDING_REVIEW' | 'PENDING_RESUBMISSION' | 'AWAITING_REFUND' | 'RETIRED';

export interface Retirement extends OrgEntity {
  budgetId: string;
  agentId: string;
  gross: Money;
  receipts: Receipt[];
  unused?: { amountMinor: number; reason: string; at: string };
  refunds: { id: string; amountMinor: number; proof?: string; at: string; by: string }[];
  status: RetirementStatus;
  carryForwardId?: string;
  retiredAt?: string;
}

export type CarryForwardType = 'UNDER_SPEND' | 'PENALTY' | 'MANUAL';
export type CarryForwardStatus = 'PENDING' | 'PARTIAL' | 'APPLIED' | 'WAIVED';

export interface CarryForward extends OrgEntity {
  agentId: string;
  type: CarryForwardType;
  sourceBudgetId?: string;
  reason: string;
  amount: Money;
  remainingMinor: number;
  applications: { budgetId: string; amountMinor: number; at: string }[];
  status: CarryForwardStatus;
  /** Performance penalty details. */
  penalty?: { weekStart: string; achievementPct: number; bandId: string; penaltyPct: number; baseMinor: number };
  waiver?: { requestedBy: string; requestedAt: string; reason: string; approvedBy?: string; approvedAt?: string };
}

export interface PenaltyRun {
  id: string;
  orgId: string;
  weekStart: string;
  at: string;
  by: string;
  lines: { agentId: string; achievementPct: number; bandId?: string; penaltyPct: number; baseMinor: number; amountMinor: number; carryForwardId?: string }[];
}

/** Snapshot written by "Recompute week" (and the scheduled job). */
export interface AchievementRecord {
  id: string;
  orgId: string;
  planId: string;
  agentId: string;
  activityId: string;
  target: number;
  achieved: number;
  computedAt: string;
  /** Manual activities: entered by the supervisor. */
  manual?: { by: string; at: string };
}

export type AllowanceLineStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'PENDING' | 'PAID' | 'FAILED';

export interface AllowanceRun extends OrgEntity {
  number: string;
  typeId: string;
  period: { from: string; to: string };
  lines: { agentId: string; achievementPct: number; amountMinor: number; status: AllowanceLineStatus; paymentId?: string }[];
  status: 'PREVIEW' | 'APPROVED' | 'PAID';
  approvedBy?: string;
  approvedAt?: string;
  currency: string;
}

export type CommissionPeriodStatus = 'DRAFT' | 'IN_REVIEW' | 'CONFIRMED' | 'PAID';
export type CommissionLineStatus = 'PENDING' | 'FIRST_APPROVED' | 'APPROVED' | 'REJECTED' | 'ON_HOLD';

export interface CommissionItem {
  rateCardId: string;
  activityId: string;
  achieved: number;
  counted: number;
  unit: string;
  per: number;
  rate: Money;
  amount: Money;
  notes: { key: string; params: Record<string, unknown> }[];
}

export interface CommissionLine {
  id: string;
  agentId: string;
  items: CommissionItem[];
  total: Money;
  status: CommissionLineStatus;
  first?: { by: string; at: string };
  second?: { by: string; at: string };
  reason?: string;
  paymentId?: string;
  paid?: boolean;
}

export interface CommissionPeriod extends OrgEntity {
  number: string;
  name: string;
  from: string;
  to: string;
  /** Approvals are accepted only inside this window. */
  window: { opens: string; closes: string };
  status: CommissionPeriodStatus;
  lines: CommissionLine[];
  confirmedAt?: string;
  confirmedBy?: string;
  currency: string;
}

export type ReportStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface AgentReport extends OrgEntity {
  number: string;
  agentId: string;
  categoryId: string;
  reason: string;
  files: string[];
  status: ReportStatus;
  assigneeId?: string;
  dueDate?: string;
  responses: { by: string; at: string; text: string }[];
  resolution?: { comment: string; files: string[]; by: string; at: string };
}

export interface Geofence {
  id: string;
  orgId: string;
  communityId: string;
  kind: 'RADIUS' | 'POLYGON';
  radiusKm?: number;
  polygon?: [number, number][];
}
