import type { AggregatorPurchase, Bag, PreExpense, Purchase, PurchaseRequest, Supplier } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);

export const useBuyingStore = defineStore(
  'buying',
  {
    requests: [] as PurchaseRequest[], purchases: [] as Purchase[], bags: [] as Bag[], expenses: [] as PreExpense[],
    suppliers: [] as Supplier[], aggregatorPurchases: [] as AggregatorPurchase[],
  },
  (s) => ({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases }),
  (set) => ({
    addPurchase: (p: Purchase) => set((st) => ({ purchases: [p, ...st.purchases] })),
    addPurchases: (ps: Purchase[]) => set((st) => ({ purchases: [...ps, ...st.purchases] })),
    updatePurchases: (ids: string[], patch: (p: Purchase) => Partial<Purchase>) => set((st) => ({ purchases: st.purchases.map((p) => (ids.includes(p.id) ? { ...p, ...patch(p) } : p)) })),
    saveRequest: (r: PurchaseRequest) => set((st) => ({ requests: upsert(st.requests, r) })),
    updateRequest: (id: string, patch: Partial<PurchaseRequest>) => set((st) => ({ requests: st.requests.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)) })),
    saveBags: (bs: Bag[]) => set((st) => { let bags = st.bags; for (const b of bs) bags = upsert(bags, b); return { bags }; }),
    saveExpense: (e: PreExpense) => set((st) => ({ expenses: upsert(st.expenses, e) })),
    updateExpense: (id: string, patch: Partial<PreExpense>) => set((st) => ({ expenses: st.expenses.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e)) })),
  }),
);
