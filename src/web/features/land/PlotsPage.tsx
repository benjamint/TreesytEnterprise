import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, FileUp, MapPinned, Pencil, RotateCcw, Save, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Plot } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { FilePick } from '@/components/shared/FilePick';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { Donut, HBars } from '@/components/charts/charts';
import { polygonAreaHa, type LatLng } from '@/engines/geo';
import { checkGeometry, parseGeometryFile, plotsDueMonitoring, recordPlotVisit, savePlot, setPlotAgreement, treesOnPlot, updatePlotGeometry } from '@/services/landService';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLandStore } from '@/stores/landStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { CheckBadge, CHECK_COLOR, LandMap, ValidationList, plotShape, useArea, useLandLookups, usePageTab } from './shared';

const TABS = ['list', 'map', 'dashboard'] as const;

/** Plots and field mapping (PRD I4). */
export function PlotsPage() {
  const { t } = useT();
  const [tab, setTab] = usePageTab(TABS, 'list');
  const plots = useOrgRows(useLandStore((s) => s.plots));
  const [openId, open, close] = useDrawerParam();
  const [mapping, setMapping] = useState(false);
  const current = plots.find((p) => p.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.trees')} title={t('nav.plots')} description={t('pages.plots')}
        primary={<PermissionGate permission="plots.create"><Button onClick={() => setMapping(true)}><MapPinned /> {t('land.mapPlot')}</Button></PermissionGate>} />
      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-3 py-2.5 text-[14px] font-medium', tab === k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>{t(`land.pTab.${k}`)}</button>)}
      </div>
      {tab === 'list' && <PlotList plots={plots} onOpen={open} openId={openId} />}
      {tab === 'map' && <PlotMap plots={plots} onOpen={open} />}
      {tab === 'dashboard' && <PlotDashboard plots={plots} />}
      {current && <PlotDrawer key={current.id} plot={current} onClose={close} />}
      {mapping && <MapPlotSheet onClose={(id) => { setMapping(false); if (id) open(id); }} />}
    </>
  );
}

function PlotList({ plots, onOpen, openId }: { plots: Plot[]; onOpen: (id: string) => void; openId: string | null }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const area = useArea();
  const { orgId } = useActor();
  const trees = useLandStore((s) => s.trees);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [check, setCheck] = useState('');
  const [view, setView] = useState<'all' | 'invalid' | 'noAgreement' | 'due'>('all');
  const due = useMemo(() => new Set(plotsDueMonitoring(orgId).map((p) => p.id)), [orgId, plots]); // eslint-disable-line react-hooks/exhaustive-deps
  const treeCount = useMemo(() => { const m = new Map<string, number>(); for (const x of trees) if (x.plotId) m.set(x.plotId, (m.get(x.plotId) ?? 0) + 1); return m; }, [trees]);
  const inView = (p: Plot, v: typeof view) => v === 'all' || (v === 'invalid' ? !p.validation?.ok : v === 'noAgreement' ? !p.agreement : due.has(p.id));
  const query = q.trim().toLowerCase();
  const shown = plots.filter((p) => inView(p, view) && (!type || p.typeId === type) && (!check || (p.check?.result ?? 'NOT_CHECKED') === check) && (!query || (p.code ?? '').toLowerCase().includes(query) || ll.farmerName(p.farmerId).toLowerCase().includes(query)));
  const columns = useMemo<ColumnDef<Plot, unknown>[]>(() => [
    { id: 'code', header: t('land.plotId'), accessorFn: (p) => p.code ?? p.id, cell: (c) => mono(c.getValue() as string) },
    { id: 'type', header: t('col.type'), accessorFn: (p) => ll.plotTypeName(p.typeId) },
    { id: 'farmer', header: t('land.farmer'), accessorFn: (p) => ll.farmerName(p.farmerId) },
    { id: 'community', header: t('col.community'), accessorFn: (p) => lk.community(p.communityId) },
    { id: 'area', header: t('land.area'), accessorKey: 'areaHa', cell: (c) => <span className="whitespace-nowrap">{area(c.getValue() as number)}</span> },
    { id: 'declared', header: t('land.declared'), accessorFn: (p) => p.declaredAreaHa ?? 0, cell: (c) => (c.row.original.declaredAreaHa != null ? <span className="whitespace-nowrap">{area(c.row.original.declaredAreaHa)}</span> : '—') },
    { id: 'geometry', header: t('land.geometry'), accessorFn: (p) => p.geometry ?? 'POLYGON', cell: (c) => t(`land.geom.${c.getValue() as string}`) },
    { id: 'precision', header: t('land.precision'), accessorFn: (p) => p.validation?.decimals ?? 0, cell: (c) => <span className={cn('tnum', c.row.original.validation?.precisionOk ? 'text-body' : 'font-medium text-danger')}>{t('land.decimalsN', { n: c.getValue() as number })}{c.row.original.gpsAccuracyM ? ` · ±${c.row.original.gpsAccuracyM} m` : ''}</span> },
    { id: 'eudr', header: t('land.eudrStatus'), accessorFn: (p) => p.check?.result ?? 'NOT_CHECKED', cell: (c) => <CheckBadge result={c.row.original.check?.result} /> },
    { id: 'trees', header: t('land.treesCol'), accessorFn: (p) => treeCount.get(p.id) ?? 0, cell: (c) => { const n = c.getValue() as number; if (n) return f.number(n); const est = treesOnPlot(c.row.original); return est.estimated && est.count ? <span className="text-muted">{t('land.estimated', { n: f.number(est.count) })}</span> : '0'; } },
    { id: 'agreement', header: t('land.agreementCol'), accessorFn: (p) => !!p.agreement, cell: (c) => (c.getValue() ? <Badge tone="success">{'✓'}</Badge> : <span className="text-muted">{'—'}</span>) },
    { id: 'monitoring', header: t('land.lastMonitoring'), accessorFn: (p) => p.visits?.at(-1)?.at ?? '', cell: (c) => (c.getValue() ? f.date(c.getValue() as string) : due.has(c.row.original.id) ? <Badge tone="warning">{t('land.due')}</Badge> : '—') },
  ], [t, f, lk, ll, area, treeCount, due]);
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('land.searchPlots')}
        views={(['all', 'invalid', 'noAgreement', 'due'] as const).map((v) => ({ key: v, label: t(`land.plView.${v}`), active: view === v, onSelect: () => setView(v), count: plots.filter((p) => inView(p, v)).length }))}
        filters={[
          { key: 'type', label: t('col.type'), value: type, onChange: setType, options: ll.plotTypes.map((x) => ({ value: x.id, label: ll.plotTypeName(x.id) })) },
          { key: 'check', label: t('land.eudrStatus'), value: check, onChange: setCheck, options: (['CLEAR', 'RISK', 'NOT_CHECKED'] as const).map((x) => ({ value: x, label: t(`land.check.${x}`) })) },
        ]}
        onClear={() => { setQ(''); setType(''); setCheck(''); setView('all'); }} />
      <DataTable columns={columns} data={shown} onRowClick={(p) => onOpen(p.id)} activeId={openId} getRowId={(p) => p.id} empty={t('land.noPlots')}
        exportCsv={{ fileName: 'plots.csv', columns: [{ header: t('land.plotId'), value: (p) => p.code ?? p.id }, { header: t('land.farmer'), value: (p) => ll.farmerName(p.farmerId) }, { header: t('land.area'), value: (p) => p.areaHa }, { header: t('land.eudrStatus'), value: (p) => p.check?.result ?? 'NOT_CHECKED' }] }} />
    </>
  );
}

function PlotMap({ plots, onOpen }: { plots: Plot[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const ll = useLandLookups();
  const area = useArea();
  const zones = useOrgRows(useLandStore((s) => s.lossZones));
  const [showZones, setShowZones] = useState(false);
  const poly = plots.filter((p) => p.polygon.length >= 3);
  const points = plots.filter((p) => !p.polygon.length && p.point);
  return (
    <div className="space-y-3">
      <Checkbox label={t('land.showLossLayer')} checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
      <LandMap ariaLabel={t('land.plotMap')} height={560}
        legend={[...(['CLEAR', 'RISK', 'NOT_CHECKED'] as const).map((x) => ({ label: t(`land.check.${x}`), color: CHECK_COLOR[x] })), ...(showZones ? [{ label: t('land.lossZone'), color: '#9b1c1c' }] : [])]}
        zones={showZones ? zones.map((z) => ({ id: z.id, polygon: z.polygon, color: '#9b1c1c', label: t('land.lossZoneLabel', { name: z.name, year: z.lossYear }) })) : []}
        shapes={poly.map((p) => plotShape(p, `${p.code} · ${ll.farmerName(p.farmerId)} · ${area(p.areaHa)}`, () => onOpen(p.id)))}
        points={points.map((p) => ({ id: p.id, lat: p.point![0], lng: p.point![1], color: CHECK_COLOR[p.check?.result ?? 'NOT_CHECKED'], label: `${p.code} · ${t('land.geom.POINT')}`, onClick: () => onOpen(p.id) }))} />
    </div>
  );
}

function PlotDashboard({ plots }: { plots: Plot[] }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const area = useArea();
  const trees = useOrgRows(useLandStore((s) => s.trees));
  const total = plots.reduce((s, p) => s + p.areaHa, 0);
  const withPoly = plots.filter((p) => p.polygon.length >= 3).length;
  const byType = ll.plotTypes.map((x, i) => ({ label: ll.plotTypeName(x.id), value: plots.filter((p) => p.typeId === x.id).length, index: i })).filter((x) => x.value);
  const byAgent = [...plots.reduce((m, p) => m.set(p.agentId ?? '', (m.get(p.agentId ?? '') ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => ({ label: lk.agent(id), value: v }));
  const treesPerPlot = plots.length ? Math.round((trees.filter((x) => x.plotId).length / plots.length) * 10) / 10 : 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={t('nav.plots')} value={f.number(plots.length)} />
        <StatCard label={t('land.totalArea')} value={area(total)} />
        <StatCard label={t('land.avgArea')} value={area(plots.length ? total / plots.length : 0)} />
        <StatCard label={t('land.withPolygon')} value={`${f.number(plots.length ? Math.round((withPoly / plots.length) * 1000) / 10 : 0)}%`} />
        <StatCard label={t('land.treesPerPlot')} value={f.number(treesPerPlot)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('land.byType')}</h3>{byType.length ? <Donut data={byType} format={(v) => f.number(v)} /> : <TabEmpty>{t('land.noPlots')}</TabEmpty>}</section>
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('land.byAgent')}</h3><HBars data={byAgent} format={(v) => f.number(v)} /></section>
      </div>
    </div>
  );
}

function PlotDrawer({ plot: p, onClose }: { plot: Plot; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const area = useArea();
  const settings = useOrgSettings();
  const { userId } = useActor();
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases)).filter((x) => x.plotId === p.id || x.farmerId === p.farmerId);
  const lots = useOrgRows(useLandStore((s) => s.eudrLots)).filter((l) => l.plotIds.includes(p.id));
  const trees = useLandStore((s) => s.trees).filter((x) => x.plotId === p.id);
  const zones = useOrgRows(useLandStore((s) => s.lossZones));
  const [editing, setEditing] = useState<LatLng[] | null>(null);
  const [visit, setVisit] = useState(false);
  const [agreement, setAgreement] = useState<string>();
  const live = editing ? checkGeometry(p.orgId, { polygon: editing }, p.id) : p.validation;
  const zone = zones.find((z) => z.id === p.check?.zoneId);
  const est = treesOnPlot(p);
  return (
    <>
      <DetailDrawer open onClose={onClose} title={p.code ?? p.id} subtitle={`${ll.plotTypeName(p.typeId)} · ${ll.farmerName(p.farmerId)} · ${lk.community(p.communityId)}`}
        badges={<><CheckBadge result={p.check?.result} />{p.validation && !p.validation.ok && <Badge tone="warningOutline">{t('land.needsFix')}</Badge>}{p.agreement && <Badge tone="success">{t('land.agreementSigned')}</Badge>}</>}
        actions={<>
          {!editing && p.polygon.length >= 3 && <PermissionGate permission="plots.edit"><Button size="sm" variant="secondary" onClick={() => setEditing(p.polygon)}><Pencil /> {t('land.editVertices')}</Button></PermissionGate>}
          {editing && <><Button size="sm" onClick={() => { updatePlotGeometry(p.id, editing, userId ?? 'system'); setEditing(null); toast.success(t('land.toast.geometry', { code: p.code })); }}><Save /> {t('common.save')}</Button><Button size="sm" variant="secondary" onClick={() => setEditing(null)}><Undo2 /> {t('common.cancel')}</Button></>}
          <PermissionGate permission="plots.edit"><Button size="sm" variant="secondary" onClick={() => setVisit(true)}><ClipboardCheck /> {t('land.recordMonitoring')}</Button></PermissionGate>
        </>}
        tabs={[
          {
            key: 'map', label: t('land.tab.map'), content: (
              <div className="space-y-4">
                <LandMap ariaLabel={p.code ?? ''} height={320}
                  zones={zone ? [{ id: zone.id, polygon: zone.polygon, color: '#9b1c1c', label: t('land.lossZoneLabel', { name: zone.name, year: zone.lossYear }) }] : []}
                  shapes={!editing && p.polygon.length >= 3 ? [plotShape(p, p.code ?? '')] : []}
                  points={!p.polygon.length && p.point ? [{ id: p.id, lat: p.point[0], lng: p.point[1], color: CHECK_COLOR[p.check?.result ?? 'NOT_CHECKED'], label: p.code ?? '' }] : trees.map((x) => ({ id: x.id, lat: x.gps.lat, lng: x.gps.lng, color: 'var(--series-3)', label: x.code }))}
                  edit={editing ? { polygon: editing, onChange: setEditing } : undefined} />
                {editing && <p className="text-[13px] text-muted">{t('land.dragHint', { area: area(polygonAreaHa(editing)) })}</p>}
                <Facts items={[
                  [t('land.area'), area(editing ? polygonAreaHa(editing) : p.areaHa)], [t('land.declared'), p.declaredAreaHa != null ? area(p.declaredAreaHa) : '—'],
                  [t('land.geometry'), `${t(`land.geom.${p.geometry ?? 'POLYGON'}`)}${p.polygon.length ? ` · ${t('land.verticesN', { n: (editing ?? p.polygon).length })}` : ''}`], [t('land.gpsAccuracy'), p.gpsAccuracyM ? `±${p.gpsAccuracyM} m` : '—'],
                  [t('land.eudrStatus'), <CheckBadge key="c" result={p.check?.result} />], [t('land.checkedOn'), p.check?.at ? `${f.date(p.check.at)}${p.check.lossHa ? ` · ${t('land.lossHa', { ha: area(p.check.lossHa) })}` : ''}` : '—'],
                  [t('land.treesCol'), est.estimated ? t('land.estimated', { n: f.number(est.count) }) : f.number(est.count)], [t('land.crop'), lk.commodity(p.crop)],
                ]} />
                <div className="rounded-ctl border border-line p-4"><h4 className="mb-2 text-[13px] font-semibold text-ink">{t('land.validation')}</h4><ValidationList v={live} minDecimals={settings.land.eudr.minDecimals} overHa={settings.land.eudr.polygonOverHa} /></div>
              </div>
            ),
          },
          {
            key: 'monitoring', label: t('land.tab.monitoring'), count: p.visits?.length ?? 0, content: p.visits?.length ? (
              <ul className="space-y-2">{[...p.visits].reverse().map((v) => (
                <li key={v.id} className="rounded-ctl border border-line p-3 text-[13px]">
                  <div className="mb-2 text-muted">{`${f.dateTime(v.at)} · ${lk.agent(v.by) !== '—' ? lk.agent(v.by) : lk.user(v.by)} · ${t(`people.device.${v.device}`)}`}</div>
                  <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{Object.entries(v.answers).map(([k, a]) => { const q = settings.land.plotMonitoring.find((x) => x.id === k); return <div key={k} className="flex justify-between gap-2"><dt className="text-body">{q ? q.label[f.lang] ?? q.label.en : k}</dt><dd className={cn('font-medium', a === true && ['chemicals', 'treeCutting', 'bushfire', 'recentBushfire', 'livestockPresent'].includes(k) ? 'text-danger' : 'text-ink')}>{typeof a === 'boolean' ? (a ? t('common.yes') : t('common.no')) : a}</dd></div>; })}</dl>
                </li>
              ))}</ul>
            ) : <TabEmpty>{t('land.noMonitoring')}</TabEmpty>,
          },
          {
            key: 'purchases', label: t('land.tab.purchases'), count: purchases.length, content: (
              <div className="space-y-4">
                {lots.length > 0 && <div className="flex flex-wrap gap-1.5">{lots.map((l) => <Badge key={l.id} tone="info">{t('land.inLot', { number: l.number })}</Badge>)}</div>}
                {purchases.length ? <ul className="divide-y divide-line rounded-ctl border border-line">{purchases.slice(0, 30).map((x) => <li key={x.id} className="flex justify-between gap-3 px-3 py-2 text-[13px]"><span className="font-mono text-ink">{x.number}</span><span className="text-muted">{`${lk.commodity(x.commodityId)} · ${f.kg(x.quantity)} · ${f.date(x.createdAt)}`}</span></li>)}</ul> : <TabEmpty>{t('land.noPurchases')}</TabEmpty>}
              </div>
            ),
          },
          {
            key: 'files', label: t('land.tab.files'), count: (p.images?.length ?? 0) + (p.agreement ? 1 : 0), content: (
              <div className="space-y-4">
                {p.agreement ? <Facts items={[[t('land.agreementFile'), p.agreement.name], [t('land.uploaded'), f.dateTime(p.agreement.at)]]} /> : (
                  <div className="space-y-2"><FilePick label={t('land.agreementFile')} value={agreement} onChange={setAgreement} sample="plot-agreement.jpg" /><PermissionGate permission="plots.edit"><Button size="sm" disabled={!agreement} onClick={() => { setPlotAgreement(p.id, agreement!, userId ?? 'system'); toast.success(t('land.toast.agreement')); }}>{t('common.save')}</Button></PermissionGate></div>
                )}
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(p.images ?? []).map((img) => <li key={img.id} className="rounded-ctl border border-line p-2"><div className="flex h-20 items-center justify-center rounded-[6px] bg-canvas text-[12px] text-muted">{img.name}</div><div className="mt-1 text-[11px] text-muted">{f.date(img.at)}</div></li>)}</ul>
              </div>
            ),
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="plot" entityId={p.id} /> },
        ]} />
      {visit && <PlotVisitDialog plot={p} onClose={() => setVisit(false)} />}
    </>
  );
}

/** Plot monitoring questionnaire for the plot's land type. */
export function PlotVisitDialog({ plot: p, onClose }: { plot: Plot; onClose: () => void }) {
  const { t } = useT();
  const lang = useLang();
  const settings = useOrgSettings();
  const { userId } = useActor();
  const qs = settings.land.plotMonitoring.filter((q) => !p.typeId || q.plotTypeIds.includes(p.typeId));
  const [answers, setAnswers] = useState<Record<string, boolean | string>>(() => Object.fromEntries(qs.map((q) => [q.id, q.kind === 'YES_NO' ? false : ''])));
  const [photo, setPhoto] = useState<string>();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('land.monitoringTitle', { code: p.code })}</DialogTitle><DialogDescription>{t('land.monitoringHint')}</DialogDescription></DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {qs.map((q) => q.kind === 'YES_NO'
            ? <div key={q.id} className="flex items-center justify-between gap-3 rounded-ctl border border-line px-3 py-2 text-[14px]"><span className="text-ink">{q.label[lang] ?? q.label.en}</span><span className="flex gap-1">{[true, false].map((v) => <button key={String(v)} type="button" aria-pressed={answers[q.id] === v} onClick={() => setAnswers({ ...answers, [q.id]: v })} className={cn('rounded-chip border px-3 py-1 text-[13px]', answers[q.id] === v ? 'border-brand bg-brand-soft text-ink' : 'border-line text-body')}>{v ? t('common.yes') : t('common.no')}</button>)}</span></div>
            : <Field key={q.id} label={q.label[lang] ?? q.label.en}><Input value={String(answers[q.id] ?? '')} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} aria-label={q.label[lang] ?? q.label.en} /></Field>)}
          <FilePick label={t('land.photo')} value={photo} onChange={setPhoto} sample="plot-visit.jpg" />
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!photo} onClick={() => { recordPlotVisit(p.id, { answers, photos: [photo!], actorId: userId ?? 'system' }); toast.success(t('land.toast.monitoring', { code: p.code })); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Map a plot on the web: draw a polygon (click the map), drop a point, or import GeoJSON / KML. */
function MapPlotSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const { orgId, userId } = useActor();
  const lk = useLookups();
  const ll = useLandLookups();
  const area = useArea();
  const settings = useOrgSettings();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const [mode, setMode] = useState<'draw' | 'point' | 'import'>('draw');
  const [farmerQ, setFarmerQ] = useState('');
  const [farmerId, setFarmerId] = useState('');
  const [typeId, setTypeId] = useState(ll.plotTypes[0]?.id ?? '');
  const [ring, setRing] = useState<LatLng[]>([]);
  const [point, setPoint] = useState<LatLng | undefined>();
  const [declared, setDeclared] = useState('');
  const [agreement, setAgreement] = useState<string>();
  const [importText, setImportText] = useState('');
  const farmer = farmers.find((f) => f.id === farmerId);
  const community = lk.communities.find((c) => c.id === farmer?.communityId);
  const matches = farmers.filter((f) => farmerQ && `${f.firstName} ${f.lastName} ${f.farmerCode}`.toLowerCase().includes(farmerQ.toLowerCase())).slice(0, 6);
  const geom = mode === 'point' ? { polygon: [] as LatLng[], point, declaredAreaHa: Number(declared) || undefined } : { polygon: ring };
  const v = (mode === 'point' ? point : ring.length >= 3) ? checkGeometry(orgId, geom) : undefined;
  const type = ll.plotTypes.find((x) => x.id === typeId);
  const invalid = (type?.requiresFarmer && !farmerId) || (mode === 'point' ? !point : ring.length < 3);
  const doImport = () => {
    try {
      const g = parseGeometryFile(importText)[0];
      if (!g) throw new Error('empty');
      if (g.point) { setMode('point'); setPoint(g.point); } else { setRing(g.polygon); }
      toast.success(t('land.toast.imported'));
    } catch { toast.error(t('land.importError')); }
  };
  const save = () => {
    try {
      const p = savePlot({ orgId, farmerId, typeId, ...geom, agreement, source: mode === 'import' ? 'IMPORTED' : 'DRAWN', actorId: userId ?? 'system', agentId: farmer?.agentId });
      toast.success(t('land.toast.plot', { code: p.code, area: area(p.areaHa) }));
      onClose(p.id);
    } catch (e) { toast.error(t(`land.error.${(e as Error).message}`, { defaultValue: (e as Error).message })); }
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0 sm:max-w-[760px]">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('land.mapPlot')}</SheetTitle></div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('land.farmer')} helper={farmer ? `${farmer.farmerCode} · ${lk.community(farmer.communityId)}` : type?.requiresFarmer ? t('land.farmerRequired') : undefined}>
              <Input value={farmer ? `${farmer.firstName} ${farmer.lastName}` : farmerQ} onChange={(e) => { setFarmerQ(e.target.value); setFarmerId(''); }} placeholder={t('land.searchFarmer')} aria-label={t('land.farmer')} />
              {!farmer && matches.length > 0 && <ul className="mt-1 divide-y divide-line rounded-ctl border border-line">{matches.map((f) => <li key={f.id}><button type="button" onClick={() => setFarmerId(f.id)} className="w-full px-3 py-2 text-left text-[13px] hover:bg-canvas">{`${f.firstName} ${f.lastName}`} <span className="text-muted">{`· ${f.farmerCode}`}</span></button></li>)}</ul>}
            </Field>
            <Field label={t('col.type')}><select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label={t('col.type')} className={select}>{ll.plotTypes.map((x) => <option key={x.id} value={x.id}>{ll.plotTypeName(x.id)}</option>)}</select></Field>
          </div>
          <div className="flex gap-1 rounded-ctl border border-line p-0.5" role="radiogroup" aria-label={t('land.howToMap')}>
            {(['draw', 'point', 'import'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('flex-1 rounded-[6px] px-3 py-2 text-[13px] font-medium', mode === m ? 'bg-brand-soft text-brand' : 'text-muted')}>{t(`land.mapMode.${m}`)}</button>)}
          </div>
          {mode === 'import' && (
            <div className="space-y-2">
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={5} placeholder={t('land.importPlaceholder')} aria-label={t('land.importFile')} className="w-full rounded-ctl border border-line bg-surface px-3 py-2 font-mono text-[12px]" />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-ctl bg-surface px-3 text-[13px] font-medium ring-1 ring-line"><FileUp className="h-4 w-4" /> {t('land.chooseGeo')}<input type="file" accept=".geojson,.json,.kml" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setImportText(await file.text()); e.target.value = ''; }} /></label>
                <Button size="sm" variant="secondary" onClick={() => setImportText(sampleGeoJson(community?.gps))}>{t('land.useSampleGeo')}</Button>
                <Button size="sm" disabled={!importText.trim()} onClick={doImport}>{t('land.import')}</Button>
              </div>
            </div>
          )}
          <LandMap ariaLabel={t('land.mapPlot')} height={340}
            edit={mode !== 'point' && ring.length ? { polygon: ring, onChange: setRing } : undefined}
            points={mode === 'point' && point ? [{ id: 'pt', lat: point[0], lng: point[1], color: '#14583F', label: t('land.geom.POINT') }] : []}
            draw={mode === 'import' ? undefined : { onAdd: (pt) => (mode === 'point' ? setPoint(pt) : setRing([...ring, pt])), center: community ? [community.gps.lat, community.gps.lng] : undefined }} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-muted">{mode === 'point' ? t('land.dropHint') : t('land.drawHint', { n: ring.length })}</span>
            <span className="flex gap-2">
              {mode !== 'point' && ring.length > 0 && <Button size="xs" variant="ghost" onClick={() => setRing(ring.slice(0, -1))}><Undo2 /> {t('land.undoPoint')}</Button>}
              <Button size="xs" variant="ghost" onClick={() => { setRing([]); setPoint(undefined); }}><RotateCcw /> {t('land.clear')}</Button>
            </span>
          </div>
          {mode === 'point' && <Field label={t('land.declaredHa')} helper={t('land.pointHint', { ha: settings.land.eudr.polygonOverHa })}><Input type="number" value={declared} onChange={(e) => setDeclared(e.target.value)} aria-label={t('land.declaredHa')} /></Field>}
          {v && (
            <div className="grid gap-4 rounded-ctl border border-line p-4 sm:grid-cols-[1fr_auto]">
              <ValidationList v={v} minDecimals={settings.land.eudr.minDecimals} overHa={settings.land.eudr.polygonOverHa} />
              <div className="text-right"><div className="text-[12px] text-muted">{t('land.area')}</div><div className="tnum text-[22px] font-semibold text-ink">{area(mode === 'point' ? Number(declared) || 0 : polygonAreaHa(ring))}</div></div>
            </div>
          )}
          <FilePick label={t('land.agreementFile')} value={agreement} onChange={setAgreement} sample="plot-agreement.jpg" />
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4"><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('common.save')}</Button></div>
      </SheetContent>
    </Sheet>
  );
}

/** A small sample GeoJSON polygon near the farmer's community (7-decimal coordinates). */
function sampleGeoJson(c?: { lat: number; lng: number }) {
  const lat = (c?.lat ?? 6.1) + 0.0031, lng = (c?.lng ?? -6.6) - 0.0027;
  const ring = [[0, 0], [0.0011, 0.0002], [0.0013, 0.0012], [0.0002, 0.0014]].map(([a, b]) => [Number((lng + b!).toFixed(7)) + 0.0000001, Number((lat + a!).toFixed(7)) + 0.0000003]);
  return JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Imported plot' }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }] }, null, 1);
}
