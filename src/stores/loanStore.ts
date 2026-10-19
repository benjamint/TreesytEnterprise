import type { LoanAccount } from '@/types';
import { defineStore } from './persistence';

export const useLoanStore = defineStore('loans', { loans: [] as LoanAccount[] }, (s) => ({ loans: s.loans }), (set) => ({
  addRepayment: (loanId: string, r: LoanAccount['repayments'][number]) => set((st) => ({ loans: st.loans.map((l) => (l.id === loanId ? { ...l, repayments: [...l.repayments, r] } : l)) })),
  addLoans: (ls: LoanAccount[]) => set((st) => ({ loans: [...ls, ...st.loans] })),
  updateLoan: (id: string, patch: Partial<LoanAccount>) => set((st) => ({ loans: st.loans.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l)) })),
}));
