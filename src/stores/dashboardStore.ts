import { defineStore } from './persistence';

export type WidgetSize = 'third' | 'half' | 'twoThirds' | 'full';
export interface WidgetPlacement {
  id: string;
  size: WidgetSize;
}

/** Dashboard layouts (PRD B1): per person per company, plus a company default. */
export const useDashboardStore = defineStore(
  'dashboard',
  { layouts: {} as Record<string, WidgetPlacement[]>, companyDefaults: {} as Record<string, WidgetPlacement[]> },
  () => ({ layouts: {} as Record<string, WidgetPlacement[]>, companyDefaults: {} as Record<string, WidgetPlacement[]> }),
  (set) => ({
    saveLayout: (orgId: string, userId: string, layout: WidgetPlacement[]) => set((st) => ({ layouts: { ...st.layouts, [`${orgId}:${userId}`]: layout } })),
    resetLayout: (orgId: string, userId: string) =>
      set((st) => {
        const layouts = { ...st.layouts };
        delete layouts[`${orgId}:${userId}`];
        return { layouts };
      }),
    saveCompanyDefault: (orgId: string, layout: WidgetPlacement[]) => set((st) => ({ companyDefaults: { ...st.companyDefaults, [orgId]: layout } })),
  }),
);
