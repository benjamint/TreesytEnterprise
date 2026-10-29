import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, CalendarClock, Copy, Download, FileText, LineChart, PieChart, Plus, Printer, Share2, Table2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ExportJob, ReportChart, ReportFilter, SavedReport } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tip } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { Checkbox, Field, SelectField, TextAreaField, TextField } from '@/components/shared/Field';
import { ChartFrame, Donut, HBars, Lines } from '@/components/charts/charts';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import {
  columnsOf, copyReport, deleteReport, download, entityAvailable, exportFile, fileName, LARGE_EXPORT_ROWS, REPORT_ENTITIES, reportsFor, runReport, saveReport, startExport,
  type ReportColumn, type ReportGroup, type Row,
} from '@/services/reportService';
import { useAccessStore } from '@/stores/accessStore';
import { useSystemStore } from '@/stores/systemStore';
import { useActor, useCan, useCurrentOrg, useFormat, useLang, useT } from '@/stores/hooks';
import { SysStatus, useReportText, useUserName } from './shared';

const CHART_ICON: Record<ReportChart, typeof BarChart3> = { TABLE: Table2, BAR: BarChart3, LINE: LineChart, DONUT: PieChart };

function useMyReports() {
  const { orgId, userId } = useActor();
  const memberships = useAccessStore((s) => s.memberships);
  const all = useSystemStore((s) => s.reports);
  const roleIds = memberships.find((m) => m.userId === userId && m.orgId === orgId)?.roleIds ?? [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => reportsFor(orgId, userId ?? '', roleIds), [all, orgId, userId, roleIds.join()]);
}

/** Reports (PRD K1): library of standard exports, saved and shared reports, the builder, and exports. */
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('report');
  const build = params.get('build');
  if (build) return <ReportBuilder key={build} id={build === 'new' ? undefined : build} onDone={(id) => setParams(id ? { report: id } : {})} />;
  if (view) return <ReportViewer key={view} id={view} onBack={() => setParams({})} onEdit={(id) => setParams({ build: id })} onOpen={(id) => setParams({ report: id })} onExports={() => setParams({ tab: 'exports' })} />;
  return <ReportLibrary tab={params.get('tab') ?? 'library'} onTab={(tab) => setParams(tab === 'library' ? {} : { tab })} onOpen={(id) => setParams({ report: id })} onNew={() => setParams({ build: 'new' })} />;
}

function ReportLibrary({ tab, onTab, onOpen, onNew }: { tab: string; onTab: (t: string) => void; onOpen: (id: string) => void; onNew: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const rt = useReportText();
  const userName = useUserName();
  const { userId } = useActor();
  const reports = useMyReports();
  const roles = useAccessStore((s) => s.roles);
  const exports = useSystemStore((s) => s.exports).filter((e) => e.userId === userId);
  const library = reports.filter((r) => r.libraryKey);
  const custom = reports.filter((r) => !r.libraryKey).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [q, setQ] = useState('');
  useDemoNotes([{ id: 'rpt', key: 'demo.note.reports' }]);
  const shownLib = library.filter((r) => !q || `${rt.reportName(r)} ${rt.reportDesc(r)} ${rt.entityName(r.entity)}`.toLowerCase().includes(q.toLowerCase()));
  const roleName = (id: string) => { const r = roles.find((x) => x.id === id); return r ? r.name ?? t(`role.${r.template}`) : id; };
  const columns = useMemo<ColumnDef<SavedReport, unknown>[]>(() => [
    { id: 'name', header: t('rpt.name'), accessorFn: (r) => rt.reportName(r), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'entity', header: t('rpt.subject'), accessorFn: (r) => rt.entityName(r.entity) },
    { id: 'chart', header: t('rpt.chart'), accessorKey: 'chart', cell: (c) => t(`rpt.chartType.${c.getValue() as string}`) },
    { id: 'schedule', header: t('rpt.schedule'), accessorFn: (r) => (r.schedule ? scheduleText(r.schedule, t) : '—') },
    { id: 'shared', header: t('rpt.sharedWith'), accessorFn: (r) => r.sharedWithRoleIds.map(roleName).join(', ') || t('rpt.onlyMe') },
    { id: 'owner', header: t('rpt.owner'), accessorFn: (r) => userName(r.createdBy) },
    { id: 'updated', header: t('rpt.updated'), accessorKey: 'updatedAt', cell: (c) => f.date(c.getValue() as string) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, rt, userName, roles]);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.insights')} title={t('nav.reports')} description={t('pages.reports')} primary={<PermissionGate permission="reports.create"><Button onClick={onNew}><Plus /> {t('rpt.new')}</Button></PermissionGate>} />
      <Tabs value={tab} onValueChange={onTab}>
        <TabsList>
          <TabsTrigger value="library">{t('rpt.tab.library')} <Badge tone="neutral" className="ml-1.5">{library.length}</Badge></TabsTrigger>
          <TabsTrigger value="saved">{t('rpt.tab.saved')} <Badge tone="neutral" className="ml-1.5">{custom.length}</Badge></TabsTrigger>
          <TabsTrigger value="exports">{t('rpt.tab.exports')}{exports.some((e) => e.status === 'RUNNING') && <span className="ml-1.5 h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden="true" />}</TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="mt-5">
          <div className="mb-4 max-w-sm"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('rpt.searchLibrary')} aria-label={t('rpt.searchLibrary')} /></div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownLib.map((r) => {
              const Icon = CHART_ICON[r.chart];
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpen(r.id)} className="flex h-full w-full flex-col rounded-card border border-line bg-surface p-4 text-left shadow-soft transition hover:border-brand/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-ink">{rt.reportName(r)}</span>
                      <span className="rounded-full bg-brand-soft p-1.5 text-brand"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                    </span>
                    <span className="mt-1 flex-1 text-[13px] text-muted">{rt.reportDesc(r)}</span>
                    <span className="mt-3 flex flex-wrap gap-1.5"><Badge tone="neutral">{rt.entityName(r.entity)}</Badge>{r.groupBy && <Badge tone="brand">{t('rpt.byX', { x: rt.heading({ key: r.groupBy }) })}</Badge>}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </TabsContent>
        <TabsContent value="saved" className="mt-5">
          {custom.length ? <DataTable columns={columns} data={custom} onRowClick={(r) => onOpen(r.id)} getRowId={(r) => r.id} />
            : <EmptyState title={t('rpt.noSaved')} body={t('rpt.noSavedHint')} action={<PermissionGate permission="reports.create"><Button onClick={onNew}><Plus /> {t('rpt.new')}</Button></PermissionGate>} />}
        </TabsContent>
        <TabsContent value="exports" className="mt-5"><ExportsList exports={exports} /></TabsContent>
      </Tabs>
    </>
  );
}

type TFn = ReturnType<typeof useT>['t'];
function scheduleText(s: NonNullable<SavedReport['schedule']>, t: TFn) {
  return s.frequency === 'DAILY' ? t('rpt.dailyAt', { time: s.time }) : t('rpt.weeklyAt', { day: t(`common.weekday.${s.weekday ?? 1}`), time: s.time });
}

function ExportsList({ exports }: { exports: ExportJob[] }) {
  const { t } = useT();
  const f = useFormat();
  const get = (j: ExportJob) => {
    const file = exportFile(j.id);
    if (file === 'expired') toast.error(t('rpt.linkExpired'));
    else if (file === 'missing') toast.error(t('rpt.fileGone'));
    else download(file, fileName(j.name, j.format));
  };
  if (!exports.length) return <EmptyState title={t('rpt.noExports')} body={t('rpt.noExportsHint', { n: LARGE_EXPORT_ROWS })} />;
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface">
      {[...exports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => (
        <li key={j.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
          <FileText className="h-5 w-5 text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink">{`${j.name} · ${j.format}`}</div>
            <div className="text-[12px] text-muted">{t('rpt.exportMeta', { rows: f.number(j.rows), when: f.relative(j.createdAt) })}{j.expiresAt && j.status === 'READY' ? ` · ${t('rpt.expires', { when: f.dateTime(j.expiresAt) })}` : ''}</div>
            {j.status === 'RUNNING' && (
              <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('rpt.preparing')}>
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${j.progress}%` }} />
              </div>
            )}
          </div>
          <SysStatus status={j.status} />
          <Button size="sm" variant="secondary" disabled={j.status !== 'READY'} onClick={() => get(j)}><Download /> {t('rpt.download')}</Button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- Viewer

function ReportChartView({ r, groups, measureCol }: { r: Pick<SavedReport, 'chart' | 'groupBy'>; groups: ReportGroup[]; measureCol?: ReportColumn }) {
  const { t } = useT();
  const f = useFormat();
  const rt = useReportText();
  const groupCol = { key: r.groupBy ?? '', kind: 'text' as const };
  const fmt = (v: number) => (measureCol?.kind === 'money' ? f.money(v) : f.number(v));
  const label = (k: string) => (k === '—' ? t('rpt.blank') : rt.value(k) === k ? k : /^[A-Z_]+$/.test(k) ? rt.value(k) : k);
  const dateLabel = (k: string) => (/^\d{4}-\d{2}$/.test(k) ? f.date(`${k}-01`, 'MMM yy') : label(k));
  const table = { head: [rt.heading(groupCol), measureCol ? rt.heading(measureCol) : t('rpt.count')], rows: groups.map((g) => [dateLabel(g.key), fmt(g.value)]) };
  if (r.chart === 'LINE') return <ChartFrame table={table}><Lines data={groups.map((g) => ({ label: dateLabel(g.key), value: g.value }))} series={[{ key: 'value', label: measureCol ? rt.heading(measureCol) : t('rpt.count'), index: 0 }]} format={fmt} /></ChartFrame>;
  if (r.chart === 'DONUT') {
    const top = groups.slice(0, 7).map((g, i) => ({ label: label(g.key), value: g.value, index: i }));
    const rest = groups.slice(7).reduce((s, g) => s + g.value, 0);
    return <ChartFrame table={table}><Donut data={rest ? [...top, { label: t('rpt.other'), value: rest, index: -1 }] : top} format={fmt} center={<span className="text-[13px] text-muted">{fmt(groups.reduce((s, g) => s + g.value, 0))}</span>} /></ChartFrame>;
  }
  const top = groups.slice(0, 12).map((g) => ({ label: dateLabel(g.key), value: g.value }));
  return <ChartFrame table={table}><HBars data={top} format={fmt} /></ChartFrame>;
}

function useMasked() {
  const can = useCan();
  return !can('farmers.viewSensitive');
}

function ReportViewer({ id, onBack, onEdit, onOpen, onExports }: { id: string; onBack: () => void; onEdit: (id: string) => void; onOpen: (id: string) => void; onExports: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lang = useLang();
  const rt = useReportText();
  const userName = useUserName();
  const { userId, orgId } = useActor();
  const can = useCan();
  const masked = useMasked();
  const r = useSystemStore((s) => s.reports.find((x) => x.id === id));
  const [dialog, setDialog] = useState<'copy' | 'schedule' | 'share' | 'pdf' | 'delete' | null>(null);
  const res = useMemo(() => (r ? runReport(r, lang) : undefined), [r, lang]);
  const tableCols = useMemo<ColumnDef<Row, unknown>[]>(() => (res?.columns ?? []).map((c) => ({
    id: c.key, header: rt.heading(c), accessorFn: (row) => row[c.key] ?? '',
    cell: (x) => (c.sensitive && masked ? <span className="text-muted">•••</span> : <span className={c.kind === 'number' || c.kind === 'money' ? 'tnum' : ''}>{rt.cell(c, x.getValue() as Row[string])}</span>),
  })), [res, rt, masked]);
  if (!r || !res || !entityAvailable(orgId, r.entity)) return <EmptyState title={t('rpt.notFound')} action={<Button variant="secondary" onClick={onBack}><ArrowLeft /> {t('rpt.back')}</Button>} />;
  const own = !r.libraryKey && r.createdBy === userId;
  const measureCol = r.measure ? columnsOf(orgId, r.entity, lang).find((c) => c.key === r.measure) : undefined;
  const doExport = (format: 'CSV' | 'XLSX') => {
    const header = res.columns.map((c) => rt.heading(c));
    const rows = res.rows.map((row) => res.columns.map((c) => (c.sensitive && masked ? '•••' : rt.raw(c, row[c.key]))));
    const out = startExport({ orgId, userId: userId ?? 'system', reportId: r.id, name: rt.reportName(r), format, header, rows });
    if (out.file) { download(out.file, fileName(rt.reportName(r), format)); toast.success(t('rpt.exported', { count: rows.length })); }
    else toast.info(t('rpt.exportQueued', { count: rows.length }), { action: { label: t('rpt.tab.exports'), onClick: onExports } });
  };
  return (
    <>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-[14px] font-medium text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> {t('rpt.allReports')}</button>
      <PageHeader eyebrow={r.libraryKey ? t('rpt.libraryReport') : t('rpt.savedReport')} title={rt.reportName(r)} description={rt.reportDesc(r) || t('rpt.ownerLine', { name: userName(r.createdBy), date: f.date(r.updatedAt) })}
        actions={<>
          {r.libraryKey
            ? <PermissionGate permission="reports.create"><Button variant="secondary" onClick={() => setDialog('copy')}><Copy /> {t('rpt.copy')}</Button></PermissionGate>
            : own && <Button variant="secondary" onClick={() => onEdit(r.id)}>{t('rpt.edit')}</Button>}
          {own && <PermissionGate permission="reports.schedule"><Button variant="secondary" onClick={() => setDialog('schedule')}><CalendarClock /> {r.schedule ? scheduleText(r.schedule, t) : t('rpt.scheduleBtn')}</Button></PermissionGate>}
          {own && <Button variant="secondary" onClick={() => setDialog('share')}><Share2 /> {t('rpt.share')}</Button>}
          {r.libraryKey && <Tip label={t('rpt.copyToSchedule')}><span><Button variant="secondary" disabled><CalendarClock /> {t('rpt.scheduleBtn')}</Button></span></Tip>}
          <Button variant="secondary" onClick={() => setDialog('pdf')}><Printer /> {t('rpt.pdf')}</Button>
          {own && <Button variant="ghost" onClick={() => setDialog('delete')} aria-label={t('rpt.delete')}><Trash2 /></Button>}
        </>}
        primary={can('reports.export') ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button><Download /> {t('common.export')}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => doExport('XLSX')}>{t('rpt.excel')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => doExport('CSV')}>{t('rpt.csv')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone="neutral">{rt.entityName(r.entity)}</Badge>
        {r.filters.map((x, i) => <Badge key={i} tone="info">{filterText(x, rt, t)}</Badge>)}
        {r.groupBy && <Badge tone="brand">{t('rpt.byX', { x: rt.heading({ key: r.groupBy }) })}</Badge>}
        <span className="text-muted">{t('rpt.rowsCount', { count: res.total, n: f.number(res.total) })}</span>
        {masked && res.columns.some((c) => c.sensitive) && <span className="text-muted">· {t('rpt.maskedNote')}</span>}
      </div>
      {res.groups && r.chart !== 'TABLE' && (
        <section className="mb-5 rounded-card border border-line bg-surface p-5 shadow-soft">
          <h2 className="mb-3 text-[14px] font-semibold text-ink">{t('rpt.chartTitle', { measure: measureCol ? rt.heading(measureCol) : t('rpt.count'), by: rt.heading({ key: r.groupBy! }) })}</h2>
          <ReportChartView r={r} groups={res.groups} measureCol={measureCol} />
        </section>
      )}
      <DataTable columns={tableCols} data={res.rows} pageSize={15} empty={t('rpt.noRows')} />
      {dialog === 'copy' && <CopyDialog r={r} onClose={(newId) => { setDialog(null); if (newId) onOpen(newId); }} />}
      {dialog === 'schedule' && <ScheduleDialog r={r} onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareDialog r={r} onClose={() => setDialog(null)} />}
      {dialog === 'pdf' && <PdfView r={r} res={res} measureCol={measureCol} masked={masked} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('rpt.deleteTitle', { name: r.name })}</DialogTitle><DialogDescription>{t('rpt.deleteHint')}</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => { deleteReport(r.id); toast.success(t('rpt.deleted')); onBack(); }}>{t('rpt.delete')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function filterText(x: ReportFilter, rt: ReturnType<typeof useReportText>, t: TFn) {
  return t(`rpt.op.${x.op}`, { col: rt.heading({ key: x.column }), value: x.column === 'commodity' ? x.value.replace(/^com_/, '') : /^[A-Z_]+$/.test(x.value) ? rt.value(x.value) : x.value, value2: x.value2 ?? '' });
}

function CopyDialog({ r, onClose }: { r: SavedReport; onClose: (id?: string) => void }) {
  const { t } = useT();
  const rt = useReportText();
  const { userId } = useActor();
  const [name, setName] = useState(t('rpt.copyOf', { name: rt.reportName(r) }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('rpt.copyTitle')}</DialogTitle><DialogDescription>{t('rpt.copyHint')}</DialogDescription></DialogHeader>
        <TextField label={t('rpt.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <DialogFooter><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={!name.trim()} onClick={() => { const c = copyReport(r.id, name.trim(), userId ?? 'system'); toast.success(t('rpt.copied')); onClose(c.id); }}>{t('rpt.copy')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useRoleOptions() {
  const { t } = useT();
  const { orgId } = useActor();
  const roles = useAccessStore((s) => s.roles);
  return roles.filter((r) => r.orgId === orgId && !r.mobile).map((r) => ({ id: r.id, name: r.name ?? t(`role.${r.template}`) }));
}

function ScheduleDialog({ r, onClose }: { r: SavedReport; onClose: () => void }) {
  const { t } = useT();
  const { userId, orgId } = useActor();
  const roles = useRoleOptions();
  const org = useCurrentOrg();
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY'>(r.schedule?.frequency ?? 'WEEKLY');
  const [weekday, setWeekday] = useState(r.schedule?.weekday ?? 1);
  const [time, setTime] = useState(r.schedule?.time ?? '07:00');
  const [roleIds, setRoleIds] = useState<string[]>(r.schedule?.roleIds ?? []);
  const save = (off?: boolean) => {
    const { id: _i, orgId: _o, createdAt: _c, updatedAt: _u, createdBy: _b, libraryKey: _l, ...rest } = r;
    saveReport(orgId, userId ?? 'system', { ...rest, schedule: off ? undefined : { frequency, weekday: frequency === 'WEEKLY' ? weekday : undefined, time, roleIds, lastSentAt: r.schedule?.lastSentAt } }, r.id);
    toast.success(off ? t('rpt.unscheduled') : t('rpt.scheduled'));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('rpt.scheduleTitle')}</DialogTitle><DialogDescription>{t('rpt.scheduleHint', { tz: org.timezone })}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label={t('rpt.frequency')} value={frequency} onChange={(e) => setFrequency(e.target.value as 'DAILY' | 'WEEKLY')} options={[{ value: 'DAILY', label: t('rpt.daily') }, { value: 'WEEKLY', label: t('rpt.weekly') }]} />
          {frequency === 'WEEKLY' && <SelectField label={t('rpt.weekday')} value={String(weekday)} onChange={(e) => setWeekday(Number(e.target.value))} options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: t(`common.weekday.${d}`) }))} />}
          <TextField label={t('rpt.time')} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Field label={t('rpt.emailRoles')}>
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-ctl border border-line p-2 sm:grid-cols-2">
            {roles.map((x) => <Checkbox key={x.id} label={x.name} checked={roleIds.includes(x.id)} onChange={(e) => setRoleIds(e.target.checked ? [...roleIds, x.id] : roleIds.filter((y) => y !== x.id))} />)}
          </div>
        </Field>
        <DialogFooter>
          {r.schedule && <Button variant="ghost" className="mr-auto" onClick={() => save(true)}>{t('rpt.stopSchedule')}</Button>}
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!roleIds.length || !time} onClick={() => save()}>{t('rpt.saveSchedule')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ r, onClose }: { r: SavedReport; onClose: () => void }) {
  const { t } = useT();
  const { userId, orgId } = useActor();
  const roles = useRoleOptions();
  const [roleIds, setRoleIds] = useState<string[]>(r.sharedWithRoleIds);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('rpt.shareTitle')}</DialogTitle><DialogDescription>{t('rpt.shareHint')}</DialogDescription></DialogHeader>
        <div className="grid max-h-60 gap-1 overflow-y-auto rounded-ctl border border-line p-2 sm:grid-cols-2">
          {roles.map((x) => <Checkbox key={x.id} label={x.name} checked={roleIds.includes(x.id)} onChange={(e) => setRoleIds(e.target.checked ? [...roleIds, x.id] : roleIds.filter((y) => y !== x.id))} />)}
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => { const { id: _i, orgId: _o, createdAt: _c, updatedAt: _u, createdBy: _b, libraryKey: _l, ...rest } = r; saveReport(orgId, userId ?? 'system', { ...rest, sharedWithRoleIds: roleIds }, r.id); toast.success(t('rpt.sharedToast', { count: roleIds.length })); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Print-ready page; the browser's "Save as PDF" makes the file. */
function PdfView({ r, res, measureCol, masked, onClose }: { r: SavedReport; res: ReturnType<typeof runReport>; measureCol?: ReportColumn; masked: boolean; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const rt = useReportText();
  const org = useCurrentOrg();
  const { userId } = useActor();
  const userName = useUserName();
  const rows = res.rows.slice(0, 200);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader className="no-print"><DialogTitle>{t('rpt.pdfTitle')}</DialogTitle><DialogDescription>{t('rpt.pdfHint')}</DialogDescription></DialogHeader>
        <article className="print-area rounded-ctl border border-line bg-white p-8 text-[#1d2b24]">
          <header className="mb-5 flex items-start justify-between border-b border-[#d9e1dc] pb-4">
            <div><div className="text-[12px] uppercase tracking-wide text-[#5d6b64]">{org.name}</div><h2 className="text-[22px] font-semibold">{rt.reportName(r)}</h2><p className="text-[13px] text-[#5d6b64]">{rt.reportDesc(r)}</p></div>
            <div className="text-right text-[12px] text-[#5d6b64]"><div>{t('rpt.generated', { when: f.dateTime(new Date().toISOString()) })}</div><div>{userName(userId ?? undefined)}</div><div>{t('rpt.rowsCount', { count: res.total, n: f.number(res.total) })}</div></div>
          </header>
          {r.filters.length > 0 && <p className="mb-4 text-[12px] text-[#5d6b64]">{`${t('rpt.filters')}: ${r.filters.map((x) => filterText(x, rt, t)).join(' · ')}`}</p>}
          {res.groups && (
            <table className="mb-5 w-full max-w-md text-[12px]">
              <thead><tr className="border-b border-[#d9e1dc]"><th className="py-1 text-left">{rt.heading({ key: r.groupBy! })}</th><th className="py-1 text-right">{measureCol ? rt.heading(measureCol) : t('rpt.count')}</th></tr></thead>
              <tbody>{res.groups.slice(0, 15).map((g) => <tr key={g.key} className="border-b border-[#eef2ef]"><td className="py-1">{/^[A-Z_]+$/.test(g.key) ? rt.value(g.key) : g.key}</td><td className="py-1 text-right tabular-nums">{measureCol?.kind === 'money' ? f.money(g.value) : f.number(g.value)}</td></tr>)}</tbody>
            </table>
          )}
          <table className="w-full text-[11px]">
            <thead><tr className="border-b-2 border-[#1d2b24]">{res.columns.map((c) => <th key={c.key} className="px-1 py-1 text-left font-semibold">{rt.heading(c)}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i} className="border-b border-[#eef2ef]">{res.columns.map((c) => <td key={c.key} className="px-1 py-1">{c.sensitive && masked ? '•••' : rt.cell(c, row[c.key])}</td>)}</tr>)}</tbody>
          </table>
          {res.rows.length > rows.length && <p className="mt-3 text-[12px] text-[#5d6b64]">{t('rpt.pdfTruncated', { shown: rows.length, total: res.rows.length })}</p>}
        </article>
        <DialogFooter className="no-print"><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button><Button onClick={() => window.print()}><Printer /> {t('rpt.print')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Builder

const OPS: ReportFilter['op'][] = ['equals', 'contains', 'gt', 'lt', 'between'];

function ReportBuilder({ id, onDone }: { id?: string; onDone: (id?: string) => void }) {
  const { t } = useT();
  const lang = useLang();
  const rt = useReportText();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const existing = useSystemStore((s) => (id ? s.reports.find((x) => x.id === id) : undefined));
  const entities = REPORT_ENTITIES.filter((e) => entityAvailable(orgId, e));
  const [entity, setEntity] = useState(existing?.entity ?? entities[0] ?? 'farmers');
  const all = useMemo(() => columnsOf(orgId, entity, lang), [orgId, entity, lang]);
  const [columns, setColumns] = useState<string[]>(existing?.columns ?? all.slice(0, 5).map((c) => c.key));
  const [filters, setFilters] = useState<ReportFilter[]>(existing?.filters ?? []);
  const [groupBy, setGroupBy] = useState(existing?.groupBy ?? '');
  const [measure, setMeasure] = useState(existing?.measure ?? '');
  const [chart, setChart] = useState<ReportChart>(existing?.chart ?? 'TABLE');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const masked = useMasked();
  const changeEntity = (e: string) => {
    setEntity(e);
    setColumns(columnsOf(orgId, e, lang).slice(0, 5).map((c) => c.key));
    setFilters([]); setGroupBy(''); setMeasure(''); setChart('TABLE');
  };
  const preview = useMemo(() => runReport({ orgId, entity, columns, filters: filters.filter((x) => x.value), groupBy: groupBy || undefined, measure: measure || undefined }, lang), [orgId, entity, columns, filters, groupBy, measure, lang]);
  const core = all.filter((c) => !c.key.startsWith('form.'));
  const form = all.filter((c) => c.key.startsWith('form.'));
  const toggle = (k: string) => setColumns((cs) => (cs.includes(k) ? cs.filter((x) => x !== k) : [...cs, k]));
  const move = (i: number, d: -1 | 1) => setColumns((cs) => { const n = [...cs]; const j = i + d; if (j < 0 || j >= n.length) return cs; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const numeric = all.filter((c) => c.kind === 'number' || c.kind === 'money');
  const measureCol = all.find((c) => c.key === measure);
  const save = () => {
    const rep = saveReport(orgId, userId ?? 'system', { name: name.trim(), description: description.trim() || undefined, entity, columns, filters: filters.filter((x) => x.value), groupBy: groupBy || undefined, measure: measure || undefined, chart: groupBy ? chart : 'TABLE', sharedWithRoleIds: existing?.sharedWithRoleIds ?? [], schedule: existing?.schedule }, existing?.id);
    toast.success(t('rpt.saved'));
    onDone(rep.id);
  };
  const colLabel = (k: string) => { const c = all.find((x) => x.key === k); return c ? rt.heading(c) : k; };
  return (
    <>
      <button type="button" onClick={() => onDone(existing?.id)} className="mb-3 inline-flex items-center gap-1 text-[14px] font-medium text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> {existing ? t('rpt.backToReport') : t('rpt.allReports')}</button>
      <PageHeader eyebrow={t('nav.reports')} title={existing ? t('rpt.editTitle') : t('rpt.newTitle')} description={t('rpt.builderHint')}
        primary={<Button disabled={!name.trim() || !columns.length} onClick={save}>{t('rpt.saveReport')}</Button>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Step n={1} title={t('rpt.step.entity')}>
            <SelectField label={t('rpt.subject')} value={entity} onChange={(e) => changeEntity(e.target.value)} options={entities.map((e) => ({ value: e, label: rt.entityName(e) }))} />
          </Step>
          <Step n={2} title={t('rpt.step.columns')} hint={t('rpt.columnsHint', { count: columns.length })}>
            {columns.length > 0 && (
              <ol className="mb-3 space-y-1" aria-label={t('rpt.columnOrder')}>
                {columns.map((k, i) => (
                  <li key={k} className="flex items-center gap-2 rounded-ctl bg-canvas px-2 py-1 text-[13px]">
                    <span className="w-5 text-right text-muted tnum">{i + 1}</span>
                    <span className="flex-1 text-ink">{colLabel(k)}</span>
                    <button type="button" className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('rpt.moveUp', { col: colLabel(k) })}><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" disabled={i === columns.length - 1} onClick={() => move(i, 1)} aria-label={t('rpt.moveDown', { col: colLabel(k) })}><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" className="rounded p-1 text-muted hover:text-danger" onClick={() => toggle(k)} aria-label={t('rpt.removeCol', { col: colLabel(k) })}><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ol>
            )}
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-ctl border border-line p-2 sm:grid-cols-2">
              {core.map((c) => <Checkbox key={c.key} label={rt.heading(c)} checked={columns.includes(c.key)} onChange={() => toggle(c.key)} />)}
            </div>
            {form.length > 0 && (
              <>
                <h4 className="mb-1 mt-3 text-[12px] font-medium text-muted">{t('rpt.formFields')}</h4>
                <div className="grid max-h-48 gap-1 overflow-y-auto rounded-ctl border border-line p-2 sm:grid-cols-2">
                  {form.map((c) => <Checkbox key={c.key} label={rt.heading(c)} checked={columns.includes(c.key)} onChange={() => toggle(c.key)} />)}
                </div>
              </>
            )}
          </Step>
          <Step n={3} title={t('rpt.step.filters')}>
            <div className="space-y-2">
              {filters.map((x, i) => {
                const col = all.find((c) => c.key === x.column);
                const type = col?.kind === 'date' ? 'date' : col?.kind === 'number' || col?.kind === 'money' ? 'number' : 'text';
                const set = (patch: Partial<ReportFilter>) => setFilters((fs) => fs.map((y, j) => (j === i ? { ...y, ...patch } : y)));
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-ctl border border-line p-2">
                    <label className="min-w-[120px] flex-1 text-[12px] text-muted">{t('rpt.column')}<select className="mt-1 h-10 w-full rounded-ctl border border-line bg-surface px-2 text-[14px] text-ink" value={x.column} onChange={(e) => set({ column: e.target.value })}>{all.map((c) => <option key={c.key} value={c.key}>{rt.heading(c)}</option>)}</select></label>
                    <label className="w-[120px] text-[12px] text-muted">{t('rpt.operator')}<select className="mt-1 h-10 w-full rounded-ctl border border-line bg-surface px-2 text-[14px] text-ink" value={x.op} onChange={(e) => set({ op: e.target.value as ReportFilter['op'] })}>{OPS.map((o) => <option key={o} value={o}>{t(`rpt.opName.${o}`)}</option>)}</select></label>
                    <label className="w-[130px] text-[12px] text-muted">{t('rpt.value')}<Input className="mt-1 h-10" type={type} value={x.value} onChange={(e) => set({ value: e.target.value })} /></label>
                    {x.op === 'between' && <label className="w-[130px] text-[12px] text-muted">{t('rpt.and')}<Input className="mt-1 h-10" type={type} value={x.value2 ?? ''} onChange={(e) => set({ value2: e.target.value })} /></label>}
                    <Button size="sm" variant="ghost" onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))} aria-label={t('rpt.removeFilter')}><X /></Button>
                  </div>
                );
              })}
              <Button size="sm" variant="secondary" onClick={() => setFilters((fs) => [...fs, { column: all[0]?.key ?? '', op: 'equals', value: '' }])}><Plus /> {t('rpt.addFilter')}</Button>
            </div>
          </Step>
          <Step n={4} title={t('rpt.step.group')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label={t('rpt.groupBy')} value={groupBy} onChange={(e) => { setGroupBy(e.target.value); if (e.target.value && chart === 'TABLE') setChart('BAR'); }} options={[{ value: '', label: t('rpt.noGrouping') }, ...all.filter((c) => c.kind !== 'money' && c.kind !== 'number').map((c) => ({ value: c.key, label: c.kind === 'date' ? t('rpt.byMonth', { col: rt.heading(c) }) : rt.heading(c) }))]} />
              <SelectField label={t('rpt.measure')} value={measure} disabled={!groupBy} onChange={(e) => setMeasure(e.target.value)} options={[{ value: '', label: t('rpt.count') }, ...numeric.map((c) => ({ value: c.key, label: t('rpt.sumOf', { col: rt.heading(c) }) }))]} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('rpt.chart')}>
              {(['TABLE', 'BAR', 'LINE', 'DONUT'] as ReportChart[]).map((c) => {
                const Icon = CHART_ICON[c];
                const off = c !== 'TABLE' && !groupBy;
                return <button key={c} type="button" role="radio" aria-checked={chart === c} disabled={off} onClick={() => setChart(c)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${chart === c ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body hover:border-brand/50'} disabled:opacity-40`}><Icon className="h-4 w-4" /> {t(`rpt.chartType.${c}`)}</button>;
              })}
            </div>
          </Step>
          <Step n={5} title={t('rpt.step.save')}>
            <TextField label={t('rpt.name')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('rpt.namePlaceholder')} />
            <TextAreaField label={t('rpt.description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Step>
        </div>
        <section className="min-w-0 space-y-4" aria-label={t('rpt.preview')}>
          <div className="flex items-center justify-between"><h2 className="text-[16px] font-semibold text-ink">{t('rpt.preview')}</h2><span className="text-[13px] text-muted">{t('rpt.rowsCount', { count: preview.total, n: f.number(preview.total) })}</span></div>
          {preview.groups && groupBy && chart !== 'TABLE' && <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><ReportChartView r={{ chart, groupBy }} groups={preview.groups} measureCol={measureCol} /></div>}
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead className="bg-canvas"><tr>{preview.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left text-[12px] font-semibold text-label">{rt.heading(c)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {preview.rows.slice(0, 10).map((row, i) => <tr key={i}>{preview.columns.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2 text-body">{c.sensitive && masked ? '•••' : rt.cell(c, row[c.key])}</td>)}</tr>)}
                {!preview.rows.length && <tr><td className="px-3 py-6 text-center text-muted" colSpan={Math.max(1, preview.columns.length)}>{t('rpt.noRows')}</td></tr>}
              </tbody>
            </table>
          </div>
          {preview.total > 10 && <p className="text-[12px] text-muted">{t('rpt.previewFirst', { count: 10 })}</p>}
        </section>
      </div>
    </>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ink"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[12px] text-brand">{n}</span>{title}{hint && <span className="ml-auto text-[12px] font-normal text-muted">{hint}</span>}</h3>
      {children}
    </section>
  );
}
