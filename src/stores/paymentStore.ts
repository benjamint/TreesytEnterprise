import type { Payment, Wallet } from '@/types';
import { defineStore } from './persistence';

export const usePaymentStore = defineStore('payments', { payments: [] as Payment[], wallets: [] as Wallet[] }, (s) => ({ payments: s.payments, wallets: s.wallets }), (set) => ({
  addPayment: (p: Payment) => set((st) => ({ payments: [p, ...st.payments] })),
  updatePayment: (id: string, patch: Partial<Payment>) => set((st) => ({ payments: st.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  updateWallet: (id: string, patch: Partial<Wallet>) => set((st) => ({ wallets: st.wallets.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
}));
