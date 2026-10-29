import * as XLSX from 'xlsx';
import type { ExportJob, ModuleKey, ReportFilter, SavedReport } from '@/types';
import { allQuestions } from '@/engines/forms';
import { REPORT_LIBRARY } from '@/data/reports/library';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLandStore } from '@/stores/landStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useSystemStore } from '@/stores/systemStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActivityStore } from '@/stores/activityStore';
import { getLiveForm } from './formService';
import { sendEmail } from './emailGateway';
import { registerJob } from './jobScheduler';
import { usePlatformStore } from '@/stores/platformStore';

/**
 * Report engine (PRD K1): an entity gives rows of plain values; a report picks columns, filters,
 * an optional group-by and a chart. Names are resolved in the viewer's language; enum codes and
 * headings are translated by the caller (`label`).
 */
export type ColKind = 'text' | 'number' | 'money' | 'date' | 'enum' | 'bool';
export interface ReportColumn { key: string; kind: ColKind; /** Literal heading (form fields); otherwise `rpt.col.{key}`. */ label?: string; sensitive?: boolean }
export type Row = Record<string, string | number | boolean | null | undefined>;
interface Entity { key: string; module?: ModuleKey; columns: (orgId: string, lang: Lang) => ReportColumn[]; rows: (orgId: string, lang: Lang) => Row[] }
type Lang = 'en' | 'fr';

const nm = (x: Partial<Record<Lang, string>> | undefined, lang: Lang, fallback = '') => (x ? x[lang] ?? x.en ?? x.fr ?? fallback : fallback);
const c = (key: string, kind: ColKind = 'text', extra: Partial<ReportColumn> = {}): ReportColumn => ({ key, kind, ...extra });
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const of = <T extends { orgId: string }>(xs: T[], orgId: string) => xs.filter((x) => x.orgId === orgId);

function lookups(orgId: string, lang: Lang) {
  const users = new Map(useAccessStore.getState().users.map((u) => [u.id, u.name]));
  const agents = new Map(useAgentStore.getState().agents.map((a) => [a.id, users.get(a.userId) ?? a.userId]));
  const communities = new Map(useCommunityStore.getState().communities.map((x) => [x.id, x.name]));
  const groups = new Map(useGroupStore.getState().groups.map((x) => [x.id, x.name]));
  const farmers = new Map(useFarmerStore.getState().farmers.map((f) => [f.id, `${f.firstName} ${f.lastName}`]));
  const s = useSettingsStore.getState().settings[orgId];
  const warehouses = new Map(useWarehouseStore.getState().warehouses.map((w) => [w.id, w.name]));
  return {
    agent: (id?: string) => (id ? agents.get(id) ?? '' : ''),
    community: (id?: string) => (id ? communities.get(id) ?? '' : ''),
    group: (id?: string) => (id ? groups.get(id) ?? '' : ''),
    farmer: (id?: string) => (id ? farmers.get(id) ?? '' : ''),
    warehouse: (id?: string) => (id ? warehouses.get(id) ?? '' : ''),
    commodity: (id: string) => nm(s?.commodities.find((x) => x.id === id)?.name, lang, id),
    provider: (id: string) => s?.paymentProviders.find((x) => x.id === id)?.name ?? id,
    species: (id: string) => nm(s?.land.species.find((x) => x.id === id)?.name, lang, id),
    supportType: (id: string) => nm(s?.support.types.find((x) => x.id === id)?.name, lang, id),
  };
}

const ENTITIES: Entity[] = [
  {
    key: 'farmers', module: 'farmers',
    columns: (orgId, lang) => {
      const form = getLiveForm(orgId, 'farmerProfile');
      const qs = allQuestions(form).filter((q) => !['note', 'repeatGroup', 'table', 'image', 'audio', 'video', 'file', 'signature', 'gps', 'geoshape'].includes(q.type));
      return [
        c('farmerId'), c('name', 'text', { sensitive: true }), c('gender', 'enum'), c('phone', 'text', { sensitive: true }), c('community'), c('agent'), c('registeredAt', 'date'),
        c('score', 'number'), c('qualityStatus', 'enum'), c('primaryCrop'),
        ...qs.map((q) => c(`form.${q.id}`, q.type === 'number' || q.type === 'decimal' ? 'number' : 'text', { label: nm(q.label, lang, q.id), sensitive: q.sensitive })),
      ];
    },
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useFarmerStore.getState().farmers, orgId).map((f) => {
        const r: Row = { id: f.id, farmerId: f.farmerCode, name: `${f.firstName} ${f.lastName}`, gender: f.gender, phone: f.phone, community: L.community(f.communityId), agent: L.agent(f.agentId), registeredAt: day(f.registeredAt), score: f.score, qualityStatus: f.qualityStatus, primaryCrop: f.primaryCrop };
        for (const [k, v] of Object.entries(f.customFields)) r[`form.${k}`] = Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v ? JSON.stringify(v) : (v as Row[string]);
        return r;
      });
    },
  },
  {
    key: 'purchases', module: 'buying',
    columns: () => [c('number'), c('date', 'date'), c('farmer', 'text', { sensitive: true }), c('community'), c('agent'), c('commodity'), c('quantity', 'number'), c('unitPrice', 'money'), c('amount', 'money'), c('paymentStatus', 'enum'), c('source', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useBuyingStore.getState().purchases, orgId).map((p) => ({ id: p.id, commodityId: p.commodityId, number: p.number, date: day(p.createdAt), farmer: L.farmer(p.farmerId), community: L.community(p.communityId), agent: L.agent(p.agentId), commodity: L.commodity(p.commodityId), quantity: p.quantity, unitPrice: p.unitPrice.amountMinor, amount: p.amount.amountMinor, paymentStatus: p.paymentStatus, source: p.syncedFrom ?? 'WEB' }));
    },
  },
  {
    key: 'purchaseRequests', module: 'buying',
    columns: () => [c('number'), c('plannedDate', 'date'), c('agent'), c('community'), c('commodity'), c('volume', 'number'), c('unitPrice', 'money'), c('total', 'money'), c('variancePct', 'number'), c('status', 'enum'), c('disbursementStatus', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useBuyingStore.getState().requests, orgId).map((r) => ({ id: r.id, commodityId: r.commodityId, number: r.number, plannedDate: r.plannedDate, agent: L.agent(r.agentId), community: L.community(r.communityId), commodity: L.commodity(r.commodityId), volume: r.volume, unitPrice: r.unitPrice.amountMinor, total: r.total.amountMinor, variancePct: r.variancePct, status: r.status, disbursementStatus: r.disbursementStatus }));
    },
  },
  {
    key: 'preExpenses', module: 'buying',
    columns: () => [c('number'), c('date', 'date'), c('agent'), c('request'), c('bags', 'number'), c('total', 'money'), c('status', 'enum'), c('paymentStatus', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      const req = new Map(useBuyingStore.getState().requests.map((r) => [r.id, r.number]));
      return of(useBuyingStore.getState().expenses, orgId).map((e) => ({ id: e.id, number: e.number, date: day(e.createdAt), agent: L.agent(e.agentId), request: req.get(e.requestId) ?? '', bags: e.bags, total: e.total.amountMinor, status: e.status, paymentStatus: e.paymentStatus }));
    },
  },
  {
    key: 'reconciliation', module: 'buying',
    columns: () => [c('number'), c('agent'), c('community'), c('requested', 'money'), c('disbursed', 'money'), c('purchased', 'money'), c('balance', 'money'), c('reconciliationStatus', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      const bought = new Map<string, number>();
      for (const p of of(useBuyingStore.getState().purchases, orgId)) bought.set(p.requestId, (bought.get(p.requestId) ?? 0) + p.amount.amountMinor);
      return of(useBuyingStore.getState().requests, orgId).filter((r) => r.disbursements.length).map((r) => {
        const disbursed = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
        const purchased = bought.get(r.id) ?? 0;
        return { id: r.id, number: r.number, agent: L.agent(r.agentId), community: L.community(r.communityId), requested: r.total.amountMinor, disbursed, purchased, balance: disbursed - purchased, reconciliationStatus: r.reconciliationStatus };
      });
    },
  },
  {
    key: 'payments', module: 'payments',
    columns: () => [c('reference'), c('date', 'date'), c('payee', 'text', { sensitive: true }), c('payableType', 'enum'), c('provider'), c('amount', 'money'), c('fee', 'money'), c('total', 'money'), c('status', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(usePaymentStore.getState().payments, orgId).map((p) => ({ id: p.id, reference: p.reference, date: day(p.createdAt), payee: p.payee.name, payableType: p.payableType, provider: L.provider(p.providerId), amount: p.amount.amountMinor, fee: p.fee.amountMinor, total: p.total.amountMinor, status: p.status }));
    },
  },
  {
    key: 'recoveries', module: 'recovery',
    columns: () => [c('number'), c('date', 'date'), c('group'), c('agent'), c('loans', 'number'), c('status', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useSupportStore.getState().recoveries, orgId).map((r) => ({ id: r.id, number: r.number, date: day(r.createdAt), group: L.group(r.groupId), agent: L.agent(r.agentId), loans: r.loanIds.length, status: r.status }));
    },
  },
  {
    key: 'support', module: 'support',
    columns: () => [c('number'), c('date', 'date'), c('group'), c('community'), c('agent'), c('type'), c('total', 'money'), c('status', 'enum'), c('fulfilmentStatus', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useSupportStore.getState().requests, orgId).map((r) => ({ id: r.id, number: r.number, date: day(r.createdAt), group: L.group(r.groupId), community: L.community(r.communityId), agent: L.agent(r.agentId), type: L.supportType(r.primaryTypeId), total: r.total.amountMinor, status: r.status, fulfilmentStatus: r.fulfilmentStatus }));
    },
  },
  {
    key: 'workshops', module: 'workshops',
    columns: () => [c('number'), c('date', 'date'), c('title'), c('community'), c('agent'), c('expected', 'number'), c('actual', 'number'), c('status', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useTrainingStore.getState().workshops, orgId).map((w) => ({ id: w.id, number: w.number, date: w.date, title: w.title, community: L.community(w.communityId), agent: L.agent(w.agentId), expected: w.expected, actual: w.attendance.length, status: w.status }));
    },
  },
  {
    key: 'trees', module: 'trees',
    columns: () => [c('code'), c('species'), c('farmer', 'text', { sensitive: true }), c('community'), c('plantedAt', 'date'), c('state', 'enum'), c('heightM', 'number'), c('health', 'number'), c('round', 'number'), c('lastVisitAt', 'date')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useLandStore.getState().trees, orgId).map((t) => ({ id: t.id, code: t.code, species: L.species(t.speciesId), farmer: L.farmer(t.farmerId), community: L.community(t.communityId), plantedAt: day(t.plantedAt), state: t.state, heightM: t.heightM ?? null, health: t.health ?? null, round: t.round, lastVisitAt: day(t.lastVisitAt) }));
    },
  },
  {
    key: 'nurseries', module: 'nurseries',
    columns: () => [c('code'), c('name'), c('date', 'date'), c('community'), c('agent'), c('fenced', 'bool'), c('rounds', 'number'), c('status', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useLandStore.getState().nurseries, orgId).map((n) => ({ id: n.id, code: n.code, name: n.name, date: day(n.createdAt), community: L.community(n.communityId), agent: L.agent(n.agentId), fenced: n.fenced, rounds: n.rounds.length, status: n.status }));
    },
  },
  {
    key: 'plots', module: 'plots',
    columns: () => [c('code'), c('date', 'date'), c('farmer', 'text', { sensitive: true }), c('community'), c('areaHa', 'number'), c('crop'), c('eudrStatus', 'enum'), c('source', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useLandStore.getState().plots, orgId).map((p) => ({ id: p.id, code: p.code ?? '', date: day(p.createdAt), farmer: L.farmer(p.farmerId), community: L.community(p.communityId), areaHa: Math.round(p.areaHa * 100) / 100, crop: p.crop, eudrStatus: p.eudrStatus, source: p.source ?? 'MAPPED' }));
    },
  },
  {
    key: 'movements', module: 'inventory',
    columns: () => [c('date', 'date'), c('warehouse'), c('kind', 'enum'), c('commodity'), c('bags', 'number'), c('kg', 'number'), c('ref')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useWarehouseStore.getState().movements, orgId).map((m) => ({ id: m.id, date: day(m.at), warehouse: L.warehouse(m.warehouseId), kind: m.kind, commodity: L.commodity(m.commodityId), bags: m.bags, kg: Math.round(m.kg), ref: m.ref }));
    },
  },
  {
    key: 'carryForwards', module: 'weeklyBudgets',
    columns: () => [c('date', 'date'), c('agent'), c('type', 'enum'), c('amount', 'money'), c('remaining', 'money'), c('status', 'enum')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useFieldStore.getState().carryForwards, orgId).map((x) => ({ id: x.id, date: day(x.createdAt), agent: L.agent(x.agentId), type: x.type, amount: x.amount.amountMinor, remaining: x.remainingMinor, status: x.status }));
    },
  },
  {
    key: 'commissions', module: 'commissions',
    columns: () => [c('period'), c('from', 'date'), c('to', 'date'), c('agent'), c('total', 'money'), c('status', 'enum'), c('paid', 'bool')],
    rows: (orgId, lang) => {
      const L = lookups(orgId, lang);
      return of(useFieldStore.getState().commissions, orgId).flatMap((p) => p.lines.map((l) => ({ id: l.id, period: `${p.number} · ${p.name}`, from: p.from, to: p.to, agent: L.agent(l.agentId), total: l.total.amountMinor, status: l.status, paid: !!l.paid })));
    },
  },
];

export const REPORT_ENTITIES = ENTITIES.map((e) => e.key);
export const entityOf = (key: string) => ENTITIES.find((e) => e.key === key);
export function entityAvailable(orgId: string, key: string) {
  const e = entityOf(key);
  const mods = useSettingsStore.getState().settings[orgId]?.modules;
  return !!e && (!e.module || !mods || mods[e.module] !== false);
}
export const columnsOf = (orgId: string, entity: string, lang: Lang) => entityOf(entity)?.columns(orgId, lang) ?? [];

// ---------------------------------------------------------------- Running a report

function matches(v: Row[string], f: ReportFilter, kind: ColKind): boolean {
  const s = v == null ? '' : String(v);
  if (f.op === 'equals') return s.toLowerCase() === f.value.toLowerCase();
  if (f.op === 'contains') return s.toLowerCase().includes(f.value.toLowerCase());
  const num = kind === 'date' ? s : Number(v);
  const a = kind === 'date' ? f.value : Number(f.value);
  if (f.op === 'gt') return num >= a;
  if (f.op === 'lt') return num <= a;
  const b = kind === 'date' ? f.value2 ?? '' : Number(f.value2);
  return num >= a && num <= b;
}

export interface ReportGroup { key: string; count: number; value: number }
export interface ReportResult { columns: ReportColumn[]; rows: Row[]; total: number; groups?: ReportGroup[] }

export function runReport(r: Pick<SavedReport, 'orgId' | 'entity' | 'columns' | 'filters' | 'groupBy' | 'measure'>, lang: Lang = 'en'): ReportResult {
  const e = entityOf(r.entity);
  if (!e) return { columns: [], rows: [], total: 0 };
  const all = e.columns(r.orgId, lang);
  const kinds = new Map(all.map((x) => [x.key, x.kind]));
  // A commodity filter may name the id (saved reports) or the display name.
  const rows = e.rows(r.orgId, lang).filter((row) => r.filters.every((f) => (f.column === 'commodity' && row.commodityId === f.value) || matches(row[f.column], f, kinds.get(f.column) ?? 'text')));
  const columns = r.columns.map((k) => all.find((x) => x.key === k)).filter(Boolean) as ReportColumn[];
  let groups: ReportGroup[] | undefined;
  if (r.groupBy) {
    const byDate = kinds.get(r.groupBy) === 'date';
    const m = new Map<string, ReportGroup>();
    for (const row of rows) {
      const raw = row[r.groupBy];
      const key = raw == null || raw === '' ? '—' : byDate ? String(raw).slice(0, 7) : String(raw);
      const g = m.get(key) ?? { key, count: 0, value: 0 };
      g.count += 1;
      g.value += r.measure ? Number(row[r.measure]) || 0 : 1;
      m.set(key, g);
    }
    groups = [...m.values()].sort(byDate ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.value - a.value);
  }
  return { columns, rows, total: rows.length, groups };
}

/** Saved reports a user can open: the library (for enabled modules), their own, and ones shared with their roles. */
export function reportsFor(orgId: string, userId: string, roleIds: string[]) {
  return useSystemStore.getState().reports.filter((r) => r.orgId === orgId && entityAvailable(orgId, r.entity) && (r.libraryKey || r.createdBy === userId || r.sharedWithRoleIds.some((x) => roleIds.includes(x))));
}

export function saveReport(orgId: string, actorId: string, input: Omit<SavedReport, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'libraryKey'>, id?: string): SavedReport {
  const existing = id ? useSystemStore.getState().reports.find((x) => x.id === id) : undefined;
  if (existing?.libraryKey) throw new Error('libraryReadOnly');
  const at = new Date().toISOString();
  const rep: SavedReport = { ...input, id: existing?.id ?? uid('rep'), orgId, createdBy: existing?.createdBy ?? actorId, createdAt: existing?.createdAt ?? at, updatedAt: at };
  useSystemStore.getState().saveReport(rep);
  return rep;
}

export function copyReport(id: string, name: string, actorId: string): SavedReport {
  const r = useSystemStore.getState().reports.find((x) => x.id === id)!;
  const { id: _id, libraryKey: _k, createdAt: _c, updatedAt: _u, createdBy: _b, schedule: _s, ...rest } = r;
  return saveReport(r.orgId, actorId, { ...rest, name, sharedWithRoleIds: [] });
}

export function deleteReport(id: string) {
  const r = useSystemStore.getState().reports.find((x) => x.id === id);
  if (!r || r.libraryKey) return false;
  useSystemStore.getState().removeReport(id);
  return true;
}

/** Puts back any library report that is missing (after a copy-and-delete mistake or new modules). */
export function restoreLibrary(orgId: string) {
  const have = new Set(useSystemStore.getState().reports.filter((r) => r.orgId === orgId && r.libraryKey).map((r) => r.libraryKey));
  const at = new Date().toISOString();
  let n = 0;
  for (const spec of REPORT_LIBRARY.filter((s) => !have.has(s.key))) {
    useSystemStore.getState().saveReport({ id: `rep_${orgId}_${spec.key}`, orgId, name: spec.key, libraryKey: spec.key, entity: spec.entity, columns: spec.columns, filters: spec.filters ?? [], groupBy: spec.groupBy, measure: spec.measure, chart: spec.chart, sharedWithRoleIds: [], createdBy: 'system', createdAt: at, updatedAt: at });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- Exports

export interface ExportInput { orgId: string; userId: string; reportId?: string; name: string; format: 'CSV' | 'XLSX'; header: string[]; rows: (string | number)[][] }
/** Above this many rows an export runs as a background job with a link that expires in 24 h. */
export const LARGE_EXPORT_ROWS = 500;
const files = new Map<string, ExportInput>();
/** Export contents also go to sessionStorage so a finished link still works after a reload in the same tab. */
const FILE_KEY = (id: string) => `treesyt-export:${id}`;
function keepFile(id: string, x: ExportInput) {
  files.set(id, x);
  try { sessionStorage.setItem(FILE_KEY(id), JSON.stringify(x)); } catch { /* storage full or blocked: memory only */ }
}
function readFile(id: string): ExportInput | undefined {
  if (files.has(id)) return files.get(id);
  try { const v = sessionStorage.getItem(FILE_KEY(id)); return v ? (JSON.parse(v) as ExportInput) : undefined; } catch { return undefined; }
}

export function buildFile(x: Pick<ExportInput, 'format' | 'header' | 'rows' | 'name'>): Blob {
  if (x.format === 'CSV') {
    const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return new Blob(['﻿' + [x.header, ...x.rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  }
  const ws = XLSX.utils.aoa_to_sheet([x.header, ...x.rows]);
  ws['!cols'] = x.header.map((h) => ({ wch: Math.min(40, Math.max(10, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, x.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Report');
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function fileName(name: string, format: 'CSV' | 'XLSX') {
  return `${name.toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, '-').replace(/^-|-$/g, '') || 'report'}.${format.toLowerCase()}`;
}

function auditExport(x: ExportInput) {
  useActivityStore.getState().addAudit({ id: uid('aud'), orgId: x.orgId, actorId: x.userId, entity: 'report', entityId: x.reportId ?? x.name, key: 'export.downloaded', after: { rows: x.rows.length, format: x.format }, at: new Date().toISOString() });
}

/** Small exports return a file now; large ones return a job that fills up and then offers the download. */
export function startExport(x: ExportInput, onTick?: (j: ExportJob) => void): { file?: Blob; job?: ExportJob } {
  auditExport(x);
  if (x.rows.length <= LARGE_EXPORT_ROWS) return { file: buildFile(x) };
  const at = new Date().toISOString();
  const job: ExportJob = { id: uid('exp'), orgId: x.orgId, userId: x.userId, reportId: x.reportId, name: x.name, format: x.format, rows: x.rows.length, progress: 0, status: 'RUNNING', createdAt: at };
  keepFile(job.id, x);
  useSystemStore.getState().saveExport(job);
  const steps = Math.min(8, Math.max(3, Math.ceil(x.rows.length / 400)));
  let i = 0;
  const tick = () => {
    i++;
    const cur = useSystemStore.getState().exports.find((e) => e.id === job.id);
    if (!cur) return;
    const done = i >= steps;
    const next: ExportJob = done
      ? { ...cur, progress: 100, status: 'READY', readyAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString() }
      : { ...cur, progress: Math.round((i / steps) * 100) };
    useSystemStore.getState().saveExport(next);
    onTick?.(next);
    if (!done) setTimeout(tick, 350);
  };
  setTimeout(tick, 350);
  return { job };
}

/** The file behind a finished export, while its link is valid. */
export function exportFile(jobId: string, at = new Date()): Blob | 'expired' | 'missing' {
  const j = useSystemStore.getState().exports.find((e) => e.id === jobId);
  if (!j || j.status === 'RUNNING') return 'missing';
  if (j.status === 'EXPIRED' || (j.expiresAt && new Date(j.expiresAt) <= at)) {
    if (j.status !== 'EXPIRED') useSystemStore.getState().saveExport({ ...j, status: 'EXPIRED' });
    return 'expired';
  }
  const x = readFile(jobId);
  return x ? buildFile(x) : 'missing';
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- Schedules (job "reports")

/** Whether a schedule is due at `at`: past its time today (or this weekday) and not yet sent for that slot. */
export function scheduleDue(s: NonNullable<SavedReport['schedule']>, timeZone: string, at = new Date()): boolean {
  const local = new Date(at.toLocaleString('en-US', { timeZone }));
  const [hh, mm] = s.time.split(':').map(Number) as [number, number];
  const slot = new Date(local);
  slot.setHours(hh, mm, 0, 0);
  if (s.frequency === 'WEEKLY') {
    const back = (local.getDay() - (s.weekday ?? 1) + 7) % 7;
    slot.setDate(slot.getDate() - back);
  }
  if (slot > local) slot.setDate(slot.getDate() - (s.frequency === 'WEEKLY' ? 7 : 1));
  const offset = local.getTime() - at.getTime();
  const slotUtc = new Date(slot.getTime() - offset);
  return !s.lastSentAt || new Date(s.lastSentAt) < slotUtc;
}

export function sendScheduled(r: SavedReport, actorId = 'system'): number {
  if (!r.schedule) return 0;
  const access = useAccessStore.getState();
  const people = access.memberships.filter((m) => m.orgId === r.orgId && m.status === 'ACTIVE' && m.roleIds.some((x) => r.schedule!.roleIds.includes(x))).map((m) => access.users.find((u) => u.id === m.userId)).filter(Boolean);
  const lang = (u: { language: string }) => (u.language === 'fr' ? 'fr' : 'en') as Lang;
  for (const u of people) {
    const res = runReport(r, lang(u!));
    const title = r.libraryKey ? r.libraryKey : r.name;
    sendEmail({ orgId: r.orgId, to: u!.email, templateId: 'report.scheduled', language: u!.language, subject: lang(u!) === 'fr' ? `Rapport : ${title}` : `Report: ${title}`, body: lang(u!) === 'fr' ? `${res.total} lignes. Le fichier Excel est joint.` : `${res.total} rows. The Excel file is attached.` });
  }
  useSystemStore.getState().saveReport({ ...r, schedule: { ...r.schedule, lastSentAt: new Date().toISOString() } });
  void actorId;
  return people.length;
}

registerJob('reports', async ({ orgId }) => {
  const orgs = usePlatformStore.getState().orgs;
  const out: string[] = [];
  for (const r of useSystemStore.getState().reports.filter((x) => x.schedule && (!orgId || x.orgId === orgId))) {
    const tz = orgs.find((o) => o.id === r.orgId)?.timezone ?? 'UTC';
    if (scheduleDue(r.schedule!, tz)) out.push(`${r.name}: sent to ${sendScheduled(r)}`);
  }
  return out.length ? out : ['no schedules due'];
});
