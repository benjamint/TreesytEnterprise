import { create } from 'zustand';

/**
 * Lets a page's FilterBar tell its DataTable that filters are on, so an empty table says
 * "nothing matches your filters" with a Clear button instead of "nothing here yet" (PRD 15).
 */
interface ListUi { path: string; active: boolean; clear?: () => void; set: (path: string, active: boolean, clear?: () => void) => void }
export const useListUiStore = create<ListUi>()((set) => ({ path: '', active: false, set: (path, active, clear) => set({ path, active, clear }) }));
