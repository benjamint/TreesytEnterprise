import type { Country, Currency, DataSharingGrant, Lead, Organisation, Plan } from '@/types';
import { defineStore } from './persistence';

export const usePlatformStore = defineStore(
  'platform',
  { orgs: [] as Organisation[], plans: [] as Plan[], countries: [] as Country[], currencies: [] as Currency[], leads: [] as Lead[], grants: [] as DataSharingGrant[] },
  (s) => ({ orgs: s.orgs, plans: s.plans, countries: s.countries, currencies: s.currencies, leads: s.leads, grants: s.grants }),
  (set) => ({
    addLead: (lead: Lead) => set((st) => ({ leads: [lead, ...st.leads] })),
    updateOrg: (id: string, patch: Partial<Organisation>) => set((st) => ({ orgs: st.orgs.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  }),
);
