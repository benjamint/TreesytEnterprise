import type { ApprovalRecord, Money, OrgEntity, WorkflowState } from './core';

export type SourcingModel = 'CASH_ADVANCE' | 'DIRECT_PAYMENT';

export interface Disbursement {
  id: string;
  amount: Money;
  weightKg?: number;
  method: 'MOMO' | 'MANUAL';
  at: string;
  by: string;
  paymentId?: string;
}

export interface RiskFlag {
  key: 'priceAboveList' | 'agentCashHigh' | 'agentFlagged' | 'manySameDay';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  params: Record<string, unknown>;
}

export interface PurchaseRequest extends OrgEntity {
  number: string;
  agentId: string;
  communityId: string;
  commodityId: string;
  grade?: string;
  unitId: string;
  volume: number;
  plannedDate: string;
  unitPrice: Money;
  listPrice: Money;
  variancePct: number;
  total: Money;
  sourcingModel: SourcingModel;
  status: string;
  wf: WorkflowState;
  approvals: ApprovalRecord[];
  disbursements: Disbursement[];
  disbursementStatus: 'NONE' | 'PARTIAL' | 'FULL';
  fundsReceived: boolean;
  reconciliationStatus: 'OPEN' | 'FULFILLED' | 'OVERPAID' | 'REFUND_AGENT' | 'RECEIVE_REFUND' | 'RECONCILED';
  riskFlags: RiskFlag[];
  notes?: string;
  archived: boolean;
}

/** PRD section 11 shape, verbatim, plus date/community denormalised for lists. */
export interface Purchase {
  id: string; orgId: string; number: string; requestId: string; farmerId: string; agentId: string;
  commodityId: string; quantity: number; unitId: string; unitPrice: Money; amount: Money; paidToFarmer: Money;
  bagCodes: string[]; consolidationRef?: string; plotId?: string;
  evidence: { scalePhoto?: string; voiceNote?: string; gps?: { lat: number; lng: number; accuracy: number }; signature?: string };
  paymentStatus: 'NOT_PAID' | 'PENDING' | 'PAID' | 'FAILED'; deductedForLoan?: Money; syncedFrom?: 'MOBILE' | 'WEB'; createdAt: string;
  communityId: string;
}

export interface Bag {
  id: string;
  orgId: string;
  code: string;
  commodityId: string;
  weightKg: number;
  status: 'IN_STOCK' | 'IN_TRANSIT' | 'OUT_OF_STOCK' | 'REPLACED' | 'WITH_AGENT';
  warehouseId?: string;
  purchaseIds: string[];
}

export interface ExpenseLine {
  expenseTypeId: string;
  quantity: number;
  rate: Money;
  amount: Money;
}

export interface PreExpense extends OrgEntity {
  number: string;
  requestId: string;
  agentId: string;
  bags: number;
  costDiscussed: boolean;
  lines: ExpenseLine[];
  total: Money;
  payee: { name: string; providerId: string; number: string };
  status: string;
  wf: WorkflowState;
  approvals: ApprovalRecord[];
  paymentStatus: 'NOT_PAID' | 'PENDING' | 'PAID' | 'FAILED';
}

export interface Supplier extends OrgEntity {
  name: string;
  kind: 'INDIVIDUAL' | 'COMPANY';
  phone: string;
  address: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'BLOCKED';
  payout: { method: 'MOMO' | 'BANK'; providerOrBank: string; number: string };
}

export interface AggregatorPurchase extends OrgEntity {
  number: string;
  poNumber: string;
  supplierId: string;
  commodityId: string;
  plannedDate: string;
  weightPerBagKg: number;
  expectedBags: number;
  expectedKg: number;
  unitPrice: Money;
  total: Money;
  dealCurrency: string;
  exchangeRate: number;
  includesPre: boolean;
  status: string;
  wf: WorkflowState;
  approvals: ApprovalRecord[];
  orderStatus: 'NONE' | 'IN_TRANSIT' | 'DELIVERED';
  paymentStatus: 'NONE' | 'FULFILLED' | 'RECEIVE_REFUND' | 'REFUND_SUPPLIER' | 'RECONCILED';
}
