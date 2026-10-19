import type { Farmer } from '@/types';
import { defineStore } from './persistence';

export const useFarmerStore = defineStore('farmers', { farmers: [] as Farmer[] }, (s) => ({ farmers: s.farmers }), (set) => ({
  saveFarmer: (f: Farmer) => set((st) => ({ farmers: st.farmers.some((x) => x.id === f.id) ? st.farmers.map((x) => (x.id === f.id ? f : x)) : [f, ...st.farmers] })),
  addFarmers: (fs: Farmer[]) => set((st) => ({ farmers: [...fs, ...st.farmers] })),
  updateFarmers: (ids: string[], patch: (f: Farmer) => Partial<Farmer>) => set((st) => ({ farmers: st.farmers.map((f) => (ids.includes(f.id) ? { ...f, ...patch(f) } : f)) })),
  removeFarmers: (ids: string[]) => set((st) => ({ farmers: st.farmers.filter((f) => !ids.includes(f.id)) })),
}));
