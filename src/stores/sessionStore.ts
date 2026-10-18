import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Lang } from '@/types';
import { storageKey } from './persistence';

/** Who is signed in to this web tab. Persisted but deliberately not synced: each window keeps its own session. */
export interface SessionState {
  userId: string | null;
  /** The Session record for this tab (My account → Sessions). */
  sessionId: string | null;
  orgId: string;
  language: Lang;
  theme: 'light' | 'dark';
  /** "View as" mode: show actions the user can't take as disabled with a tooltip (PRD principle 4). */
  viewAs: boolean;
  signIn: (userId: string, orgId: string, language: Lang, sessionId?: string | null) => void;
  switchOrg: (orgId: string, language: Lang) => void;
  setLanguage: (language: Lang) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setViewAs: (on: boolean) => void;
  signOut: () => void;
}

export const DEFAULT_SESSION = { userId: 'u_benjamin', orgId: 'org_vitara', language: 'en' as Lang };

/** A fresh browser starts signed out on the public site (PRD 4.1); "Enter the demo" signs in as the default persona. */
const START = { userId: null as string | null, orgId: DEFAULT_SESSION.orgId, language: DEFAULT_SESSION.language, sessionId: null as string | null };

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...START,
      theme: 'light',
      viewAs: false,
      signIn: (userId, orgId, language, sessionId = null) => set({ userId, orgId, language, sessionId }),
      switchOrg: (orgId, language) => set({ orgId, language }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setViewAs: (viewAs) => set({ viewAs }),
      signOut: () => set({ userId: null, sessionId: null }),
    }),
    { name: storageKey('session'), storage: createJSONStorage(() => localStorage) },
  ),
);
