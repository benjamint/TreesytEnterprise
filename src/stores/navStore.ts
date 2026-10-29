import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { storageKey } from './persistence';

/** Sidebar preferences for this browser: which sections are open, and each person's pinned pages. */
interface NavPrefs {
  /** Sections the person has opened or closed; untouched sections fall back to the default (only Overview open). */
  open: Record<string, boolean>;
  pinned: Record<string, string[]>;
  toggle: (section: string, open: boolean) => void;
  togglePin: (userId: string, routeKey: string) => void;
}

export const useNavStore = create<NavPrefs>()(
  persist(
    (set) => ({
      open: {},
      pinned: {},
      toggle: (section, open) => set((s) => ({ open: { ...s.open, [section]: open } })),
      togglePin: (userId, key) => set((s) => {
        const mine = s.pinned[userId] ?? [];
        return { pinned: { ...s.pinned, [userId]: mine.includes(key) ? mine.filter((k) => k !== key) : [...mine, key] } };
      }),
    }),
    { name: storageKey('navPrefs'), storage: createJSONStorage(() => localStorage) },
  ),
);
