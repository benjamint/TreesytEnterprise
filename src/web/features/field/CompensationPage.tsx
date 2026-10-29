import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Check, CheckCheck, Coins, Download, Loader2, Pause, Plus, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CommissionLine, CommissionPeriod } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Field, TextAreaField } from '@/components/shared/Field';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable, downloadCsv } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { agentBlocks } from '@/services/fieldService';
import { approveLines, approveProblem, confirmPeriod, createCommissionPeriod, decideLine, payrollRows, windowOpen } from '@/services/teamService';
import { latency } from '@/lib/utils';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useCan, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { ActivityFeed } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { AgentName, FieldStatus, useFieldLookups } from './shared';

/** Commissions (PRD J9): periods with an approval window, lines from rate cards with eligibility notes, two approvals, confirm, pay or export. */
export function CompensationPage() {
  const { t } = useT();
  const f = useFormat();
  const rows = useOrgRows(useFieldStore((s) => s.commissions));
  const [openId, open, close] = useDrawerParam();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const shown = rows.filter((p) => (!status || p.status === status) && (!q.trim() || `${p.number} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => b.from.localeCompare(a.from));
  const total = (p: CommissionPeriod) => p.lines.filter((l) => l.status !== 'REJECTED').reduce((s, l) => s + l.total.amountMinor, 0);
  const columns = useMemo<ColumnDef<CommissionPeriod, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'name', header: t('field.periodName'), accessorKey: 'name', cell: (c) => <span className="font-medium capitalize text-ink">{c.getValue() as string}</span> },
    { id: 'dates', header: t('field.period'), accessorFn: (p) => p.from, cell: (c) => `${f.date(c.row.original.from, 'd MMM')} – ${f.date(c.row.original.to, 'd MMM yyyy')}` },
    { id: 'window', header: t('field.window'), accessorFn: (p) => p.window.closes, cell: (c) => { const p = c.row.original; return <span className="whitespace-nowrap">{`${f.date(p.window.opens, 'd MMM')} – ${f.date(p.window.closes, 'd MMM')}`}{p.status === 'IN_REVIEW' && <Badge tone={windowOpen(p) ? 'success' : 'danger'} className="ml-2">{windowOpen(p) ? t('field.windowOpen') : t('field.windowClosed')}</Badge>}</span>; } },
    { id: 'lines', header: t('field.lines'), accessorFn: (p) => p.lines.length },
    { id: 'approved', header: t('field.status.APPROVED'), accessorFn: (p) => p.lines.filter((l) => l.status === 'APPROVED').length },
    { id: 'total', header: t('field.total'), accessorFn: total, cell: (c) => <span className="tnum">{f.money({ amountMinor: c.getValue() as number, currency: c.row.original.currency })}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <FieldStatus status={c.getValue() as string} /> },
  ], [t, f]);
  const current = rows.find((p) => p.id === openId);
  const review = rows.filter((p) => p.status === 'IN_REVIEW');
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.compensation')} description={t('pages.compensation')}
        primary={<PermissionGate permission="compensation.create"><Button onClick={() => setCreating(true)}><Plus /> {t('field.newPeriod')}</Button></PermissionGate>} />
      <div className="mb-5 stat-strip grid gap-3 sm:grid-cols-3">
        <StatCard label={t('field.status.IN_REVIEW')} value={f.number(review.length)} hint={t('field.linesWaiting', { count: review.flatMap((p) => p.lines).filter((l) => l.status === 'PENDING' || l.status === 'FIRST_APPROVED').length })} icon={Coins} onClick={() => setStatus('IN_REVIEW')} />
        <StatCard label={t('field.status.CONFIRMED')} value={f.number(rows.filter((p) => p.status === 'CONFIRMED').length)} onClick={() => setStatus('CONFIRMED')} />
        <StatCard label={t('field.paidThisYear')} value={f.money(rows.filter((p) => p.from.slice(0, 4) === new Date().toISOString().slice(0, 4)).reduce((s, p) => s + p.lines.filter((l) => l.paid).reduce((a, l) => a + l.total.amountMinor, 0), 0))} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchPeriods')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...(['IN_REVIEW', 'CONFIRMED', 'PAID'] as const).map((s) => ({ key: s, label: t(`field.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((p) => p.status === s).length }))]} />
      <DataTable columns={columns} data={shown} onRowClick={(p) => open(p.id)} activeId={openId} getRowId={(p) => p.id} empty={t('field.noPeriods')} />
      {current && <PeriodDrawer key={current.id} p={current} onClose={close} />}
      {creating && <NewPeriodDialog onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function PeriodDrawer({ p, onClose }: { p: CommissionPeriod; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const can = useCan();
  const { userId } = useActor();
  useFieldStore((s) => s.reports);
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; decision: 'REJECTED' | 'ON_HOLD' } | null>(null);
  const [paying, setPaying] = useState(false);
  const me = userId ?? 'system';
  const firstable = p.lines.filter((l) => !approveProblem(p, l, 'first', me)).map((l) => l.id);
  const secondable = p.lines.filter((l) => !approveProblem(p, l, 'second', me)).map((l) => l.id);
  const run = (step: 'first' | 'second', ids: string[]) => {
    const r = approveLines(p.id, ids, step, me);
    if (r.ok.length) toast.success(t(step === 'first' ? 'field.toast.firstApproved' : 'field.toast.secondApproved', { count: r.ok.length }));
    if (r.blocked.length) toast.error(t(`field.err.${r.blocked[0]!.reason}`), { description: t('field.blockedN', { count: r.blocked.length }) });
    setSel([]);
  };
  const payable = p.lines.filter((l) => l.status === 'APPROVED' && !l.paid && l.total.amountMinor > 0);
  const blocked = payable.filter((l) => agentBlocks(p.orgId, l.agentId).payouts);
  const toPay = payable.filter((l) => !blocked.includes(l));
  const allDecided = p.lines.every((l) => l.status === 'APPROVED' || l.status === 'REJECTED');
  const exportPayroll = () => { const rows = payrollRows(p); downloadCsv(`payroll-${p.number}.csv`, [t('col.agent'), t('field.wallet'), t('field.amount'), t('field.reference'), t('field.paid')], rows.map((r) => [r.agent, r.wallet, r.amount, r.reference, r.paid])); };
  return (
    <>
      <DetailDrawer open onClose={onClose} title={<span className="capitalize">{p.name}</span>} subtitle={`${p.number} · ${f.date(p.from)} – ${f.date(p.to)}`}
        badges={<><FieldStatus status={p.status} />{p.status === 'IN_REVIEW' && <Badge tone={windowOpen(p) ? 'success' : 'danger'}><CalendarClock className="h-3 w-3" /> {windowOpen(p) ? t('field.windowUntil', { date: f.date(p.window.closes, 'd MMM') }) : t('field.windowClosed')}</Badge>}</>}
        actions={<>
          {firstable.length > 0 && <Button size="sm" onClick={() => run('first', sel.length ? sel.filter((x) => firstable.includes(x)) : firstable)}><Check /> {sel.length ? t('field.firstApproveSel', { count: sel.filter((x) => firstable.includes(x)).length }) : t('field.firstApproveAll', { count: firstable.length })}</Button>}
          {secondable.length > 0 && <Button size="sm" onClick={() => run('second', sel.length ? sel.filter((x) => secondable.includes(x)) : secondable)}><CheckCheck /> {sel.length ? t('field.secondApproveSel', { count: sel.filter((x) => secondable.includes(x)).length }) : t('field.secondApproveAll', { count: secondable.length })}</Button>}
          {p.status === 'IN_REVIEW' && allDecided && can('compensation.approveSecond') && <Button size="sm" variant="secondary" onClick={() => { confirmPeriod(p.id, me); toast.success(t('field.toast.confirmed')); }}>{t('field.confirmPeriod')}</Button>}
          {p.status === 'CONFIRMED' && toPay.length > 0 && <PermissionGate permission="compensation.pay"><Button size="sm" onClick={() => setPaying(true)}><Send /> {t('field.payN', { count: toPay.length })}</Button></PermissionGate>}
          {(p.status === 'CONFIRMED' || p.status === 'PAID') && <PermissionGate permission="compensation.export"><Button size="sm" variant="secondary" onClick={exportPayroll}><Download /> {t('field.exportPayroll')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'lines', label: t('field.lines'), count: p.lines.length, content: (
              <div className="space-y-3">
                <p className="text-[13px] text-muted">{t('field.twoApprovals')}</p>
                {blocked.length > 0 && <p className="rounded-ctl border border-danger/40 bg-danger/5 px-3 py-2 text-[13px]" role="alert">{t('field.blockedSkipped', { count: blocked.length })}</p>}
                <ul className="divide-y divide-line rounded-ctl border border-line">{p.lines.map((l) => <LineRow key={l.id} l={l} currency={p.currency} selected={sel.includes(l.id)} onSelect={(v) => setSel(v ? [...sel, l.id] : sel.filter((x) => x !== l.id))} open={open === l.id} onOpen={() => setOpen(open === l.id ? null : l.id)} canDecide={p.status === 'IN_REVIEW' && (can('compensation.approveFirst') || can('compensation.approveSecond'))} onDecide={(decision) => setDeciding({ id: l.id, decision })} />)}</ul>
              </div>
            ),
          },
          { key: 'details', label: t('field.tab.details'), content: <Facts items={[[t('field.period'), `${f.date(p.from)} – ${f.date(p.to)}`], [t('field.window'), `${f.date(p.window.opens)} – ${f.date(p.window.closes)}`], [t('field.created'), `${fl.user(p.createdBy)} · ${f.dateTime(p.createdAt)}`], ...(p.confirmedAt ? [[t('field.confirmedBy'), `${fl.user(p.confirmedBy ?? '')} · ${f.dateTime(p.confirmedAt)}`] as [string, string]] : [])]} /> },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="commission" entityId={p.id} /> },
        ]} />
      {deciding && <DecideDialog title={t(deciding.decision === 'REJECTED' ? 'field.rejectLine' : 'field.holdLine')} onClose={() => setDeciding(null)} onConfirm={(reason) => { try { decideLine(p.id, deciding.id, deciding.decision, reason, me); toast.success(t('field.toast.lineDecided')); } catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); } setDeciding(null); }} />}
      {paying && <PayDialog request={{ type: 'COMMISSION', payableId: p.id, title: t('field.payCommissionTitle', { number: p.number }), payees: toPay.map((l) => { const a = fl.agent(l.agentId)!; return { name: a.wallet.verifiedName, number: a.wallet.number, providerId: a.wallet.providerId, amount: l.total, payableId: `${p.id}#${l.id}`, label: fl.agentName(l.agentId) }; }) }} onClose={() => setPaying(false)} />}
    </>
  );
}

function LineRow({ l, currency, selected, onSelect, open, onOpen, canDecide, onDecide }: { l: CommissionLine; currency: string; selected: boolean; onSelect: (v: boolean) => void; open: boolean; onOpen: () => void; canDecide: boolean; onDecide: (d: 'REJECTED' | 'ON_HOLD') => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const notes = l.items.flatMap((x) => x.notes);
  return (
    <li className="px-3 py-2.5 text-[13px]">
      <div className="flex items-center gap-3">
        <Checkbox label={<span className="sr-only">{fl.agentName(l.agentId)}</span>} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        <button type="button" onClick={onOpen} aria-expanded={open} className="flex flex-1 items-center gap-3 text-left">
          <span className="flex-1"><AgentName id={l.agentId} />{notes.length > 0 && <Badge tone="warning" className="ml-2">{t('field.notesN', { count: notes.length })}</Badge>}</span>
          <span className="text-muted">{[l.first && t('field.firstBy', { name: fl.user(l.first.by) }), l.second && t('field.secondBy', { name: fl.user(l.second.by) })].filter(Boolean).join(' · ')}</span>
          <span className="tnum w-28 text-right font-semibold text-ink">{f.money(l.total)}</span>
          <FieldStatus status={l.paid ? 'PAID' : l.status} />
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2 pl-8">
          <table className="w-full"><thead><tr className="text-left text-[12px] text-label"><th className="py-1">{t('field.activity')}</th><th className="py-1 text-right">{t('field.achieved')}</th><th className="py-1 text-right">{t('field.counted')}</th><th className="py-1 text-right">{t('field.rate')}</th><th className="py-1 text-right">{t('field.amount')}</th></tr></thead>
            <tbody>{l.items.map((x) => <tr key={x.rateCardId} className="border-t border-line"><td className="py-1">{fl.activity(x.activityId)}</td><td className="tnum py-1 text-right">{f.number(x.achieved)}</td><td className="tnum py-1 text-right">{f.number(x.counted)}</td><td className="tnum py-1 text-right text-muted">{t('field.ratePer', { rate: f.money(x.rate), per: f.number(x.per), unit: x.unit })}</td><td className="tnum py-1 text-right">{f.money(x.amount)}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-line font-semibold"><td className="py-1" colSpan={4}>{t('field.total')}</td><td className="tnum py-1 text-right">{f.money({ amountMinor: l.total.amountMinor, currency })}</td></tr></tfoot></table>
          {notes.length > 0 && <ul className="space-y-1 rounded-ctl bg-warning/5 p-2 text-[12px] text-ink">{notes.map((n, i) => <li key={i}>{t(n.key, n.params)}</li>)}</ul>}
          {l.reason && <p className="text-[12px] text-muted">{t('field.reasonIs', { reason: l.reason })}</p>}
          {canDecide && l.status !== 'APPROVED' && l.status !== 'REJECTED' && <div className="flex gap-1.5"><Button size="xs" variant="secondary" onClick={() => onDecide('ON_HOLD')}><Pause /> {t('field.hold')}</Button><Button size="xs" variant="dangerOutline" onClick={() => onDecide('REJECTED')}><X /> {t('field.reject')}</Button></div>}
        </div>
      )}
    </li>
  );
}

function DecideDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t('dashboard.reasonBody')}</DialogDescription></DialogHeader>
        <TextAreaField label={t('field.reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPeriodDialog({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const { orgId, userId } = useActor();
  const d = new Date();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const [name, setName] = useState(d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const [closes, setCloses] = useState(new Date(Date.parse(`${last}T12:00:00Z`) + 10 * 86_400_000).toISOString().slice(0, 10));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const create = async () => {
    setProgress({ done: 0, total: 1 });
    await latency(300, 500);
    let p: CommissionPeriod;
    try { p = createCommissionPeriod({ orgId, name, from, to, window: { opens: new Date().toISOString().slice(0, 10), closes }, actorId: userId ?? 'system' }, (done, total) => setProgress({ done, total })); }
    catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); setProgress(null); return; }
    await latency(400, 600);
    toast.success(t('field.toast.periodCreated', { number: p.number, count: p.lines.length }));
    onClose(p.id);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !progress && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.newPeriod')}</DialogTitle><DialogDescription>{t('field.newPeriodHint')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('field.periodName')} className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('field.periodName')} /></Field>
          <Field label={t('field.from')}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('field.from')} /></Field>
          <Field label={t('field.to')}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('field.to')} /></Field>
          <Field label={t('field.windowCloses')} helper={t('field.windowHint')}><Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} aria-label={t('field.windowCloses')} /></Field>
        </div>
        {progress && <p className="flex items-center gap-2 text-[13px] text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t('field.generating', { done: progress.done, total: progress.total })}</p>}
        <DialogFooter><Button variant="secondary" disabled={!!progress} onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={!!progress || !name.trim() || from > to} onClick={() => void create()}>{t('field.generateLines')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
