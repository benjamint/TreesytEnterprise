import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarRange, CheckCircle2, ChevronRight, Circle, Coins, Flag, Plus, ReceiptText, Trash2, Trophy, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Trip } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PhotoPicker } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MobileWizard, mInput, savedKey } from '@/mobile/components/kit';
import { achievementGrid, agentBlocks, budgetLimits, budgetProblem, budgetStage, deductionsFor, grossOf, mondayOf, openRetirement, outstanding, retirementSummary } from '@/services/fieldService';
import { agentScore, cashPosition, modelFor } from '@/services/teamService';
import { saveOrQueue } from '@/services/mobileSync';
import { toMinor } from '@/engines/money';
import { cn } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useNotificationText } from '@/web/layout/NotificationsBell';
import { FieldStatus, useCfReason, useFieldLookups } from '@/web/features/field/shared';

type TripDraft = Omit<Trip, 'id'> & { key: string };

/** M11: this week's published plan with progress, the budget request and retirement for it. */
export function PlanScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const fl = useFieldLookups();
  const { agent } = useMobileAgent();
  const plans = useOrgRows(useFieldStore((s) => s.plans));
  const budgets = useOrgRows(useFieldStore((s) => s.budgets));
  const retirements = useFieldStore((s) => s.retirements);
  const outbox = useOutboxStore((s) => s.items);
  const week = mondayOf(new Date());
  const mine = plans.filter((p) => agent && p.agentIds.includes(agent.id) && p.status !== 'DRAFT').sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const plan = mine.find((p) => p.weekStart === week);
  const grid = useMemo(() => (plan && agent ? achievementGrid({ ...plan, agentIds: [agent.id] })[0] : undefined), [plan, agent]);
  const budget = plan && budgets.find((b) => b.planId === plan.id && b.agentId === agent?.id && b.status !== 'REJECTED');
  const queued = outbox.some((i) => i.type === 'budget' && (i.payload as { planId: string }).planId === plan?.id);
  const prev = agent ? openRetirement(agent.id) : undefined;
  const blocked = agent && plan && !budget ? budgetProblem({ orgId: agent.orgId, agentId: agent.id, planId: plan.id, trips: [{ date: plan.dates[0]!, communityId: '', activities: [], costs: {} }] }) : null;
  const openRets = retirements.filter((r) => r.agentId === agent?.id && r.status !== 'RETIRED');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m11.title')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        {!plan ? <p className="rounded-card border border-line px-4 py-6 text-center text-[14px] text-muted">{t('mobile.m11.noPlan')}</p> : (
          <>
            <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft">
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{t('field.weekOf', { date: f.date(plan.weekStart, 'd MMM') })}</div>
              <div className="tnum mt-1 text-[30px] font-semibold">{`${grid?.pct ?? 0}%`}</div>
              <div className="text-[13px] text-white/80">{t('mobile.m11.daysPlanned', { days: plan.dates.map((d) => f.date(d, 'EEE')).join(', ') })}</div>
            </div>
            <section>
              <h2 className="eyebrow mb-2">{t('field.activities')}</h2>
              <ul className="space-y-2">{grid?.cells.map((c) => (
                <li key={c.activityId} className="rounded-card border border-line bg-surface p-3">
                  <div className="flex items-center justify-between text-[15px]"><span className="font-medium text-ink">{fl.activity(c.activityId)}</span><span className="tnum text-muted">{`${f.number(c.achieved, { maximumFractionDigits: 0 })} / ${f.number(c.target)} ${fl.unit(c.activityId)}`}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, c.pct)}%` }} /></div>
                </li>
              ))}</ul>
            </section>
            <section>
              <h2 className="eyebrow mb-2">{t('mobile.m11.budget')}</h2>
              {budget ? <MList><li><ListRow title={budget.number} subtitle={`${f.money(budget.net)} · ${t('field.tripsN', { count: budget.trips.length })}`} badge={<FieldStatus status={budgetStage(budget)} />} onClick={() => navigate(`/m/budget/${budget.id}`)} /></li></MList>
                : queued ? <p className="rounded-card border border-warning/40 bg-warning/5 px-4 py-3 text-[14px]">{t('mobile.m11.queued')}</p>
                : blocked && blocked !== 'noTrips' && blocked !== 'tripOutsidePlan' && blocked !== 'overLimit' ? (
                  <div className="rounded-card border border-danger/40 bg-danger/5 p-4 text-[14px] text-ink" role="alert"><AlertTriangle className="mb-1 h-5 w-5 text-danger" />{t(`mobile.m11.blocked.${blocked}`, { defaultValue: t(`field.err.${blocked}`) })}{prev && blocked === 'retirementOpen' && <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => navigate(`/m/retirement/${prev.id}`)}>{t('mobile.m11.openRetirement')}</Button>}</div>
                ) : <Button size="lg" className="w-full" onClick={() => navigate(`/m/budget/new?plan=${plan.id}`)}><Plus /> {t('mobile.m11.createBudget')}</Button>}
            </section>
          </>
        )}
        {openRets.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2">{t('nav.retirements')}</h2>
            <MList>{openRets.map((r) => <li key={r.id}><ListRow title={useFieldStore.getState().budgets.find((b) => b.id === r.budgetId)?.number ?? ''} subtitle={f.money(r.gross)} badge={<FieldStatus status={r.status} />} onClick={() => navigate(`/m/retirement/${r.id}`)} /></li>)}</MList>
          </section>
        )}
        {mine.filter((p) => p.weekStart < week).length > 0 && (
          <section>
            <h2 className="eyebrow mb-2">{t('mobile.m11.past')}</h2>
            <MList>{mine.filter((p) => p.weekStart < week).slice(0, 4).map((p) => { const g = agent ? achievementGrid({ ...p, agentIds: [agent.id] })[0] : undefined; return <li key={p.id}><ListRow title={t('field.weekOf', { date: f.date(p.weekStart, 'd MMM') })} subtitle={t('field.activitiesN', { count: p.activities.length })} right={<span className="tnum font-semibold text-ink">{`${g?.pct ?? 0}%`}</span>} /></li>; })}</MList>
          </section>
        )}
      </div>
    </div>
  );
}

/** M11 budget request: trips (date, community, activities with target slices, costs with limits shown live) → review → submit. */
export function BudgetNewScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const { agent } = useMobileAgent();
  const [params] = useSearchParams();
  const planId = params.get('plan') ?? '';
  const plan = useFieldStore((s) => s.plans.find((p) => p.id === planId));
  const communities = useOrgRows(useCommunityStore((s) => s.communities)).filter((c) => agent && c.agentIds.includes(agent.id));
  const cats = settings.fieldTeam.costCategories;
  const [trips, setTrips] = useState<TripDraft[]>(() => (plan ? plan.dates.slice(0, 2).map((date, i) => ({ key: `t${i}`, date, communityId: plan.communities[agent?.id ?? '']?.[i] ?? communities[0]?.id ?? '', activities: plan.activities.slice(0, 2).map((a) => ({ activityId: a.activityId, target: Math.ceil((a.perAgent?.[agent?.id ?? ''] ?? a.target) / Math.max(1, plan.dates.length)) })), costs: {} })) : []));
  const [busy, setBusy] = useState(false);
  if (!plan || !agent) return <div className="flex min-h-0 flex-1 flex-col"><MobileHeader title={t('mobile.m11.createBudget')} back /><p className="px-6 py-10 text-center text-muted">{t('mobile.m11.noPlan')}</p></div>;
  const limits = budgetLimits(orgId, trips);
  const total = trips.reduce((s, x) => s + Object.values(x.costs).reduce((a, b) => a + b, 0), 0);
  const deductions = deductionsFor(agent.id, total, orgId).reduce((s, d) => s + d.amountMinor, 0);
  const over = limits.some((l) => l.overWeek || l.overDays.length);
  const set = (key: string, patch: Partial<TripDraft>) => setTrips(trips.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const submit = async () => {
    setBusy(true);
    const payload = { orgId, agentId: agent.id, planId: plan.id, trips: trips.map(({ key: _k, ...x }) => x) };
    const problem = budgetProblem(payload);
    if (problem) { toast.error(t(`field.err.${problem}`)); setBusy(false); return; }
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'budget', label: t('mobile.m11.budgetLabel', { amount: f.money(total) }), payload });
    toast.success(t(savedKey(queued)));
    navigate('/m/plan');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m11.createBudget')} back />
      <MobileWizard busy={busy} finishLabel={t('mobile.m11.submit')} onFinish={() => void submit()} steps={[
        {
          key: 'trips', title: t('field.trips'), valid: trips.length > 0 && !over && trips.every((x) => x.communityId), hint: over ? t('mobile.m11.overLimit') : undefined, content: (
            <div className="space-y-4">
              {trips.map((tr, i) => (
                <div key={tr.key} className="space-y-3 rounded-card border border-line bg-surface p-4">
                  <div className="flex items-center justify-between"><span className="font-semibold text-ink">{t('mobile.m11.tripN', { n: i + 1 })}</span><button type="button" onClick={() => setTrips(trips.filter((x) => x.key !== tr.key))} aria-label={t('mobile.m11.removeTrip', { n: i + 1 })} className="rounded-full p-2 text-muted"><Trash2 className="h-4 w-4" /></button></div>
                  <MField label={t('col.date')}><select className={mInput} value={tr.date} onChange={(e) => set(tr.key, { date: e.target.value })}>{plan.dates.map((d) => <option key={d} value={d}>{f.date(d, 'EEE d MMM')}</option>)}</select></MField>
                  <MField label={t('col.community')}><select className={mInput} value={tr.communityId} onChange={(e) => set(tr.key, { communityId: e.target.value })}>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></MField>
                  <div><div className="mb-1.5 text-[14px] font-medium text-label">{t('mobile.m11.targets')}</div>
                    <div className="space-y-2">{plan.activities.map((a) => { const cur = tr.activities.find((x) => x.activityId === a.activityId); return (
                      <label key={a.activityId} className="flex items-center gap-3 text-[14px]"><input type="checkbox" checked={!!cur} onChange={(e) => set(tr.key, { activities: e.target.checked ? [...tr.activities, { activityId: a.activityId, target: 1 }] : tr.activities.filter((x) => x.activityId !== a.activityId) })} className="h-5 w-5 accent-[rgb(var(--brand))]" /><span className="flex-1">{fl.activity(a.activityId)}</span>{cur && <input type="number" inputMode="numeric" min={0} value={cur.target} onChange={(e) => set(tr.key, { activities: tr.activities.map((x) => (x.activityId === a.activityId ? { ...x, target: Number(e.target.value) } : x)) })} aria-label={`${fl.activity(a.activityId)} ${t('field.target')}`} className="h-10 w-20 rounded-ctl border border-line px-2 text-right text-[15px]" />}</label>
                    ); })}</div></div>
                  <div className="space-y-2">{cats.map((c) => { const dayTotal = trips.filter((x) => x.date === tr.date).reduce((s, x) => s + (x.costs[c.id] ?? 0), 0); const overDay = dayTotal > c.maxPerDayMinor; return (
                    <MField key={c.id} label={c.name} help={<span className={overDay ? 'font-medium text-danger' : ''}>{t('mobile.m11.limitDay', { max: f.money(c.maxPerDayMinor) })}</span>}><input className={cn(mInput, overDay && 'border-danger')} inputMode="decimal" value={tr.costs[c.id] ? String(tr.costs[c.id]! / 100) : ''} placeholder="0" onChange={(e) => set(tr.key, { costs: { ...tr.costs, [c.id]: toMinor(Number(e.target.value) || 0, f.org.currency) } })} /></MField>
                  ); })}</div>
                </div>
              ))}
              {trips.length < plan.dates.length && <Button variant="secondary" className="w-full" onClick={() => setTrips([...trips, { key: `t${Date.now()}`, date: plan.dates.find((d) => !trips.some((x) => x.date === d)) ?? plan.dates[0]!, communityId: communities[0]?.id ?? '', activities: [], costs: {} }])}><Plus /> {t('mobile.m11.addTrip')}</Button>}
              <ul className="space-y-1 rounded-card bg-canvas p-3 text-[13px]">{limits.map((l) => <li key={l.categoryId} className={cn('flex justify-between', l.overWeek && 'font-semibold text-danger')}><span>{l.name}</span><span className="tnum">{`${f.money(l.week)} / ${f.money(l.maxWeek)}`}</span></li>)}</ul>
            </div>
          ),
        },
        {
          key: 'review', title: t('mobile.m11.review'), valid: total > 0, content: (
            <div className="space-y-3 text-[15px]">
              <dl className="divide-y divide-line rounded-card border border-line">
                {([[t('field.trips'), String(trips.length)], [t('field.total'), f.money(total)], [t('field.deductions'), `− ${f.money(deductions)}`], [t('mobile.m11.youReceive'), f.money(total - deductions)]] as [string, string][]).map(([k, v], i) => <div key={k} className={cn('flex justify-between px-4 py-3', i === 3 && 'font-semibold text-ink')}><dt className="text-muted">{k}</dt><dd className="tnum">{v}</dd></div>)}
              </dl>
              {deductions > 0 && <p className="text-[13px] text-muted">{t('mobile.m11.deductionHint', { items: outstanding(agent.id).map((c) => t(`field.cfType.${c.type}`)).join(', ') })}</p>}
              <p className="text-[13px] text-muted">{t('mobile.m11.walletHint', { number: agent.wallet.number })}</p>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

/** M11: budget status timeline and payout. */
export function BudgetStatusScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const fl = useFieldLookups();
  const b = useFieldStore((s) => s.budgets.find((x) => x.id === id));
  if (!b) return null;
  const steps = [
    { key: 'submitted', done: true, at: b.createdAt, label: t('mobile.m11.step.submitted') },
    { key: 'mgr', done: b.approvals.some((a) => a.stepId === 'mgr' && a.decision === 'APPROVED'), at: b.approvals.find((a) => a.stepId === 'mgr')?.at, label: t('mobile.m11.step.manager'), by: b.approvals.find((a) => a.stepId === 'mgr')?.userId },
    { key: 'fin', done: b.status === 'APPROVED', at: b.approvals.find((a) => a.stepId === 'fin')?.at, label: t('mobile.m11.step.finance'), by: b.approvals.find((a) => a.stepId === 'fin')?.userId },
    { key: 'paid', done: b.payStatus === 'PAID' || b.payStatus === 'ABSORBED', at: b.paidAt, label: b.payStatus === 'ABSORBED' ? t('mobile.m11.step.absorbed') : t('mobile.m11.step.paid', { amount: f.money(b.net) }) },
  ];
  const rejected = b.status === 'REJECTED' || b.status === 'ON_HOLD';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={b.number} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="flex items-center justify-between"><FieldStatus status={budgetStage(b)} /><span className="tnum text-[22px] font-semibold text-ink">{f.money(b.net)}</span></div>
        {rejected && <p className="rounded-card border border-danger/40 bg-danger/5 p-3 text-[14px]" role="alert">{b.approvals.at(-1)?.comment ?? t(`field.status.${b.status}`)}</p>}
        <ol className="space-y-3">{steps.map((s) => (
          <li key={s.key} className="flex gap-3">{s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-line" />}
            <div><div className={cn('text-[15px]', s.done ? 'text-ink' : 'text-muted')}>{s.label}</div>{s.at && <div className="text-[12px] text-muted">{`${f.dateTime(s.at)}${s.by ? ` · ${fl.user(s.by)}` : ''}`}</div>}</div></li>
        ))}</ol>
        {b.deductions.length > 0 && <p className="text-[13px] text-muted">{t('mobile.m11.deductedNote', { amount: f.money(b.deductions.reduce((s, d) => s + d.amountMinor, 0)), gross: f.money(grossOf(b)) })}</p>}
        <ul className="divide-y divide-line rounded-card border border-line text-[14px]">{b.trips.map((tr) => <li key={tr.id} className="flex justify-between px-4 py-3"><span>{f.date(tr.date, 'EEE d MMM')}</span><span className="tnum">{f.money(Object.values(tr.costs).reduce((a, x) => a + x, 0))}</span></li>)}</ul>
        {b.retirementId && <Button size="lg" className="w-full" onClick={() => navigate(`/m/retirement/${b.retirementId}`)}><ReceiptText /> {t('mobile.m11.retire')}</Button>}
      </div>
    </div>
  );
}

interface ReceiptDraft { key: string; categoryId: string; amount: string; date: string; photos: string[]; replaces?: string }

/** M11 retirement: receipts per category (amount, date, photo), resubmit rejected ones, or declare unused funds. */
export function RetirementScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const r = useFieldStore((s) => s.retirements.find((x) => x.id === id));
  const b = useFieldStore((s) => s.budgets.find((x) => x.id === r?.budgetId));
  const cats = settings.fieldTeam.costCategories.filter((c) => c.receiptRequired);
  const s = r ? retirementSummary(r) : undefined;
  const rejected = s?.live.filter((x) => x.status === 'REJECTED') ?? [];
  const [rows, setRows] = useState<ReceiptDraft[]>(() => (r && b ? (rejected.length
    ? rejected.map((x) => ({ key: x.id, categoryId: x.categoryId, amount: String(x.amountMinor / 100), date: x.date, photos: [], replaces: x.id }))
    : r.receipts.length ? [] : cats.flatMap((c) => b.trips.filter((tr) => tr.costs[c.id] && (c.id !== 'cc_airtime' || tr === b.trips[0])).map((tr) => ({ key: `${c.id}_${tr.id}`, categoryId: c.id, amount: String(tr.costs[c.id]! / 100), date: tr.date, photos: [] })))) : []));
  const [unused, setUnused] = useState('');
  const [reason, setReason] = useState(settings.fieldTeam.unusedReasons[0] ?? '');
  const [busy, setBusy] = useState(false);
  if (!r || !b || !s) return null;
  const closed = r.status === 'RETIRED' || r.status === 'AWAITING_REFUND' || r.status === 'PENDING_REVIEW';
  const submit = async () => {
    setBusy(true);
    const payload = { retirementId: r.id, receipts: rows.map((x) => ({ categoryId: x.categoryId, amountMinor: toMinor(Number(x.amount) || 0, r.gross.currency), date: x.date, file: x.photos[0] ?? 'receipt.jpg', replaces: x.replaces })), unused: Number(unused) > 0 ? { amountMinor: toMinor(Number(unused), r.gross.currency), reason } : undefined };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'retirement', label: t('mobile.m11.retirementLabel', { number: b.number }), payload });
    toast.success(t(savedKey(queued)));
    navigate('/m/plan');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m11.retire')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="flex items-center justify-between"><span className="text-[14px] text-muted">{`${b.number} · ${f.money(r.gross)}`}</span><FieldStatus status={r.status} /></div>
        {s.live.length > 0 && (
          <MList>{s.live.map((x) => <li key={x.id}><ListRow title={`${settings.fieldTeam.costCategories.find((c) => c.id === x.categoryId)?.name} · ${f.money(x.amountMinor)}`} subtitle={x.reason ? `${f.date(x.date)} · ${x.reason}` : f.date(x.date)} badge={<FieldStatus status={x.status === 'PENDING' ? 'PENDING_REVIEW' : x.status} />} /></li>)}</MList>
        )}
        {r.status === 'AWAITING_REFUND' && <p className="rounded-card border border-warning/40 bg-warning/5 p-3 text-[14px]">{t('mobile.m11.refundDue', { amount: f.money((r.unused?.amountMinor ?? 0) - s.refunded) })}</p>}
        {!closed && (
          <>
            {rejected.length > 0 && <p className="rounded-card border border-danger/40 bg-danger/5 p-3 text-[14px]" role="alert">{t('mobile.m11.resubmitHint', { count: rejected.length })}</p>}
            <p className="text-[13px] text-muted">{t('mobile.m11.airtimeOnce')}</p>
            {rows.map((x, i) => (
              <div key={x.key} className="space-y-3 rounded-card border border-line bg-surface p-4">
                <div className="flex items-center justify-between"><span className="font-semibold text-ink">{x.replaces ? t('mobile.m11.replacement') : t('mobile.m11.receiptN', { n: i + 1 })}</span>{!x.replaces && <button type="button" onClick={() => setRows(rows.filter((y) => y.key !== x.key))} className="rounded-full p-2 text-muted" aria-label={t('mobile.m11.removeReceipt')}><Trash2 className="h-4 w-4" /></button>}</div>
                <MField label={t('field.category')}><select className={mInput} value={x.categoryId} onChange={(e) => setRows(rows.map((y) => (y.key === x.key ? { ...y, categoryId: e.target.value } : y)))}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></MField>
                <div className="grid grid-cols-2 gap-2">
                  <MField label={t('field.amount')}><input className={mInput} inputMode="decimal" value={x.amount} onChange={(e) => setRows(rows.map((y) => (y.key === x.key ? { ...y, amount: e.target.value } : y)))} /></MField>
                  <MField label={t('col.date')}><input type="date" className={mInput} value={x.date} onChange={(e) => setRows(rows.map((y) => (y.key === x.key ? { ...y, date: e.target.value } : y)))} /></MField>
                </div>
                <MField label={t('mobile.m11.receiptPhoto')} group><PhotoPicker value={x.photos} onChange={(photos) => setRows(rows.map((y) => (y.key === x.key ? { ...y, photos } : y)))} max={1} /></MField>
              </div>
            ))}
            {!rejected.length && <Button variant="secondary" className="w-full" onClick={() => setRows([...rows, { key: `r${Date.now()}`, categoryId: cats[0]?.id ?? '', amount: '', date: b.trips[0]?.date ?? '', photos: [] }])}><Plus /> {t('mobile.m11.addReceipt')}</Button>}
            {!rejected.length && (
              <div className="space-y-3 rounded-card border border-line p-4">
                <div className="font-semibold text-ink">{t('mobile.m11.unused')}</div>
                <MField label={t('field.amount')} help={t('mobile.m11.unusedHelp')}><input className={mInput} inputMode="decimal" value={unused} placeholder="0" onChange={(e) => setUnused(e.target.value)} /></MField>
                {Number(unused) > 0 && <MField label={t('field.reason')}><select className={mInput} value={reason} onChange={(e) => setReason(e.target.value)}>{settings.fieldTeam.unusedReasons.map((x) => <option key={x} value={x}>{x}</option>)}</select></MField>}
              </div>
            )}
            <Button size="lg" className="w-full" disabled={busy || (!rows.length && !(Number(unused) > 0)) || rows.some((x) => !(Number(x.amount) > 0) || !x.photos.length)} onClick={() => void submit()}>{t('mobile.m11.sendReceipts')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

/** M12 hub: my cash, commissions, score, reports, notifications. */
export function MyWorkLinks() {
  const { t } = useT();
  const f = useFormat();
  const { agent, membership } = useMobileAgent();
  const { userId, orgId } = useActor();
  const reports = useFieldStore((s) => s.reports);
  const unread = useNotificationStore((s) => s.notifications.filter((n) => n.userId === userId && n.orgId === orgId && !n.read).length);
  void membership;
  if (!agent) return null;
  const cash = cashPosition(agent.id);
  const open = reports.filter((r) => r.agentId === agent.id && r.status !== 'RESOLVED').length;
  const items = [
    { to: '/m/me/cash', icon: Wallet, label: t('mobile.m12.cash'), right: f.money(cash.balance) },
    { to: '/m/me/commissions', icon: Coins, label: t('mobile.m12.commissions') },
    { to: '/m/me/score', icon: Trophy, label: t('mobile.m12.score'), right: f.number(agent.score) },
    { to: '/m/me/reports', icon: Flag, label: t('mobile.m12.reports'), right: open ? <Badge tone="danger">{open}</Badge> : undefined },
    { to: '/m/me/notifications', icon: Bell, label: t('mobile.m12.notifications'), right: unread ? <Badge tone="brand">{unread}</Badge> : undefined },
    { to: '/m/plan', icon: CalendarRange, label: t('mobile.m11.title') },
  ];
  return (
    <div>
      <div className="eyebrow mb-2">{t('mobile.m12.myWork')}</div>
      <ul className="divide-y divide-line rounded-card border border-line">{items.map((x) => { const I = x.icon; return (
        <li key={x.to}><Link to={x.to} className="flex min-h-[52px] items-center gap-3 px-4 text-[15px] active:bg-brand-soft"><I className="h-5 w-5 text-brand" /><span className="flex-1 text-ink">{x.label}</span>{x.right && <span className="tnum text-muted">{x.right}</span>}<ChevronRight className="h-4 w-4 text-muted" /></Link></li>
      ); })}</ul>
    </div>
  );
}

export function MyCashScreen() {
  const { t } = useT();
  const f = useFormat();
  const { agent } = useMobileAgent();
  useFieldStore((s) => s.carryForwards);
  const cfReason = useCfReason();
  if (!agent) return null;
  const c = cashPosition(agent.id);
  const cfs = outstanding(agent.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m12.cash')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft"><div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{t('mobile.m12.toReconcile')}</div><div className="tnum mt-1 text-[30px] font-semibold">{f.money(c.balance)}</div><div className="text-[13px] text-white/80">{t('mobile.m12.requestsOpen', { count: c.toReconcile })}</div></div>
        <dl className="divide-y divide-line rounded-card border border-line text-[15px]">{([[t('field.advances'), c.advanced], [t('mobile.m12.spent'), c.spent], [t('field.refunds'), c.refunded]] as [string, number][]).map(([k, v]) => <div key={k} className="flex justify-between px-4 py-3"><dt className="text-muted">{k}</dt><dd className="tnum">{f.money(v)}</dd></div>)}</dl>
        {cfs.length > 0 && <section><h2 className="eyebrow mb-2">{t('nav.carryForwards')}</h2><MList>{cfs.map((x) => <li key={x.id}><ListRow title={t(`field.cfType.${x.type}`)} subtitle={cfReason(x)} right={<span className="tnum text-danger">{f.money(x.remainingMinor)}</span>} /></li>)}</MList><p className="mt-1.5 text-[12px] text-muted">{t('mobile.m12.cfHint')}</p></section>}
        <section><h2 className="eyebrow mb-2">{t('mobile.m12.advancesList')}</h2><MList>{c.rows.slice(0, 10).map((r) => <li key={r.id}><ListRow title={r.number} subtitle={`${f.money(r.advanced)} → ${f.money(r.spent)}`} right={<span className={cn('tnum', r.balance ? 'font-semibold text-ink' : 'text-muted')}>{f.money(r.balance)}</span>} /></li>)}</MList></section>
      </div>
    </div>
  );
}

export function MyCommissionsScreen() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const { agent } = useMobileAgent();
  const periods = useOrgRows(useFieldStore((s) => s.commissions));
  const [open, setOpen] = useState<string | null>(null);
  if (!agent) return null;
  const lines = periods.map((p) => ({ p, l: p.lines.find((x) => x.agentId === agent.id) })).filter((x) => x.l).sort((a, b) => b.p.from.localeCompare(a.p.from));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m12.commissions')} back />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-1">
        {!lines.length && <p className="rounded-card border border-line px-4 py-6 text-center text-[14px] text-muted">{t('field.noCommissions')}</p>}
        {lines.map(({ p, l }) => (
          <div key={p.id} className="rounded-card border border-line bg-surface">
            <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id} className="flex w-full items-center gap-3 px-4 py-3 text-left"><span className="flex-1"><span className="block font-medium capitalize text-ink">{p.name}</span><span className="text-[12px] text-muted">{p.number}</span></span><span className="tnum font-semibold text-ink">{f.money(l!.total)}</span><FieldStatus status={l!.paid ? 'PAID' : l!.status} /></button>
            {open === p.id && <ul className="divide-y divide-line border-t border-line text-[13px]">{l!.items.map((x) => <li key={x.rateCardId} className="px-4 py-2"><div className="flex justify-between"><span>{fl.activity(x.activityId)}</span><span className="tnum">{f.money(x.amount)}</span></div><div className="text-[12px] text-muted">{t('mobile.m12.itemLine', { counted: f.number(x.counted), achieved: f.number(x.achieved), rate: f.money(x.rate), per: x.per, unit: x.unit })}</div>{x.notes.map((n, i) => <div key={i} className="text-[12px] text-warning">{t(n.key, n.params)}</div>)}</li>)}</ul>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MyScoreScreen() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const { agent } = useMobileAgent();
  const s = useMemo(() => (agent ? agentScore(agent) : null), [agent]);
  const model = agent ? modelFor(agent.orgId, agent.agentTypeId) : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m12.score')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        {!s || !model ? <p className="rounded-card border border-line px-4 py-6 text-center text-[14px] text-muted">{t('field.noScoreModel')}</p> : (
          <>
            <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft"><div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{t('mobile.m12.thisYear')}</div><div className="tnum mt-1 text-[34px] font-semibold">{f.number(s.total, { maximumFractionDigits: 1 })}<span className="text-[16px] text-white/70">{' / 100'}</span></div></div>
            <ul className="space-y-2">{model.components.map((c) => { const p = s.parts.find((x) => x.componentId === c.id); const pct = c.target ? Math.min(100, ((p?.value ?? 0) / c.target) * 100) : 0; return (
              <li key={c.id} className="rounded-card border border-line bg-surface p-3"><div className="flex justify-between text-[14px]"><span className="text-ink">{fl.activity(c.metric)}</span><span className="tnum font-medium">{`${f.number(p?.points ?? 0, { maximumFractionDigits: 1 })} / ${c.weight}`}</span></div><div className="mt-1 text-[12px] text-muted">{`${f.number(p?.value ?? 0, { maximumFractionDigits: 0 })} / ${f.number(c.target ?? 0)}`}</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div></li>
            ); })}</ul>
          </>
        )}
      </div>
    </div>
  );
}

export function MyReportsScreen() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const { orgId, userId } = useActor();
  const { agent } = useMobileAgent();
  const reports = useOrgRows(useFieldStore((s) => s.reports)).filter((r) => r.agentId === agent?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const blocks = agent ? agentBlocks(orgId, agent.id) : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m12.reports')} back />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-1">
        {blocks && (blocks.payouts || blocks.budgets) && <p className="rounded-card border border-danger/40 bg-danger/5 p-3 text-[14px]" role="alert">{t(blocks.payouts ? 'rep.effect.BLOCK_PAYOUTS' : 'rep.effect.BLOCK_BUDGETS')}</p>}
        {!reports.length && <p className="rounded-card border border-line px-4 py-6 text-center text-[14px] text-muted">{t('mobile.m12.noReports')}</p>}
        {reports.map((r) => (
          <div key={r.id} className="space-y-2 rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between"><span className="font-medium text-ink">{fl.issue(r.categoryId)?.name}</span><FieldStatus status={r.status} /></div>
            <p className="text-[14px] text-body">{r.reason}</p>
            <p className="text-[12px] text-muted">{`${r.number} · ${f.date(r.createdAt)}`}</p>
            {r.responses.map((x, i) => <p key={i} className="rounded-ctl bg-canvas px-3 py-2 text-[13px]">{x.text}</p>)}
            {r.resolution && <p className="text-[13px] text-success">{r.resolution.comment}</p>}
            {r.status !== 'RESOLVED' && (
              <div className="space-y-2">
                <textarea className="w-full rounded-ctl border border-line bg-surface p-3 text-[15px]" rows={2} placeholder={t('mobile.m12.respond')} aria-label={t('mobile.m12.respond')} value={answer[r.id] ?? ''} onChange={(e) => setAnswer({ ...answer, [r.id]: e.target.value })} />
                <Button size="sm" disabled={!answer[r.id]?.trim()} onClick={async () => { const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'reportResponse', label: t('mobile.m12.responseLabel', { number: r.number }), payload: { reportId: r.id, text: answer[r.id]!.trim() } }); toast.success(t(savedKey(queued))); setAnswer({ ...answer, [r.id]: '' }); }}>{t('mobile.m12.send')}</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MyNotificationsScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const all = useNotificationStore((s) => s.notifications);
  const { markRead, markAllRead } = useNotificationStore();
  const text = useNotificationText();
  const mine = all.filter((n) => n.userId === userId && n.orgId === orgId).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m12.notifications')} back right={mine.some((n) => !n.read) ? <Button size="sm" variant="ghost" onClick={() => markAllRead(userId ?? '', orgId)}>{t('mobile.m12.markAll')}</Button> : undefined} />
      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-1">
        {!mine.length ? <p className="rounded-card border border-line px-4 py-6 text-center text-[14px] text-muted">{t('mobile.m12.noNotifications')}</p> : (
          <MList>{mine.slice(0, 50).map((n) => <li key={n.id}><ListRow title={<span className={n.read ? 'text-body' : 'font-semibold text-ink'}>{text(n)}</span>} subtitle={f.dateTime(n.at)} onClick={() => { markRead(n.id); if (n.link?.startsWith('/m')) navigate(n.link); }} /></li>)}</MList>
        )}
      </div>
    </div>
  );
}

