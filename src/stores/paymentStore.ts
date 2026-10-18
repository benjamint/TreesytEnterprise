import type { Payment, Wallet } from '@/types';
import { defineStore } from './persistence';

export const usePaymentStore = defineStore('payments', { payments: [] as Payment[], wallets: [] as Wallet[] }, (s) => ({ payments: s.payments, wallets: s.wallets }), () => ({}));
