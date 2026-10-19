import type { LocationNode } from '@/types';
import { defineStore } from './persistence';

export const useLocationStore = defineStore('locations', { nodes: [] as LocationNode[] }, (s) => ({ nodes: s.nodes }), (set) => ({
  /** Replace one company's location tree (Settings → Locations). */
  setOrgNodes: (orgId: string, nodes: LocationNode[]) => set((st) => ({ nodes: [...st.nodes.filter((n) => n.orgId !== orgId), ...nodes] })),
}));
