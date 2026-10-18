import type { Lang, TermKey, Terminology } from '@/types';

/** Default words per language; companies override them in Settings → Terminology (PRD 8.10). */
export const DEFAULT_TERMS: Record<Lang, Record<TermKey, string>> = {
  en: {
    agent: 'Agent', agents: 'Agents', community: 'Community', communities: 'Communities', farmer: 'Farmer', farmers: 'Farmers',
    farmerGroup: 'Farmer group', farmerGroups: 'Farmer groups', purchaseRequest: 'Purchase request', purchaseRequests: 'Purchase requests',
    pre: 'Expense (PRE)', pres: 'Expenses (PRE)', ticket: 'Ticket', warehouseOfficer: 'Warehouse officer', supervisor: 'Supervisor',
  },
  fr: {
    agent: 'Agent', agents: 'Agents', community: 'Communauté', communities: 'Communautés', farmer: 'Producteur', farmers: 'Producteurs',
    farmerGroup: 'Groupement', farmerGroups: 'Groupements', purchaseRequest: "Demande d'achat", purchaseRequests: "Demandes d'achat",
    pre: 'Dépense (PRE)', pres: 'Dépenses (PRE)', ticket: 'Ticket', warehouseOfficer: 'Magasinier', supervisor: 'Superviseur',
  },
};

export type Terms = Record<TermKey, string>;

/** Resolve the full term set for a company in a language (overrides on top of defaults). */
export function resolveTerms(overrides: Terminology | undefined, lang: Lang): Terms {
  return { ...DEFAULT_TERMS[lang], ...(overrides?.[lang] ?? {}) };
}

/** `term('agent')` → the company's word. Lower-case variants are available via `lower`. */
export function term(terms: Terms, key: TermKey, opts: { lower?: boolean } = {}): string {
  const v = terms[key];
  return opts.lower ? v.toLocaleLowerCase() : v;
}

/** Variables passed to i18next so strings can embed `{{term.agent}}` and `{{termLower.agents}}`. */
export function termVariables(terms: Terms) {
  const lower = Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, v.toLocaleLowerCase()]));
  return { term: terms, termLower: lower };
}
