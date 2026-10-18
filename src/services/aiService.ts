import type { ModuleKey, OrgType } from '@/types';
import { COUNTRIES } from '@/data/catalogs/countries';
import { countryDefaults, type ApprovalChoice, type CompanyDraft, type TemplateKey } from '@/data/templates/companyTemplates';
import { latency } from '@/lib/utils';

/**
 * Scripted AI (PRD 4.4). Phase 2: "AI draft" for company setup — reads a free-text description and
 * fills the wizard. Every inference is returned as a note so the UI can explain what it guessed.
 */
export interface DraftNote {
  key: string;
  params: Record<string, unknown>;
}

const COMMODITY_WORDS: [RegExp, string, TemplateKey][] = [
  [/cashew|cajou|anacarde/i, 'com_cashew', 'cashew'],
  [/coco[a]?\b|cacao|cocoa/i, 'com_cocoa', 'cocoa'],
  [/shea|karit[eé]/i, 'com_shea', 'shea'],
  [/coffee|caf[eé]/i, 'com_coffee', 'coffee'],
  [/soy|soja/i, 'com_soy', 'grains'],
  [/maize|corn|ma[iï]s/i, 'com_maize', 'grains'],
  [/sesame|s[eé]same/i, 'com_sesame', 'grains'],
  [/groundnut|peanut|arachide/i, 'com_gnut', 'grains'],
  [/sorghum|sorgho/i, 'com_sorghum', 'grains'],
  [/millet|\bmil\b/i, 'com_millet', 'grains'],
  [/rice|\briz\b/i, 'com_rice', 'grains'],
];

const COUNTRY_ALIASES: Record<string, string> = { 'ivory coast': 'CI', 'cote d’ivoire': 'CI', "cote d'ivoire": 'CI' };

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const num = (s: string) => Number(s.replace(/[,\s]/g, ''));

export function draftCompanySync(text: string): { draft: Partial<CompanyDraft>; notes: DraftNote[] } {
  const t = text.trim();
  const lower = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const notes: DraftNote[] = [];
  const draft: Partial<CompanyDraft> = { description: t };

  // Country
  let country = Object.entries(COUNTRY_ALIASES).find(([k]) => lower.includes(k))?.[1];
  if (!country) country = COUNTRIES.find((c) => [c.name.en, c.name.fr].some((n) => lower.includes(n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))))?.code;
  if (country) {
    const d = countryDefaults(country);
    Object.assign(draft, { countries: [country], currency: d.currency, language: d.language, timezone: d.timezone, weekStart: 1 });
    notes.push({ key: 'country', params: { country, currency: d.currency, language: d.language.toUpperCase(), timezone: d.timezone } });
  }

  // Commodities and template
  const found = COMMODITY_WORDS.filter(([re]) => re.test(t));
  if (found.length) {
    draft.commodityIds = [...new Set(found.map(([, id]) => id))];
    draft.template = found[0]![2];
    notes.push({ key: 'commodities', params: { count: draft.commodityIds.length, template: draft.template } });
  }

  // Company type
  let type: OrgType = 'SUPPLIER';
  if (/\b(buyer|processor|roaster|manufactur|chocolat|brand)/i.test(t)) type = /export|sourc|aggregat|cooperative/i.test(t) ? 'BOTH' : 'BUYER';
  draft.type = type;
  notes.push({ key: 'type', params: { type } });

  // Size → plan
  const agents = t.match(/(\d[\d,\s]*)\s*(field\s+)?(agents|officers|délégués|delegues|buyers)/i);
  const farmers = t.match(/(\d[\d,\s]*)\s*(smallholder\s+)?(farmers|producteurs|growers|suppliers)/i);
  const agentCount = agents ? num(agents[1]!) : 0;
  const farmerCount = farmers ? num(farmers[1]!) : 0;
  draft.planId = agentCount > 50 || farmerCount > 20_000 ? 'plan_enterprise' : agentCount > 10 || farmerCount > 2_000 || found.length ? 'plan_growth' : 'plan_starter';
  notes.push({ key: 'plan', params: { agents: agentCount, farmers: farmerCount, plan: draft.planId } });

  // Modules worth switching on
  const modules = new Set<ModuleKey>(['dashboard', 'ai', 'farmers', 'dataQuality', 'imports', 'buying', 'payments', 'inventory', 'dispatch', 'salesContracts', 'traceboard', 'forms', 'workshops', 'fieldTeam', 'reports', 'notifications', 'system']);
  if (type === 'BUYER') ['buying', 'inventory', 'fieldTeam', 'farmers'].forEach((m) => modules.delete(m as ModuleKey));
  if (/loan|pre-?financ|credit|input|support|ploughing/i.test(t)) ['support', 'recovery'].forEach((m) => modules.add(m as ModuleKey));
  if (/eudr|deforest|traceab|plot|polygon/i.test(t) || draft.template === 'cocoa' || draft.template === 'coffee') ['plots', 'eudr'].forEach((m) => modules.add(m as ModuleKey));
  if (/tree|nurser|carbon|agroforest/i.test(t)) ['nurseries', 'trees', 'plots', 'carbon'].forEach((m) => modules.add(m as ModuleKey));
  if (/aggregat|trader/i.test(t)) modules.add('aggregators');
  if (/budget|trip|allowance/i.test(t)) ['weeklyBudgets', 'allowances'].forEach((m) => modules.add(m as ModuleKey));
  if (/commission/i.test(t)) modules.add('commissions');
  draft.modules = [...modules];
  notes.push({ key: 'modules', params: { count: modules.size } });

  // Approvals
  const above = t.match(/(?:above|over|plus de|au-dessus de)\s*([A-Z]{3})?\s*(\d[\d,\s]*)/i);
  let approvals: ApprovalChoice = 'two';
  if (above) {
    approvals = 'threeThreshold';
    draft.thresholdMajor = num(above[2]!);
  } else if (/single approv|one approv|une seule/i.test(t)) approvals = 'one';
  draft.approvals = approvals;
  draft.requesterCannotApprove = true;
  notes.push({ key: 'approvals', params: { approvals, threshold: draft.thresholdMajor ?? 0 } });

  // Name
  const named = t.match(/(?:called|named|appel[ée]e?|nomm[ée]e?)\s+["“]?([A-Z][\w&'’.\- ]+?)["”]?(?=[,.;]|\s+(?:in|with|based|that|we|en|au|avec)\b|$)/);
  const commodityWord = found[0] ? titleCase(t.match(found[0][0])![0].toLowerCase()) : 'Agri';
  const countryName = country ? COUNTRIES.find((c) => c.code === country)!.name.en : '';
  const role = /export/i.test(t) ? 'Exporters' : /cooperative|union/i.test(t) ? 'Cooperative Union' : /process/i.test(t) ? 'Processors' : 'Sourcing';
  draft.name = named ? named[1]!.trim() : [countryName, commodityWord, role].filter(Boolean).join(' ');
  draft.legalName = /\b(ltd|limited|sarl|sa|plc|ab|inc)\b/i.test(draft.name) ? draft.name : `${draft.name} ${country === 'CI' || country === 'SN' || country === 'BF' ? 'SARL' : 'Ltd'}`;
  notes.push({ key: named ? 'nameFound' : 'nameSuggested', params: { name: draft.name } });

  // Admin contact, if given
  const email = t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  if (email) {
    const who = t.match(/(?:[Aa]dmin(?:istrator)? is|[Cc]ontact is|[Cc]ontact:)\s+([A-Z][a-zé]+(?:\s+[A-Z][a-zé]+)+)/);
    draft.admins = [{ name: who?.[1] ?? '', email: email[0] }];
    notes.push({ key: 'admin', params: { email: email[0] } });
  }
  return { draft, notes };
}

/** Async wrapper with "thinking" latency. Uses the scripted parser (a real model call is optional in later phases). */
export async function draftCompany(text: string) {
  await latency(900, 1400);
  return draftCompanySync(text);
}
