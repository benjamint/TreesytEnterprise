import type { AggregatorPurchase, Bag, PreExpense, Purchase, PurchaseRequest, Supplier } from '@/types';
import { defineStore } from './persistence';

export const useBuyingStore = defineStore(
  'buying',
  {
    requests: [] as PurchaseRequest[], purchases: [] as Purchase[], bags: [] as Bag[], expenses: [] as PreExpense[],
    suppliers: [] as Supplier[], aggregatorPurchases: [] as AggregatorPurchase[],
  },
  (s) => ({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases }),
  (set) => ({
    addPurchase: (p: Purchase) => set((st) => ({ purchases: [p, ...st.purchases] })),
  }),
);
