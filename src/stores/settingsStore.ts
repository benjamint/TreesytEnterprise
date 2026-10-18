import type { OrgSettings } from '@/types';
import { nextNumber, type NumberContext } from '@/engines/numbering';
import { defineStore } from './persistence';

export const useSettingsStore = defineStore(
  'settings',
  { settings: {} as Record<string, OrgSettings>, sequences: {} as Record<string, Record<string, number>> },
  (s) => ({ settings: s.settings, sequences: s.sequences }),
  (set, get) => ({
    addSettings: (settings: OrgSettings) => set((st) => ({ settings: { ...st.settings, [settings.orgId]: settings }, sequences: { ...st.sequences, [settings.orgId]: {} } })),
    updateSettings: (orgId: string, patch: Partial<OrgSettings>) =>
      set((st) => ({ settings: { ...st.settings, [orgId]: { ...st.settings[orgId]!, ...patch } } })),
    /** Issue the next document number for a company (numbering engine + per-company sequences). */
    issueNumber: (orgId: string, docType: string, ctx: NumberContext = {}): string => {
      const pattern = get().settings[orgId]?.numbering.find((p) => p.docType === docType);
      if (!pattern) throw new Error(`No numbering pattern for ${docType}`);
      const res = nextNumber(pattern, get().sequences[orgId] ?? {}, ctx);
      set((st) => ({ sequences: { ...st.sequences, [orgId]: res.sequences } }));
      return res.number;
    },
  }),
);
