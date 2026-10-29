import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarRange, Check, Lock, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanActivity, WeeklyPlan } from '@/types';
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
import { achievementGrid, addDays, amendPlan, closePlan, createPlan, mondayOf, publishPlan, resolveAssignees, validatePlan, weekDays, weekEnd } from '@/services/fieldService';
import { cn } from '@/lib/utils';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { LandMap } from '@/web/features/land/shared';
import { AgentName, FieldStatus, PctCell, selectCls, useFieldLookups } from './shared';

/** Weekly plans (PRD J2): list, create (week, days, activities and targets, assignees), publish, amend, detail with progress grid. */
export function PlansPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const rows = useOrgRows(useFieldStore((s) => s.plans));
  const budgets = useOrgRows(useFieldStore((s) => s.budgets));
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [manager, setManager] = useState('');
  const [creating, setCreating] = useState(false);
  const thisWeek = mondayOf(new Date());
  // Achievement % per plan (average of its agents), computed once per render of the list.
  const pct = useMemo(() => new Map(rows.filter((p) => p.status !== 'DRAFT').map((p) => { const g = achievementGrid(p); return [p.id, g.length ? Math.round(g.reduce((s, x) => s + x.pct, 0) / g.length) : 0]; })), [rows, budgets]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = q.trim().toLowerCase();
  const shown = rows.filter((p) => (!status || p.status === status) && (!manager || p.managerId === manager) && (!query || [p.number, fl.user(p.managerId)].some((x) => x.toLowerCase().includes(query)))).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.number.localeCompare(b.number));
  const columns = useMemo<ColumnDef<WeeklyPlan, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'week', header: t('field.week'), accessorKey: 'weekStart', cell: (c) => <span className="whitespace-nowrap">{t('field.weekOf', { date: f.date(c.getValue() as string, 'd MMM') })}{c.getValue() === thisWeek && <Badge tone="brand" className="ml-2">{t('field.thisWeek')}</Badge>}</span> },
    { id: 'manager', header: t('field.manager'), accessorFn: (p) => fl.user(p.managerId) },
    { id: 'days', header: t('field.days'), accessorFn: (p) => p.dates.length },
    { id: 'activities', header: t('field.activities'), accessorFn: (p) => p.activities.length },
    { id: 'targets', header: t('field.targetsTotal'), accessorFn: (p) => p.activities.reduce((s, a) => s + a.target, 0) * p.agentIds.length, cell: (c) => f.number(c.getValue() as number) },
    { id: 'assignees', header: t('field.assignees'), accessorFn: (p) => p.agentIds.length },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <FieldStatus status={c.getValue() as string} /> },
    { id: 'pct', header: t('field.achievement'), accessorFn: (p) => pct.get(p.id) ?? -1, cell: (c) => (c.getValue() as number) >= 0 ? <PctCell pct={c.getValue() as number} /> : <span className="text-muted">{'—'}</span> },
    { id: 'version', header: t('field.version'), accessorKey: 'version', cell: (c) => `v${c.getValue() as number}` },
  ], [t, f, fl, pct, thisWeek]);
  const current = rows.find((p) => p.id === openId);
  const live = rows.filter((p) => p.weekStart === thisWeek);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.weeklyPlans')} description={t('pages.weeklyPlans')}
        primary={<PermissionGate permission="weeklyPlans.create"><Button onClick={() => setCreating(true)}><Plus /> {t('field.newPlan')}</Button></PermissionGate>} />
      <div className="mb-5 stat-strip grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('field.plansThisWeek')} value={f.number(live.length)} hint={t('field.draftsN', { count: live.filter((p) => p.status === 'DRAFT').length })} icon={CalendarRange} />
        <StatCard label={t('field.agentsPlanned')} value={f.number(new Set(live.flatMap((p) => p.agentIds)).size)} />
        <StatCard label={t('field.budgetsThisWeek')} value={f.number(budgets.filter((b) => b.weekStart === thisWeek).length)} />
        <StatCard label={t('field.lastWeekAchievement')} value={(() => { const ps = rows.filter((p) => p.weekStart === addDays(thisWeek, -7)); const xs = ps.map((p) => pct.get(p.id) ?? 0); return xs.length ? `${Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)}%` : '—'; })()} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchPlans')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...(['DRAFT', 'PUBLISHED', 'CLOSED'] as const).map((s) => ({ key: s, label: t(`field.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((p) => p.status === s).length }))]}
        filters={[{ key: 'manager', label: t('field.manager'), value: manager, onChange: setManager, options: [...new Set(rows.map((p) => p.managerId))].map((m) => ({ value: m, label: fl.user(m) })) }]}
        onClear={() => { setQ(''); setStatus(''); setManager(''); }} />
      <DataTable columns={columns} data={shown} onRowClick={(p) => open(p.id)} activeId={openId} getRowId={(p) => p.id} empty={t('field.noPlans')}
        exportCsv={{ fileName: 'weekly-plans.csv', columns: [{ header: t('col.number'), value: (p) => p.number }, { header: t('field.week'), value: (p) => p.weekStart }, { header: t('field.manager'), value: (p) => fl.user(p.managerId) }, { header: t('field.assignees'), value: (p) => p.agentIds.length }, { header: t('col.status'), value: (p) => p.status }, { header: t('field.achievement'), value: (p) => pct.get(p.id) ?? '' }] }} />
      {current && <PlanDrawer key={current.id} plan={current} onClose={close} />}
      {creating && <PlanSheet onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function PlanDrawer({ plan: p, onClose }: { plan: WeeklyPlan; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const lk = useLookups();
  const { userId } = useActor();
  const [amending, setAmending] = useState(false);
  useFieldStore((s) => s.achievements);
  const grid = useMemo(() => (p.status === 'DRAFT' ? [] : achievementGrid(p)), [p]);
  const comms = [...new Set(Object.values(p.communities).flat())].map((id) => lk.communities.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const actor = userId ?? 'system';
  return (
    <>
      <DetailDrawer open onClose={onClose} title={t('field.planTitle', { date: f.date(p.weekStart, 'd MMM yyyy') })} subtitle={`${p.number} · ${fl.user(p.managerId)} · v${p.version}`}
        badges={<FieldStatus status={p.status} />}
        actions={<>
          {p.status === 'DRAFT' && <PermissionGate permission="weeklyPlans.publish"><Button size="sm" onClick={() => { publishPlan(p.id, actor); toast.success(t('field.toast.published', { count: p.agentIds.length })); }}><Send /> {t('field.publish')}</Button></PermissionGate>}
          {p.status !== 'CLOSED' && <PermissionGate permission="weeklyPlans.edit"><Button size="sm" variant="secondary" onClick={() => setAmending(true)}><Pencil /> {p.status === 'DRAFT' ? t('common.edit') : t('field.amend')}</Button></PermissionGate>}
          {p.status === 'PUBLISHED' && p.weekStart < mondayOf(new Date()) && <PermissionGate permission="weeklyPlans.edit"><Button size="sm" variant="secondary" onClick={() => { closePlan(p.id, actor); toast.success(t('field.toast.closed')); }}><Lock /> {t('field.close')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'progress', label: t('field.tab.progress'), content: grid.length ? (
              <div className="overflow-x-auto rounded-ctl border border-line">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-3 py-2 font-semibold">{t('col.agent')}</th>{p.activities.map((a) => <th key={a.activityId} className="px-2 py-2 text-center font-semibold">{fl.activity(a.activityId)}</th>)}<th className="px-3 py-2 text-center font-semibold">{t('field.overall')}</th></tr></thead>
                  <tbody>{grid.map((g) => (
                    <tr key={g.agentId} className="border-b border-line last:border-0">
                      <td className="px-3 py-2"><AgentName id={g.agentId} /></td>
                      {g.cells.map((c) => <td key={c.activityId} className="px-2 py-1.5 text-center"><PctCell pct={c.pct}><span>{`${f.number(c.achieved, { maximumFractionDigits: 0 })} / ${f.number(c.target)}`}</span></PctCell></td>)}
                      <td className="px-3 py-2 text-center"><PctCell pct={g.pct} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <TabEmpty>{t('field.publishToTrack')}</TabEmpty>,
          },
          {
            key: 'plan', label: t('field.tab.plan'), content: (
              <div className="space-y-5">
                <Facts items={[
                  [t('field.week'), `${f.date(p.weekStart)} – ${f.date(weekEnd(p.weekStart))}`], [t('field.days'), p.dates.map((d) => f.date(d, 'EEE d')).join(', ')],
                  [t('field.manager'), fl.user(p.managerId)], [t('field.assignees'), t(`field.assignKind.${p.assignees.kind}`, { count: p.agentIds.length })],
                  ...(p.publishedAt ? [[t('field.publishedOn'), f.dateTime(p.publishedAt)] as [string, string]] : []),
                ]} />
                <ul className="divide-y divide-line rounded-ctl border border-line text-[14px]">{p.activities.map((a) => (
                  <li key={a.activityId} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-ink">{fl.activity(a.activityId)}</span><span className="tnum text-muted">{`${f.number(a.target)} ${fl.unit(a.activityId)}${a.perAgent && Object.keys(a.perAgent).length ? ` · ${t('field.perAgentN', { count: Object.keys(a.perAgent).length })}` : ''}`}</span></li>
                ))}</ul>
                <div><h4 className="mb-2 text-[13px] font-semibold text-ink">{t('field.tripsMap')}</h4>
                  <LandMap ariaLabel={t('field.tripsMap')} height={260} points={comms.map((c) => ({ id: c.id, lat: c.gps.lat, lng: c.gps.lng, color: 'var(--series-1)', label: c.name }))} /></div>
              </div>
            ),
          },
          { key: 'versions', label: t('field.tab.versions'), count: p.history.length, content: <ul className="divide-y divide-line rounded-ctl border border-line text-[14px]">{[...p.history].reverse().map((h) => <li key={h.version} className="px-3 py-2"><span className="font-medium text-ink">{`v${h.version}`}</span><span className="text-muted">{` · ${fl.user(h.by)} · ${f.dateTime(h.at)}`}</span>{h.note && <p className="text-body">{h.note}</p>}</li>)}</ul> },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="weeklyPlan" entityId={p.id} /> },
        ]} />
      {amending && <AmendDialog plan={p} onClose={() => setAmending(false)} />}
    </>
  );
}

function ActivityRows({ value, onChange, agentIds }: { value: PlanActivity[]; onChange: (v: PlanActivity[]) => void; agentIds: string[] }) {
  const { t } = useT();
  const fl = useFieldLookups();
  const [perAgent, setPerAgent] = useState<string | null>(null);
  const active = fl.activities.filter((a) => a.active);
  const set = (i: number, patch: Partial<PlanActivity>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={i} className="rounded-ctl border border-line p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto_auto]">
            <select value={a.activityId} onChange={(e) => set(i, { activityId: e.target.value })} aria-label={`${t('field.activity')} ${i + 1}`} className={selectCls}>{active.map((x) => <option key={x.id} value={x.id}>{fl.activity(x.id)}</option>)}</select>
            <Input type="number" min={0} value={a.target} onChange={(e) => set(i, { target: Number(e.target.value) })} aria-label={`${t('field.target')} ${i + 1}`} />
            <Button size="sm" variant={a.perAgent ? 'secondary' : 'ghost'} onClick={() => setPerAgent(perAgent === String(i) ? null : String(i))}>{t('field.perAgent')}</Button>
            <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t('field.removeActivity')}><Trash2 /></Button>
          </div>
          {perAgent === String(i) && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">{agentIds.map((id) => (
              <label key={id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{fl.agentName(id)}</span>
                <Input type="number" min={0} className="h-9 w-24" value={a.perAgent?.[id] ?? a.target} onChange={(e) => set(i, { perAgent: { ...a.perAgent, [id]: Number(e.target.value) } })} aria-label={`${t('field.target')} ${fl.agentName(id)}`} /></label>
            ))}</div>
          )}
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...value, { activityId: active.find((x) => !value.some((v) => v.activityId === x.id))?.id ?? active[0]!.id, target: 10 }])}><Plus /> {t('field.addActivity')}</Button>
    </div>
  );
}

function PlanSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const ahead = settings.fieldTeam.plan.planAheadWeeks;
  const weeks = Array.from({ length: ahead + 1 }, (_, i) => addDays(mondayOf(new Date()), i * 7));
  const [weekStart, setWeekStart] = useState(weeks[0]!);
  const [dates, setDates] = useState<string[]>(() => weekDays(weeks[0]!).slice(0, Math.min(5, settings.fieldTeam.plan.maxDays)));
  const [kind, setKind] = useState<'team' | 'agentType' | 'agents'>('team');
  const [ids, setIds] = useState<string[]>(() => (userId && fl.supervisors.includes(userId) ? [userId] : fl.supervisors.slice(0, 1)));
  const [activities, setActivities] = useState<PlanActivity[]>(() => fl.activities.filter((a) => a.active).slice(0, 3).map((a) => ({ activityId: a.id, target: 10 })));
  const agentIds = resolveAssignees(orgId, { kind, ids });
  const problem = validatePlan(orgId, { weekStart, dates, activities });
  const options = kind === 'team' ? fl.supervisors.map((s) => ({ id: s, label: fl.user(s) })) : kind === 'agentType' ? settings.agentTypes.map((a) => ({ id: a.id, label: fl.agentType(a.id) })) : fl.agents.filter((a) => a.status !== 'DEACTIVATED').map((a) => ({ id: a.id, label: fl.agentName(a.id) }));
  const save = (publish: boolean) => {
    try {
      const p = createPlan({ orgId, weekStart, dates, managerId: kind === 'team' ? ids[0] ?? userId ?? '' : userId ?? '', activities, assignees: { kind, ids }, actorId: userId ?? 'system' });
      if (publish) publishPlan(p.id, userId ?? 'system');
      toast.success(t(publish ? 'field.toast.published' : 'field.toast.saved', { count: p.agentIds.length }));
      onClose(p.id);
    } catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); }
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0 sm:max-w-3xl">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('field.newPlan')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label={t('field.week')}><select value={weekStart} onChange={(e) => { setWeekStart(e.target.value); setDates(weekDays(e.target.value).slice(0, dates.length)); }} aria-label={t('field.week')} className={selectCls}>{weeks.map((w) => <option key={w} value={w}>{t('field.weekOf', { date: f.date(w, 'd MMM yyyy') })}</option>)}</select></Field>
          <div>
            <div className="mb-2 text-[13px] font-medium text-label">{t('field.daysHint', { min: settings.fieldTeam.plan.minDays, max: settings.fieldTeam.plan.maxDays })}</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('field.days')}>{weekDays(weekStart).map((d) => <button key={d} type="button" aria-pressed={dates.includes(d)} onClick={() => setDates(dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d].sort())} className={cn('rounded-chip border px-3 py-1.5 text-[13px]', dates.includes(d) ? 'border-brand bg-brand-soft font-medium text-ink' : 'border-line text-muted')}>{f.date(d, 'EEE d')}</button>)}</div>
          </div>
          <div>
            <h3 className="mb-2 text-[14px] font-semibold text-ink">{t('field.activities')}</h3>
            <ActivityRows value={activities} onChange={setActivities} agentIds={agentIds} />
          </div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-semibold text-ink">{t('field.assignees')}</h3>
            <div className="flex gap-1.5" role="group" aria-label={t('field.assignees')}>{(['team', 'agentType', 'agents'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setIds([]); }} className={cn('rounded-chip border px-3 py-1.5 text-[13px]', kind === k ? 'border-brand bg-brand-soft font-medium text-ink' : 'border-line text-muted')}>{t(`field.assignBy.${k}`)}</button>)}</div>
            <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">{options.map((o) => <button key={o.id} type="button" aria-pressed={ids.includes(o.id)} onClick={() => setIds(ids.includes(o.id) ? ids.filter((x) => x !== o.id) : [...ids, o.id])} className={cn('rounded-chip border px-3 py-1 text-[13px]', ids.includes(o.id) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-muted')}>{o.label}</button>)}</div>
            <p className="text-[13px] text-muted">{t('field.resolvesTo', { count: agentIds.length })}</p>
          </div>
          {problem && <p className="rounded-ctl border border-warning/40 bg-warning/5 px-3 py-2 text-[13px] text-ink" role="status">{t(`field.err.${problem}`, { min: settings.fieldTeam.plan.minDays, max: settings.fieldTeam.plan.maxDays })}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button variant="secondary" disabled={!!problem || !agentIds.length} onClick={() => save(false)}>{t('field.saveDraft')}</Button>
          <PermissionGate permission="weeklyPlans.publish"><Button disabled={!!problem || !agentIds.length} onClick={() => save(true)}><Check /> {t('field.savePublish')}</Button></PermissionGate>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AmendDialog({ plan: p, onClose }: { plan: WeeklyPlan; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const [activities, setActivities] = useState(p.activities);
  const [note, setNote] = useState('');
  const needsNote = p.status === 'PUBLISHED';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{needsNote ? t('field.amendTitle', { number: p.number }) : t('field.editTitle', { number: p.number })}</DialogTitle><DialogDescription>{needsNote ? t('field.amendHint') : t('field.editHint')}</DialogDescription></DialogHeader>
        <ActivityRows value={activities} onChange={setActivities} agentIds={p.agentIds} />
        {needsNote && <TextAreaField label={t('field.amendReason')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />}
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={needsNote && !note.trim()} onClick={() => { amendPlan(p.id, { activities }, note.trim(), userId ?? 'system'); toast.success(t('field.toast.amended')); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
