import type { Membership, Role, User } from '@/types';
import { defineStore } from './persistence';

export const useAccessStore = defineStore(
  'access',
  { users: [] as User[], memberships: [] as Membership[], roles: [] as Role[] },
  (s) => ({ users: s.users, memberships: s.memberships, roles: s.roles }),
  (set) => ({
    touchUser: (id: string) => set((st) => ({ users: st.users.map((u) => (u.id === id ? { ...u, lastActiveAt: new Date().toISOString() } : u)) })),
  }),
);
