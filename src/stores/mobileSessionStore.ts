import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Lang } from '@/types';
import { storageKey } from './persistence';

/** The mobile window's own session (PRD 4.2: mobile has its own sign-in and offline mode). */
export interface MobileSessionState {
  userId: string | null;
  orgId: string | null;
  language: Lang;
  online: boolean;
  lastSyncAt: string | null;
  /** App PIN set at first sign-in; the app locks after inactivity (PRD M1). */
  pin: string | null;
  locked: boolean;
  setPin: (pin: string) => void;
  lock: () => void;
  unlock: () => void;
  signIn: (userId: string, orgId: string, language: Lang) => void;
  setLanguage: (language: Lang) => void;
  setOnline: (online: boolean) => void;
  markSynced: () => void;
  signOut: () => void;
}

export const useMobileSessionStore = create<MobileSessionState>()(
  persist(
    (set) => ({
      userId: null,
      orgId: null,
      language: 'en',
      online: true,
      lastSyncAt: null,
      pin: null,
      locked: false,
      setPin: (pin) => set({ pin }),
      lock: () => set((s) => ({ locked: !!s.pin && !!s.userId })),
      unlock: () => set({ locked: false }),
      signIn: (userId, orgId, language) => set({ userId, orgId, language, lastSyncAt: new Date().toISOString(), locked: false }),
      setLanguage: (language) => set({ language }),
      setOnline: (online) => set({ online }),
      markSynced: () => set({ lastSyncAt: new Date().toISOString() }),
      signOut: () => set({ userId: null, orgId: null, pin: null, locked: false }),
    }),
    { name: storageKey('mobileSession'), storage: createJSONStorage(() => localStorage) },
  ),
);
