import type { ImportRun } from '@/types';
import { defineStore } from './persistence';

/** Import history (PRD C6), newest first. */
export const useImportStore = defineStore('imports', { runs: [] as ImportRun[] }, () => ({ runs: [] }), (set) => ({
  addRun: (r: ImportRun) => set((st) => ({ runs: [r, ...st.runs] })),
  updateRun: (id: string, patch: Partial<ImportRun>) => set((st) => ({ runs: st.runs.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
}));
