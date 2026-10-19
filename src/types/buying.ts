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
  /** Reason given when the unit price is set outside the list tolerance. */
  overrideReason?: string;
  priceHistory?: { at: string; by: string; fromMinor: number; toMinor: number; reason?: string }[];
  rateConfirmedAt?: string;
  ticketActivatedAt?: string;
  fundsReceivedAt?: string;
  /** Agent returns unspent cash (proof, or a simulated mobile-money collection). */
  refunds?: { id: string; amount: Money; method: 'MANUAL' | 'MOMO_COLLECT'; at: string; by: string; note?: string; proof?: string }[];
  /** The company pays the agent the difference when they bought more than they were given. */
  topUps?: { id: string; amount: Money; at: string; by: string; paymentId?: string }[];
  writeOffs?: { id: string; amount: Money; reason: string; at: string; by: string }[];
  reconciledAt?: string;
  reconciledBy?: string;
  /** Matched automatically when the gap is within the company tolerance. */
  autoMatched?: boolean;
  receipt?: { signature: string; signedAt: string };
  /** Created by a recovery activation: excess produce bought from farmers repaying a loan. */
  recoveryRequestId?: string;
  /** Staff member who keyed it on the web for the agent. */
  enteredBy?: string;
}

/** PRD section 11 shape, verbatim, plus date/community denormalised for lists. */
export interface Purchase {
  id: string; orgId: string; number: string; requestId: string; farmerId: string; agentId: string;
  commodityId: string; quantity: number; unitId: string; unitPrice: Money; amount: Money; paidToFarmer: Money;
  bagCodes: string[]; consolidationRef?: string; plotId?: string;
  evidence: { scalePhoto?: string; voiceNote?: string; gps?: { lat: number; lng: number; accuracy: number }; signature?: string };
  paymentStatus: 'NOT_PAID' | 'PENDING' | 'PAID' | 'FAILED'; deductedForLoan?: Money; syncedFrom?: 'MOBILE' | 'WEB'; createdAt: string;
  communityId: string;
  /** Payout wallet for direct payment when it differs from the farmer's phone (edit before payment starts). */
  wallet?: { providerId: string; number: string; name: string };
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
  /** Kg each purchase put in this bag (several farmers share a consolidated bag). */
  contributions?: { purchaseId: string; kg: number }[];
  /** Purchase → PRE → inbound → transfer → dispatch. */
  history?: { at: string; event: 'PURCHASED' | 'PRE' | 'INBOUND' | 'TRANSFER' | 'DISPATCH' | 'REPLACED'; ref: string; by?: string; note?: string }[];
  replacement?: { oldCode: string; newCode: string; oldKg: number; newKg: number; by: string; at: string; reason: string };
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
  bagCodes?: string[];
  disbursement?: { method: 'MOMO' | 'MANUAL'; at: string; by: string; paymentId?: string; proof?: string };
  /** Expected delivery created at the warehouse when an expense type triggers inbound. */
  expectedDelivery?: { warehouseId: string; bags: number; createdAt: string };
}

export interface Supplier extends OrgEntity {
  name: string;
  kind: 'INDIVIDUAL' | 'COMPANY';
  phone: string;
  address: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'BLOCKED';
  payout: { method: 'MOMO' | 'BANK'; providerOrBank: string; number: string; accountName?: string };
  contactPerson?: string;
  email?: string;
  /** KYC: ID type and number (the documents themselves are record documents). */
  idType?: string;
  idNumber?: string;
  approvedBy?: string;
  approvedAt?: string;
  blockedReason?: string;
}

/** Truck loading for an aggregator purchase (PRD D4): sets the order In transit. */
export interface AggDelivery { driver: string; contact: string; plate: string; bags: number; kg: number; waybill?: string; at: string; by: string }
/** Proof of delivery at the destination: sets the order Delivered and computes the result. */
export interface AggProof { customer: string; bags: number; kg: number; unitPrice: Money; weighbridge?: string; invoice?: string; qualityReport?: string; at: string; by: string }
/**
 * Settling a gap. RECEIVE: the supplier owes the company — in goods (a new PO with bags and kg)
 * or money. SUPPLIER: the company pays the supplier what it still owes, with proof.
 */
export interface AggRefund { id: string; kind: 'RECEIVE' | 'SUPPLIER'; method: 'GOODS' | 'MONEY'; amount?: Money; poNumber?: string; bags?: number; kg?: number; proof?: string; note?: string; at: string; by: string }

export interface AggregatorPurchase extends OrgEntity {
  number: string;
  poNumber: string;
  supplierId: string;
  commodityId: string;
  plannedDate: string;
  weightPerBagKg: number;
  expectedBags: number;
  expectedKg: number;
  /** Price per kg and total, in the deal currency. */
  unitPrice: Money;
  total: Money;
  dealCurrency: string;
  /** Company currency per one unit of the deal currency (1 when they are the same). */
  exchangeRate: number;
  includesPre: boolean;
  listPrice?: Money;
  overrideReason?: string;
  poFile?: string;
  weighbridgeFile?: string;
  status: string;
  wf: WorkflowState;
  approvals: ApprovalRecord[];
  /** Money paid to the supplier, in the company currency. */
  disbursements: Disbursement[];
  delivery?: AggDelivery;
  proof?: AggProof;
  refunds?: AggRefund[];
  reconciledAt?: string;
  reconciledBy?: string;
  orderStatus: 'NONE' | 'IN_TRANSIT' | 'DELIVERED';
  paymentStatus: 'NONE' | 'FULFILLED' | 'RECEIVE_REFUND' | 'REFUND_SUPPLIER' | 'RECONCILED';
}

/** Aggregator expense (ACSPRE): logistics lines for an aggregator purchase, approved then paid. */
export interface AggregatorExpense extends OrgEntity {
  number: string;
  aggregatorPurchaseId: string;
  bags: number;
  lines: ExpenseLine[];
  total: Money;
  payee: { name: string; providerId: string; number: string };
  status: string;
  wf: WorkflowState;
  approvals: ApprovalRecord[];
  paymentStatus: 'NOT_PAID' | 'PENDING' | 'PAID' | 'FAILED';
  disbursement?: { method: 'MOMO' | 'MANUAL'; at: string; by: string; paymentId?: string; proof?: string };
}
