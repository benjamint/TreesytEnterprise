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
