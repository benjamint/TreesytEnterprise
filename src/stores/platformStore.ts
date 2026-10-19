import type { Country, Currency, DataSharingGrant, Lead, Organisation, Plan } from '@/types';
import { defineStore } from './persistence';

export const usePlatformStore = defineStore(
  'platform',
  { orgs: [] as Organisation[], plans: [] as Plan[], countries: [] as Country[], currencies: [] as Currency[], leads: [] as Lead[], grants: [] as DataSharingGrant[], questionTypes: {} as Record<string, boolean> },
  (s) => ({ orgs: s.orgs, plans: s.plans, countries: s.countries, currencies: s.currencies, leads: s.leads, grants: s.grants, questionTypes: s.questionTypes }),
  (set) => ({
    addLead: (lead: Lead) => set((st) => ({ leads: [lead, ...st.leads] })),
    addOrg: (org: Organisation) => set((st) => ({ orgs: [...st.orgs, org] })),
    setQuestionType: (key: string, on: boolean) => set((st) => ({ questionTypes: { ...st.questionTypes, [key]: on } })),
    addGrant: (g: DataSharingGrant) => set((st) => ({ grants: [g, ...st.grants] })),
    updateGrant: (id: string, patch: Partial<DataSharingGrant>) => set((st) => ({ grants: st.grants.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
    updateOrg: (id: string, patch: Partial<Organisation>) => set((st) => ({ orgs: st.orgs.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  }),
);
