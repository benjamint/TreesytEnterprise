import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { Tree, TreeState } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable, downloadCsv } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { FilePick } from '@/components/shared/FilePick';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { HBars, StackedColumns } from '@/components/charts/charts';
import { recordTreeVisit, treeDashboard, treeDue } from '@/services/landService';
import { cn } from '@/lib/utils';
import { useLandStore } from '@/stores/landStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { LandMap, STATE_COLOR, useLandLookups, usePageTab } from './shared';

const TABS = ['dashboard', 'list', 'map'] as const;
const STATES: TreeState[] = ['ALIVE', 'DEAD', 'NOT_FOUND'];
const CAUSES = ['drought', 'fire', 'termites', 'grazing', 'cutting', 'unknown'];
const ISSUES = ['termites', 'livestock', 'fire', 'mistletoe', 'pests'];

export function StateBadge({ state }: { state: TreeState }) {
  const { t } = useT();
  return <Badge tone={state === 'ALIVE' ? 'success' : state === 'DEAD' ? 'danger' : 'warning'}>{t(`land.state.${state}`)}</Badge>;
}

/** Tree monitoring (PRD I3): dashboard, register, map and the visit history of each tree. */
export function TreesPage() {
  const { t } = useT();
  const [tab, setTab] = usePageTab(TABS, 'dashboard');
  const trees = useOrgRows(useLandStore((s) => s.trees));
  const [openId, open, close] = useDrawerParam();
  const current = trees.find((x) => x.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.trees')} title={t('nav.trees')} description={t('pages.trees')} />
      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-3 py-2.5 text-[14px] font-medium', tab === k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>{t(`land.tTab.${k}`)}</button>)}
      </div>
      {tab === 'dashboard' && <TreeDashboard trees={trees} />}
      {tab === 'list' && <TreeList trees={trees} onOpen={open} openId={openId} />}
      {tab === 'map' && <TreeMap trees={trees} onOpen={open} />}
      {current && <TreeDrawer key={current.id} tree={current} onClose={close} />}
    </>
  );
}

function TreeDashboard({ trees }: { trees: Tree[] }) {
  const { t } = useT();
  const f = useFormat();
  const ll = useLandLookups();
  const allocations = useOrgRows(useLandStore((s) => s.allocations));
  const [species, setSpecies] = useState('');
  const shown = species ? trees.filter((x) => x.speciesId === species) : trees;
  const d = useMemo(() => treeDashboard(shown, species ? allocations.filter((a) => a.speciesId === species) : allocations), [shown, allocations, species]);
  const cohort = d.byCohort.slice(-10).map((c) => ({ label: f.date(`${c.key}-15`, 'MMM yy'), alive: c.alive, lost: c.planted - c.alive }));
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><select value={species} onChange={(e) => setSpecies(e.target.value)} aria-label={t('land.species')} className="h-10 rounded-ctl border border-line bg-surface px-3 text-[14px]"><option value="">{t('land.allSpecies')}</option>{ll.species.map((s) => <option key={s.id} value={s.id}>{ll.speciesName(s.id)}</option>)}</select></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={t('land.disbursed')} value={f.number(d.disbursed)} />
        <StatCard label={t('land.planted')} value={f.number(d.planted)} hint={t('land.visitedN', { n: f.number(d.visited) })} />
        <StatCard label={t('land.farmersWithTrees')} value={f.number(d.farmers)} />
        <StatCard label={t('land.alivePct')} value={`${f.number(d.alivePct)}%`} hint={t('land.deadNotFound', { dead: f.number(d.dead), nf: f.number(d.notFound) })} />
        <StatCard label={t('land.avgHeight')} value={`${f.number(d.avgHeightM, { maximumFractionDigits: 2 })} m`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[15px] font-semibold text-ink">{t('land.survivalByCohort')}</h3>{cohort.length ? <StackedColumns data={cohort} series={[{ key: 'alive', label: t('land.state.ALIVE'), index: 2 }, { key: 'lost', label: t('land.lost'), index: -1 }]} format={(v) => f.number(v)} /> : <TabEmpty>{t('land.noTrees')}</TabEmpty>}</section>
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[15px] font-semibold text-ink">{t('land.survivalBySpecies')}</h3><HBars data={d.bySpecies.map((x) => ({ label: ll.speciesName(x.key), value: x.survivalPct }))} format={(v) => `${f.number(v)}%`} /></section>
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[15px] font-semibold text-ink">{t('land.byRound')}</h3>{d.byRound.length ? <HBars data={d.byRound.map((x) => ({ label: t('land.roundN', { n: x.round }), value: x.survivalPct }))} format={(v) => `${f.number(v)}%`} /> : <TabEmpty>{t('land.noVisits')}</TabEmpty>}</section>
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[15px] font-semibold text-ink">{t('land.causes')}</h3>{d.causes.length ? <HBars data={d.causes.map(([k, v]) => ({ label: t(`land.cause.${k}`, { defaultValue: k }), value: v }))} format={(v) => f.number(v)} /> : <TabEmpty>{t('land.noDeaths')}</TabEmpty>}</section>
      </div>
    </div>
  );
}

function TreeList({ trees, onOpen, openId }: { trees: Tree[]; onOpen: (id: string) => void; openId: string | null }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const plots = useOrgRows(useLandStore((s) => s.plots));
  const [q, setQ] = useState('');
  const [species, setSpecies] = useState('');
  const [state, setState] = useState('');
  const [round, setRound] = useState('');
  const [view, setView] = useState<'all' | 'due' | 'issues'>('all');
  const [exporting, setExporting] = useState(false);
  const plotCode = useMemo(() => new Map(plots.map((p) => [p.id, p.code ?? ''])), [plots]);
  const inView = (x: Tree, v: typeof view) => v === 'all' || (v === 'due' ? treeDue(x, settings) != null : x.issues.length > 0);
  const query = q.trim().toLowerCase();
  const shown = trees.filter((x) => inView(x, view) && (!species || x.speciesId === species) && (!state || x.state === state) && (!round || String(x.round) === round) && (!query || x.code.toLowerCase().includes(query) || ll.farmerName(x.farmerId).toLowerCase().includes(query)));
  const columns = useMemo<ColumnDef<Tree, unknown>[]>(() => [
    { id: 'code', header: t('land.treeCode'), accessorKey: 'code', cell: (c) => mono(c.getValue() as string) },
    { id: 'species', header: t('land.species'), accessorFn: (x) => ll.speciesName(x.speciesId) },
    { id: 'farmer', header: t('land.farmer'), accessorFn: (x) => ll.farmerName(x.farmerId) },
    { id: 'community', header: t('col.community'), accessorFn: (x) => lk.community(x.communityId) },
    { id: 'plot', header: t('land.plot'), accessorFn: (x) => (x.plotId ? plotCode.get(x.plotId) ?? '' : ''), cell: (c) => (c.getValue() ? mono(c.getValue() as string) : <span className="text-muted">{'—'}</span>) },
    { id: 'planted', header: t('land.plantedOn'), accessorKey: 'plantedAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'last', header: t('land.lastVisit'), accessorFn: (x) => x.lastVisitAt ?? '', cell: (c) => (c.getValue() ? f.date(c.getValue() as string) : <span className="text-muted">{'—'}</span>) },
    { id: 'round', header: t('land.roundCol'), accessorKey: 'round', cell: (c) => { const due = treeDue(c.row.original, settings); return <span className="flex items-center gap-1.5">{f.number(c.getValue() as number)}{due != null && <Badge tone="warning">{t('land.dueRound', { n: due })}</Badge>}</span>; } },
    { id: 'state', header: t('land.stateCol'), accessorKey: 'state', cell: (c) => <StateBadge state={c.getValue() as TreeState} /> },
    { id: 'height', header: t('land.height'), accessorFn: (x) => x.heightM ?? 0, cell: (c) => (c.row.original.state === 'ALIVE' && c.row.original.heightM ? `${f.number(c.row.original.heightM, { maximumFractionDigits: 2 })} m` : '—') },
    { id: 'health', header: t('land.health'), accessorFn: (x) => x.health ?? -1, cell: (c) => (c.row.original.health != null ? f.number(c.row.original.health) : '—') },
    { id: 'issues', header: t('land.issues'), accessorFn: (x) => x.issues.join(', '), cell: (c) => c.row.original.issues.map((i) => t(`land.issue.${i}`, { defaultValue: i })).join(', ') || '—' },
    { id: 'agent', header: t('col.agent'), accessorFn: (x) => lk.user(x.createdBy) },
  ], [t, f, lk, ll, settings, plotCode]);
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('land.searchTrees')}
        views={(['all', 'due', 'issues'] as const).map((v) => ({ key: v, label: t(`land.tView.${v}`), active: view === v, onSelect: () => setView(v), count: trees.filter((x) => inView(x, v)).length }))}
        filters={[
          { key: 'species', label: t('land.species'), value: species, onChange: setSpecies, options: ll.species.map((s) => ({ value: s.id, label: ll.speciesName(s.id) })) },
          { key: 'state', label: t('land.stateCol'), value: state, onChange: setState, options: STATES.map((s) => ({ value: s, label: t(`land.state.${s}`) })) },
          { key: 'round', label: t('land.roundCol'), value: round, onChange: setRound, options: [0, ...settings.land.treeRoundDays.map((_, i) => i + 1)].map((r) => ({ value: String(r), label: t('land.roundN', { n: r }) })) },
        ]}
        onClear={() => { setQ(''); setSpecies(''); setState(''); setRound(''); setView('all'); }}
        extra={<Button variant="secondary" onClick={() => setExporting(true)}><Download /> {t('common.export')}</Button>} />
      <DataTable columns={columns} data={shown} onRowClick={(x) => onOpen(x.id)} activeId={openId} getRowId={(x) => x.id} empty={t('land.noTrees')} />
      {exporting && <ExportDialog trees={shown} onClose={() => setExporting(false)} />}
    </>
  );
}

/** Export trees planted in a date range, limited to the company's maximum span. */
function ExportDialog({ trees, onClose }: { trees: Tree[]; onClose: () => void }) {
  const { t } = useT();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const max = settings.land.exportMaxDays;
  const [from, setFrom] = useState(new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
  const tooLong = days > max;
  const rows = trees.filter((x) => x.plantedAt >= from && x.plantedAt <= to);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('land.exportTrees')}</DialogTitle><DialogDescription>{t('land.exportHint', { days: max })}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('land.plantedFrom')}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('land.plantedFrom')} /></Field>
          <Field label={t('land.plantedTo')} error={tooLong ? t('land.exportTooLong', { days: max }) : days < 0 ? t('sales.windowError') : undefined}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('land.plantedTo')} /></Field>
        </div>
        <p className="text-[14px] text-body">{t('land.exportCount', { count: rows.length })}</p>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={tooLong || days < 0 || !rows.length} onClick={() => { downloadCsv('trees.csv', [t('land.treeCode'), t('land.species'), t('land.farmer'), t('land.plantedOn'), t('land.stateCol'), t('land.height'), t('land.health'), t('land.roundCol')], rows.map((x) => [x.code, ll.speciesName(x.speciesId), ll.farmerName(x.farmerId), x.plantedAt, x.state, x.heightM ?? '', x.health ?? '', x.round])); toast.success(t('land.toast.exported', { count: rows.length })); onClose(); }}><Download /> {t('common.export')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TreeMap({ trees, onOpen }: { trees: Tree[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const plots = useOrgRows(useLandStore((s) => s.plots));
  const [species, setSpecies] = useState('');
  const [round, setRound] = useState('');
  const shown = trees.filter((x) => (!species || x.speciesId === species) && (!round || String(x.round) === round));
  const plotIds = new Set(shown.map((x) => x.plotId).filter(Boolean));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={species} onChange={(e) => setSpecies(e.target.value)} aria-label={t('land.species')} className="h-10 rounded-ctl border border-line bg-surface px-3 text-[14px]"><option value="">{t('land.allSpecies')}</option>{ll.species.map((s) => <option key={s.id} value={s.id}>{ll.speciesName(s.id)}</option>)}</select>
        <select value={round} onChange={(e) => setRound(e.target.value)} aria-label={t('land.roundCol')} className="h-10 rounded-ctl border border-line bg-surface px-3 text-[14px]"><option value="">{t('land.allRounds')}</option>{[0, ...settings.land.treeRoundDays.map((_, i) => i + 1)].map((r) => <option key={r} value={r}>{t('land.roundN', { n: r })}</option>)}</select>
      </div>
      <LandMap ariaLabel={t('land.treeMap')} height={560}
        legend={[...STATES.map((s) => ({ label: t(`land.state.${s}`), color: STATE_COLOR[s] })), { label: t('land.plot'), color: '#6b7280' }]}
        shapes={plots.filter((p) => plotIds.has(p.id) && p.polygon.length >= 3).map((p) => ({ id: p.id, polygon: p.polygon, color: '#6b7280', label: p.code ?? '' }))}
        points={shown.map((x) => ({ id: x.id, lat: x.gps.lat, lng: x.gps.lng, color: STATE_COLOR[x.state], label: `${x.code} · ${ll.speciesName(x.speciesId)} · ${t(`land.state.${x.state}`)}`, onClick: () => onOpen(x.id) }))} />
    </div>
  );
}

function TreeDrawer({ tree: x, onClose }: { tree: Tree; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const plot = useLandStore((s) => s.plots.find((p) => p.id === x.plotId));
  const [visit, setVisit] = useState(false);
  const due = treeDue(x, settings);
  return (
    <>
      <DetailDrawer open onClose={onClose} title={x.code} subtitle={`${ll.speciesName(x.speciesId)} · ${ll.farmerName(x.farmerId)} · ${lk.community(x.communityId)}`}
        badges={<><StateBadge state={x.state} />{due != null && <Badge tone="warning">{t('land.dueRound', { n: due })}</Badge>}</>}
        actions={x.state === 'ALIVE' ? <PermissionGate permission="trees.edit"><Button size="sm" onClick={() => setVisit(true)}><ClipboardCheck /> {t('land.recordVisit')}</Button></PermissionGate> : undefined}
        tabs={[
          {
            key: 'overview', label: t('land.tab.overview'), content: (
              <div className="space-y-5">
                <Facts items={[
                  [t('land.plantedOn'), f.date(x.plantedAt)], [t('land.plot'), plot?.code ?? '—'],
                  [t('land.height'), x.heightM ? `${f.number(x.heightM, { maximumFractionDigits: 2 })} m` : '—'], [t('land.health'), x.health != null ? f.number(x.health) : '—'],
                  [t('land.roundCol'), f.number(x.round)], [t('land.lastVisit'), x.lastVisitAt ? f.dateTime(x.lastVisitAt) : '—'],
                  [t('land.issues'), x.issues.map((i) => t(`land.issue.${i}`, { defaultValue: i })).join(', ') || '—'], [t('land.gps'), `${x.gps.lat.toFixed(5)}, ${x.gps.lng.toFixed(5)}`],
                ]} />
                <LandMap ariaLabel={x.code} height={240} shapes={plot && plot.polygon.length >= 3 ? [{ id: plot.id, polygon: plot.polygon, color: '#6b7280', label: plot.code ?? '' }] : []} points={[{ id: x.id, lat: x.gps.lat, lng: x.gps.lng, color: STATE_COLOR[x.state], label: x.code }]} />
              </div>
            ),
          },
          {
            key: 'visits', label: t('land.tab.visits'), count: x.visits.length, content: x.visits.length ? (
              <ol className="space-y-2">{[...x.visits].reverse().map((v) => (
                <li key={v.id} className="rounded-ctl border border-line px-3 py-2.5 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2"><StateBadge state={v.state} /><span className="font-medium text-ink">{t('land.roundN', { n: v.round })}</span><span className="text-muted">{`${f.dateTime(v.at)} · ${lk.user(v.by)} · ${t(`people.device.${v.device}`)}`}</span></div>
                  <div className="mt-1 text-body">{[v.heightM ? `${f.number(v.heightM, { maximumFractionDigits: 2 })} m` : '', v.health != null && v.state === 'ALIVE' ? t('land.healthN', { n: v.health }) : '', v.causeOfDeath ? t('land.causeOf', { cause: t(`land.cause.${v.causeOfDeath}`, { defaultValue: v.causeOfDeath }) }) : '', v.issues.map((i) => t(`land.issue.${i}`, { defaultValue: i })).join(', ')].filter(Boolean).join(' · ')}</div>
                  {v.photos.length > 0 && <div className="mt-1 text-[12px] text-muted">{v.photos.join(', ')}</div>}
                </li>
              ))}</ol>
            ) : <TabEmpty>{t('land.noVisits')}</TabEmpty>,
          },
        ]} />
      {visit && <VisitDialog tree={x} onClose={() => setVisit(false)} />}
    </>
  );
}

/** Web visit form, the same fields as the species form on the phone (alive / dead logic). */
export function VisitDialog({ tree: x, onClose }: { tree: Tree; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const [state, setState] = useState<TreeState>('ALIVE');
  const [height, setHeight] = useState(String(x.heightM ?? ''));
  const [rating, setRating] = useState(4);
  const [issues, setIssues] = useState<string[]>([]);
  const [cause, setCause] = useState('');
  const [photo, setPhoto] = useState<string>();
  const invalid = !photo || (state === 'DEAD' && !cause) || (state === 'ALIVE' && !(Number(height) > 0));
  const save = () => {
    recordTreeVisit(x.id, { state, heightM: state === 'ALIVE' ? Number(height) : undefined, rating, issues, causeOfDeath: state === 'DEAD' ? cause : undefined, photos: [photo!], actorId: userId ?? 'system', device: 'web' });
    toast.success(t('land.toast.visit', { code: x.code, state: t(`land.state.${state}`) }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('land.visitTitle', { code: x.code })}</DialogTitle><DialogDescription>{t('land.roundN', { n: x.round + 1 })}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('land.stateCol')}>{STATES.map((s) => <button key={s} type="button" role="radio" aria-checked={state === s} onClick={() => setState(s)} className={cn('rounded-ctl border px-2 py-2.5 text-[14px] font-medium', state === s ? 'border-brand bg-brand-soft text-ink' : 'border-line text-body')}>{t(`land.state.${s}`)}</button>)}</div>
          {state === 'ALIVE' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('land.heightM')}><Input type="number" step="0.05" value={height} onChange={(e) => setHeight(e.target.value)} aria-label={t('land.heightM')} /></Field>
                <Field label={t('land.rating')}><select value={rating} onChange={(e) => setRating(Number(e.target.value))} aria-label={t('land.rating')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px]">{[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{'★'.repeat(r)}</option>)}</select></Field>
              </div>
              <fieldset><legend className="mb-2 text-[13px] font-semibold text-label">{t('land.issues')}</legend><div className="flex flex-wrap gap-2">{ISSUES.map((i) => <button key={i} type="button" aria-pressed={issues.includes(i)} onClick={() => setIssues(issues.includes(i) ? issues.filter((y) => y !== i) : [...issues, i])} className={cn('rounded-chip border px-3 py-1.5 text-[13px]', issues.includes(i) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-body')}>{t(`land.issue.${i}`)}</button>)}</div></fieldset>
            </>
          )}
          {state === 'DEAD' && <Field label={t('land.causeOfDeath')}><select value={cause} onChange={(e) => setCause(e.target.value)} aria-label={t('land.causeOfDeath')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px]"><option value="">{t('land.pickCause')}</option>{CAUSES.map((c) => <option key={c} value={c}>{t(`land.cause.${c}`)}</option>)}</select></Field>}
          <FilePick label={t('land.photo')} value={photo} onChange={setPhoto} sample="tree.jpg" />
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CAUSES, ISSUES };
