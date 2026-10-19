import Papa from 'papaparse';
import type { Community, Farmer, ImportRun, ImportType, Lang, LocationNode, OrgSettings } from '@/types';
import type { Question } from '@/engines/forms';
import { ancestorAtLevel, importLocations } from '@/engines/locations';
import { initialsOf } from '@/engines/numbering';
import { makeEvent } from '@/engines/activity';
import { communityProfileForm, farmerProfileForm } from '@/data/forms/profiles';
import { isValidPhone } from '@/lib/format';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useImportStore } from '@/stores/importStore';
import { useLocationStore } from '@/stores/locationStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { recheck } from './qualityService';

/**
 * Import wizard engine (PRD C6): fields per type, auto-matching columns, transforms, location
 * matching, row validation, commit with a data-quality re-check, and undo. Pure where possible;
 * `commitImport` and `undoImport` write to the stores.
 */

export const SUPPORTED_IMPORTS: ImportType[] = ['farmers', 'communities', 'locations'];
export const ALL_IMPORTS: ImportType[] = ['communities', 'farmers', 'groups', 'members', 'leaders', 'recoveries', 'warehouseLoads', 'priceLists', 'locations', 'users', 'agents'];

export type FieldKind = 'text' | 'date' | 'phone' | 'number' | 'gender' | 'community' | 'parent' | 'yesNo' | 'select' | 'commodity';
export type Transform = 'none' | 'trim' | 'upper' | 'leadingZero' | 'ddmmyyyy' | 'mmddyyyy';
export const TRANSFORMS: Transform[] = ['none', 'trim', 'upper', 'leadingZero', 'ddmmyyyy', 'mmddyyyy'];

export interface ImportField {
  key: string;
  /** i18n key, or a literal label for form questions. */
  label: { key?: string; text?: string };
  required?: boolean;
  kind: FieldKind;
  aliases: string[];
  options?: { value: string; labels: string[] }[];
  /** Where the value is written on the record. */
  path: string;
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const IMPORTABLE: Question['type'][] = ['shortText', 'longText', 'number', 'decimal', 'currency', 'selectOne', 'yesNo', 'date', 'phone', 'email'];
function formFields(questions: Question[]): ImportField[] {
  return questions.filter((q) => IMPORTABLE.includes(q.type)).map((q) => ({
    key: q.id, label: { text: q.label.en ?? q.id }, kind: q.type === 'number' || q.type === 'decimal' || q.type === 'currency' ? 'number' : q.type === 'selectOne' ? 'select' : q.type === 'yesNo' ? 'yesNo' : q.type === 'date' ? 'date' : q.type === 'phone' ? 'phone' : 'text',
    aliases: [q.id, q.label.en ?? '', q.label.fr ?? ''], path: `customFields.${q.id}`, required: q.required,
    options: q.options?.map((o) => ({ value: o.value, labels: [o.value, o.label.en ?? '', o.label.fr ?? ''] })),
  }));
}
const labelFor = (q: Question, lang: Lang) => q.label[lang] ?? q.label.en ?? q.id;

/** Fields for each import type, generated from the company's current forms and levels. */
export function importFields(type: ImportType, orgId: string, settings: OrgSettings, lang: Lang): ImportField[] {
  if (type === 'farmers') {
    const form = farmerProfileForm(orgId);
    const qs = form.sections.flatMap((s) => s.questions);
    return [
      { key: 'farmerCode', label: { key: 'imp.field.farmerCode' }, kind: 'text', aliases: ['farmer id', 'farmer code', 'id producteur', 'code'], path: 'farmerCode' },
      { key: 'firstName', label: { key: 'imp.field.firstName' }, required: true, kind: 'text', aliases: ['first name', 'firstname', 'given name', 'prenom', 'prénom'], path: 'firstName' },
      { key: 'lastName', label: { key: 'imp.field.lastName' }, required: true, kind: 'text', aliases: ['last name', 'lastname', 'surname', 'family name', 'nom'], path: 'lastName' },
      { key: 'gender', label: { key: 'imp.field.gender' }, required: true, kind: 'gender', aliases: ['gender', 'sex', 'sexe', 'genre'], path: 'gender' },
      { key: 'dateOfBirth', label: { key: 'imp.field.dateOfBirth' }, required: true, kind: 'date', aliases: ['date of birth', 'dob', 'birth date', 'birthdate', 'date de naissance'], path: 'dateOfBirth' },
      { key: 'phone', label: { key: 'imp.field.phone' }, kind: 'phone', aliases: ['phone', 'phone number', 'mobile', 'telephone', 'téléphone'], path: 'phone' },
      { key: 'community', label: { key: 'imp.field.community' }, required: true, kind: 'community', aliases: ['community', 'village', 'communaute', 'communauté', 'localite'], path: 'communityId' },
      { key: 'registeredAt', label: { key: 'imp.field.registeredAt' }, kind: 'date', aliases: ['registered', 'registered on', 'registration date', 'date enregistrement', 'date d’enregistrement'], path: 'registeredAt' },
      { key: 'primaryCrop', label: { key: 'imp.field.primaryCrop' }, kind: 'commodity', aliases: ['crop', 'main crop', 'primary crop', 'commodity', 'culture', 'produit'], path: 'primaryCrop' },
      { key: 'consent', label: { key: 'imp.field.consent' }, kind: 'yesNo', aliases: ['consent', 'consentement', 'consent given'], path: 'identity.consent' },
      ...formFields(qs).map((f) => ({ ...f, label: { text: labelFor(qs.find((q) => q.id === f.key)!, lang) }, aliases: [...f.aliases, ...(f.key === 'numberOfChildren' ? ['children', 'enfants'] : [])] })),
    ];
  }
  if (type === 'communities') {
    const qs = communityProfileForm(orgId).sections.flatMap((s) => s.questions);
    return [
      { key: 'name', label: { key: 'imp.field.name' }, required: true, kind: 'text', aliases: ['name', 'community', 'community name', 'nom', 'village'], path: 'name' },
      { key: 'parent', label: { key: 'imp.field.parent' }, required: true, kind: 'parent', aliases: ['district', 'parent', 'location', 'departement', 'département', 'area'], path: 'locationNodeId' },
      { key: 'population', label: { key: 'imp.field.population' }, kind: 'number', aliases: ['population', 'pop'], path: 'population' },
      { key: 'contactName', label: { key: 'imp.field.contactName' }, kind: 'text', aliases: ['contact', 'contact name', 'contact person', 'chief'], path: 'contactPerson.name' },
      { key: 'contactPhone', label: { key: 'imp.field.contactPhone' }, kind: 'phone', aliases: ['contact phone', 'phone', 'telephone'], path: 'contactPerson.phone' },
      { key: 'lat', label: { key: 'imp.field.lat' }, kind: 'number', aliases: ['lat', 'latitude'], path: 'gps.lat' },
      { key: 'lng', label: { key: 'imp.field.lng' }, kind: 'number', aliases: ['lng', 'lon', 'long', 'longitude'], path: 'gps.lng' },
      ...formFields(qs).map((f) => ({ ...f, label: { text: labelFor(qs.find((q) => q.id === f.key)!, lang) } })),
    ];
  }
  if (type === 'locations') {
    return settings.locationLevels.map((l, i) => ({ key: `level${i}`, label: { text: l.label[lang] ?? l.label.en ?? l.id }, required: i === 0, kind: 'text' as const, aliases: [l.label.en ?? '', l.label.fr ?? '', l.id], path: l.id }));
  }
  return [];
}

export interface Parsed { headers: string[]; rows: string[][] }

export async function parseFile(file: File): Promise<Parsed> {
  let grid: string[][];
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    grid = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][]).map((r) => r.map((c) => String(c ?? '')));
  } else {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    grid = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
  }
  const [headers = [], ...rows] = grid.filter((r) => r.some((c) => String(c).trim()));
  return { headers: headers.map((h) => String(h).trim()), rows };
}

export type Mapping = Record<string, number | null>;

/** Match columns by name and aliases; each column is used once. */
export function autoMatch(headers: string[], fields: ImportField[]): Mapping {
  const used = new Set<number>();
  const out: Mapping = {};
  for (const f of fields) {
    const names = new Set([f.key, ...f.aliases].map(norm).filter(Boolean));
    const i = headers.findIndex((h, idx) => !used.has(idx) && names.has(norm(h)));
    out[f.key] = i >= 0 ? i : null;
    if (i >= 0) used.add(i);
  }
  return out;
}

/** Suggest a transform from the column's values ("parse dd/mm/yyyy", "add leading 0"). */
export function suggestTransform(field: ImportField, values: string[]): Transform {
  const v = values.map((x) => x.trim()).filter(Boolean);
  if (!v.length) return 'none';
  if (field.kind === 'date' && v.filter((x) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x)).length > v.length / 2) {
    return v.some((x) => Number(x.split('/')[1]) > 12) ? 'mmddyyyy' : 'ddmmyyyy';
  }
  if (field.kind === 'phone' && v.filter((x) => /^[1-9]\d{8}$/.test(x)).length > v.length / 2) return 'leadingZero';
  return 'none';
}

export function applyTransform(raw: string, tr: Transform): string {
  const v = raw ?? '';
  switch (tr) {
    case 'trim': return v.trim().replace(/\s+/g, ' ');
    case 'upper': return v.trim().toUpperCase();
    case 'leadingZero': return /^[1-9]\d*$/.test(v.trim()) ? `0${v.trim()}` : v.trim();
    case 'ddmmyyyy':
    case 'mmddyyyy': {
      const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return v.trim();
      const [d, mo] = tr === 'ddmmyyyy' ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
      return `${m[3]}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    default: return v.trim();
  }
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

export interface Place { id: string; name: string; code: string; detail?: string }

/** Exact match by name or code; otherwise fuzzy suggestions (closest first). */
export function matchPlace(raw: string, places: Place[]): { exact?: Place; suggestions: Place[] } {
  const n = norm(raw);
  if (!n) return { suggestions: [] };
  const exact = places.find((p) => norm(p.name) === n || norm(p.code) === n);
  if (exact) return { exact, suggestions: [] };
  const scored = places.map((p) => ({ p, d: Math.min(lev(n, norm(p.name)), norm(p.name).includes(n) || n.includes(norm(p.name)) ? 1 : 99) })).filter((x) => x.d <= Math.max(2, Math.floor(n.length / 4))).sort((a, b) => a.d - b.d);
  return { suggestions: scored.slice(0, 4).map((x) => x.p) };
}

export interface PreviewRow {
  /** 1-based row number in the file (after the header). */
  index: number;
  raw: Record<string, string>;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  warnings: string[];
}

export interface ValidateCtx {
  orgId: string;
  country: string;
  settings: OrgSettings;
  places: Record<string, string>;
  farmers: Farmer[];
}

/** E.164 for the company's country from local or international input. */
export function toE164(raw: string, country: string): string {
  const v = raw.replace(/[\s().-]/g, '');
  if (!v) return '';
  if (v.startsWith('+')) return v;
  if (v.startsWith('00')) return `+${v.slice(2)}`;
  const cc = country === 'CI' ? '225' : '233';
  if (v.startsWith(cc) && v.length > 10) return `+${v}`;
  return `+${cc}${country === 'CI' ? v : v.replace(/^0/, '')}`;
}

const YES = new Set(['yes', 'y', 'true', '1', 'oui', 'o', 'x']);
const NO = new Set(['no', 'n', 'false', '0', 'non']);

function parseValue(f: ImportField, v: string, ctx: ValidateCtx): { value?: unknown; error?: string } {
  if (!v) return f.required ? { error: 'required' } : {};
  switch (f.kind) {
    case 'date': {
      let s = v;
      if (/^\d{5}$/.test(v)) s = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000).toISOString().slice(0, 10);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
      if (!m || !d || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) return { error: 'badDate' };
      if (d.getTime() > Date.now()) return { error: 'futureDate' };
      return { value: s };
    }
    case 'phone': {
      const e = toE164(v, ctx.country);
      return isValidPhone(e, ctx.country) ? { value: e } : { error: 'badPhone' };
    }
    case 'number': {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? { value: n } : { error: 'badNumber' };
    }
    case 'gender': {
      const n = norm(v);
      if (['f', 'female', 'femme', 'woman', 'w'].includes(n)) return { value: 'F' };
      if (['m', 'male', 'homme', 'man', 'h'].includes(n)) return { value: 'M' };
      return { error: 'badGender' };
    }
    case 'yesNo': {
      const n = v.trim().toLowerCase();
      if (YES.has(n)) return { value: true };
      if (NO.has(n)) return { value: false };
      return { error: 'badYesNo' };
    }
    case 'select': {
      const n = norm(v);
      const o = f.options?.find((x) => x.labels.some((l) => norm(l) === n));
      return o ? { value: o.value } : { error: 'badOption' };
    }
    case 'commodity': {
      const n = norm(v);
      const c = ctx.settings.commodities.find((x) => norm(x.code) === n || Object.values(x.name).some((l) => norm(l ?? '') === n));
      return c ? { value: c.id } : { error: 'badOption' };
    }
    case 'community':
    case 'parent': {
      const id = ctx.places[v];
      return id ? { value: id } : { error: f.kind === 'community' ? 'unknownCommunity' : 'unknownLocation' };
    }
    default: return { value: v };
  }
}

/** Validate every row: errors block a row, warnings (likely duplicates) don't. */
export function validateRows(type: ImportType, fields: ImportField[], parsed: Parsed, mapping: Mapping, transforms: Record<string, Transform>, overrides: Record<string, string>, ctx: ValidateCtx): PreviewRow[] {
  const existingPhones = new Map(ctx.farmers.map((f) => [f.phone, f]));
  const existingCodes = new Map(ctx.farmers.map((f) => [f.farmerCode, f]));
  const seenPhones = new Map<string, number>();
  return parsed.rows.map((cells, i) => {
    const row: PreviewRow = { index: i + 1, raw: {}, values: {}, errors: {}, warnings: [] };
    for (const f of fields) {
      const col = mapping[f.key];
      const key = `${i}:${f.key}`;
      const raw = key in overrides ? overrides[key]! : col == null ? '' : applyTransform(cells[col] ?? '', transforms[f.key] ?? 'none');
      row.raw[f.key] = raw;
      const res = parseValue(f, raw.trim(), ctx);
      if (res.error) row.errors[f.key] = res.error;
      else if (res.value !== undefined) row.values[f.key] = res.value;
    }
    if (type === 'farmers') {
      const phone = row.values.phone as string | undefined;
      if (phone) {
        const dup = existingPhones.get(phone);
        if (dup && dup.farmerCode !== row.values.farmerCode) row.warnings.push(`dupPhone:${dup.firstName} ${dup.lastName} (${dup.farmerCode})`);
        if (seenPhones.has(phone)) row.warnings.push(`dupInFile:${seenPhones.get(phone)}`);
        else seenPhones.set(phone, i + 1);
      }
      const code = row.values.farmerCode as string | undefined;
      if (code && existingCodes.has(code)) row.warnings.push('updates');
    }
    if (type === 'locations') {
      // Rows may stop at any level, but can't skip one.
      const filled = fields.map((f) => !!row.raw[f.key]?.trim());
      fields.forEach((f, k) => { if (!filled[k] && filled.slice(k + 1).some(Boolean)) row.errors[f.key] = 'gap'; });
    }
    return row;
  });
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  const last = parts.pop()!;
  let cur = obj;
  for (const p of parts) cur = (cur[p] = { ...((cur[p] as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
  cur[last] = value;
}

export interface CommitResult { run: ImportRun; flags: number; errorRows: PreviewRow[] }

/** Write valid rows, re-check data quality on what was written (source IMPORT), record the run. */
export function commitImport(type: ImportType, fileName: string, fields: ImportField[], rows: PreviewRow[], ctx: ValidateCtx & { actorId: string }): CommitResult {
  const { orgId, actorId, settings } = ctx;
  const good = rows.filter((r) => !Object.keys(r.errors).length);
  const errorRows = rows.filter((r) => Object.keys(r.errors).length);
  const now = new Date().toISOString();
  const createdIds: string[] = [];
  let updated = 0;
  let flags = 0;
  const log = (entity: string, id: string, key: string, params: Record<string, unknown>) => useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device: 'web' }));

  if (type === 'farmers') {
    const communities = useCommunityStore.getState().communities;
    const nodes = useLocationStore.getState().nodes;
    const byCode = new Map(ctx.farmers.map((f) => [f.farmerCode, f]));
    const created: Farmer[] = [];
    const touched: string[] = [];
    for (const r of good) {
      const v = r.values;
      const com = communities.find((c) => c.id === v.community)!;
      const existing = v.farmerCode ? byCode.get(String(v.farmerCode)) : undefined;
      const base: Farmer = existing ? structuredClone(existing) : {
        id: uid('far'), orgId, createdAt: now, updatedAt: now, createdBy: actorId, farmerCode: '', firstName: '', lastName: '', gender: 'F', dateOfBirth: '', phone: '',
        communityId: com.id, locationNodeId: com.locationNodeId, registeredAt: now, agentId: com.agentIds[0] ?? '', primaryCrop: settings.commodities[0]?.id ?? '',
        identity: { photo: false, idCard: false, thumbprints: { left: false, right: false }, consent: null, nfcCard: null }, qualityStatus: 'OK', score: 0, version: 0, customFields: {},
      };
      const rec = base as unknown as Record<string, unknown>;
      for (const f of fields) {
        if (!(f.key in v) || f.key === 'farmerCode') continue;
        if (f.key === 'consent') base.identity.consent = v.consent ? { type: 'TICK', capturedAt: now } : null;
        else if (f.key === 'registeredAt') base.registeredAt = new Date(String(v.registeredAt)).toISOString();
        else setPath(rec, f.path, v[f.key]);
      }
      base.locationNodeId = com.locationNodeId;
      if (!existing) base.agentId = com.agentIds[0] ?? base.agentId;
      base.version = (existing?.version ?? 0) + 1;
      base.updatedAt = now;
      if (existing) {
        useFarmerStore.getState().saveFarmer(base);
        log('farmer', base.id, 'farmer.importUpdated', { file: fileName, version: base.version });
        updated++;
      } else {
        const region = ancestorAtLevel(nodes, com.locationNodeId, settings.locationLevels[0]!.id);
        // "Import existing IDs": a code the company doesn't know yet is kept as the farmer's ID.
        base.farmerCode = v.farmerCode ? String(v.farmerCode) : useSettingsStore.getState().issueNumber(orgId, 'farmerId', { community: com.code, initials: initialsOf(`${base.firstName} ${base.lastName}`), region: region?.code ?? '', date: new Date() });
        created.push(base);
        createdIds.push(base.id);
      }
      touched.push(base.id);
    }
    if (created.length) useFarmerStore.getState().addFarmers(created);
    for (const f of created) log('farmer', f.id, 'farmer.imported', { file: fileName, code: f.farmerCode });
    flags = recheck(orgId, 'farmer', touched, 'IMPORT', actorId).length;
  } else if (type === 'communities') {
    const levels = settings.locationLevels;
    const leaf = levels[levels.length - 1]!.id;
    let nodes = useLocationStore.getState().nodes.filter((n) => n.orgId === orgId);
    const cs: Community[] = [];
    for (const r of good) {
      const v = r.values;
      const name = String(v.name);
      let node = nodes.find((n) => n.parentId === v.parent && n.levelId === leaf && n.name.toLowerCase() === name.toLowerCase());
      if (!node) {
        node = { id: uid('loc'), orgId, levelId: leaf, parentId: String(v.parent), name, code: name.slice(0, 3).toUpperCase() };
        nodes = [...nodes, node];
        createdIds.push(node.id);
      }
      const region = ancestorAtLevel(nodes, node.id, levels[0]!.id);
      const c: Community = {
        id: uid('com'), orgId, createdAt: now, updatedAt: now, createdBy: actorId, code: useSettingsStore.getState().issueNumber(orgId, 'communityCode', { region: region?.code ?? '', date: new Date() }),
        name, locationNodeId: node.id, population: Number(v.population ?? 0), agentIds: [], gps: { lat: Number(v.lat ?? 0), lng: Number(v.lng ?? 0) },
        contactPerson: { name: String(v.contactName ?? ''), phone: String(v.contactPhone ?? '') }, profiledAt: now, score: 0, flags: [], customFields: {},
      };
      for (const f of fields) if (f.path.startsWith('customFields.') && f.key in v) c.customFields[f.key] = v[f.key];
      cs.push(c);
      createdIds.push(c.id);
    }
    useLocationStore.getState().setOrgNodes(orgId, nodes);
    useCommunityStore.getState().addCommunities(cs);
    for (const c of cs) log('community', c.id, 'community.imported', { file: fileName, code: c.code });
    flags = recheck(orgId, 'community', cs.map((c) => c.id), 'IMPORT', actorId).length;
  } else if (type === 'locations') {
    const existing = useLocationStore.getState().nodes.filter((n) => n.orgId === orgId);
    const before = new Set(existing.map((n) => n.id));
    const grid = good.map((r) => fields.map((f) => r.raw[f.key] ?? ''));
    // Rows can stop at any level: fill the tree down to the deepest named level.
    const byDepth = new Map<number, string[][]>();
    for (const g of grid) {
      const depth = g.findIndex((c) => !c.trim());
      const d = depth < 0 ? g.length : depth;
      byDepth.set(d, [...(byDepth.get(d) ?? []), g.slice(0, d)]);
    }
    let nodes: LocationNode[] = existing;
    for (const [d, list] of byDepth) nodes = importLocations(nodes, settings.locationLevels.slice(0, d), list, orgId, () => uid('loc')).nodes;
    useLocationStore.getState().setOrgNodes(orgId, nodes);
    createdIds.push(...nodes.filter((n) => !before.has(n.id)).map((n) => n.id));
  }

  const run: ImportRun = {
    id: uid('imp'), orgId, type, fileName, by: actorId, at: now, created: type === 'locations' ? createdIds.length : createdIds.filter((id) => !id.startsWith('loc_')).length,
    updated, skipped: errorRows.length, errors: errorRows.length, createdIds, status: 'DONE',
  };
  useImportStore.getState().addRun(run);
  return { run, flags, errorRows };
}

/** Undo an import: remove the records it created (updates to existing records stay). */
export function undoImport(runId: string): number {
  const run = useImportStore.getState().runs.find((r) => r.id === runId);
  if (!run || run.status === 'UNDONE') return 0;
  const ids = new Set(run.createdIds);
  if (run.type === 'farmers') useFarmerStore.getState().removeFarmers(run.createdIds);
  if (run.type === 'communities') useCommunityStore.getState().removeCommunities(run.createdIds);
  const nodes = useLocationStore.getState().nodes.filter((n) => n.orgId === run.orgId);
  if (nodes.some((n) => ids.has(n.id))) useLocationStore.getState().setOrgNodes(run.orgId, nodes.filter((n) => !ids.has(n.id)));
  const q = useQualityStore.getState();
  q.removeIssues(q.issues.filter((i) => ids.has(i.recordId)).map((i) => i.id));
  useImportStore.getState().updateRun(runId, { status: 'UNDONE' });
  return run.created;
}

/** The template for a type: its columns (from the current forms) and one example row. */
export function templateRows(fields: ImportField[], label: (f: ImportField) => string): string[][] {
  return [fields.map(label)];
}

export function errorFileRows(fields: ImportField[], rows: PreviewRow[], label: (f: ImportField) => string, error: (field: string, code: string) => string, errorsHeader: string): (string | number)[][] {
  return [[...fields.map(label), errorsHeader], ...rows.map((r) => [...fields.map((f) => r.raw[f.key] ?? ''), Object.entries(r.errors).map(([k, c]) => error(k, c)).join('; ')])];
}
