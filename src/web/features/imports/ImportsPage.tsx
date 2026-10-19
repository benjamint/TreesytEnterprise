import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, FlaskConical, Undo2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { ImportRun, ImportType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable, downloadCsv } from '@/components/shared/DataTable';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { sampleFarmersCsv } from '@/data/samples/importSamples';
import { pathLabel } from '@/engines/locations';
import {
  ALL_IMPORTS, SUPPORTED_IMPORTS, TRANSFORMS, autoMatch, applyTransform, commitImport, errorFileRows, importFields, matchPlace, parseFile, suggestTransform, undoImport, validateRows,
  type CommitResult, type ImportField, type Mapping, type Parsed, type Place, type Transform,
} from '@/services/importService';
import { cn } from '@/lib/utils';
import { useFarmerStore } from '@/stores/farmerStore';
import { useImportStore } from '@/stores/importStore';
import { useLocationStore } from '@/stores/locationStore';
import { useActor, useCan, useCurrentOrg, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';

const STEPS = ['type', 'upload', 'map', 'match', 'preview', 'result'] as const;
type Step = (typeof STEPS)[number];
const sel = 'h-10 w-full rounded-ctl border border-line bg-surface px-2 text-[14px] text-ink';

/** Imports (PRD C6): the wizard and the import history with undo. */
export function ImportsPage() {
  const { t } = useT();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('new');
  useDemoNotes([{ id: 'imports', key: 'demo.note.imports' }]);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.people')} title={t('nav.imports')} description={t('pages.imports')} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="new">{t('imp.newImport')}</TabsTrigger>
          <TabsTrigger value="history">{t('imp.history')}</TabsTrigger>
        </TabsList>
        <TabsContent value="new"><Wizard initialType={(params.get('type') as ImportType | null) ?? null} onHistory={() => setTab('history')} /></TabsContent>
        <TabsContent value="history"><History /></TabsContent>
      </Tabs>
    </>
  );
}

function Wizard({ initialType, onHistory }: { initialType: ImportType | null; onHistory: () => void }) {
  const { orgId, userId } = useActor();
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const lang = useLang();
  const navigate = useNavigate();
  const settings = useOrgSettings();
  const lk = useLookups();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const can = useCan();
  const start = initialType && SUPPORTED_IMPORTS.includes(initialType) ? initialType : null;
  const [type, setType] = useState<ImportType | null>(start);
  const [step, setStep] = useState<Step>(start ? 'upload' : 'type');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [transforms, setTransforms] = useState<Record<string, Transform>>({});
  const [places, setPlaces] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [initialMapped, setInitialMapped] = useState<Set<string>>(new Set());
  const [fixedPlaces, setFixedPlaces] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CommitResult | null>(null);
  const country = org.countries[0] ?? 'GH';

  const fields = useMemo(() => (type ? importFields(type, orgId, settings, lang) : []), [type, orgId, settings, lang]);
  const fieldLabel = (fl: ImportField) => (fl.label.key ? t(fl.label.key) : fl.label.text ?? fl.key);
  const placeFields = fields.filter((x) => x.kind === 'community' || x.kind === 'parent');
  const placeList = useMemo<Place[]>(() => {
    if (type === 'farmers') return lk.communities.map((c) => ({ id: c.id, name: c.name, code: c.code, detail: pathLabel(nodes, c.locationNodeId) }));
    if (type === 'communities') {
      const level = settings.locationLevels[settings.locationLevels.length - 2]?.id;
      return nodes.filter((n) => n.levelId === level).map((n) => ({ id: n.id, name: n.name, code: n.code, detail: pathLabel(nodes, n.id) }));
    }
    return [];
  }, [type, lk.communities, nodes, settings.locationLevels]);
  const ctx = { orgId, country, settings, places, farmers };
  const rows = useMemo(() => (parsed && type ? validateRows(type, fields, parsed, mapping, transforms, overrides, { orgId, country, settings, places, farmers }) : []), [parsed, type, fields, mapping, transforms, overrides, orgId, country, settings, places, farmers]);
  const bad = rows.filter((r) => Object.keys(r.errors).length);
  const warned = rows.filter((r) => r.warnings.length);

  const reset = () => { setFixedPlaces(new Set()); setParsed(null); setFileName(''); setMapping({}); setTransforms({}); setPlaces({}); setOverrides({}); setResult(null); };
  const load = (name: string, p: Parsed) => {
    const m = autoMatch(p.headers, fields);
    const tr: Record<string, Transform> = {};
    for (const fl of fields) tr[fl.key] = m[fl.key] == null ? 'none' : suggestTransform(fl, p.rows.map((r) => r[m[fl.key]!] ?? ''));
    // Exact location names are matched straight away; the rest wait for the match step.
    const pl: Record<string, string> = {};
    for (const fl of placeFields) {
      const col = m[fl.key];
      if (col == null) continue;
      for (const raw of new Set(p.rows.map((r) => (r[col] ?? '').trim()).filter(Boolean))) {
        const res = matchPlace(raw, placeList);
        if (res.exact) pl[raw] = res.exact.id;
        else if (res.suggestions[0]) pl[raw] = res.suggestions[0].id;
      }
    }
    setFileName(name);
    setParsed(p);
    setMapping(m);
    setInitialMapped(new Set(Object.keys(m).filter((k) => m[k] != null)));
    setTransforms(tr);
    setPlaces(pl);
    setOverrides({});
    setStep('map');
    toast.success(t('imp.loaded', { name, rows: p.rows.length, matched: Object.values(m).filter((v) => v != null).length }));
  };
  const onFile = async (file: File) => {
    try {
      const p = await parseFile(file);
      if (!p.rows.length) return toast.error(t('imp.emptyFile'));
      load(file.name, p);
    } catch {
      toast.error(t('imp.unreadable'));
    }
  };
  const sample = () => sampleFarmersCsv({ orgId, lang, communities: lk.communities, farmers });
  const loadSample = async () => {
    const s = sample();
    await onFile(new File([s.csv], s.fileName, { type: 'text/csv' }));
  };
  const downloadTemplate = async (kind: 'csv' | 'xlsx') => {
    const head = fields.map(fieldLabel);
    const name = `${org.code.toLowerCase()}-${type}-template`;
    if (kind === 'csv') return downloadCsv(`${name}.csv`, head, []);
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head]), 'Template');
    XLSX.writeFile(wb, `${name}.xlsx`);
  };
  const errorText = (field: string, code: string) => `${fieldLabel(fields.find((x) => x.key === field)!)}: ${t(`imp.err.${code}`)}`;
  const downloadErrors = (list = bad) => {
    const [head, ...data] = errorFileRows(fields, list, fieldLabel, errorText, t('imp.errorsColumn'));
    downloadCsv(`${fileName.replace(/\.\w+$/, '')}-errors.csv`, head as string[], data);
  };
  const doImport = () => {
    if (!type) return;
    const res = commitImport(type, fileName, fields, rows, { ...ctx, actorId: userId ?? 'system' });
    setResult(res);
    setStep('result');
  };

  const unmatchedRequired = fields.filter((x) => x.required && mapping[x.key] == null);
  const placeValues = useMemo(() => {
    if (!parsed) return [];
    return placeFields.flatMap((fl) => {
      const col = mapping[fl.key];
      if (col == null) return [];
      const counts = new Map<string, number>();
      for (const r of parsed.rows) { const v = applyTransform(r[col] ?? '', transforms[fl.key] ?? 'none'); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
      return [...counts].map(([raw, n]) => ({ field: fl, raw, n, ...matchPlace(raw, placeList) }));
    });
  }, [parsed, placeFields, mapping, transforms, placeList]);
  const needsMatch = placeValues.filter((p) => !p.exact);
  const stepIndex = STEPS.indexOf(step);
  const mapRow = (fl: ImportField) => {
    const col = mapping[fl.key];
    const samples = col == null ? [] : (parsed?.rows ?? []).slice(0, 3).map((r) => applyTransform(r[col] ?? '', transforms[fl.key] ?? 'none'));
    return (
      <tr key={fl.key} className={cn(fl.required && col == null && 'bg-danger/5')}>
        <td className="px-3 py-2"><span className="font-medium text-ink">{fieldLabel(fl)}</span>{fl.required && <span className="ml-1 text-danger">{'*'}</span>}</td>
        <td className="w-56 px-3 py-2">
          <select className={sel} value={col ?? ''} onChange={(e) => setMapping({ ...mapping, [fl.key]: e.target.value === '' ? null : Number(e.target.value) })} aria-label={t('imp.columnFor', { field: fieldLabel(fl) })}>
            <option value="">{t('imp.notMapped')}</option>
            {(parsed?.headers ?? []).map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </td>
        <td className="w-48 px-3 py-2">
          <select className={sel} value={transforms[fl.key] ?? 'none'} onChange={(e) => setTransforms({ ...transforms, [fl.key]: e.target.value as Transform })} disabled={col == null} aria-label={t('imp.transformFor', { field: fieldLabel(fl) })}>
            {TRANSFORMS.map((x) => <option key={x} value={x}>{t(`imp.tr.${x}`)}</option>)}
          </select>
        </td>
        <td className="px-3 py-2 font-mono text-[12px] text-muted">{samples.filter(Boolean).join(' · ') || '—'}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2" aria-label={t('imp.steps')}>
        {STEPS.map((s, i) => (
          <li key={s} className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium', i === stepIndex ? 'border-brand bg-brand text-white' : i < stepIndex ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line bg-surface text-muted')} aria-current={i === stepIndex ? 'step' : undefined}>
            <span className="tnum">{i + 1}</span>{t(`imp.step.${s}`)}
          </li>
        ))}
      </ol>

      <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
        {step === 'type' && (
          <div>
            <h2 className="mb-1 text-[18px] font-semibold text-ink">{t('imp.chooseType')}</h2>
            <p className="mb-4 text-[14px] text-muted">{t('imp.chooseTypeHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ALL_IMPORTS.map((x) => {
                const ok = SUPPORTED_IMPORTS.includes(x);
                return (
                  <button key={x} type="button" disabled={!ok} onClick={() => { setType(x); reset(); setStep('upload'); }} className={cn('flex items-start gap-3 rounded-ctl border p-4 text-left transition-colors', ok ? 'border-line hover:border-brand/50' : 'cursor-not-allowed border-dashed border-line opacity-60', type === x && 'border-brand')}>
                    <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{t(`imp.type.${x}`)}</span>
                      <span className="block text-[13px] text-muted">{ok ? t(`imp.typeHint.${x}`) : t('imp.laterPhase')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 'upload' && type && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[18px] font-semibold text-ink">{t('imp.uploadTitle', { type: t(`imp.type.${type}`).toLocaleLowerCase() })}</h2>
              <p className="mt-1 text-[14px] text-muted">{t('imp.uploadHint', { count: fields.length })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => downloadTemplate('csv')}><Download /> {t('imp.templateCsv')}</Button>
              <Button variant="secondary" onClick={() => downloadTemplate('xlsx')}><Download /> {t('imp.templateXlsx')}</Button>
              {type === 'farmers' && <Button variant="secondary" onClick={() => { const s = sample(); const url = URL.createObjectURL(new Blob(['﻿', s.csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = s.fileName; a.click(); URL.revokeObjectURL(url); }}><FlaskConical /> {t('imp.downloadSample')}</Button>}
            </div>
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line px-6 py-12 text-center hover:border-brand/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void onFile(file); }}
            >
              <Upload className="h-8 w-8 text-brand" aria-hidden="true" />
              <span className="font-medium text-ink">{t('imp.drop')}</span>
              <span className="text-[13px] text-muted">{t('imp.formats')}</span>
              <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void onFile(file); }} />
            </label>
            {type === 'farmers' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-ctl bg-canvas px-4 py-3 text-[14px]">
                <span className="text-body">{t('imp.sampleHint')}</span>
                <Button size="sm" onClick={() => void loadSample()}><FlaskConical /> {t('imp.useSample')}</Button>
              </div>
            )}
            <div><Button variant="ghost" onClick={() => setStep('type')}><ArrowLeft /> {t('imp.back')}</Button></div>
          </div>
        )}

        {step === 'map' && parsed && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[18px] font-semibold text-ink">{t('imp.mapTitle')}</h2>
              <p className="mt-1 text-[14px] text-muted">{t('imp.mapHint', { file: fileName, rows: f.number(parsed.rows.length), columns: parsed.headers.length })}</p>
            </div>
            <div className="overflow-x-auto rounded-ctl border border-line">
              <table className="w-full text-[14px]">
                <thead className="bg-canvas text-left text-[12px] uppercase tracking-[0.06em] text-label">
                  <tr><th className="px-3 py-2">{t('imp.fieldCol')}</th><th className="px-3 py-2">{t('imp.column')}</th><th className="px-3 py-2">{t('imp.transform')}</th><th className="px-3 py-2">{t('imp.preview')}</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {fields.filter((fl) => fl.required || initialMapped.has(fl.key)).map(mapRow)}
                </tbody>
              </table>
            </div>
            {fields.some((fl) => !fl.required && !initialMapped.has(fl.key)) && (
              <details className="rounded-ctl border border-line">
                <summary className="cursor-pointer px-4 py-3 text-[14px] font-medium text-ink">{t('imp.moreFields', { count: fields.filter((fl) => !fl.required && !initialMapped.has(fl.key)).length })}</summary>
                <table className="w-full border-t border-line text-[14px]"><tbody className="divide-y divide-line">{fields.filter((fl) => !fl.required && !initialMapped.has(fl.key)).map(mapRow)}</tbody></table>
              </details>
            )}
            {(() => {
              const used = new Set(Object.values(mapping).filter((v): v is number => v != null));
              const ignored = parsed.headers.filter((_, i) => !used.has(i));
              return ignored.length ? <p className="text-[13px] text-muted">{t('imp.ignored', { columns: ignored.join(', ') })}</p> : null;
            })()}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('upload')}><ArrowLeft /> {t('imp.back')}</Button>
              <Button disabled={unmatchedRequired.length > 0} onClick={() => setStep(placeFields.length ? 'match' : 'preview')}>{unmatchedRequired.length ? t('imp.mapRequired', { count: unmatchedRequired.length }) : <>{t('imp.next')} <ArrowRight /></>}</Button>
            </div>
          </div>
        )}

        {step === 'match' && parsed && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[18px] font-semibold text-ink">{t('imp.matchTitle')}</h2>
              <p className="mt-1 text-[14px] text-muted">{t('imp.matchHint', { exact: placeValues.length - needsMatch.length, total: placeValues.length })}</p>
            </div>
            {needsMatch.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line">
                {needsMatch.map((p) => (
                  <li key={`${p.field.key}:${p.raw}`} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr]">
                    <div>
                      <div className="font-medium text-ink">{'“'}{p.raw}{'”'}</div>
                      <div className="text-[12px] text-muted">{t('imp.rowsUsing', { count: p.n })} · {p.suggestions.length ? t('imp.suggested') : t('imp.noSuggestion')}</div>
                    </div>
                    <select className={sel} value={places[p.raw] ?? ''} onChange={(e) => setPlaces({ ...places, [p.raw]: e.target.value })} aria-label={t('imp.matchFor', { value: p.raw })}>
                      <option value="">{t('imp.leaveUnmatched')}</option>
                      {p.suggestions.length > 0 && <optgroup label={t('imp.suggestions')}>{p.suggestions.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.detail}</option>)}</optgroup>}
                      <optgroup label={t('imp.allPlaces')}>{[...placeList].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.detail}</option>)}</optgroup>
                    </select>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 rounded-ctl bg-success/10 px-4 py-3 text-[14px] text-ink"><CheckCircle2 className="h-4 w-4 text-success" /> {t('imp.allMatched')}</p>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('map')}><ArrowLeft /> {t('imp.back')}</Button>
              <Button onClick={() => setStep('preview')}>{t('imp.next')} <ArrowRight /></Button>
            </div>
          </div>
        )}

        {step === 'preview' && parsed && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold text-ink">{t('imp.previewTitle')}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="success">{t('imp.ready', { count: rows.length - bad.length })}</Badge>
                  {bad.length > 0 && <Badge tone="danger">{t('imp.withErrors', { count: bad.length })}</Badge>}
                  {warned.length > 0 && <Badge tone="warning">{t('imp.withWarnings', { count: warned.length })}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 text-[14px] text-body"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />{t('imp.onlyProblems')}</label>
                {bad.length > 0 && <Button size="sm" variant="secondary" onClick={() => downloadErrors()}><Download /> {t('imp.errorFile')}</Button>}
              </div>
            </div>
            <div className="max-h-[520px] overflow-auto rounded-ctl border border-line">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-canvas text-left text-[11px] uppercase tracking-[0.06em] text-label">
                  <tr><th className="px-3 py-2">{'#'}</th><th className="px-3 py-2">{t('imp.notes')}</th>{fields.filter((fl) => mapping[fl.key] != null).map((fl) => <th key={fl.key} className="whitespace-nowrap px-3 py-2">{fieldLabel(fl)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.filter((r) => !onlyProblems || Object.keys(r.errors).length || r.warnings.length || fields.some((fl) => `${r.index - 1}:${fl.key}` in overrides) || fields.some((fl) => (fl.kind === 'community' || fl.kind === 'parent') && fixedPlaces.has(r.raw[fl.key] ?? ''))).map((r) => (
                    <tr key={r.index} className={cn(Object.keys(r.errors).length ? 'bg-danger/5' : r.warnings.length ? 'bg-warning/5' : '')}>
                      <td className="px-3 py-1.5 align-top tnum text-muted">{r.index}</td>
                      <td className="min-w-[200px] max-w-[260px] px-3 py-1.5 align-top text-[12px] text-warning">{r.warnings.map((w) => { const [k, v] = w.split(':'); return t(`imp.warn.${k}`, { value: v }); }).join(' · ')}</td>
                      {fields.filter((fl) => mapping[fl.key] != null).map((fl) => {
                        const err = r.errors[fl.key];
                        const key = `${r.index - 1}:${fl.key}`;
                        return (
                          <td key={fl.key} className="px-3 py-1.5 align-top">
                            {err || (key in overrides && fl.kind !== 'community' && fl.kind !== 'parent') ? (
                              <div className="min-w-[140px]">
                                {fl.kind === 'community' || fl.kind === 'parent' ? (
                                  <select className="h-8 w-full rounded border border-danger/60 bg-surface px-1 text-[13px]" value="" onChange={(e) => { setPlaces({ ...places, [r.raw[fl.key] ?? '']: e.target.value }); setFixedPlaces(new Set([...fixedPlaces, r.raw[fl.key] ?? ''])); }} aria-label={t('imp.fixCell', { field: fieldLabel(fl), row: r.index })}>
                                    <option value="">{r.raw[fl.key] || '—'}</option>
                                    {[...placeList].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                  </select>
                                ) : (
                                  <Input compact className={cn('h-8 text-[13px]', err ? 'border-danger/60' : 'border-success/60')} value={overrides[key] ?? r.raw[fl.key] ?? ''} onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })} aria-label={t('imp.fixCell', { field: fieldLabel(fl), row: r.index })} />
                                )}
                                {err ? <div className="mt-0.5 text-[11px] text-danger">{t(`imp.err.${err}`)}</div> : <div className="mt-0.5 text-[11px] text-success">{t('imp.fixed')}</div>}
                              </div>
                            ) : <span className={cn('whitespace-nowrap', key in overrides ? 'font-medium text-success' : 'text-ink')}>{fl.kind === 'community' || fl.kind === 'parent' ? placeList.find((p) => p.id === r.values[fl.key])?.name ?? r.raw[fl.key] : r.raw[fl.key] || <span className="text-muted">{'—'}</span>}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setStep(placeFields.length ? 'match' : 'map')}><ArrowLeft /> {t('imp.back')}</Button>
              <div className="flex items-center gap-3">
                {bad.length > 0 && <span className="text-[13px] text-muted">{t('imp.skipNote', { count: bad.length })}</span>}
                <Button disabled={!can('imports.create') || rows.length === bad.length} onClick={doImport}><Upload /> {t('imp.importRows', { count: rows.length - bad.length })}</Button>
              </div>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
              <div>
                <h2 className="text-[18px] font-semibold text-ink">{t('imp.doneTitle')}</h2>
                <p className="text-[14px] text-muted">{t('imp.doneHint', { file: result.run.fileName })}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {([['created', result.run.created], ['updated', result.run.updated], ['skipped', result.run.skipped], ['flags', result.flags]] as const).map(([k, v]) => (
                <div key={k} className={cn('rounded-ctl border p-4', k === 'flags' && v > 0 ? 'border-warning/40 bg-warning/5' : 'border-line')}>
                  <div className="eyebrow">{t(`imp.result.${k}`)}</div>
                  <div className="tnum mt-1 text-[28px] font-semibold text-ink">{f.number(v)}</div>
                </div>
              ))}
            </div>
            {result.flags > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-ctl border border-warning/40 bg-warning/10 px-4 py-3 text-[14px]">
                <span className="flex items-center gap-2 text-ink"><AlertTriangle className="h-4 w-4 text-warning" /> {t('imp.flagsRaised', { count: result.flags })}</span>
                <Button size="sm" onClick={() => navigate('/app/data-quality?source=IMPORT')}>{t('imp.reviewFlags')}</Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {result.errorRows.length > 0 && <Button variant="secondary" onClick={() => downloadErrors(result.errorRows)}><Download /> {t('imp.errorFile')}</Button>}
              <Button variant="secondary" onClick={onHistory}>{t('imp.history')}</Button>
              <Button variant="secondary" onClick={() => navigate(type === 'farmers' ? '/app/farmers' : type === 'communities' ? '/app/communities' : '/app/locations')}>{t('imp.openList')}</Button>
              <Button onClick={() => { reset(); setStep('type'); setType(null); }}>{t('imp.another')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function History() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const runs = useOrgRows(useImportStore((s) => s.runs));
  const [undo, setUndo] = useState<ImportRun | null>(null);
  const lastDone = runs.find((r) => r.status === 'DONE');
  const columns = useMemo<ColumnDef<ImportRun, unknown>[]>(() => [
    { id: 'file', header: t('imp.file'), accessorKey: 'fileName', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'type', header: t('col.type'), accessorKey: 'type', cell: (c) => t(`imp.type.${c.getValue() as string}`) },
    { id: 'by', header: t('imp.by'), accessorFn: (r) => lk.user(r.by) },
    { id: 'at', header: t('col.date'), accessorKey: 'at', cell: (c) => f.dateTime(c.getValue() as string) },
    { id: 'created', header: t('imp.result.created'), accessorKey: 'created' },
    { id: 'updated', header: t('imp.result.updated'), accessorKey: 'updated' },
    { id: 'skipped', header: t('imp.result.skipped'), accessorKey: 'skipped' },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <Badge tone={c.getValue() === 'DONE' ? 'success' : 'neutral'}>{t(`imp.status.${c.getValue() as string}`)}</Badge> },
    { id: 'undo', header: '', enableSorting: false, cell: (c) => (c.row.original.id === lastDone?.id ? <PermissionGate permission="imports.undo"><Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); setUndo(c.row.original); }}><Undo2 /> {t('imp.undo')}</Button></PermissionGate> : null) },
  ], [t, f, lk, lastDone?.id]);
  return (
    <>
      <DataTable columns={columns} data={runs} getRowId={(r) => r.id} empty={t('imp.noHistory')} />
      <Dialog open={!!undo} onOpenChange={(o) => !o && setUndo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('imp.undoTitle', { file: undo?.fileName })}</DialogTitle>
            <DialogDescription>{t('imp.undoHint', { count: undo?.created ?? 0 })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUndo(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => { const n = undoImport(undo!.id); toast.success(t('imp.undone', { count: n })); setUndo(null); }}>{t('imp.undo')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
