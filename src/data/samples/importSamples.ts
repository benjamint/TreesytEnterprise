import type { Community, Farmer, Lang } from '@/types';
import { farmerProfileForm } from '@/data/forms/profiles';
import { ORG } from '@/data/seed/templates';

/**
 * Sample import file for Journey 15: 50 farmers for the company's own communities, with
 * 4 rows that fail validation (missing surname, short phone, 31 February, unknown sex),
 * one misspelt community (matched in the "Match locations" step) and 3 rows that import but
 * trip data-quality rules (a phone already registered, an age over 100, a household of 25).
 * Phones are written without their leading 0, as spreadsheets often drop it.
 */

const NAMES = {
  gh: {
    f: ['Akosua', 'Adwoa', 'Efua', 'Mariama', 'Rahinatu', 'Fuseina', 'Hawa', 'Asana', 'Memunatu', 'Zuweira', 'Lamisi', 'Ayishetu', 'Barikisu', 'Safia', 'Wumpini'],
    m: ['Yakubu', 'Issahaku', 'Abdulai', 'Seidu', 'Mumuni', 'Baba', 'Dramani', 'Alhassan', 'Iddrisu', 'Bukari', 'Sulemana', 'Napari'],
    s: ['Bawa', 'Salifu', 'Dagbanja', 'Yidana', 'Mahama', 'Tahiru', 'Zakaria', 'Saaka', 'Wumbei', 'Fuseini', 'Nakpa', 'Bayor', 'Dery', 'Kuuire'],
  },
  ci: {
    f: ['Adjoua', 'Akissi', 'Amenan', 'Affoué', 'Ahou', 'Mariam', 'Fatou', 'Awa', 'Brigitte', 'Odile', 'Pélagie', 'Yolande'],
    m: ['Kouassi', 'Konan', 'Yao', 'Koffi', 'Ange', 'Sékou', 'Drissa', 'Lassina', 'Gnagne', 'Zadi', 'Séraphin', 'Blaise'],
    s: ['Kouamé', 'N’Guessan', 'Gbagbo', 'Tra', 'Bamba', 'Ouattara', 'Coulibaly', 'Yapi', 'Dje', 'Zoro', 'Gnahoré', 'Kipré'],
  },
};

const HEAD = {
  en: ['First name', 'Surname', 'Sex', 'Date of birth', 'Phone number', 'Community', 'Household size', 'Children', 'Education level', 'Consent', 'Registered on'],
  fr: ['Prénom', 'Nom', 'Sexe', 'Date de naissance', 'Téléphone', 'Village', 'Taille du ménage', 'Enfants', 'Niveau d’études', 'Consentement', 'Date d’enregistrement'],
};

const dmy = (y: number, m: number, d: number) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function sampleFarmersCsv(opts: { orgId: string; lang: Lang; communities: Community[]; farmers: Farmer[]; now?: Date }): { fileName: string; csv: string } {
  const { orgId, lang, farmers } = opts;
  const now = opts.now ?? new Date();
  const ci = orgId === ORG.kakao;
  const names = ci ? NAMES.ci : NAMES.gh;
  const head = HEAD[ci ? 'fr' : lang === 'fr' ? 'fr' : 'en'];
  const yes = head === HEAD.fr ? 'Oui' : 'Yes';
  const sex = head === HEAD.fr ? { F: 'F', M: 'H' } : { F: 'F', M: 'M' };
  const coms = [...opts.communities].sort((a, b) => b.agentIds.length - a.agentIds.length || a.name.localeCompare(b.name)).filter((c) => c.agentIds.length).slice(0, 5);
  const edu = farmerProfileForm(orgId).sections.flatMap((s) => s.questions).find((q) => q.id === 'educationLevel')?.options ?? [];
  const eduLabel = (i: number) => { const o = edu[i % Math.min(3, edu.length)]; return o ? o.label[head === HEAD.fr ? 'fr' : 'en'] ?? o.value : ''; };
  const taken = new Set(farmers.map((f) => f.phone));
  const prefixes = ci ? ['7', '5', '1'] : ['24', '54', '20', '27'];
  const local = (i: number) => {
    for (let k = 0; ; k++) {
      const p = prefixes[(i + k) % prefixes.length]!;
      const n = `${p}${String(((i + 3) * 7_919 + k * 104_729) % 10 ** (9 - p.length)).padStart(9 - p.length, '0')}`;
      if (!taken.has(ci ? `+2250${n}` : `+233${n}`)) { taken.add(ci ? `+2250${n}` : `+233${n}`); return n; }
    }
  };
  // A phone that is already registered to a farmer in this company.
  const existing = farmers.find((f) => f.phone);
  const existingLocal = existing ? existing.phone.replace(ci ? '+2250' : '+233', '') : local(99);
  const misspell = (s: string) => (s.length > 4 ? s.slice(0, 2) + s.slice(3) : `${s}a`);

  const rows: (string | number)[][] = [];
  for (let i = 1; i <= 50; i++) {
    const female = i % 5 < 3;
    const first = (female ? names.f : names.m)[(i * 7) % (female ? names.f : names.m).length]!;
    const last = names.s[(i * 11) % names.s.length]!;
    const age = 22 + ((i * 13) % 48);
    const dob = dmy(now.getFullYear() - age, 1 + ((i * 5) % 12), 1 + ((i * 3) % 27));
    const household = 3 + ((i * 7) % 9);
    const children = Math.max(0, household - 2 - (i % 3));
    const c = coms[i % coms.length]!;
    const reg = new Date(now.getTime() - (3 + (i % 20)) * 86_400_000);
    rows.push([first, last, female ? sex.F : sex.M, dob, local(i), c.name, household, children, eduLabel(i), yes, dmy(reg.getFullYear(), reg.getMonth() + 1, reg.getDate())]);
  }
  // Four validation errors, fixed in the preview.
  rows[6]![1] = '';
  rows[14]![4] = ci ? '70123' : '24412';
  rows[22]![3] = '31/02/1984';
  rows[37]![2] = 'U';
  // One misspelt community, matched to the right one in "Match locations".
  rows[18]![5] = misspell(String(rows[18]![5]));
  // Three rows that import but raise data-quality flags.
  rows[10]![4] = existingLocal;
  rows[28]![3] = dmy(now.getFullYear() - 106, 4, 12);
  rows[43]![6] = 25;
  rows[43]![7] = 4;
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  return { fileName: ci ? 'producteurs-exemple.csv' : 'farmers-sample.csv', csv };
}
