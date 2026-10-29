import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Award, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Pencil, Plus, Star, Trash2, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Workshop, WorkshopStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Field, TextAreaField } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { HBars, Lines } from '@/components/charts/charts';
import { allQuestions } from '@/engines/forms';
import { cn } from '@/lib/utils';
import { archiveWorkshop, canDelete, canEdit, cancelWorkshop, deleteWorkshop, planWorkshops, topicName, trainingDashboard, updateWorkshop, workshopStats } from '@/services/trainingService';
import { latestVersion } from '@/services/formService';
import { useFormStore } from '@/stores/formStore';
import { useGroupStore } from '@/stores/groupStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { QuestionSummary, schemaFor } from '@/web/features/forms/ResponsesPage';
import { mono } from '@/web/features/buying/common';
import { useLandLookups, usePageTab } from '@/web/features/land/shared';

const STATUSES: WorkshopStatus[] = ['PLANNED', 'HELD', 'CANCELLED', 'ARCHIVED'];
const TONE: Record<WorkshopStatus, 'info' | 'success' | 'danger' | 'neutral'> = { PLANNED: 'info', HELD: 'success', CANCELLED: 'danger', ARCHIVED: 'neutral' };
const today = () => new Date().toISOString().slice(0, 10);
const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';

/** Names for training screens: topics and groups. */
export function useTrainingLookups() {
  const lang = useLang();
  const topics = useOrgRows(useTrainingStore((s) => s.topics));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  return useMemo(() => {
    const tm = new Map(topics.map((x) => [x.id, x]));
    const gm = new Map(groups.map((g) => [g.id, g]));
    return {
      topics, groups,
      topic: (id: string) => tm.get(id),
      topicName: (id: string) => topicName(tm.get(id), lang),
      group: (id?: string) => (id ? gm.get(id)?.name ?? '—' : '—'),
    };
  }, [topics, groups, lang]);
}

export function StatusBadge({ status }: { status: WorkshopStatus }) {
  const { t } = useT();
  return <Badge tone={TONE[status]}>{t(`ws.status.${status}`)}</Badge>;
}

export function Stars({ value }: { value: number | null | undefined }) {
  const f = useFormat();
  if (value == null) return <span className="text-muted">{'—'}</span>;
  return <span className="inline-flex items-center gap-1 tnum"><Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />{f.number(value, { maximumFractionDigits: 1 })}</span>;
}

/** Workshops (PRD G3): list, calendar and dashboard; bulk planning; detail with attendance, photos and feedback. */
export function WorkshopsPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const tl = useTrainingLookups();
  const settings = useOrgSettings();
  const rows = useOrgRows(useTrainingStore((s) => s.workshops));
  const [openId, open, close] = useDrawerParam();
  const [tab, setTab] = usePageTab(['list', 'calendar', 'dashboard'] as const, 'list');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | WorkshopStatus>('');
  const [agent, setAgent] = useState('');
  const [community, setCommunity] = useState('');
  const [planning, setPlanning] = useState(false);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((w) => (!status || w.status === status) && (!agent || w.agentId === agent) && (!community || w.communityId === community)
    && (!query || [w.title, w.number, w.location, lk.community(w.communityId)].some((x) => x.toLowerCase().includes(query))))
    .sort((a, b) => b.date.localeCompare(a.date));
  const dash = useMemo(() => trainingDashboard(rows), [rows]);
  const columns = useMemo<ColumnDef<Workshop, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'title', header: t('ws.title'), accessorFn: (w) => tl.topicName(w.topicId) || w.title, cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'date', header: t('col.date'), accessorKey: 'date', cell: (c) => <span className="whitespace-nowrap">{f.date(c.getValue() as string)}</span> },
    { id: 'location', header: t('ws.location'), accessorKey: 'location' },
    { id: 'community', header: t('col.community'), accessorFn: (w) => lk.community(w.communityId) },
    { id: 'group', header: t('ws.group'), accessorFn: (w) => tl.group(w.groupId) },
    { id: 'agent', header: t('ws.facilitator'), accessorFn: (w) => lk.agent(w.agentId) },
    { id: 'attendees', header: t('ws.expectedActual'), accessorFn: (w) => w.attendance.length, cell: (c) => { const w = c.row.original; return <span className="tnum whitespace-nowrap">{w.status === 'PLANNED' || w.status === 'CANCELLED' ? `${f.number(w.expected)} / —` : `${f.number(w.expected)} / ${f.number(w.attendance.length)}`}</span>; } },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as WorkshopStatus} /> },
    { id: 'images', header: t('ws.images'), accessorFn: (w) => w.images.length },
    { id: 'rating', header: t('ws.rating'), accessorFn: (w) => workshopStats(w, settings).avgRating ?? -1, cell: (c) => <Stars value={workshopStats(c.row.original, settings).avgRating} /> },
  ], [t, f, lk, tl, settings]);
  const current = rows.find((w) => w.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.forms')} title={t('nav.workshops')} description={t('pages.workshops')}
        actions={<Button variant="secondary" asChild><Link to="/app/workshops/catalogue"><Award /> {t('nav.trainingCatalogue')}</Link></Button>}
        primary={<PermissionGate permission="workshops.create"><Button onClick={() => setPlanning(true)}><Plus /> {t('ws.plan')}</Button></PermissionGate>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('ws.held')} value={f.number(dash.held)} hint={t('ws.ofCreated', { n: f.number(dash.created) })} icon={GraduationCap} />
        <StatCard label={t('ws.upcoming')} value={f.number(dash.upcoming)} hint={dash.overdue ? t('ws.overdueN', { count: dash.overdue }) : t('ws.noneOverdue')} icon={CalendarDays} />
        <StatCard label={t('ws.farmersTrained')} value={f.number(dash.farmersTrained)} hint={t('ws.attendanceN', { n: f.number(dash.attendance) })} icon={Users} />
        <StatCard label={t('ws.avgRating')} value={dash.avgRating == null ? '—' : `${f.number(dash.avgRating, { maximumFractionDigits: 1 })} / 5`} icon={Star} />
      </div>
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist" aria-label={t('nav.workshops')}>
        {(['list', 'calendar', 'dashboard'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium', tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>{t(`ws.tab.${k}`)}</button>)}
      </div>
      {tab !== 'dashboard' && (
        <FilterBar search={q} onSearch={setQ} placeholder={t('ws.search')}
          views={[{ key: 'all', label: t('ws.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...STATUSES.map((s) => ({ key: s, label: t(`ws.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((w) => w.status === s).length }))]}
          filters={[
            { key: 'agent', label: t('ws.facilitator'), value: agent, onChange: setAgent, options: [...new Set(rows.map((w) => w.agentId))].map((a) => ({ value: a, label: lk.agent(a) })) },
            { key: 'community', label: t('col.community'), value: community, onChange: setCommunity, options: [...new Set(rows.map((w) => w.communityId))].map((c) => ({ value: c, label: lk.community(c) })) },
          ]}
          onClear={() => { setQ(''); setStatus(''); setAgent(''); setCommunity(''); }} />
      )}
      {tab === 'list' && (
        <DataTable columns={columns} data={shown} onRowClick={(w) => open(w.id)} activeId={openId} getRowId={(w) => w.id} empty={t('ws.none')}
          exportCsv={{ fileName: 'workshops.csv', columns: [
            { header: t('col.number'), value: (w) => w.number }, { header: t('ws.title'), value: (w) => tl.topicName(w.topicId) || w.title }, { header: t('col.date'), value: (w) => w.date },
            { header: t('ws.location'), value: (w) => w.location }, { header: t('col.community'), value: (w) => lk.community(w.communityId) }, { header: t('ws.group'), value: (w) => tl.group(w.groupId) },
            { header: t('ws.facilitator'), value: (w) => lk.agent(w.agentId) }, { header: t('ws.expected'), value: (w) => w.expected }, { header: t('ws.actual'), value: (w) => w.attendance.length },
            { header: t('col.status'), value: (w) => t(`ws.status.${w.status}`) }, { header: t('ws.images'), value: (w) => w.images.length }, { header: t('ws.rating'), value: (w) => workshopStats(w, settings).avgRating ?? '' },
          ] }} />
      )}
      {tab === 'calendar' && <Calendar rows={shown} onOpen={open} />}
      {tab === 'dashboard' && <Dashboard rows={rows} />}
      {current && <WorkshopDrawer key={current.id} w={current} onClose={close} />}
      {planning && <PlanSheet onClose={(id) => { setPlanning(false); if (id) open(id); }} />}
    </>
  );
}

function Calendar({ rows, onOpen }: { rows: Workshop[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const tl = useTrainingLookups();
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1);
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const byDay = new Map<string, Workshop[]>();
  for (const w of rows) if (w.date.startsWith(month)) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w]);
  const weekdays = Array.from({ length: 7 }, (_, i) => f.date(new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), 'EEE'));
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-soft" aria-label={t('ws.tab.calendar')}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink">{f.date(`${month}-15`, 'MMMM yyyy')}</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label={t('ws.prevMonth')}><ChevronLeft /></Button>
          <Button size="sm" variant="secondary" onClick={() => setMonth(today().slice(0, 7))}>{t('ws.thisMonth')}</Button>
          <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label={t('ws.nextMonth')}><ChevronRight /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-ctl border border-line bg-line text-[12px]">
        {weekdays.map((d) => <div key={d} className="bg-canvas px-2 py-1.5 font-semibold text-label">{d}</div>)}
        {cells.map((d, i) => {
          const iso = d >= 1 && d <= days ? `${month}-${String(d).padStart(2, '0')}` : '';
          const list = iso ? byDay.get(iso) ?? [] : [];
          return (
            <div key={i} className={cn('min-h-[92px] bg-surface p-1.5', !iso && 'bg-canvas/60', iso === today() && 'ring-2 ring-inset ring-brand')}>
              {iso && <div className="mb-1 text-[11px] font-medium text-muted">{d}</div>}
              <ul className="space-y-1">
                {list.slice(0, 3).map((w) => (
                  <li key={w.id}><button type="button" onClick={() => onOpen(w.id)} className={cn('w-full truncate rounded-[6px] px-1.5 py-1 text-left text-[11px] font-medium', w.status === 'HELD' || w.status === 'ARCHIVED' ? 'bg-success/10 text-success' : w.status === 'CANCELLED' ? 'bg-danger/10 text-danger line-through' : 'bg-info/10 text-info')} title={tl.topicName(w.topicId)}>{tl.topicName(w.topicId) || w.title}</button></li>
                ))}
                {list.length > 3 && <li className="px-1.5 text-[11px] text-muted">{t('ws.more', { count: list.length - 3 })}</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Dashboard({ rows }: { rows: Workshop[] }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const tl = useTrainingLookups();
  const d = useMemo(() => trainingDashboard(rows), [rows]);
  const ratings = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const w of rows) for (const a of w.attendance) if (a.rating != null) m.set(w.agentId, [...(m.get(w.agentId) ?? []), a.rating]);
    return [...m.entries()].map(([id, xs]) => ({ label: lk.agent(id), value: Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 })).sort((a, b) => b.value - a.value);
  }, [rows, lk]);
  const card = 'rounded-card border border-line bg-surface p-5 shadow-soft';
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {([[t('ws.created'), d.created], [t('ws.held'), d.held], [t('ws.upcoming'), d.upcoming], [t('ws.cancelled'), d.cancelled], [t('ws.farmersTrained'), d.farmersTrained], [t('ws.attendance'), d.attendance]] as [string, number][]).map(([k, v]) => <StatCard key={k} label={k} value={f.number(v)} />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('ws.byTopic')}</h3>{d.byTopic.length ? <HBars data={d.byTopic.map(([id, v]) => ({ label: tl.topicName(id), value: v }))} format={(v) => f.number(v)} /> : <TabEmpty>{t('ws.noneHeld')}</TabEmpty>}</section>
        <section className={card}><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('ws.byAgent')}</h3>{d.byAgent.length ? <HBars data={d.byAgent.map(([id, v]) => ({ label: lk.agent(id), value: v }))} format={(v) => f.number(v)} /> : <TabEmpty>{t('ws.noneHeld')}</TabEmpty>}</section>
        <section className={card}><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('ws.heldByMonth')}</h3>{d.byMonth.length ? <Lines data={d.byMonth.map(([k, v]) => ({ label: f.date(`${k}-15`, 'MMM yy'), held: v }))} series={[{ key: 'held', label: t('ws.held'), index: 0 }]} format={(v) => f.number(v)} /> : <TabEmpty>{t('ws.noneHeld')}</TabEmpty>}</section>
        <section className={card}><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('ws.ratingByAgent')}</h3>{ratings.length ? <HBars data={ratings} format={(v) => `${f.number(v, { maximumFractionDigits: 1 })} / 5`} /> : <TabEmpty>{t('ws.noneHeld')}</TabEmpty>}</section>
      </div>
    </div>
  );
}

function WorkshopDrawer({ w, onClose }: { w: Workshop; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const tl = useTrainingLookups();
  const settings = useOrgSettings();
  const { userId } = useActor();
  const forms = useFormStore((s) => s.forms);
  const lists = useFormStore((s) => s.optionLists);
  const responses = useFormStore((s) => s.responses);
  const [dialog, setDialog] = useState<null | 'edit' | 'cancel' | 'archive' | 'delete'>(null);
  const st = workshopStats(w, settings);
  const fb = responses.filter((r) => w.feedbackResponseIds.includes(r.id));
  const fbForm = fb[0] ? forms.find((x) => x.id === fb[0]!.formId) : undefined;
  const schema = useMemo(() => (fbForm ? schemaFor(fbForm, latestVersion(fbForm)?.version ?? 0, lists) : undefined), [fbForm, lists]);
  const editable = canEdit(w, settings);
  const topic = tl.topic(w.topicId);
  const done = w.status === 'HELD' || w.status === 'ARCHIVED';
  const actor = userId ?? 'system';
  return (
    <>
      <DetailDrawer open onClose={onClose} title={tl.topicName(w.topicId) || w.title} subtitle={`${w.number} · ${f.date(w.date)} · ${lk.community(w.communityId)}`}
        badges={<>
          <StatusBadge status={w.status} />
          {done && (st.commissionEligible ? <Badge tone="success">{t('ws.countsForCommission')}</Badge> : <Badge tone="warning">{t(`ws.excluded.${st.commissionNote}`, { n: st.farmers, min: st.min, max: st.max })}</Badge>)}
          {w.status === 'PLANNED' && w.date < today() && <Badge tone="danger">{t('ws.overdue')}</Badge>}
        </>}
        actions={<>
          {editable && <PermissionGate permission="workshops.edit"><Button size="sm" variant="secondary" onClick={() => setDialog('edit')}><Pencil /> {t('common.edit')}</Button></PermissionGate>}
          {w.status === 'PLANNED' && <PermissionGate permission="workshops.edit"><Button size="sm" variant="secondary" onClick={() => setDialog('cancel')}><XCircle /> {t('ws.cancel')}</Button></PermissionGate>}
          {w.status === 'HELD' && <PermissionGate permission="workshops.edit"><Button size="sm" variant="secondary" onClick={() => setDialog('archive')}><Archive /> {t('ws.archive')}</Button></PermissionGate>}
          {canDelete(w, settings) && <PermissionGate permission="workshops.delete"><Button size="sm" variant="ghost" onClick={() => setDialog('delete')}><Trash2 /> {t('common.delete')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'details', label: t('ws.tab.details'), content: (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([[t('ws.expected'), f.number(w.expected)], [t('ws.actual'), done ? f.number(st.attendees) : '—'], [t('ws.guests'), done ? f.number(st.guests) : '—'], [t('ws.avgRating'), st.avgRating == null ? '—' : `${f.number(st.avgRating, { maximumFractionDigits: 1 })} / 5`]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[16px] font-semibold text-ink">{v}</div></div>)}
                </div>
                <Facts items={[
                  [t('ws.topic'), tl.topicName(w.topicId)], [t('ws.category'), topic ? t(`ws.cat.${topic.category}`) : '—'],
                  [t('col.date'), f.date(w.date)], [t('ws.location'), w.location],
                  [t('col.community'), lk.community(w.communityId)], [t('ws.group'), tl.group(w.groupId)],
                  [t('ws.facilitator'), lk.agent(w.agentId)], [t('ws.duration'), topic ? t('ws.minutes', { n: topic.durationMin }) : '—'],
                  ...(w.startedAt ? [[t('ws.started'), f.dateTime(w.startedAt)] as [string, string]] : []),
                  ...(w.heldAt ? [[t('ws.finished'), `${f.dateTime(w.heldAt)}${w.device === 'mobile' ? ` · ${t('ws.onPhone')}` : ''}`] as [string, string]] : []),
                  ...(w.gps ? [[t('land.gps'), `${w.gps.lat.toFixed(5)}, ${w.gps.lng.toFixed(5)}`] as [string, string]] : []),
                  ...(topic?.materials.length ? [[t('ws.materials'), topic.materials.join(', ')] as [string, string]] : []),
                  ...(w.cancelled ? [[t('ws.cancelReason'), `${w.cancelled.reason} · ${lk.user(w.cancelled.by)}`] as [string, string]] : []),
                  ...(w.archived ? [[t('ws.remarks'), `${w.archived.remarks} · ${lk.user(w.archived.by)} · ${f.date(w.archived.at)}`] as [string, string]] : []),
                ]} />
                <p className="text-[13px] text-muted">{editable ? (w.status === 'PLANNED' ? t('ws.editPlanned') : t('ws.editHeld', { count: settings.training.editHeldDays })) : t('ws.locked')}</p>
              </div>
            ),
          },
          {
            key: 'attendance', label: t('ws.tab.attendance'), count: w.attendance.length, content: w.attendance.length ? (
              <div className="overflow-x-auto rounded-ctl border border-line">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label">{[t('ws.attendee'), t('ws.method'), t('ws.rating'), t('ws.comment'), t('ws.time')].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{w.attendance.map((a) => (
                    <tr key={a.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">{a.farmerId ? <span><span className="block text-ink">{ll.farmerName(a.farmerId)}</span><span className="block font-mono text-[11px] text-muted">{ll.farmer(a.farmerId)?.farmerCode}</span></span> : <span>{a.guestName} <Badge tone="neutral">{t('ws.guest')}</Badge></span>}</td>
                      <td className="px-3 py-2">{t(`ws.methodName.${a.method}`)}</td>
                      <td className="px-3 py-2"><Stars value={a.rating} /></td>
                      <td className="px-3 py-2 text-body">{a.comment ?? <span className="text-muted">{'—'}</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">{f.dateTime(a.at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <TabEmpty>{w.status === 'PLANNED' ? t('ws.attendanceOnPhone') : t('ws.noAttendance')}</TabEmpty>,
          },
          {
            key: 'photos', label: t('ws.tab.photos'), count: w.images.length, content: w.images.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{w.images.map((img) => <li key={img.id} className="rounded-ctl border border-line p-2"><div className="flex h-24 items-center justify-center rounded-[6px] bg-canvas text-[12px] text-muted">{img.name}</div><div className="mt-1.5 text-[12px] text-body">{lk.user(img.by)}</div><div className="text-[11px] text-muted">{f.dateTime(img.at)}</div></li>)}</ul>
            ) : <TabEmpty>{t('ws.noPhotos')}</TabEmpty>,
          },
          {
            key: 'feedback', label: t('ws.tab.feedback'), count: fb.length, content: fb.length && schema ? (
              <div className="space-y-3">
                <p className="text-[13px] text-muted">{t('ws.feedbackHint', { count: fb.length, form: fbForm!.name })}</p>
                {allQuestions(schema).filter((qq) => !['note', 'calculated', 'autoId'].includes(qq.type)).map((qq) => <QuestionSummary key={qq.id} q={qq} values={fb.map((r) => r.answers[qq.id])} total={fb.length} />)}
              </div>
            ) : <TabEmpty>{t('ws.noFeedback')}</TabEmpty>,
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="workshop" entityId={w.id} /> },
        ]} />
      {dialog === 'edit' && <EditDialog w={w} onClose={() => setDialog(null)} />}
      {(dialog === 'cancel' || dialog === 'archive') && (
        <ReasonDialog title={t(dialog === 'cancel' ? 'ws.cancelTitle' : 'ws.archiveTitle')} body={t(dialog === 'cancel' ? 'ws.cancelBody' : 'ws.archiveBody')} label={t(dialog === 'cancel' ? 'ws.cancelReason' : 'ws.remarks')}
          confirm={t(dialog === 'cancel' ? 'ws.cancel' : 'ws.archive')} onClose={() => setDialog(null)}
          onConfirm={(text) => { if (dialog === 'cancel') { cancelWorkshop(w.id, text, actor); toast.success(t('ws.toast.cancelled')); } else { archiveWorkshop(w.id, text, actor); toast.success(t('ws.toast.archived')); } setDialog(null); }} />
      )}
      {dialog === 'delete' && (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('ws.deleteTitle')}</DialogTitle><DialogDescription>{t('ws.deleteBody', { number: w.number })}</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => { deleteWorkshop(w.id, actor); toast.success(t('ws.toast.deleted', { number: w.number })); onClose(); }}>{t('common.delete')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function ReasonDialog({ title, body, label, confirm, onClose, onConfirm }: { title: string; body: string; label: string; confirm: string; onClose: () => void; onConfirm: (text: string) => void }) {
  const { t } = useT();
  const [text, setText] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{body}</DialogDescription></DialogHeader>
        <TextAreaField label={label} value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.back')}</Button><Button disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>{confirm}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ w, onClose }: { w: Workshop; onClose: () => void }) {
  const { t } = useT();
  const lk = useLookups();
  const tl = useTrainingLookups();
  const { userId } = useActor();
  const [v, setV] = useState({ topicId: w.topicId, date: w.date, location: w.location, agentId: w.agentId, expected: String(w.expected), groupId: w.groupId ?? '' });
  const held = w.status !== 'PLANNED';
  const save = () => {
    try {
      updateWorkshop(w.id, held ? { location: v.location } : { topicId: v.topicId, date: v.date, location: v.location, agentId: v.agentId, expected: Number(v.expected), groupId: v.groupId || undefined }, userId ?? 'system');
      toast.success(t('ws.toast.saved'));
      onClose();
    } catch (e) { toast.error(t(`ws.err.${(e as Error).message}`)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('ws.editTitle', { number: w.number })}</DialogTitle><DialogDescription>{held ? t('ws.editHeldHint') : t('ws.editPlanned')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('ws.topic')}><select disabled={held} value={v.topicId} onChange={(e) => setV({ ...v, topicId: e.target.value })} aria-label={t('ws.topic')} className={select}>{tl.topics.filter((x) => x.active || x.id === w.topicId).map((x) => <option key={x.id} value={x.id}>{tl.topicName(x.id)}</option>)}</select></Field>
          <Field label={t('col.date')}><Input disabled={held} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} aria-label={t('col.date')} /></Field>
          <Field label={t('ws.location')}><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} aria-label={t('ws.location')} /></Field>
          <Field label={t('ws.facilitator')}><select disabled={held} value={v.agentId} onChange={(e) => setV({ ...v, agentId: e.target.value })} aria-label={t('ws.facilitator')} className={select}>{lk.agents.map((a) => <option key={a.id} value={a.id}>{lk.agent(a.id)}</option>)}</select></Field>
          <Field label={t('ws.expected')}><Input disabled={held} type="number" min={1} value={v.expected} onChange={(e) => setV({ ...v, expected: e.target.value })} aria-label={t('ws.expected')} /></Field>
          <Field label={t('ws.group')}><select disabled={held} value={v.groupId} onChange={(e) => setV({ ...v, groupId: e.target.value })} aria-label={t('ws.group')} className={select}><option value="">{t('ws.noGroup')}</option>{tl.groups.filter((g) => g.communityId === w.communityId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!v.location.trim() || !(Number(v.expected) > 0)} onClick={save}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Row { topicId: string; agentId: string; groupId: string; expected: string; date: string; communityId: string }

/** Plan workshops in bulk: one location, then a row per session. */
function PlanSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const lang = useLang();
  const lk = useLookups();
  const tl = useTrainingLookups();
  const { orgId, userId } = useActor();
  const active = tl.topics.filter((x) => x.active);
  const blank = (prev?: Row): Row => {
    const agentId = prev?.agentId ?? lk.agents.find((a) => a.status === 'ACTIVE')?.id ?? '';
    const communityId = prev?.communityId ?? lk.communities.find((c) => c.agentIds.includes(agentId))?.id ?? lk.communities[0]?.id ?? '';
    return { topicId: prev?.topicId ?? active[0]?.id ?? '', agentId, groupId: '', expected: prev?.expected ?? '25', date: prev?.date ?? today(), communityId };
  };
  const [location, setLocation] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p, ...(p.communityId ? { groupId: '' } : {}) } : r)));
  const invalid = !location.trim() || rows.some((r) => !r.topicId || !r.agentId || !r.communityId || !r.date || !(Number(r.expected) > 0));
  const save = () => {
    const list = planWorkshops(orgId, location.trim(), rows.map((r) => ({ ...r, expected: Number(r.expected), groupId: r.groupId || undefined })), userId ?? 'system', lang === 'fr' ? 'fr' : 'en');
    toast.success(t('ws.toast.planned', { count: list.length }));
    onClose(list.length === 1 ? list[0]!.id : undefined);
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0 sm:max-w-4xl">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('ws.plan')}</SheetTitle><p className="mt-1 text-[14px] text-muted">{t('ws.planHint')}</p></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label={t('ws.location')} className="max-w-md"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('ws.locationPlaceholder')} aria-label={t('ws.location')} /></Field>
          <div className="overflow-x-auto rounded-ctl border border-line">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label">{[t('ws.topic'), t('ws.facilitator'), t('col.community'), t('ws.groupOptional'), t('ws.expected'), t('col.date'), ''].map((h, i) => <th key={i} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="p-1.5"><select value={r.topicId} onChange={(e) => set(i, { topicId: e.target.value })} aria-label={`${t('ws.topic')} ${i + 1}`} className={select}>{active.map((x) => <option key={x.id} value={x.id}>{tl.topicName(x.id)}</option>)}</select></td>
                  <td className="p-1.5"><select value={r.agentId} onChange={(e) => set(i, { agentId: e.target.value })} aria-label={`${t('ws.facilitator')} ${i + 1}`} className={select}>{lk.agents.filter((a) => a.status === 'ACTIVE').map((a) => <option key={a.id} value={a.id}>{lk.agent(a.id)}</option>)}</select></td>
                  <td className="p-1.5"><select value={r.communityId} onChange={(e) => set(i, { communityId: e.target.value })} aria-label={`${t('col.community')} ${i + 1}`} className={select}>{lk.communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                  <td className="p-1.5"><select value={r.groupId} onChange={(e) => set(i, { groupId: e.target.value })} aria-label={`${t('ws.group')} ${i + 1}`} className={select}><option value="">{t('ws.noGroup')}</option>{tl.groups.filter((g) => g.communityId === r.communityId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></td>
                  <td className="w-24 p-1.5"><Input type="number" min={1} value={r.expected} onChange={(e) => set(i, { expected: e.target.value })} aria-label={`${t('ws.expected')} ${i + 1}`} /></td>
                  <td className="w-40 p-1.5"><Input type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} aria-label={`${t('col.date')} ${i + 1}`} /></td>
                  <td className="w-10 p-1.5">{rows.length > 1 && <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t('ws.removeRow', { n: i + 1 })}><Trash2 /></Button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setRows([...rows, blank(rows.at(-1))])}><Plus /> {t('ws.addRow')}</Button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-4">
          <span className="text-[13px] text-muted">{t('ws.rowsN', { count: rows.length })}</span>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('ws.planN', { count: rows.length })}</Button></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Workshops for a profile tab (community or farmer); each row opens the workshop. */
export function WorkshopList({ workshops, farmerId }: { workshops: Workshop[]; farmerId?: string }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const tl = useTrainingLookups();
  const list = [...workshops].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">
      {list.map((w) => {
        const mine = farmerId ? w.attendance.find((a) => a.farmerId === farmerId) : undefined;
        return (
          <li key={w.id}><Link to={`/app/workshops?open=${w.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-canvas">
            <span className="w-24 whitespace-nowrap text-muted">{f.date(w.date)}</span>
            <span className="min-w-[180px] flex-1"><span className="block font-medium text-ink">{tl.topicName(w.topicId) || w.title}</span><span className="text-[12px] text-muted">{`${w.location} · ${lk.agent(w.agentId)}`}</span></span>
            {mine ? <span className="flex items-center gap-2">{t(`ws.methodName.${mine.method}`)} <Stars value={mine.rating} /></span> : <span className="tnum text-muted">{t('ws.attendeesN', { count: w.attendance.length })}</span>}
            <StatusBadge status={w.status} />
          </Link></li>
        );
      })}
    </ul>
  );
}
