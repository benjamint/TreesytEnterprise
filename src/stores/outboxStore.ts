import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { storageKey } from './persistence';

/**
 * Mobile-only offline queue (PRD 4.3). Items saved while offline wait here and are written
 * to the shared stores only when the agent taps Sync (Phase 9 wires each item type).
 */
export interface OutboxItem {
  id: string;
  orgId: string;
  userId: string;
  type: 'purchase' | 'purchaseRequest' | 'farmer' | 'community' | 'group' | 'expense' | 'survey' | 'qualityFix' | 'other';
  label: string;
  payload: unknown;
  createdAt: string;
}

interface OutboxState {
  items: OutboxItem[];
  add: (item: OutboxItem) => void;
  remove: (ids: string[]) => void;
  clear: (userId: string) => void;
}

export const useOutboxStore = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items, item] })),
      remove: (ids) => set((s) => ({ items: s.items.filter((i) => !ids.includes(i.id)) })),
      clear: (userId) => set((s) => ({ items: s.items.filter((i) => i.userId !== userId) })),
    }),
    { name: storageKey('outbox'), storage: createJSONStorage(() => localStorage) },
  ),
);
