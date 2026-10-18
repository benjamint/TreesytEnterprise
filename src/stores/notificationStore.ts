import type { AppNotification, OutboxMessage } from '@/types';
import { defineStore } from './persistence';

export const useNotificationStore = defineStore(
  'notifications',
  { notifications: [] as AppNotification[], outbox: [] as OutboxMessage[] },
  (s) => ({ notifications: s.notifications, outbox: s.outbox }),
  (set) => ({
    markRead: (id: string) => set((st) => ({ notifications: st.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
    markAllRead: (userId: string, orgId: string) =>
      set((st) => ({ notifications: st.notifications.map((n) => (n.userId === userId && n.orgId === orgId ? { ...n, read: true } : n)) })),
    push: (n: AppNotification) => set((st) => ({ notifications: [n, ...st.notifications] })),
    send: (m: OutboxMessage) => set((st) => ({ outbox: [m, ...st.outbox] })),
  }),
);
