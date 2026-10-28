import type { TrainingTopic, Workshop } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);
const patchIn = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => Partial<T>)) =>
  list.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: new Date().toISOString() } : x));

/** Training catalogue and workshops with their attendance (PRD G3). */
export const useTrainingStore = defineStore(
  'training',
  { topics: [] as TrainingTopic[], workshops: [] as Workshop[] },
  (s) => ({ topics: s.trainingTopics, workshops: s.workshops }),
  (set) => ({
    saveTopic: (x: TrainingTopic) => set((st) => ({ topics: upsert(st.topics, x) })),
    saveWorkshops: (xs: Workshop[]) => set((st) => { const ids = new Set(xs.map((x) => x.id)); return { workshops: [...xs, ...st.workshops.filter((x) => !ids.has(x.id))] }; }),
    updateWorkshop: (id: string, p: Partial<Workshop> | ((x: Workshop) => Partial<Workshop>)) => set((st) => ({ workshops: patchIn(st.workshops, id, p) })),
    removeWorkshop: (id: string) => set((st) => ({ workshops: st.workshops.filter((x) => x.id !== id) })),
  }),
);
