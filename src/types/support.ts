import type { ApprovalRecord, Money, OrgEntity, WorkflowState } from './core';

/** Farmer support and recovery (PRD F1–F5). */

export interface ServiceProvider extends OrgEntity {
  name: string;
  /** Support types this provider serves (ploughing, farm input…). */
  typeIds: string[];
  /** Inputs or services offered, e.g. "Fertilizer · NPK 15-15-15", "Tractor ploughing". */
  offers: string[];
  location: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  wallet?: { providerId: string; number: string; name: string };
}

export type SupportLineStatus = 'PENDING' | 'APPROVED' | 'CONFIRMED' | 'REJECTED' | 'DECLINED' | 'PAID' | 'FULFILLED';

export interface SupportLine {
  id: string;
  farmerId: string;
  typeId: string;
  subType?: string;
  amount: Money;
  landSize?: number;
  quantity?: number;
  supplyDate?: string;
  abilityToPay: string;
  status: SupportLineStatus;
  /** Amount edits during approval, in the company currency. */
  edits?: { from: Money; to: Money; by: string; at: string; reason?: string }[];
  fulfilment?: { audioSeconds: number; witness?: string; photo?: string; gps?: { lat: number; lng: number; accuracy: number }; at: string; by: string };
  loanId?: string;
}

/** What was approved for one service on the request (PRD F2 approval per service). */
export interface ServiceApproval {
  typeId: string;
  amountPerFarmer: Money;
  providerId?: string;
  arrangement?: 'PROVIDER_PAID' | 'GROUP_PAID' | 'IN_KIND';
  expectedKgPerFarmer?: number;
  inputs?: { subType: string; quantity: number; amount: Money }[];
  by: string;
  at: string;
}

export interface SupportRequest extends OrgEntity {
  number: string;
  groupId: string;
  communityId: string;
  agentId: string;
  primaryTypeId: string;
  secondaryTypeId?: string;
  agroforestry?: { interested: boolean; type?: string };
  gps?: { lat: number; lng: number; accuracy: number };
  lines: SupportLine[];
  voice: { leaderSeconds?: number; witnessSeconds?: number };
  services: ServiceApproval[];
  total: Money;
  status: string;
  wf?: WorkflowState;
  approvals: ApprovalRecord[];
  payout: { method: 'GROUP_WALLET' | 'FARMER_WALLETS' | 'PROVIDER' | 'MANUAL'; wallet?: { providerId: string; number: string; name: string } };
  /** Set when the agent has confirmed who turned up and the group wallet. */
  confirmedAt?: string;
  disbursements: { id: string; amount: Money; method: 'MOMO' | 'MANUAL'; to: string; at: string; by: string; paymentId?: string; proof?: string }[];
  refunds: { id: string; farmerId: string; amount: Money; method: string; reference: string; document?: string; at: string; by: string }[];
  assets: { agreement?: string; thumbprints?: number; at?: string };
  fulfilmentStatus: 'PENDING' | 'PARTIAL' | 'FULL';
  device?: 'web' | 'mobile';
}

export interface RecoveryWindow extends OrgEntity {
  name: string;
  /** The programme: a support type. */
  typeId: string;
  season: string;
  commodityId: string;
  start: string;
  end: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  remark?: string;
  reminders: { sms: boolean; push: boolean };
}

export interface RecoveryRequest extends OrgEntity {
  number: string;
  groupId: string;
  windowId: string;
  agentId: string;
  loanIds: string[];
  status: 'PENDING_REVIEW' | 'FINANCE_REVIEW' | 'ACTIVATED' | 'PARTIALLY_RECOVERED' | 'FULLY_RECOVERED' | 'REJECTED';
  review?: { commodityId: string; unitPrice: Money; excessPrice?: Money; by: string; at: string };
  activation?: { excessPrice?: Money; reason?: string; by: string; at: string };
  rejection?: { reason: string; by: string; at: string };
  purchaseRequestId?: string;
  feedback?: { experience: string; lendAgain: 'YES' | 'MAYBE' | 'NO'; comment?: string; at: string; by: string };
  device?: 'web' | 'mobile';
}

export interface Repayment {
  id: string;
  orgId: string;
  loanId: string;
  farmerId: string;
  recoveryRequestId?: string;
  agentId?: string;
  date: string;
  mode: 'CASH' | 'PRODUCE' | 'MIXED';
  kg?: number;
  bagCode?: string;
  cash?: Money;
  /** Produce value credited to the loan. */
  produceValue?: Money;
  excess?: { kg: number; amount: Money; purchaseId?: string };
  receipt: { status: 'PENDING' | 'CONFIRMED' | 'NA'; photo?: string; by?: string; at?: string };
  status: 'RECORDED' | 'CONFIRMED' | 'REVERSED';
  createdAt: string;
  createdBy: string;
}

export interface LoanRefund { id: string; orgId: string; loanId: string; farmerId: string; amount: Money; method: 'MOMO' | 'MANUAL'; paymentId?: string; proof?: string; at: string; by: string }

/** Read-only archive of past allocations (PRD F5), migratable to support & loans. */
export interface LegacyAllocation {
  id: string;
  orgId: string;
  farmerId: string;
  type: string;
  quantity: number;
  unit: string;
  amount: Money;
  repaymentMode: 'MONEY' | 'FARM_PRODUCE';
  voiceNote?: number;
  date: string;
  repayments: { purchaseNumber?: string; amount: Money; date: string }[];
  status: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'NOT_PAID';
  migratedLoanId?: string;
}
