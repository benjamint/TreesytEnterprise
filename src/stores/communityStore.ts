import type { Community } from '@/types';
import { defineStore } from './persistence';

export const useCommunityStore = defineStore('communities', { communities: [] as Community[] }, (s) => ({ communities: s.communities }), (set) => ({
  saveCommunity: (c: Community) => set((st) => ({ communities: st.communities.some((x) => x.id === c.id) ? st.communities.map((x) => (x.id === c.id ? c : x)) : [c, ...st.communities] })),
  addCommunities: (cs: Community[]) => set((st) => ({ communities: [...cs, ...st.communities] })),
  removeCommunities: (ids: string[]) => set((st) => ({ communities: st.communities.filter((c) => !ids.includes(c.id)) })),
}));
