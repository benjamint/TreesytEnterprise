import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Lang } from '@/types';
import { storageKey } from './persistence';

/** Who is signed in to this web tab. Persisted but deliberately not synced: each window keeps its own session. */
export interface SessionState {
  userId: string | null;
  orgId: string;
  language: Lang;
  theme: 'light' | 'dark';
  /** "View as" mode: show actions the user can't take as disabled with a tooltip (PRD principle 4). */
  viewAs: boolean;
  signIn: (userId: string, orgId: string, language: Lang) => void;
  switchOrg: (orgId: string, language: Lang) => void;
  setLanguage: (language: Lang) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setViewAs: (on: boolean) => void;
  signOut: () => void;
}

export const DEFAULT_SESSION = { userId: 'u_benjamin', orgId: 'org_vitara', language: 'en' as Lang };

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...DEFAULT_SESSION,
      theme: 'light',
      viewAs: false,
      signIn: (userId, orgId, language) => set({ userId, orgId, language }),
      switchOrg: (orgId, language) => set({ orgId, language }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setViewAs: (viewAs) => set({ viewAs }),
      signOut: () => set({ userId: null }),
    }),
    { name: storageKey('session'), storage: createJSONStorage(() => localStorage) },
  ),
);
