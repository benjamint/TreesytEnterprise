import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Check, FileImage, ReceiptText, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Retirement } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Field } from '@/components/shared/Field';
import { FilePick } from '@/components/shared/FilePick';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { budgetOf, confirmRefund, retirementSummary, reviewReceipts } from '@/services/fieldService';
import { toMinor } from '@/engines/money';
import { cn } from '@/lib/utils';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { ActivityFeed } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { AgentName, FieldStatus, useFieldLookups } from './shared';

const STATUSES = ['PENDING_SUBMISSION', 'PENDING_REVIEW', 'PENDING_RESUBMISSION', 'AWAITING_REFUND', 'RETIRED'] as const;

/** Retirements (PRD J4): receipts per category, approve / reject in one batch, unused funds and refunds. */
export function RetirementsPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const rows = useOrgRows(useFieldStore((s) => s.retirements));
  const budgets = useFieldStore((s) => s.budgets);
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const num = (r: Retirement) => budgets.find((b) => b.id === r.budgetId)?.number ?? '';
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!status || r.status === status) && (!query || [num(r), fl.agentName(r.agentId)].some((x) => x.toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<Retirement, unknown>[]>(() => [
    { id: 'number', header: t('field.request'), accessorFn: num, cell: (c) => mono(c.getValue() as string) },
    { id: 'agent', header: t('col.agent'), accessorFn: (r) => fl.agentName(r.agentId), cell: (c) => <AgentName id={c.row.original.agentId} /> },
    { id: 'gross', header: t('field.gross'), accessorFn: (r) => r.gross.amountMinor, cell: (c) => <span className="tnum">{f.money(c.row.original.gross)}</span> },
    { id: 'fuel', header: fl.category('cc_fuel'), accessorFn: (r) => r.receipts.filter((x) => x.categoryId === 'cc_fuel').reduce((s, x) => s + x.amountMinor, 0), cell: (c) => <span className="tnum">{f.money(c.getValue() as number)}</span> },
    { id: 'receipts', header: t('field.receipts'), accessorFn: (r) => r.receipts.length, cell: (c) => { const r = c.row.original; const rej = r.receipts.filter((x) => x.status === 'REJECTED').length; return <span>{r.receipts.length}{rej > 0 && <Badge tone="danger" className="ml-1.5">{t('field.rejectedN', { count: rej })}</Badge>}</span>; } },
    { id: 'approved', header: t('field.approvedAmount'), accessorFn: (r) => retirementSummary(r).approved, cell: (c) => <span className="tnum">{f.money(c.getValue() as number)}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <FieldStatus status={c.getValue() as string} /> },
    { id: 'cf', header: t('field.carryForward'), accessorFn: (r) => (r.carryForwardId ? 1 : 0), cell: (c) => (c.row.original.carryForwardId ? <Badge tone="warning">{t('field.cfCreated')}</Badge> : <span className="text-muted">{'—'}</span>) },
  ], [t, f, fl, budgets]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = rows.find((r) => r.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.retirements')} description={t('pages.retirements')} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('field.status.PENDING_REVIEW')} value={f.number(rows.filter((r) => r.status === 'PENDING_REVIEW').length)} icon={ReceiptText} onClick={() => setStatus('PENDING_REVIEW')} />
        <StatCard label={t('field.status.PENDING_SUBMISSION')} value={f.number(rows.filter((r) => r.status === 'PENDING_SUBMISSION').length)} onClick={() => setStatus('PENDING_SUBMISSION')} />
        <StatCard label={t('field.status.AWAITING_REFUND')} value={f.number(rows.filter((r) => r.status === 'AWAITING_REFUND').length)} onClick={() => setStatus('AWAITING_REFUND')} />
        <StatCard label={t('field.duplicates')} value={f.number(rows.flatMap((r) => r.receipts).filter((x) => x.duplicateOf && x.status === 'PENDING').length)} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchRetirements')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...STATUSES.map((s) => ({ key: s, label: t(`field.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((r) => r.status === s).length }))]}
        onClear={() => { setQ(''); setStatus(''); }} />
      <DataTable columns={columns} data={shown} onRowClick={(r) => open(r.id)} activeId={openId} getRowId={(r) => r.id} empty={t('field.noRetirements')}
        exportCsv={{ fileName: 'retirements.csv', columns: [{ header: t('field.request'), value: num }, { header: t('col.agent'), value: (r) => fl.agentName(r.agentId) }, { header: t('field.gross'), value: (r) => r.gross.amountMinor / 100 }, { header: t('field.approvedAmount'), value: (r) => retirementSummary(r).approved / 100 }, { header: t('col.status'), value: (r) => r.status }] }} />
      {current && <RetirementDrawer key={current.id} r={current} onClose={close} />}
    </>
  );
}

function RetirementDrawer({ r, onClose }: { r: Retirement; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const { userId } = useActor();
  const s = retirementSummary(r);
  const b = budgetOf(r.budgetId);
  const pending = s.live.filter((x) => x.status === 'PENDING');
  const [decisions, setDecisions] = useState<Record<string, { approve: boolean; reason?: string }>>({});
  const [refund, setRefund] = useState(false);
  const all = Object.keys(decisions).length === pending.length && pending.length > 0;
  const missingReason = Object.values(decisions).some((d) => !d.approve && !d.reason?.trim());
  const save = () => {
    try { reviewReceipts(r.id, decisions, userId ?? 'system'); toast.success(t('field.toast.reviewed')); setDecisions({}); }
    catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); }
  };
  return (
    <>
      <DetailDrawer open onClose={onClose} title={fl.agentName(r.agentId)} subtitle={`${b.number} · ${t('field.weekOf', { date: f.date(b.weekStart, 'd MMM yyyy') })}`}
        badges={<FieldStatus status={r.status} />}
        actions={<>
          {pending.length > 0 && <PermissionGate permission="retirements.review"><Button size="sm" variant="secondary" onClick={() => setDecisions(Object.fromEntries(pending.map((x) => [x.id, { approve: true }])))}><Check /> {t('field.approveAll')}</Button></PermissionGate>}
          {r.status === 'AWAITING_REFUND' && <PermissionGate permission="retirements.confirmRefund"><Button size="sm" onClick={() => setRefund(true)}>{t('field.confirmRefund')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'receipts', label: t('field.receipts'), count: s.live.length, content: (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([[t('field.gross'), r.gross.amountMinor], [t('field.approvedAmount'), s.approved], [s.pending ? t('field.inReview') : t('field.unused'), s.pending || s.unused], [t('field.unaccounted'), s.unaccounted]] as [string, number][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[18px] font-semibold text-ink">{f.money(v)}</div></div>)}
                </div>
                {s.byCat.map((c) => (
                  <section key={c.categoryId}>
                    <h4 className="mb-2 flex items-center justify-between text-[13px] font-semibold text-ink"><span>{c.name}</span><span className="tnum font-normal text-muted">{c.receiptRequired ? t('field.catLine', { budgeted: f.money(c.budgeted), submitted: f.money(c.submitted) }) : t('field.noReceiptNeeded', { amount: f.money(c.budgeted) })}</span></h4>
                    {c.receiptRequired && (
                      <ul className="grid gap-2 sm:grid-cols-2">{s.live.filter((x) => x.categoryId === c.categoryId).map((x) => {
                        const d = decisions[x.id];
                        return (
                          <li key={x.id} className={cn('rounded-ctl border p-2.5', x.status === 'REJECTED' ? 'border-danger/40' : x.status === 'APPROVED' ? 'border-success/40' : 'border-line')}>
                            <div className="flex gap-3">
                              <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded-[6px] bg-canvas text-muted" aria-hidden><FileImage className="h-5 w-5" /></div>
                              <div className="min-w-0 flex-1 text-[13px]">
                                <div className="tnum font-semibold text-ink">{f.money(x.amountMinor)}</div>
                                <div className="text-muted">{`${f.date(x.date)} · ${x.file}`}</div>
                                {x.replaces && <Badge tone="info" className="mt-1">{t('field.resubmitted')}</Badge>}
                                {x.duplicateOf && <Badge tone="warning" className="mt-1"><AlertTriangle className="h-3 w-3" /> {t('field.possibleDuplicate')}</Badge>}
                                {x.status !== 'PENDING' && <div className="mt-1"><FieldStatus status={x.status === 'APPROVED' ? 'APPROVED' : 'REJECTED'} />{x.reason && <span className="ml-1.5 text-muted">{x.reason}</span>}</div>}
                              </div>
                            </div>
                            {x.status === 'PENDING' && (
                              <PermissionGate permission="retirements.review"><div>
                                <div className="mt-2 flex gap-1.5">
                                  <Button size="xs" variant={d?.approve === true ? 'primary' : 'secondary'} onClick={() => setDecisions({ ...decisions, [x.id]: { approve: true } })} aria-pressed={d?.approve === true}><Check /> {t('field.approve')}</Button>
                                  <Button size="xs" variant={d?.approve === false ? 'danger' : 'secondary'} onClick={() => setDecisions({ ...decisions, [x.id]: { approve: false, reason: d?.reason } })} aria-pressed={d?.approve === false}><X /> {t('field.reject')}</Button>
                                </div>
                                {d?.approve === false && <Input className="mt-2 h-9" placeholder={t('field.rejectReason')} value={d.reason ?? ''} onChange={(e) => setDecisions({ ...decisions, [x.id]: { approve: false, reason: e.target.value } })} aria-label={t('field.rejectReason')} />}
                              </div></PermissionGate>
                            )}
                          </li>
                        );
                      })}</ul>
                    )}
                  </section>
                ))}
                {r.status === 'PENDING_SUBMISSION' && <TabEmpty>{t('field.waitingReceipts')}</TabEmpty>}
                {pending.length > 0 && (
                  <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-ctl border border-line bg-surface p-3 shadow-soft">
                    <span className="text-[13px] text-muted">{t('field.decidedOf', { n: Object.keys(decisions).length, total: pending.length })}</span>
                    <Button size="sm" disabled={!all || missingReason} onClick={save}>{t('field.saveReview')}</Button>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'unused', label: t('field.unusedFunds'), content: (
              <div className="space-y-3">
                {r.unused ? <Facts items={[[t('field.unused'), f.money(r.unused.amountMinor)], [t('field.reason'), r.unused.reason], [t('field.declared'), f.dateTime(r.unused.at)], [t('field.refunded'), f.money(s.refunded)]]} /> : <TabEmpty>{t('field.noUnused')}</TabEmpty>}
                {r.refunds.length > 0 && <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{r.refunds.map((x) => <li key={x.id} className="flex justify-between px-3 py-2"><span>{`${fl.user(x.by)} · ${f.dateTime(x.at)}${x.proof ? ` · ${x.proof}` : ''}`}</span><span className="tnum">{f.money(x.amountMinor)}</span></li>)}</ul>}
              </div>
            ),
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="retirement" entityId={r.id} /> },
        ]} />
      {refund && <RefundDialog r={r} onClose={() => setRefund(false)} />}
    </>
  );
}

function RefundDialog({ r, onClose }: { r: Retirement; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const { userId } = useActor();
  const s = retirementSummary(r);
  const due = Math.max(0, s.unused - s.refunded);
  const [amount, setAmount] = useState(String(due / 100));
  const [proof, setProof] = useState<string>();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.confirmRefund')}</DialogTitle><DialogDescription>{t('field.refundHint', { amount: f.money(due) })}</DialogDescription></DialogHeader>
        <Field label={t('field.amount')}><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('field.amount')} /></Field>
        <FilePick label={t('field.proof')} value={proof} onChange={setProof} sample="momo-refund.jpg" />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!(Number(amount) > 0)} onClick={() => { confirmRefund(r.id, toMinor(Number(amount), r.gross.currency), proof, userId ?? 'system'); toast.success(t('field.toast.refund')); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
