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
  type: OutboxType;
  label: string;
  payload: unknown;
  createdAt: string;
  /** The server record this edit started from: a newer server version is a sync conflict. */
  base?: { entity: string; id: string; updatedAt: string };
  /** Set when the last sync attempt hit a conflict or an error. */
  status?: 'conflict' | 'error';
  error?: string;
}

export type OutboxType =
  | 'purchase' | 'purchaseRequest' | 'fundsReceived' | 'receipt' | 'farmer' | 'farmerEdit' | 'community' | 'group' | 'expense'
  | 'survey' | 'qualityFix' | 'other';

interface OutboxState {
  items: OutboxItem[];
  add: (item: OutboxItem) => void;
  remove: (ids: string[]) => void;
  update: (id: string, patch: Partial<OutboxItem>) => void;
  clear: (userId: string) => void;
}

export const useOutboxStore = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items, item] })),
      remove: (ids) => set((s) => ({ items: s.items.filter((i) => !ids.includes(i.id)) })),
      update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      clear: (userId) => set((s) => ({ items: s.items.filter((i) => i.userId !== userId) })),
    }),
    { name: storageKey('outbox'), storage: createJSONStorage(() => localStorage) },
  ),
);
