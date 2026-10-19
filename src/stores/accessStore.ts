import type { Invite, Membership, ResetToken, Role, Session, User } from '@/types';
import { defineStore } from './persistence';

export const useAccessStore = defineStore(
  'access',
  {
    users: [] as User[], memberships: [] as Membership[], roles: [] as Role[], invites: [] as Invite[],
    sessions: [] as Session[], resetTokens: [] as ResetToken[],
  },
  (s) => ({ users: s.users, memberships: s.memberships, roles: s.roles, invites: s.invites, sessions: s.sessions, resetTokens: s.resetTokens }),
  (set) => ({
    touchUser: (id: string) => set((st) => ({ users: st.users.map((u) => (u.id === id ? { ...u, lastActiveAt: new Date().toISOString() } : u)) })),
    updateUser: (id: string, patch: Partial<User>) => set((st) => ({ users: st.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),
    addUser: (u: User) => set((st) => ({ users: [...st.users, u] })),
    addMembership: (m: Membership) => set((st) => ({ memberships: [...st.memberships.filter((x) => x.id !== m.id), m] })),
    updateMembership: (id: string, patch: Partial<Membership>) => set((st) => ({ memberships: st.memberships.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
    addRoles: (roles: Role[]) => set((st) => ({ roles: [...st.roles, ...roles] })),
    /** Replace one company's roles (Settings → Roles & permissions). */
    setOrgRoles: (orgId: string, roles: Role[]) => set((st) => ({ roles: [...st.roles.filter((r) => r.orgId !== orgId), ...roles] })),
    addInvite: (i: Invite) => set((st) => ({ invites: [i, ...st.invites] })),
    updateInvite: (id: string, patch: Partial<Invite>) => set((st) => ({ invites: st.invites.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
    addSession: (s: Session) => set((st) => ({ sessions: [s, ...st.sessions] })),
    touchSession: (id: string) => set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? { ...s, lastActiveAt: new Date().toISOString() } : s)) })),
    revokeSession: (id: string) => set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? { ...s, revokedAt: new Date().toISOString() } : s)) })),
    revokeAllSessions: (userId: string) =>
      set((st) => ({ sessions: st.sessions.map((s) => (s.userId === userId && !s.revokedAt ? { ...s, revokedAt: new Date().toISOString() } : s)) })),
    addResetToken: (t: ResetToken) => set((st) => ({ resetTokens: [t, ...st.resetTokens] })),
    markResetTokenUsed: (token: string) => set((st) => ({ resetTokens: st.resetTokens.map((t) => (t.token === token ? { ...t, usedAt: new Date().toISOString() } : t)) })),
  }),
);
