import type { FarmerGroup, GroupMembership, SavingsEntry } from '@/types';
import { defineStore } from './persistence';

export const useGroupStore = defineStore(
  'groups',
  { groups: [] as FarmerGroup[], groupMemberships: [] as GroupMembership[], savings: [] as SavingsEntry[] },
  (s) => ({ groups: s.groups, groupMemberships: s.groupMemberships, savings: s.savings }),
  (set) => ({
    saveGroup: (g: FarmerGroup) => set((st) => ({ groups: st.groups.some((x) => x.id === g.id) ? st.groups.map((x) => (x.id === g.id ? g : x)) : [g, ...st.groups] })),
    addMembership: (m: GroupMembership) => set((st) => ({ groupMemberships: [...st.groupMemberships, m] })),
    endMembership: (id: string) => set((st) => ({ groupMemberships: st.groupMemberships.map((m) => (m.id === id ? { ...m, leftAt: new Date().toISOString().slice(0, 10) } : m)) })),
    setMemberRole: (id: string, role: GroupMembership['role']) => set((st) => ({ groupMemberships: st.groupMemberships.map((m) => (m.id === id ? { ...m, role } : m)) })),
    addSavings: (e: SavingsEntry) => set((st) => ({ savings: [e, ...st.savings] })),
  }),
);
