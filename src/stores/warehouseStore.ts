import type { AgentRepayment, Discrepancy, Inbound, StockCount, StockMovement, Transfer, Warehouse, WarehouseExpense } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);
const patchIn = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => Partial<T>)) =>
  list.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: new Date().toISOString() } : x));

/** Warehouses and everything that moves through them (PRD H1–H5). Bags live in the buying store. */
export const useWarehouseStore = defineStore(
  'warehouses',
  {
    warehouses: [] as Warehouse[], inbounds: [] as Inbound[], discrepancies: [] as Discrepancy[], agentRepayments: [] as AgentRepayment[],
    movements: [] as StockMovement[], transfers: [] as Transfer[], stockCounts: [] as StockCount[], warehouseExpenses: [] as WarehouseExpense[],
  },
  (s) => ({
    warehouses: s.warehouses, inbounds: s.inbounds, discrepancies: s.discrepancies, agentRepayments: s.agentRepayments,
    movements: s.movements, transfers: s.transfers, stockCounts: s.stockCounts, warehouseExpenses: s.warehouseExpenses,
  }),
  (set) => ({
    saveWarehouse: (x: Warehouse) => set((st) => ({ warehouses: upsert(st.warehouses, x) })),
    saveInbound: (x: Inbound) => set((st) => ({ inbounds: upsert(st.inbounds, x) })),
    updateInbound: (id: string, patch: Partial<Inbound> | ((x: Inbound) => Partial<Inbound>)) => set((st) => ({ inbounds: patchIn(st.inbounds, id, patch) })),
    saveDiscrepancies: (xs: Discrepancy[]) => set((st) => ({ discrepancies: xs.reduce(upsert, st.discrepancies) })),
    updateDiscrepancy: (id: string, patch: Partial<Discrepancy> | ((x: Discrepancy) => Partial<Discrepancy>)) => set((st) => ({ discrepancies: patchIn(st.discrepancies, id, patch) })),
    saveRepayment: (x: AgentRepayment) => set((st) => ({ agentRepayments: upsert(st.agentRepayments, x) })),
    addMovements: (xs: StockMovement[]) => set((st) => ({ movements: [...xs, ...st.movements] })),
    saveTransfer: (x: Transfer) => set((st) => ({ transfers: upsert(st.transfers, x) })),
    updateTransfer: (id: string, patch: Partial<Transfer>) => set((st) => ({ transfers: patchIn(st.transfers, id, patch) })),
    saveStockCount: (x: StockCount) => set((st) => ({ stockCounts: upsert(st.stockCounts, x) })),
    updateStockCount: (id: string, patch: Partial<StockCount> | ((x: StockCount) => Partial<StockCount>)) => set((st) => ({ stockCounts: patchIn(st.stockCounts, id, patch) })),
    saveExpense: (x: WarehouseExpense) => set((st) => ({ warehouseExpenses: upsert(st.warehouseExpenses, x) })),
    updateExpense: (id: string, patch: Partial<WarehouseExpense> | ((x: WarehouseExpense) => Partial<WarehouseExpense>)) => set((st) => ({ warehouseExpenses: patchIn(st.warehouseExpenses, id, patch) })),
  }),
);
