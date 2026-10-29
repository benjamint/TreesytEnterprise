import { useMemo, useState } from 'react';
import { Calculator, Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { TabEmpty } from '@/components/shared/ListKit';
import { achievementGrid, activityOf, countedRows, mondayOf, recomputeWeek, setManualAchievement, weekEnd } from '@/services/fieldService';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useCan, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { AgentName, PctCell, WeekPicker, selectCls, useFieldLookups } from './shared';

/** Achievements (PRD J6): agents × activities for a week from the metric definitions, drill into the records counted, recompute. */
export function AchievementsPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const can = useCan();
  const { userId } = useActor();
  const plans = useOrgRows(useFieldStore((s) => s.plans));
  const achievements = useFieldStore((s) => s.achievements);
  const [week, setWeek] = useState(mondayOf(new Date()));
  const inWeek = plans.filter((p) => p.weekStart === week && p.status !== 'DRAFT');
  const [planId, setPlanId] = useState('');
  const plan = inWeek.find((p) => p.id === planId) ?? inWeek[0];
  const [tick, setTick] = useState(0);
  const grid = useMemo(() => (plan ? achievementGrid(plan) : []), [plan, achievements, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drill, setDrill] = useState<{ agentId: string; activityId: string } | null>(null);
  const last = plan ? achievements.filter((a) => a.planId === plan.id).sort((a, b) => b.computedAt.localeCompare(a.computedAt))[0] : undefined;
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.achievements')} description={t('pages.achievements')}
        primary={plan && <PermissionGate permission="weeklyPlans.edit"><Button onClick={() => { recomputeWeek(plan.id, userId ?? 'system'); setTick(tick + 1); toast.success(t('field.toast.recomputed')); }}><RefreshCw /> {t('field.recompute')}</Button></PermissionGate>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <WeekPicker value={week} onChange={(w) => { setWeek(w); setPlanId(''); }} />
        {inWeek.length > 1 && <select value={plan?.id} onChange={(e) => setPlanId(e.target.value)} aria-label={t('field.plan')} className={`${selectCls} max-w-xs`}>{inWeek.map((p) => <option key={p.id} value={p.id}>{`${p.number} · ${fl.user(p.managerId)}`}</option>)}</select>}
        {last && <span className="text-[13px] text-muted">{t('field.lastComputed', { date: f.dateTime(last.computedAt) })}</span>}
      </div>
      <p className="mb-4 flex items-start gap-2 rounded-ctl border border-line bg-surface px-3 py-2 text-[13px] text-body"><Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />{t('field.attribution')}</p>
      {!plan ? <TabEmpty>{t('field.noPlansWeek')}</TabEmpty> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-soft">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label">
              <th className="px-3 py-2 font-semibold">{t('col.agent')}</th>
              {plan.activities.map((a) => { const def = activityOf(plan.orgId, a.activityId); return <th key={a.activityId} className="px-2 py-2 text-center font-semibold"><span className="block">{fl.activity(a.activityId)}</span><span className="font-normal text-muted">{def?.metric.source === 'manual' ? t('field.manual') : t(`field.attrib.${def?.metric.attribution ?? 'anywhere'}`)}</span></th>; })}
              <th className="px-3 py-2 text-center font-semibold">{t('field.overall')}</th>
            </tr></thead>
            <tbody>{grid.map((g) => (
              <tr key={g.agentId} className="border-b border-line last:border-0">
                <td className="px-3 py-2"><AgentName id={g.agentId} /></td>
                {g.cells.map((c) => (
                  <td key={c.activityId} className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => setDrill({ agentId: g.agentId, activityId: c.activityId })} className="rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={t('field.drillLabel', { agent: fl.agentName(g.agentId), activity: fl.activity(c.activityId) })}>
                      <PctCell pct={c.pct}><span>{`${f.number(c.achieved, { maximumFractionDigits: 1 })} / ${f.number(c.target)}`}</span></PctCell>
                    </button>
                  </td>
                ))}
                <td className="px-3 py-2 text-center"><PctCell pct={g.pct} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {drill && plan && <DrillDialog planId={plan.id} {...drill} canEdit={can('weeklyPlans.edit')} onClose={() => { setDrill(null); setTick(tick + 1); }} />}
    </>
  );
}

function DrillDialog({ planId, agentId, activityId, canEdit, onClose }: { planId: string; agentId: string; activityId: string; canEdit: boolean; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const lk = useLookups();
  const { userId } = useActor();
  const plan = useFieldStore((s) => s.plans.find((p) => p.id === planId))!;
  const def = activityOf(plan.orgId, activityId)!;
  const manual = def.metric.source === 'manual';
  const rows = manual ? [] : countedRows(plan.orgId, def, { agentId, from: plan.weekStart, to: weekEnd(plan.weekStart), plannedCommunityIds: plan.communities[agentId] });
  const current = useFieldStore.getState().achievements.find((a) => a.planId === planId && a.agentId === agentId && a.activityId === activityId)?.achieved;
  const [value, setValue] = useState(String(current ?? ''));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{`${fl.activity(activityId)} · ${fl.agentName(agentId)}`}</DialogTitle>
          <DialogDescription>{manual ? t('field.manualHint') : t('field.countedHint', { count: rows.length, source: t(`field.source.${def.metric.source}`), attribution: t(`field.attrib.${def.metric.attribution}`) })}</DialogDescription></DialogHeader>
        {manual ? (
          <div className="flex items-end gap-2"><label className="flex-1"><span className="mb-1 block text-[13px] text-label">{t('field.achieved')}</span><Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} aria-label={t('field.achieved')} /></label>
            {canEdit && <Button onClick={() => { setManualAchievement(planId, agentId, activityId, Number(value) || 0, userId ?? 'system'); toast.success(t('field.toast.saved')); onClose(); }}><Calculator /> {t('common.save')}</Button>}</div>
        ) : rows.length ? (
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-ctl border border-line text-[13px]">
            {rows.slice(0, 200).map((r) => <li key={String(r.id)} className="flex items-center justify-between gap-3 px-3 py-2"><span className="font-mono text-muted">{String(r.number ?? r.code ?? r.id).slice(0, 24)}</span><span className="flex-1 text-body">{lk.community(r.communityId as string)}</span>{r.quantity != null && <span className="tnum">{f.number(Number(r.quantity))}</span>}<span className="text-muted">{f.dateTime(String(r.date))}</span></li>)}
          </ul>
        ) : <TabEmpty>{t('field.nothingCounted')}</TabEmpty>}
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
