import type { LegacyAllocation, LoanRefund, RecoveryRequest, RecoveryWindow, Repayment, ServiceProvider, SupportRequest } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);
const patchIn = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => Partial<T>)) =>
  list.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: new Date().toISOString() } : x));

/** Farmer support and recovery records (PRD F). Loans themselves live in the loan store. */
export const useSupportStore = defineStore(
  'support',
  {
    providers: [] as ServiceProvider[], requests: [] as SupportRequest[], windows: [] as RecoveryWindow[], recoveries: [] as RecoveryRequest[],
    repayments: [] as Repayment[], refunds: [] as LoanRefund[], legacy: [] as LegacyAllocation[],
  },
  (s) => ({ providers: s.providers, requests: s.supportRequests, windows: s.recoveryWindows, recoveries: s.recoveryRequests, repayments: s.repayments, refunds: s.loanRefunds, legacy: s.legacyAllocations }),
  (set) => ({
    saveProvider: (x: ServiceProvider) => set((st) => ({ providers: upsert(st.providers, x) })),
    saveRequest: (x: SupportRequest) => set((st) => ({ requests: upsert(st.requests, x) })),
    updateRequest: (id: string, patch: Partial<SupportRequest> | ((x: SupportRequest) => Partial<SupportRequest>)) => set((st) => ({ requests: patchIn(st.requests, id, patch) })),
    saveWindow: (x: RecoveryWindow) => set((st) => ({ windows: upsert(st.windows, x) })),
    saveRecovery: (x: RecoveryRequest) => set((st) => ({ recoveries: upsert(st.recoveries, x) })),
    updateRecovery: (id: string, patch: Partial<RecoveryRequest> | ((x: RecoveryRequest) => Partial<RecoveryRequest>)) => set((st) => ({ recoveries: patchIn(st.recoveries, id, patch) })),
    addRepayment: (x: Repayment) => set((st) => ({ repayments: [x, ...st.repayments] })),
    updateRepayment: (id: string, patch: Partial<Repayment>) => set((st) => ({ repayments: st.repayments.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
    addRefund: (x: LoanRefund) => set((st) => ({ refunds: [x, ...st.refunds] })),
    updateLegacy: (id: string, patch: Partial<LegacyAllocation>) => set((st) => ({ legacy: st.legacy.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  }),
);
