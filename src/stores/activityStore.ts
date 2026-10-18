import type { ActivityEvent, AuditEntry } from '@/types';
import { defineStore } from './persistence';

/** Activity events are immutable: the only action is append. */
export const useActivityStore = defineStore(
  'activity',
  { activity: [] as ActivityEvent[], audit: [] as AuditEntry[] },
  (s) => ({ activity: s.activity, audit: [] }),
  (set) => ({
    log: (e: ActivityEvent) => set((st) => ({ activity: [...st.activity, e] })),
    addAudit: (e: AuditEntry) => set((st) => ({ audit: [...st.audit, e] })),
  }),
);
