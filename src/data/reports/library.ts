import type { ReportChart, ReportFilter } from '@/types';

export interface LibrarySpec { key: string; entity: string; columns: string[]; groupBy?: string; measure?: string; chart: ReportChart; filters?: ReportFilter[] }

/** Every export the current system offers, reproduced as a saved report (PRD K1). */
export const REPORT_LIBRARY: LibrarySpec[] = [
  { key: 'farmers', entity: 'farmers', columns: ['farmerId', 'name', 'gender', 'phone', 'community', 'agent', 'registeredAt', 'score'], chart: 'TABLE' },
  { key: 'profilingByAgent', entity: 'farmers', columns: ['name', 'agent', 'community', 'registeredAt'], groupBy: 'agent', chart: 'BAR' },
  { key: 'purchases', entity: 'purchases', columns: ['number', 'date', 'farmer', 'community', 'commodity', 'quantity', 'amount', 'paymentStatus'], chart: 'TABLE' },
  { key: 'purchaseRequests', entity: 'purchaseRequests', columns: ['number', 'plannedDate', 'agent', 'community', 'commodity', 'volume', 'total', 'status'], chart: 'TABLE' },
  { key: 'pre', entity: 'preExpenses', columns: ['number', 'date', 'agent', 'request', 'bags', 'total', 'status', 'paymentStatus'], chart: 'TABLE' },
  { key: 'reconciliation', entity: 'reconciliation', columns: ['number', 'agent', 'requested', 'disbursed', 'purchased', 'balance', 'reconciliationStatus'], chart: 'TABLE' },
  { key: 'payments', entity: 'payments', columns: ['reference', 'date', 'payee', 'payableType', 'provider', 'amount', 'fee', 'status'], chart: 'TABLE' },
  { key: 'recoveries', entity: 'recoveries', columns: ['number', 'date', 'group', 'agent', 'loans', 'status'], chart: 'TABLE' },
  { key: 'support', entity: 'support', columns: ['number', 'date', 'group', 'community', 'type', 'total', 'status', 'fulfilmentStatus'], chart: 'TABLE' },
  { key: 'workshops', entity: 'workshops', columns: ['number', 'date', 'title', 'community', 'agent', 'expected', 'actual', 'status'], chart: 'TABLE' },
  { key: 'treeMonitoring', entity: 'trees', columns: ['code', 'species', 'farmer', 'community', 'state', 'heightM', 'health', 'lastVisitAt'], groupBy: 'state', chart: 'DONUT' },
  { key: 'nurseries', entity: 'nurseries', columns: ['code', 'name', 'community', 'agent', 'fenced', 'rounds', 'status'], chart: 'TABLE' },
  { key: 'plots', entity: 'plots', columns: ['code', 'farmer', 'community', 'areaHa', 'crop', 'eudrStatus'], groupBy: 'eudrStatus', chart: 'DONUT' },
  { key: 'inventoryMovements', entity: 'movements', columns: ['date', 'warehouse', 'kind', 'commodity', 'bags', 'kg', 'ref'], chart: 'TABLE' },
  { key: 'carryForwards', entity: 'carryForwards', columns: ['date', 'agent', 'type', 'amount', 'remaining', 'status'], chart: 'TABLE' },
  { key: 'commissions', entity: 'commissions', columns: ['period', 'agent', 'total', 'status', 'paid'], chart: 'TABLE' },
  { key: 'sourcingByAgent', entity: 'purchases', columns: ['agent', 'commodity', 'quantity', 'amount'], groupBy: 'agent', measure: 'quantity', chart: 'BAR' },
];
