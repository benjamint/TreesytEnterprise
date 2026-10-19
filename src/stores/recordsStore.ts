import type { Leader, RecordDocument } from '@/types';
import { defineStore } from './persistence';

/** Leaders and documents attached to communities, groups and farmers (PRD C2, C4). */
export const useRecordsStore = defineStore(
  'records',
  { leaders: [] as Leader[], documents: [] as RecordDocument[] },
  (s) => ({ leaders: s.leaders, documents: s.documents }),
  (set) => ({
    saveLeader: (l: Leader) => set((st) => ({ leaders: st.leaders.some((x) => x.id === l.id) ? st.leaders.map((x) => (x.id === l.id ? l : x)) : [...st.leaders, l] })),
    removeLeader: (id: string) => set((st) => ({ leaders: st.leaders.filter((x) => x.id !== id) })),
    addDocument: (d: RecordDocument) => set((st) => ({ documents: [d, ...st.documents] })),
    removeDocument: (id: string) => set((st) => ({ documents: st.documents.filter((x) => x.id !== id) })),
  }),
);
