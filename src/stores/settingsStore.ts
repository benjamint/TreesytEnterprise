import type { Organisation, OrgSettings } from '@/types';
import { nextNumber, type NumberContext } from '@/engines/numbering';
import { defineStore } from './persistence';

/** What a company was created with — "Reset to template" on every settings page restores from here. */
export interface Baseline {
  settings: OrgSettings;
  org?: Organisation;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const useSettingsStore = defineStore(
  'settings',
  {
    settings: {} as Record<string, OrgSettings>,
    sequences: {} as Record<string, Record<string, number>>,
    baselines: {} as Record<string, Baseline>,
  },
  (s) => ({
    settings: s.settings,
    sequences: s.sequences,
    baselines: Object.fromEntries(Object.entries(s.settings).map(([id, st]) => [id, { settings: clone(st), org: clone(s.orgs.find((o) => o.id === id)) }])),
  }),
  (set, get) => ({
    addSettings: (settings: OrgSettings, org?: Organisation) =>
      set((st) => ({
        settings: { ...st.settings, [settings.orgId]: settings },
        sequences: { ...st.sequences, [settings.orgId]: {} },
        baselines: { ...st.baselines, [settings.orgId]: { settings: clone(settings), org: org && clone(org) } },
      })),
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
