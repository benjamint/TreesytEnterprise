import type { LoanAccount } from '@/types';
import { defineStore } from './persistence';

export const useLoanStore = defineStore('loans', { loans: [] as LoanAccount[] }, (s) => ({ loans: s.loans }), () => ({}));
