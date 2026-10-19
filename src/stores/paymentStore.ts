import type { Collection, Payment, Wallet, WalletTopUp } from '@/types';
import { defineStore } from './persistence';

export const usePaymentStore = defineStore(
  'payments',
  { payments: [] as Payment[], wallets: [] as Wallet[], collections: [] as Collection[], topUps: [] as WalletTopUp[] },
  (s) => ({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [] }),
  (set) => ({
    addPayment: (p: Payment) => set((st) => ({ payments: [p, ...st.payments] })),
    addPayments: (ps: Payment[]) => set((st) => ({ payments: [...ps, ...st.payments] })),
    updatePayment: (id: string, patch: Partial<Payment> | ((p: Payment) => Partial<Payment>)) =>
      set((st) => ({ payments: st.payments.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)) })),
    updateWallet: (id: string, patch: Partial<Wallet>) => set((st) => ({ wallets: st.wallets.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
    addCollection: (c: Collection) => set((st) => ({ collections: [c, ...st.collections] })),
    updateCollection: (id: string, patch: Partial<Collection>) => set((st) => ({ collections: st.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
    addTopUp: (t: WalletTopUp) => set((st) => ({ topUps: [t, ...st.topUps] })),
    updateTopUp: (id: string, patch: Partial<WalletTopUp>) => set((st) => ({ topUps: st.topUps.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  }),
);
