import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** In-progress sign-in (between password, 2-step and company choice). Per tab. */
interface AuthFlow {
  pendingUserId: string | null;
  remember: boolean;
  next: string | null;
  viaSso: boolean;
  start: (p: { userId: string; remember: boolean; next: string | null; viaSso?: boolean }) => void;
  clear: () => void;
}

export const useAuthFlowStore = create<AuthFlow>()(
  persist(
    (set) => ({
      pendingUserId: null,
      remember: false,
      next: null,
      viaSso: false,
      start: ({ userId, remember, next, viaSso = false }) => set({ pendingUserId: userId, remember, next, viaSso }),
      clear: () => set({ pendingUserId: null, remember: false, next: null, viaSso: false }),
    }),
    { name: 'treesyt-demo:v1:authFlow', storage: createJSONStorage(() => sessionStorage) },
  ),
);
