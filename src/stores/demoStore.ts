import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { uid } from '@/lib/utils';

/**
 * The Demo panel's content (prototype-only, never part of the product UI): one-time codes and email
 * links the simulated gateways "sent", plus notes the current page registers about how it works.
 * Kept per browser tab (sessionStorage).
 */
export interface DemoCode { id: string; label: 'twoStep' | 'verifyEmail'; to: string; code: string; at: string }
export interface DemoLink { id: string; label: 'reset' | 'invite'; to: string; href: string; at: string }
export interface DemoNote { id: string; key: string; params?: Record<string, unknown> }

interface DemoState {
  codes: DemoCode[];
  links: DemoLink[];
  notes: DemoNote[];
  /** Items the user hasn't looked at yet: shows a dot on the Demo icon (the panel never opens by itself). */
  unseen: number;
  pushCode: (c: Omit<DemoCode, 'id' | 'at'>) => void;
  pushLink: (l: Omit<DemoLink, 'id' | 'at'>) => void;
  setNotes: (notes: DemoNote[]) => void;
  markSeen: () => void;
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      codes: [],
      links: [],
      notes: [],
      unseen: 0,
      pushCode: (c) => set((s) => ({ codes: [{ ...c, id: uid('code'), at: new Date().toISOString() }, ...s.codes].slice(0, 6), unseen: s.unseen + 1 })),
      pushLink: (l) => set((s) => ({ links: [{ ...l, id: uid('link'), at: new Date().toISOString() }, ...s.links].slice(0, 6), unseen: s.unseen + 1 })),
      setNotes: (notes) => set({ notes }),
      markSeen: () => set({ unseen: 0 }),
    }),
    { name: 'treesyt-demo:v1:demoPanel', storage: createJSONStorage(() => sessionStorage), partialize: (s) => ({ codes: s.codes, links: s.links, unseen: s.unseen }) },
  ),
);
