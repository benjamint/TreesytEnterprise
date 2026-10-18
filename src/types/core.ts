// Key shapes from PRD section 11 (verbatim where specified).

export type Money = { amountMinor: number; currency: string };
export type Status<T extends string> = { value: T; since: string; by?: string };

export type Lang = 'en' | 'fr';
export type ISODate = string;
export type GPS = { lat: number; lng: number; accuracy?: number };

/** Fields shared by every company-owned record. */
export interface OrgEntity {
  id: string;
  orgId: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  roleIds: string[];
  permission: string;
  condition?: { field: string; op: '>' | '>=' | '<' | 'in' | 'aboveListPct'; value: unknown };
  parallel?: boolean;
  minApprovals?: number;
  allowEditAmount?: boolean;
  slaHours?: number;
  auto?: boolean;
}

export interface ApprovalRecord {
  stepId: string;
  userId: string;
  decision: 'APPROVED' | 'REJECTED' | 'HELD';
  comment?: string;
  amountOverride?: Money;
  at: string;
}

export interface LedgerEntry {
  date: string;
  type: 'PRINCIPAL' | 'INTEREST' | 'PENALTY' | 'REPAYMENT' | 'REFUND';
  amount: Money;
  balanceAfter: Money;
  note?: string;
}

export interface ActivityEvent {
  id: string;
  orgId: string;
  entity: string;
  entityId: string;
  key: string;
  params: Record<string, unknown>;
  actorId: string;
  at: string;
  gps?: { lat: number; lng: number };
  meta?: { device?: string };
}

/** Engine-owned progress of a record through its workflow definition. */
export interface WorkflowState {
  /** First step of the group currently waiting for decisions; null when finished. */
  currentStepId: string | null;
  /** Approvers per step in the current round (reset when a step is re-opened). */
  stepApprovals: Record<string, string[]>;
  heldAtStepId?: string | null;
  heldFromStatus?: string;
}
