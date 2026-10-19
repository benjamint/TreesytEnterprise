import type { LoanAccount } from '@/types';
import { defineStore } from './persistence';

export const useLoanStore = defineStore('loans', { loans: [] as LoanAccount[] }, (s) => ({ loans: s.loans }), (set) => ({
  addRepayment: (loanId: string, r: LoanAccount['repayments'][number]) => set((st) => ({ loans: st.loans.map((l) => (l.id === loanId ? { ...l, repayments: [...l.repayments, r] } : l)) })),
}));
