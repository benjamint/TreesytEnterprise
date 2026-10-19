import type { Money } from './core';

export type PayableType =
  | 'AGENT_CASH_ADVANCE' | 'PRE_EXPENSE' | 'AGGREGATOR_PURCHASE' | 'AGGREGATOR_EXPENSE' | 'FARMER_SUPPORT'
  | 'FARMER_PURCHASE' | 'BULK_FARMER_PURCHASE' | 'WEEKLY_BUDGET' | 'MONTHLY_ALLOWANCE' | 'COMMISSION'
  | 'FARMER_REFUND' | 'WAREHOUSE_EXPENSE';

export type PaymentStatus = 'PENDING' | 'AWAITING_CHECKER' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'UNKNOWN' | 'REVERSED';

export interface Payment {
  id: string;
  orgId: string;
  reference: string;
  payableType: PayableType;
  payableId: string;
  payee: { name: string; number: string };
  providerId: string;
  amount: Money;
  fee: Money;
  tax: Money;
  total: Money;
  status: PaymentStatus;
  failureReason?: string;
  initiatedBy: string;
  approvedBy?: string;
  createdAt: string;
  /** Extra charges added (company list) and the withdrawal charge when included for the payee. */
  extras?: Money;
  withdrawal?: Money;
  /** What lands in the payee's wallet. */
  received?: Money;
  /** Payments sent together in one bulk run share a batch id. */
  batchId?: string;
  /** A retry is a new attempt pointing at the one that failed. */
  retryOf?: string;
  providerRef?: string;
  /** Timeline: initiated, checked, provider accepted, callback, reversed (PRD E1 detail). */
  events?: { at: string; key: string; by?: string; note?: string }[];
  /** Simulated raw provider response. */
  response?: Record<string, unknown>;
  /** What the payable needs to apply on success (e.g. tranche weight). */
  meta?: Record<string, unknown>;
}

export type CollectionStatus = 'PENDING' | 'SUCCESSFUL' | 'DECLINED' | 'EXPIRED';

/** Mobile-money collection request (PRD E2): the payee approves the prompt on their phone. */
export interface Collection {
  id: string;
  orgId: string;
  reference: string;
  payer: { name: string; number: string; userId?: string };
  providerId: string;
  amount: Money;
  reason: string;
  payableType: 'AGENT_REFUND' | 'FARMER_REFUND' | 'CASH_RECOVERY';
  payableId: string;
  status: CollectionStatus;
  requestedBy: string;
  createdAt: string;
  settledAt?: string;
}

export interface WalletTopUp {
  id: string;
  orgId: string;
  walletId: string;
  amount: Money;
  status: 'REQUESTED' | 'CREDITED';
  requestedBy: string;
  createdAt: string;
  creditedAt?: string;
  note?: string;
}

export interface Wallet {
  id: string;
  orgId: string;
  providerId: string;
  name: string;
  balance: Money;
  lowBalanceThreshold: Money;
  lastTopUpAt: string;
}
