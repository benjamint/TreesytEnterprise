import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, LayoutGrid, List, PiggyBank, Repeat, Send, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { BudgetRequest } from '@/types';
import type { WorkflowRecord } from '@/engines/workflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Field, TextAreaField } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { agentBlocks, budgetLimits, payBudget, budgetStage, grossOf, openRetirement, outstanding, overrideBudget, payProblem, refreshDeductions, retirementOf } from '@/services/fieldService';
import { cn } from '@/lib/utils';
import { toMinor } from '@/engines/money';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useCan, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { ApprovalTimeline, PaymentState, WorkflowButtons, mono, useWorkflowDef } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { AgentName, FieldStatus, useCfReason, useFieldLookups } from './shared';

const STAGES = ['SUBMITTED', 'MANAGER_APPROVED', 'EXTRA_APPROVED', 'APPROVED', 'PAYING', 'RETIREMENT_OPEN', 'CLOSED', 'ON_HOLD', 'REJECTED'] as const;

/** Budget requests (PRD J3): list or board by status, detail with trips and limits, approvals, deductions, pay or absorb. */
export function BudgetsPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const rows = useOrgRows(useFieldStore((s) => s.budgets));
  useFieldStore((s) => s.retirements);
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [agent, setAgent] = useState('');
  const [mode, setMode] = useState<'list' | 'board'>('list');
  const cats = settings.fieldTeam.costCategories;
  const query = q.trim().toLowerCase();
  const shown = rows.filter((b) => (!stage || budgetStage(b) === stage) && (!agent || b.agentId === agent) && (!query || [b.number, fl.agentName(b.agentId)].some((x) => x.toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const catTotal = (b: BudgetRequest, id: string) => b.trips.reduce((s, x) => s + (x.costs[id] ?? 0), 0);
  const columns = useMemo<ColumnDef<BudgetRequest, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'agent', header: t('col.agent'), accessorFn: (b) => fl.agentName(b.agentId), cell: (c) => <AgentName id={c.row.original.agentId} /> },
    { id: 'week', header: t('field.week'), accessorKey: 'weekStart', cell: (c) => f.date(c.getValue() as string, 'd MMM') },
    { id: 'trips', header: t('field.trips'), accessorFn: (b) => b.trips.length },
    ...cats.map((cat) => ({ id: cat.id, header: cat.name, accessorFn: (b: BudgetRequest) => catTotal(b, cat.id), cell: (c: { getValue: () => unknown }) => <span className="tnum">{f.money(c.getValue() as number)}</span> })),
    { id: 'total', header: t('field.total'), accessorFn: (b) => grossOf(b).amountMinor, cell: (c) => <span className="tnum font-medium text-ink">{f.money(grossOf(c.row.original))}</span> },
    { id: 'manager', header: t('field.managerDecision'), accessorFn: (b) => decision(b, 'mgr'), cell: (c) => <Decision v={c.getValue() as string} /> },
    { id: 'finance', header: t('field.financeDecision'), accessorFn: (b) => decision(b, 'fin'), cell: (c) => <Decision v={c.getValue() as string} /> },
    { id: 'stage', header: t('col.status'), accessorFn: (b) => budgetStage(b), cell: (c) => <FieldStatus status={c.getValue() as string} /> },
    { id: 'deductions', header: t('field.deductions'), accessorFn: (b) => b.deductions.reduce((s, d) => s + d.amountMinor, 0), cell: (c) => (c.getValue() as number) ? <span className="tnum text-danger">{`− ${f.money(c.getValue() as number)}`}</span> : <span className="text-muted">{'—'}</span> },
    { id: 'net', header: t('field.netPaid'), accessorFn: (b) => b.net.amountMinor, cell: (c) => <span className="tnum">{f.money(c.row.original.net)}</span> },
  ], [t, f, fl, cats]);
  const current = rows.find((b) => b.id === openId);
  const waitingMgr = rows.filter((b) => b.status === 'SUBMITTED').length;
  const waitingFin = rows.filter((b) => b.status === 'MANAGER_APPROVED' || b.status === 'EXTRA_APPROVED').length;
  const toPay = rows.filter((b) => b.status === 'APPROVED' && b.payStatus === 'UNPAID');
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.budgets')} description={t('pages.budgets')} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('field.waitingManager')} value={f.number(waitingMgr)} icon={PiggyBank} onClick={() => setStage('SUBMITTED')} />
        <StatCard label={t('field.waitingFinance')} value={f.number(waitingFin)} onClick={() => setStage('MANAGER_APPROVED')} />
        <StatCard label={t('field.toPay')} value={f.number(toPay.length)} hint={f.money(toPay.reduce((s, b) => s + b.net.amountMinor, 0))} icon={Wallet} onClick={() => setStage('APPROVED')} />
        <StatCard label={t('field.paidThisMonth')} value={f.money(rows.filter((b) => b.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, b) => s + b.net.amountMinor, 0))} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchBudgets')}
        views={[{ key: '', label: t('field.view.all'), active: !stage, onSelect: () => setStage(''), count: rows.length }, ...STAGES.map((s) => ({ key: s, label: t(`field.status.${s}`), active: stage === s, onSelect: () => setStage(s), count: rows.filter((b) => budgetStage(b) === s).length })).filter((v) => v.count)]}
        filters={[{ key: 'agent', label: t('col.agent'), value: agent, onChange: setAgent, options: [...new Set(rows.map((b) => b.agentId))].map((a) => ({ value: a, label: fl.agentName(a) })) }]}
        onClear={() => { setQ(''); setStage(''); setAgent(''); }}
        extra={<div className="flex rounded-ctl border border-line bg-surface p-0.5" role="group" aria-label={t('field.viewAs')}>{(['list', 'board'] as const).map((m) => { const I = m === 'list' ? List : LayoutGrid; return <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn('flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium', mode === m ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink')}><I className="h-4 w-4" /> {t(`field.mode.${m}`)}</button>; })}</div>} />
      {mode === 'list'
        ? <DataTable columns={columns} data={shown} onRowClick={(b) => open(b.id)} activeId={openId} getRowId={(b) => b.id} empty={t('field.noBudgets')} columnPicker
          exportCsv={{ fileName: 'budget-requests.csv', columns: [{ header: t('col.number'), value: (b) => b.number }, { header: t('col.agent'), value: (b) => fl.agentName(b.agentId) }, { header: t('field.week'), value: (b) => b.weekStart }, ...cats.map((c) => ({ header: c.name, value: (b: BudgetRequest) => catTotal(b, c.id) / 100 })), { header: t('field.total'), value: (b) => grossOf(b).amountMinor / 100 }, { header: t('field.deductions'), value: (b) => b.deductions.reduce((s, d) => s + d.amountMinor, 0) / 100 }, { header: t('field.netPaid'), value: (b) => b.net.amountMinor / 100 }, { header: t('col.status'), value: (b) => budgetStage(b) }] }} />
        : <Board rows={shown} onOpen={open} />}
      {current && <BudgetDrawer key={current.id} b={current} onClose={close} />}
    </>
  );
}

const decision = (b: BudgetRequest, step: string) => b.approvals.filter((a) => a.stepId === step).at(-1)?.decision ?? '';
function Decision({ v }: { v: string }) {
  const { t } = useT();
  return v ? <Badge tone={v === 'APPROVED' ? 'success' : v === 'REJECTED' ? 'danger' : 'warning'}>{t(`field.decision.${v}`)}</Badge> : <span className="text-muted">{'—'}</span>;
}

function Board({ rows, onOpen }: { rows: BudgetRequest[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const cols = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED', 'RETIREMENT_OPEN', 'CLOSED'] as const;
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5">
      {cols.map((c) => { const list = rows.filter((b) => budgetStage(b) === c || (c === 'MANAGER_APPROVED' && budgetStage(b) === 'EXTRA_APPROVED')); return (
        <section key={c} className="min-w-[220px] rounded-card border border-line bg-canvas p-2" aria-label={t(`field.status.${c}`)}>
          <h3 className="mb-2 flex items-center justify-between px-1 text-[13px] font-semibold text-ink">{t(`field.status.${c}`)}<span className="tnum text-muted">{list.length}</span></h3>
          <ul className="space-y-2">{list.slice(0, 20).map((b) => (
            <li key={b.id}><button type="button" onClick={() => onOpen(b.id)} className="w-full rounded-ctl border border-line bg-surface p-3 text-left shadow-soft hover:border-brand/40">
              <div className="font-mono text-[11px] text-muted">{b.number}</div>
              <div className="text-[14px] font-medium text-ink">{fl.agentName(b.agentId)}</div>
              <div className="mt-1 flex justify-between text-[12px] text-muted"><span>{f.date(b.weekStart, 'd MMM')}</span><span className="tnum text-ink">{f.money(b.net)}</span></div>
            </button></li>
          ))}</ul>
        </section>
      ); })}
    </div>
  );
}

function BudgetDrawer({ b, onClose }: { b: BudgetRequest; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const def = useWorkflowDef('weeklyBudget');
  const can = useCan();
  const plan = useFieldStore((s) => s.plans.find((p) => p.id === b.planId));
  useFieldStore((s) => s.carryForwards);
  useFieldStore((s) => s.reports);
  const cfReason = useCfReason();
  const [override, setOverride] = useState(false);
  const [paying, setPaying] = useState(false);
  const [absorbing, setAbsorbing] = useState(false);
  const limits = budgetLimits(b.orgId, b.trips);
  const blocks = agentBlocks(b.orgId, b.agentId);
  const prevOpen = openRetirement(b.agentId);
  const ret = b.retirementId ? retirementOf(b.retirementId) : undefined;
  const assigned = plan?.agentIds.includes(b.agentId);
  const problem = payProblem(b);
  const outstandingCfs = outstanding(b.agentId);
  const cats = settings.fieldTeam.costCategories;
  const startPay = () => {
    refreshDeductions(b.id);
    const fresh = useFieldStore.getState().budgets.find((x) => x.id === b.id)!;
    if (fresh.net.amountMinor <= 0) setAbsorbing(true); else setPaying(true);
  };
  return (
    <>
      <DetailDrawer open onClose={onClose} title={fl.agentName(b.agentId)} subtitle={`${b.number} · ${t('field.weekOf', { date: f.date(b.weekStart, 'd MMM yyyy') })}`}
        badges={<><FieldStatus status={budgetStage(b)} />{b.extraApproval ? <Badge tone="warning">{t('field.extraStep')}</Badge> : null}{blocks.flagged && <Badge tone="danger"><AlertTriangle className="h-3 w-3" /> {t('field.openReports')}</Badge>}</>}
        actions={<>
          {def && <WorkflowButtons docType="weeklyBudget" record={b as unknown as WorkflowRecord & { number: string }} def={def} />}
          {(b.status === 'MANAGER_APPROVED' || b.status === 'EXTRA_APPROVED') && can('budgets.approveFinance') && <Button size="sm" variant="secondary" onClick={() => setOverride(true)}>{t('field.overrideAmount')}</Button>}
          {b.status === 'APPROVED' && b.payStatus === 'UNPAID' && <PermissionGate permission="budgets.pay">
            <Button size="sm" disabled={!!problem} title={problem ? t(`field.err.${problem}`) : undefined} onClick={startPay}><Send /> {b.net.amountMinor <= 0 ? t('field.absorb') : t('field.payNet', { amount: f.money(b.net) })}</Button>
          </PermissionGate>}
        </>}
        tabs={[
          {
            key: 'details', label: t('field.tab.details'), content: (
              <div className="space-y-5">
                {problem === 'reportBlocksPayout' && b.status === 'APPROVED' && <p className="flex items-center gap-2 rounded-ctl border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-ink" role="alert"><AlertTriangle className="h-4 w-4 text-danger" /> {t('field.payBlocked', { category: blocks.payouts?.category?.name ?? '' })}</p>}
                <PaymentState payableId={b.id} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([[t('field.requested'), f.money(b.total)], [t('field.approvedAmount'), f.money(grossOf(b))], [t('field.deductions'), `− ${f.money(b.deductions.reduce((s, d) => s + d.amountMinor, 0))}`], [t('field.net'), f.money(b.net)]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[16px] font-semibold text-ink">{v}</div></div>)}
                </div>
                <div className="overflow-x-auto rounded-ctl border border-line">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-3 py-2 font-semibold">{t('col.date')}</th><th className="px-3 py-2 font-semibold">{t('col.community')}</th><th className="px-3 py-2 font-semibold">{t('field.activities')}</th>{cats.map((c) => <th key={c.id} className="px-3 py-2 text-right font-semibold">{c.name}</th>)}</tr></thead>
                    <tbody>{b.trips.map((tr) => (
                      <tr key={tr.id} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap px-3 py-2">{f.date(tr.date, 'EEE d MMM')}</td>
                        <td className="px-3 py-2">{lk.community(tr.communityId)}</td>
                        <td className="px-3 py-2 text-body">{tr.activities.map((a) => `${fl.activity(a.activityId)} ${a.target}`).join(' · ')}</td>
                        {cats.map((c) => { const over = (tr.costs[c.id] ?? 0) > c.maxPerDayMinor; return <td key={c.id} className={cn('tnum px-3 py-2 text-right', over && 'font-semibold text-danger')}>{tr.costs[c.id] ? f.money(tr.costs[c.id]!) : '—'}</td>; })}
                      </tr>
                    ))}</tbody>
                    <tfoot><tr className="bg-canvas text-[12px]"><td className="px-3 py-2 text-muted" colSpan={3}>{t('field.limitsWeek')}</td>{limits.map((l) => <td key={l.categoryId} className={cn('tnum px-3 py-2 text-right', l.overWeek ? 'font-semibold text-danger' : 'text-muted')}>{`${f.money(l.week)} / ${f.money(l.maxWeek)}`}</td>)}</tr></tfoot>
                  </table>
                </div>
                <ul className="space-y-1.5 text-[13px]">
                  <Check ok={!!assigned} label={assigned ? t('field.check.assigned', { number: plan?.number ?? '' }) : t('field.check.notAssigned')} />
                  <Check ok={!prevOpen || prevOpen.budgetId === b.id} label={!prevOpen || prevOpen.budgetId === b.id ? t('field.check.retired') : t('field.check.retirementOpen', { status: t(`field.status.${prevOpen.status}`) })} />
                  <Check ok={!blocks.budgets && !blocks.payouts} label={blocks.flagged ? t('field.check.reports', { count: [blocks.payouts, blocks.budgets, blocks.extra].filter(Boolean).length }) : t('field.check.noReports')} />
                  <Check ok={!limits.some((l) => l.overWeek || l.overDays.length)} label={t('field.check.limits')} />
                </ul>
                <Facts items={[
                  [t('field.wallet'), `${b.wallet.number} · ${b.wallet.name}`], [t('field.submitted'), `${f.dateTime(b.createdAt)}${b.device === 'mobile' ? ` · ${t('field.onPhone')}` : ''}`],
                  ...(b.overrideReason ? [[t('field.overrideReason'), b.overrideReason] as [string, string]] : []),
                  ...(b.paidAt ? [[t('field.paidOn'), f.dateTime(b.paidAt)] as [string, string]] : []),
                  ...(ret ? [[t('nav.retirements'), <Link key="r" to={`/app/retirements?open=${ret.id}`} className="text-link">{t(`field.status.${ret.status}`)}</Link>] as [string, React.ReactNode]] : []),
                ]} />
              </div>
            ),
          },
          {
            key: 'deductions', label: t('field.deductions'), count: b.deductions.length, content: (
              <div className="space-y-3">
                <p className="text-[13px] text-muted">{b.payStatus === 'UNPAID' ? t('field.deductionsPreview') : t('field.deductionsApplied')}</p>
                <ul className="divide-y divide-line rounded-ctl border border-line text-[14px]">
                  {(b.payStatus === 'UNPAID' ? outstandingCfs.map((c) => ({ c, amt: b.deductions.find((d) => d.carryForwardId === c.id)?.amountMinor ?? 0 })) : b.deductions.map((d) => ({ c: useFieldStore.getState().carryForwards.find((x) => x.id === d.carryForwardId)!, amt: d.amountMinor }))).filter((x) => x.c).map(({ c, amt }) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2"><span><span className="block text-ink">{t(`field.cfType.${c.type}`)}</span><span className="text-[12px] text-muted">{cfReason(c)}</span></span><span className="tnum text-danger">{`− ${f.money(amt)}`}</span></li>
                  ))}
                  {!b.deductions.length && !outstandingCfs.length && <li className="px-3 py-3 text-center text-muted">{t('field.noDeductions')}</li>}
                </ul>
                <Link to={`/app/carry-forwards?agent=${b.agentId}`} className="text-link text-[13px]"><Repeat className="mr-1 inline h-3.5 w-3.5" />{t('field.seeCarryForwards')}</Link>
              </div>
            ),
          },
          { key: 'approvals', label: t('field.tab.approvals'), content: def ? <ApprovalTimeline record={b as unknown as WorkflowRecord} def={def} /> : null },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="weeklyBudget" entityId={b.id} /> },
        ]} />
      {override && <OverrideDialog b={b} onClose={() => setOverride(false)} />}
      {paying && <PayDialog request={{ type: 'WEEKLY_BUDGET', payableId: b.id, title: t('field.payTitle', { number: b.number }), payees: [{ name: b.wallet.name, number: b.wallet.number, providerId: b.wallet.providerId, amount: useFieldStore.getState().budgets.find((x) => x.id === b.id)!.net, label: fl.agentName(b.agentId) }] }} onClose={() => setPaying(false)} />}
      {absorbing && <AbsorbDialog b={b} onClose={() => setAbsorbing(false)} />}
    </>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />}<span className={ok ? 'text-body' : 'font-medium text-ink'}>{label}</span></li>;
}

function OverrideDialog({ b, onClose }: { b: BudgetRequest; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const { userId } = useActor();
  const [amount, setAmount] = useState(String(grossOf(b).amountMinor / 100));
  const [reason, setReason] = useState('');
  const minor = toMinor(Number(amount) || 0, b.total.currency);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.overrideAmount')}</DialogTitle><DialogDescription>{t('field.overrideHint', { amount: f.money(b.total) })}</DialogDescription></DialogHeader>
        <Field label={t('field.approvedAmount')}><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('field.approvedAmount')} /></Field>
        <TextAreaField label={t('field.overrideReason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!reason.trim() || minor <= 0 || minor > b.total.amountMinor} onClick={() => { overrideBudget(b.id, minor, reason, userId ?? 'system'); toast.success(t('field.toast.overridden')); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AbsorbDialog({ b, onClose }: { b: BudgetRequest; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const { userId } = useActor();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.absorbTitle')}</DialogTitle><DialogDescription>{t('field.absorbBody', { amount: f.money(grossOf(b)) })}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); await payBudget(b.id, userId ?? 'system'); toast.success(t('field.toast.absorbed')); onClose(); }}>{t('field.absorb')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
