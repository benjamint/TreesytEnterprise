import type { AggregatorExpense, AggregatorPurchase, Bag, PreExpense, Purchase, PurchaseRequest, Supplier } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);

export const useBuyingStore = defineStore(
  'buying',
  {
    requests: [] as PurchaseRequest[], purchases: [] as Purchase[], bags: [] as Bag[], expenses: [] as PreExpense[],
    suppliers: [] as Supplier[], aggregatorPurchases: [] as AggregatorPurchase[], aggregatorExpenses: [] as AggregatorExpense[],
  },
  (s) => ({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses }),
  (set) => ({
    addPurchase: (p: Purchase) => set((st) => ({ purchases: [p, ...st.purchases] })),
    addPurchases: (ps: Purchase[]) => set((st) => ({ purchases: [...ps, ...st.purchases] })),
    updatePurchases: (ids: string[], patch: (p: Purchase) => Partial<Purchase>) => set((st) => ({ purchases: st.purchases.map((p) => (ids.includes(p.id) ? { ...p, ...patch(p) } : p)) })),
    saveRequest: (r: PurchaseRequest) => set((st) => ({ requests: upsert(st.requests, r) })),
    updateRequest: (id: string, patch: Partial<PurchaseRequest>) => set((st) => ({ requests: st.requests.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)) })),
    saveBags: (bs: Bag[]) => set((st) => { let bags = st.bags; for (const b of bs) bags = upsert(bags, b); return { bags }; }),
    saveExpense: (e: PreExpense) => set((st) => ({ expenses: upsert(st.expenses, e) })),
    updateExpense: (id: string, patch: Partial<PreExpense>) => set((st) => ({ expenses: st.expenses.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e)) })),
    saveSupplier: (x: Supplier) => set((st) => ({ suppliers: upsert(st.suppliers, x) })),
    updateSupplier: (id: string, patch: Partial<Supplier>) => set((st) => ({ suppliers: st.suppliers.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)) })),
    saveAggregatorPurchase: (x: AggregatorPurchase) => set((st) => ({ aggregatorPurchases: upsert(st.aggregatorPurchases, x) })),
    updateAggregatorPurchase: (id: string, patch: Partial<AggregatorPurchase> | ((a: AggregatorPurchase) => Partial<AggregatorPurchase>)) =>
      set((st) => ({ aggregatorPurchases: st.aggregatorPurchases.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: new Date().toISOString() } : x)) })),
    saveAggregatorExpense: (x: AggregatorExpense) => set((st) => ({ aggregatorExpenses: upsert(st.aggregatorExpenses, x) })),
    updateAggregatorExpense: (id: string, patch: Partial<AggregatorExpense>) => set((st) => ({ aggregatorExpenses: st.aggregatorExpenses.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)) })),
  }),
);
