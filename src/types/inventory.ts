import type { ApprovalRecord, Money, OrgEntity, WorkflowState } from './core';

/** Warehouses, receiving, discrepancies, transfers, stock counts and warehouse expenses (PRD H1–H5). */

export type BagReceipt = 'ORIGINAL' | 'MISSING' | 'REPLACED' | 'TOP_UP';

export interface InboundBag {
  code: string;
  expectedKg: number;
  /** Set when received. */
  status?: BagReceipt;
  receivedKg?: number;
  /** New tag when the bag arrived with a replaced tag. */
  newCode?: string;
}

export type InboundStatus = 'PENDING' | 'CONFIRMED' | 'DISCREPANCY' | 'NEEDS_RESOLUTION' | 'REFUND_SUBMITTED' | 'RESOLVED';

/** An expected delivery and, once received, its receipt. */
export interface Inbound extends OrgEntity {
  number: string;
  warehouseId: string;
  source: { kind: 'PRE' | 'TRANSFER' | 'MANUAL'; preId?: string; requestId?: string; transferId?: string; fromWarehouseId?: string };
  agentId?: string;
  commodityId: string;
  bags: InboundBag[];
  expectedKg: number;
  receivedKg?: number;
  status: InboundStatus;
  received?: { at: string; by: string; device: 'web' | 'mobile'; note?: string };
}

export type DiscrepancyResolution = 'BAG_RETURNED' | 'TAG_REPLACED' | 'WEIGHT_RETURNED' | 'PAID_BY_AGENT' | 'WRITTEN_OFF';

export interface Discrepancy extends OrgEntity {
  inboundId: string;
  warehouseId: string;
  agentId?: string;
  commodityId: string;
  bagCode: string;
  type: 'MISSING' | 'WEIGHT';
  expectedKg: number;
  receivedKg: number;
  varianceKg: number;
  variancePct: number;
  status: 'OPEN' | 'AUTO_WRITTEN_OFF' | 'RESOLVED';
  /** Kg still unaccounted for (top-ups reduce it oldest first). */
  openKg: number;
  resolution?: { type: DiscrepancyResolution; at: string; by: string; note?: string; kg?: number; ref?: string };
  /** Top-up bags allocated to this discrepancy. */
  allocations?: { bagCode: string; kg: number; at: string }[];
}

/** The agent pays back what was lost (PRD H2 agent repayment). */
export interface AgentRepayment extends OrgEntity {
  number: string;
  inboundId: string;
  agentId: string;
  discrepancyIds: string[];
  expected: { lostKg: number; pricePerKg: Money; produce: Money; logistics: Money; total: Money };
  submitted: { amount: Money; method: 'MOMO' | 'CASH' | 'BANK'; reference?: string; proof?: string; at: string; by: string; device: 'web' | 'mobile' };
  status: 'SUBMITTED' | 'APPROVED' | 'PARTIAL' | 'REJECTED';
  review?: { approved: Money; balance: Money; reason?: string; by: string; at: string };
}

export type MovementKind = 'IN' | 'OUT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT' | 'WRITE_OFF' | 'RETURN';

export interface StockMovement {
  id: string;
  orgId: string;
  warehouseId: string;
  at: string;
  kind: MovementKind;
  commodityId: string;
  bags: number;
  kg: number;
  /** Stock (kg) at the warehouse before and after. */
  before: number;
  after: number;
  ref: string;
  refId?: string;
  by: string;
}

/** Bags leaving a warehouse: to dispatch, or to another warehouse. */
export interface Transfer extends OrgEntity {
  number: string;
  kind: 'OUTBOUND' | 'TRANSFER';
  fromWarehouseId: string;
  toWarehouseId?: string;
  receivingOfficerId?: string;
  commodityId: string;
  bagCodes: string[];
  sentKg: number;
  receivedKg?: number;
  /** The receipt at the destination, for transfers. */
  inboundId?: string;
  /** The dispatch order an outbound was loaded on. */
  dispatchId?: string;
  status: 'DISPATCHED' | 'TRANSFER_PENDING' | 'TRANSFER_COMPLETE';
  /** Set when the weight received is further below the weight sent than the company allows. */
  outOfBounds?: { lossPct: number; boundPct: number };
  device?: 'web' | 'mobile';
  note?: string;
}

export interface StockCount extends OrgEntity {
  number: string;
  warehouseId: string;
  scheduledFor: string;
  status: 'SCHEDULED' | 'RECONCILED' | 'INCONSISTENT';
  expected?: { bags: number; kg: number };
  counted?: { bags: number; kg: number; codes: string[]; weighed: Record<string, number>; at: string; by: string; device: 'web' | 'mobile'; photos: string[] };
  /** Expected but not found, found but not expected. */
  missingCodes?: string[];
  extraCodes?: string[];
  adjustment?: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; kg: number; reason: string; requestedBy: string; at: string; reviewedBy?: string; reviewedAt?: string; note?: string };
}

export interface WarehouseExpenseLine {
  typeId: string;
  basis: 'PER_BAG' | 'PER_KG' | 'FLAT';
  quantity: number;
  rate: Money;
  amount: Money;
  payee: { name: string; providerId: string; number: string };
  paid?: boolean;
}

export interface WarehouseExpense extends OrgEntity {
  number: string;
  warehouseId: string;
  description?: string;
  lines: WarehouseExpenseLine[];
  total: Money;
  status: string;
  wf?: WorkflowState;
  approvals: ApprovalRecord[];
  paymentStatus: 'PENDING' | 'PARTIAL' | 'FULL' | 'REJECTED';
  disbursements: { id: string; amount: Money; method: 'MOMO' | 'MANUAL'; at: string; by: string; paymentId?: string; proof?: string; lineIndex?: number }[];
  device?: 'web' | 'mobile';
}
