import type { FieldTask, QualityIssue } from '@/types';
import { defineStore } from './persistence';

/** Data-quality issues and the fix tasks sent to agents' phones (PRD C5). */
export const useQualityStore = defineStore(
  'quality',
  { issues: [] as QualityIssue[], tasks: [] as FieldTask[] },
  (s) => ({ issues: s.qualityIssues, tasks: s.fieldTasks }),
  (set) => ({
    addIssues: (issues: QualityIssue[]) => set((st) => ({ issues: [...issues, ...st.issues] })),
    updateIssues: (ids: string[], patch: Partial<QualityIssue>) =>
      set((st) => ({ issues: st.issues.map((i) => (ids.includes(i.id) ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)) })),
    removeIssues: (ids: string[]) => set((st) => ({ issues: st.issues.filter((i) => !ids.includes(i.id)) })),
    addTask: (t: FieldTask) => set((st) => ({ tasks: [t, ...st.tasks] })),
    updateTask: (id: string, patch: Partial<FieldTask>) => set((st) => ({ tasks: st.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  }),
);
