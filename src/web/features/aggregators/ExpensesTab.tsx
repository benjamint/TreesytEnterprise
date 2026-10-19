import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, Pencil, Plus, Printer, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AggregatorExpense } from '@/types';
import { canAct, type WorkflowRecord } from '@/engines/workflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DataTable } from '@/components/shared/DataTable';
import { PermissionGate } from '@/components/shared/Gates';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { acspreTypes, canEditAggExpense, createAggExpense, payAggExpenseManual, updateAggExpense } from '@/services/aggregatorService';
import { inFlight } from '@/services/paymentService';
import { preLineCap } from '@/services/buyingService';
import { workflowUser } from '@/services/workflowService';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { AmountDialog, ApprovalTimeline, PaymentState, WorkflowButtons, mono, usePrintReceipt, useWorkflowDef } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { useSuppliers } from './shared';

type View = 'all' | 'mine' | 'pending' | 'toPay' | 'paid' | 'rejected';

/** Aggregator expenses (ACSPRE, PRD D4): logistics lines from the company catalogue, approved then paid. */
export function ExpensesTab() {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const sup = useSuppliers();
  const def = useWorkflowDef('aggregatorExpense');
  const rows = useOrgRows(useBuyingStore((s) => s.aggregatorExpenses));
  const acs = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AggregatorExpense | 'new' | null>(null);
  const acsById = useMemo(() => new Map(acs.map((a) => [a.id, a])), [acs]);
  const mine = useMemo(() => {
    if (!def || !userId) return new Set<string>();
    const u = workflowUser(userId, orgId);
    return new Set(rows.filter((e) => canAct(e as unknown as WorkflowRecord, def, u)).map((e) => e.id));
  }, [rows, def, userId, orgId]);
  const inView = (e: AggregatorExpense, v: View) =>
    v === 'all' || (v === 'mine' ? mine.has(e.id) : v === 'pending' ? !['APPROVED', 'REJECTED'].includes(e.status) : v === 'toPay' ? e.status === 'APPROVED' && e.paymentStatus !== 'PAID' : v === 'paid' ? e.paymentStatus === 'PAID' : e.status === 'REJECTED');
  const query = q.trim().toLowerCase();
  const shown = rows.filter((e) => inView(e, view) && (!query || e.number.toLowerCase().includes(query) || (acsById.get(e.aggregatorPurchaseId)?.number ?? '').toLowerCase().includes(query) || e.payee.name.toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<AggregatorExpense, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'acs', header: t('agg.col.reference'), accessorFn: (e) => acsById.get(e.aggregatorPurchaseId)?.number ?? '—', cell: (c) => mono(c.getValue() as string) },
    { id: 'supplier', header: t('agg.col.supplier'), accessorFn: (e) => sup.name(acsById.get(e.aggregatorPurchaseId)?.supplierId ?? '') },
    { id: 'bags', header: t('col.bags'), accessorKey: 'bags', cell: (c) => f.number(c.getValue() as number) },
    { id: 'lines', header: t('agg.lines'), accessorFn: (e) => e.lines.length },
    { id: 'total', header: t('col.total'), accessorFn: (e) => e.total.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.total)}</span> },
    { id: 'perBag', header: t('buy.costPerBag'), accessorFn: (e) => (e.bags ? e.total.amountMinor / e.bags : 0), cell: (c) => f.money({ amountMinor: Math.round(c.getValue() as number), currency: c.row.original.total.currency }) },
    { id: 'payee', header: t('col.payee'), accessorFn: (e) => e.payee.name },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'payment', header: t('buy.paymentStatus'), accessorKey: 'paymentStatus', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'created', header: t('buy.created'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
  ], [t, f, sup, acsById]);
  const current = rows.find((e) => e.id === openId);
  return (
    <>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('agg.searchExpenses')}
        views={(['all', 'mine', 'pending', 'toPay', 'paid', 'rejected'] as const).map((v) => ({ key: v, label: t(`agg.expView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((e) => inView(e, v)).length }))}
        onClear={() => { setQ(''); setView('all'); }}
        extra={<PermissionGate permission="aggregators.create"><Button size="sm" onClick={() => setEditing('new')}><Plus /> {t('agg.newExpense')}</Button></PermissionGate>}
      />
      <DataTable
        columns={columns}
        data={shown}
        onRowClick={(e) => open(e.id)}
        activeId={openId}
        getRowId={(e) => e.id}
        columnPicker
        initialHidden={['lines', 'created']}
        exportCsv={{ fileName: 'aggregator-expenses.csv', columns: [
          { header: t('col.number'), value: (e) => e.number }, { header: t('agg.col.reference'), value: (e) => acsById.get(e.aggregatorPurchaseId)?.number ?? '' }, { header: t('col.bags'), value: (e) => e.bags },
          { header: t('col.total'), value: (e) => e.total.amountMinor }, { header: t('col.status'), value: (e) => e.status }, { header: t('buy.paymentStatus'), value: (e) => e.paymentStatus },
        ] }}
        empty={view === 'mine' ? t('buy.emptyMine') : t('agg.emptyExpenses')}
      />
      {current && def && <ExpenseDrawer key={current.id} expense={current} onClose={close} onEdit={() => setEditing(current)} />}
      {editing && <AggExpenseSheet expense={editing === 'new' ? undefined : editing} onClose={(id) => { setEditing(null); if (id) open(id); }} />}
    </>
  );
}

function ExpenseDrawer({ expense: e, onClose, onEdit }: { expense: AggregatorExpense; onClose: () => void; onEdit: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sup = useSuppliers();
  const settings = useOrgSettings();
  const def = useWorkflowDef('aggregatorExpense')!;
  const a = useBuyingStore((s) => s.aggregatorPurchases.find((x) => x.id === e.aggregatorPurchaseId));
  const payments = usePaymentStore((s) => s.payments);
  const attempts = payments.filter((p) => p.payableId === e.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const [paying, setPaying] = useState(false);
  const [manual, setManual] = useState(false);
  const print = usePrintReceipt();
  const busy = inFlight(e.id) && attempts.some((p) => ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(p.status));
  const typeName = (id: string) => settings.expenseTypes.find((x) => x.id === id)?.name ?? id;
  const payable = e.status === 'APPROVED' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PENDING';
  const rows: [string, string][] = [
    [t('agg.col.reference'), a?.number ?? '—'], [t('agg.col.supplier'), sup.name(a?.supplierId ?? '')], [t('col.bags'), f.number(e.bags)],
    ...e.lines.map((l) => [`${typeName(l.expenseTypeId)} (${f.number(l.quantity)} × ${f.money(l.rate)})`, f.money(l.amount)] as [string, string]),
    [t('col.total'), f.money(e.total)], [t('col.payee'), `${e.payee.name} · ${e.payee.number}`],
  ];
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{e.number}</span>}
        subtitle={`${a?.number ?? ''} · ${sup.name(a?.supplierId ?? '')} · ${t('buy.bagsN', { count: e.bags })}`}
        badges={<><StatusBadge status={e.status} /><StatusBadge status={e.paymentStatus} /></>}
        actions={
          <>
            <PaymentState payableId={e.id} />
            <WorkflowButtons docType="aggregatorExpense" record={e as unknown as WorkflowRecord & { number: string }} def={def} />
            {canEditAggExpense(e) && <PermissionGate permission="aggregators.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('people.edit')}</Button></PermissionGate>}
            {payable && <PermissionGate permission="aggregators.disburse"><Button size="sm" disabled={busy} onClick={() => setPaying(true)}><Smartphone /> {t('buy.payMomo')}</Button></PermissionGate>}
            {payable && <PermissionGate permission="aggregators.disburse"><Button size="sm" variant="secondary" disabled={busy} onClick={() => setManual(true)}><Banknote /> {t('buy.manualDisbursement')}</Button></PermissionGate>}
            <Button size="sm" variant="ghost" onClick={() => print(t('docType.aggregatorExpense'), e.number, rows)}><Printer /> {t('buy.printReceipt')}</Button>
          </>
        }
        tabs={[
          {
            key: 'summary', label: t('buy.tab.summary'), content: (
              <div className="space-y-4">
                <table className="w-full text-[14px]">
                  <thead><tr className="border-b border-line text-left text-[12px] text-label"><th className="py-2 font-semibold">{t('buy.expenseType')}</th><th className="py-2 text-right font-semibold">{t('col.quantity')}</th><th className="py-2 text-right font-semibold">{t('buy.rate')}</th><th className="py-2 text-right font-semibold">{t('col.amount')}</th></tr></thead>
                  <tbody>
                    {e.lines.map((l, i) => {
                      const cap = preLineCap(settings, l.expenseTypeId);
                      return <tr key={i} className="border-b border-line"><td className="py-2 text-ink">{typeName(l.expenseTypeId)}{cap != null && l.amount.amountMinor >= cap && <Badge tone="warning" className="ml-2">{t('buy.capped')}</Badge>}</td><td className="tnum py-2 text-right">{f.number(l.quantity)}</td><td className="tnum py-2 text-right">{f.money(l.rate)}</td><td className="tnum py-2 text-right font-medium text-ink">{f.money(l.amount)}</td></tr>;
                    })}
                    <tr><td className="py-2 font-semibold text-ink" colSpan={3}>{t('col.total')}</td><td className="tnum py-2 text-right font-semibold text-ink">{f.money(e.total)}</td></tr>
                  </tbody>
                </table>
                <Facts items={[
                  [t('buy.costPerBag'), f.money({ amountMinor: Math.round(e.total.amountMinor / Math.max(1, e.bags)), currency: e.total.currency })], [t('col.payee'), `${e.payee.name} · ${e.payee.number}`],
                  [t('agg.col.reference'), a ? <Link key="a" to={`/app/aggregators?open=${a.id}`} className="font-mono text-brand hover:underline">{a.number}</Link> : '—'], [t('buy.created'), `${lk.user(e.createdBy)} · ${f.dateTime(e.createdAt)}`],
                ]} />
                {!canEditAggExpense(e) && e.status !== 'APPROVED' && e.status !== 'REJECTED' && <p className="text-[12px] text-muted">{t('buy.preLocked')}</p>}
              </div>
            ),
          },
          { key: 'approvals', label: t('buy.tab.approvals'), content: <ApprovalTimeline record={e as unknown as WorkflowRecord} def={def} /> },
          {
            key: 'payment', label: t('buy.tab.payment'), count: attempts.length, content: (
              <div className="space-y-3">
                {e.disbursement && <p className="text-[14px] text-ink">{t('buy.prePaidLine', { method: t(`buy.method.${e.disbursement.method}`), name: lk.user(e.disbursement.by), date: f.dateTime(e.disbursement.at) })}{e.disbursement.proof ? ` · ${e.disbursement.proof}` : ''}</p>}
                {attempts.length ? (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {attempts.map((p) => <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"><span className="font-mono text-ink">{p.reference}</span><StatusBadge status={p.status} /><span className="min-w-0 flex-1 truncate text-muted">{p.failureReason ?? ''}</span><span className="tnum text-ink">{f.money(p.amount)}</span><span className="text-muted">{f.dateTime(p.createdAt)}</span></li>)}
                  </ul>
                ) : !e.disbursement && <TabEmpty>{t('buy.noAttempts')}</TabEmpty>}
              </div>
            ),
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="aggregatorExpense" entityId={e.id} /> },
        ]}
      />
      {paying && <PayDialog request={{ type: 'AGGREGATOR_EXPENSE', payableId: e.id, title: t('agg.payExpenseTitle', { number: e.number }), payees: [{ name: e.payee.name, number: e.payee.number, providerId: e.payee.providerId, amount: e.total, label: t('col.payee') }] }} onClose={() => setPaying(false)} />}
      {manual && (
        <AmountDialog open onClose={() => setManual(false)} title={t('buy.manualTitle', { number: e.number })} description={t('buy.manualHint')} initialMinor={e.total.amountMinor} maxMinor={e.total.amountMinor} currency={e.total.currency} proof confirm={t('buy.markDisbursed')}
          onConfirm={(v) => { payAggExpenseManual(e.id, v.proof ?? '', userId ?? 'system'); setManual(false); toast.success(t('buy.toast.prePaidManual', { number: e.number })); }} />
      )}
    </>
  );
}

/** Create or edit an ACSPRE: aggregator purchase, bags, catalogue lines with caps, payee wallet. */
export function AggExpenseSheet({ expense, acsId, onClose }: { expense?: AggregatorExpense; acsId?: string; onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const sup = useSuppliers();
  const settings = useOrgSettings();
  const types = acspreTypes(settings);
  const acs = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const eligible = acs.filter((a) => ['APPROVED', 'PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'].includes(a.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [aggId, setAggId] = useState(expense?.aggregatorPurchaseId ?? acsId ?? eligible[0]?.id ?? '');
  const a = acs.find((x) => x.id === aggId);
  const [bags, setBags] = useState(String(expense?.bags ?? a?.expectedBags ?? 1));
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const [lines, setLines] = useState<{ expenseTypeId: string; quantity: string; rate: string }[]>(() => expense ? expense.lines.map((l) => ({ expenseTypeId: l.expenseTypeId, quantity: String(l.quantity), rate: String(l.rate.amountMinor / 10 ** dec) })) : []);
  const supplierOf = sup.get(a?.supplierId ?? '');
  const momo = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY' && p.enabled);
  const defaultPayee = supplierOf?.payout.method === 'MOMO' ? { name: supplierOf.name.toUpperCase(), providerId: supplierOf.payout.providerOrBank, number: supplierOf.payout.number } : { name: '', providerId: momo[0]?.id ?? '', number: '' };
  const [payee, setPayee] = useState(expense?.payee ?? defaultPayee);
  const n = Number(bags || 0);
  const qtyFor = (id: string) => { const x = types.find((e) => e.id === id); return x?.basis === 'PER_BAG' ? n : x?.basis === 'PER_KG' ? Math.round(a?.expectedKg ?? n * 85) : 1; };
  const add = (id: string) => { const x = types.find((e) => e.id === id)!; setLines([...lines, { expenseTypeId: id, quantity: String(qtyFor(id)), rate: String(x.defaultRate.amountMinor / 10 ** dec) }]); };
  const computed = lines.map((l) => {
    const rateMinor = Math.round(Number(l.rate || 0) * 10 ** dec);
    const raw = rateMinor * Number(l.quantity || 0);
    const cap = preLineCap(settings, l.expenseTypeId);
    return { ...l, rateMinor, amount: cap != null ? Math.min(cap, raw) : raw, capped: cap != null && raw > cap };
  });
  const total = computed.reduce((s, l) => s + l.amount, 0);
  const invalid = !a || !(n > 0) || !computed.length || computed.some((l) => !(Number(l.quantity) > 0) || !(l.rateMinor > 0)) || !payee.name.trim() || !payee.number.trim();
  const save = () => {
    if (invalid || !a) return;
    const payload = { bags: n, lines: computed.map((l) => ({ expenseTypeId: l.expenseTypeId, quantity: Number(l.quantity), rateMinor: l.rateMinor })), payee: { ...payee, name: payee.name.trim().toUpperCase() } };
    if (expense) {
      if (updateAggExpense(expense.id, payload, userId ?? 'system')) toast.success(t('buy.toast.preSaved', { number: expense.number }));
      else toast.error(t('buy.preLocked'));
      onClose(expense.id);
    } else {
      const e = createAggExpense({ orgId, aggregatorPurchaseId: a.id, ...payload, actorId: userId ?? 'system' });
      toast.success(t('agg.toast.expenseCreated', { number: e.number }), { description: t('dashboard.actedStatus', { status: t(`status.${e.status}`, { defaultValue: e.status }) }) });
      onClose(e.id);
    }
  };
  const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{expense ? t('buy.editPre', { number: expense.number }) : t('agg.newExpense')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('agg.col.reference')}>
              <select value={aggId} disabled={!!expense || !!acsId} onChange={(e) => { setAggId(e.target.value); const x = acs.find((y) => y.id === e.target.value); if (x) setBags(String(x.expectedBags)); }} aria-label={t('agg.col.reference')} className={select}>
                {eligible.map((x) => <option key={x.id} value={x.id}>{`${x.number} · ${x.poNumber} · ${sup.name(x.supplierId)}`}</option>)}
              </select>
            </Field>
            <Field label={t('buy.numberOfBags')}><Input compact type="number" min={1} value={bags} onChange={(e) => setBags(e.target.value)} aria-label={t('buy.numberOfBags')} /></Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-[15px] font-semibold text-ink">{t('buy.expenseLines')}</h3>
              <select value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label={t('buy.addLine')} className="h-10 max-w-[60%] rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
                <option value="">{t('agg.addLineCount', { count: types.length })}</option>
                {types.filter((x) => !lines.some((l) => l.expenseTypeId === x.id)).map((x) => <option key={x.id} value={x.id}>{`${x.name} · ${t(`buy.basis.${x.basis}`)}`}</option>)}
              </select>
            </div>
            {computed.length ? (
              <ul className="space-y-2">
                {computed.map((l, i) => {
                  const x = settings.expenseTypes.find((e) => e.id === l.expenseTypeId)!;
                  return (
                    <li key={i} className="rounded-ctl border border-line p-3">
                      <div className="flex items-center justify-between gap-2"><span className="text-[14px] font-medium text-ink">{x.name}</span><span className="flex items-center gap-2"><span className="text-[12px] text-muted">{t(`buy.basis.${x.basis}`)}</span><Button variant="ghost" size="iconSm" aria-label={t('set.remove')} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button></span></div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Input compact type="number" value={l.quantity} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, quantity: e.target.value } : y)))} aria-label={`${x.name} ${t('col.quantity')}`} />
                        <Input compact type="number" value={l.rate} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, rate: e.target.value } : y)))} aria-label={`${x.name} ${t('buy.rate')}`} />
                        <div className={cn('flex h-11 items-center justify-end rounded-ctl bg-canvas px-3 tnum text-[14px] font-medium', l.capped ? 'text-warning' : 'text-ink')}>{f.money({ amountMinor: l.amount, currency: f.org.currency })}</div>
                      </div>
                      {l.capped && x.cap && <p className="mt-1 text-[12px] text-warning">{t('buy.capHint', { cap: f.money(x.cap) })}</p>}
                    </li>
                  );
                })}
              </ul>
            ) : <TabEmpty>{t('buy.noLines')}</TabEmpty>}
          </div>
          <section className="space-y-3 rounded-card border border-line p-4">
            <h3 className="text-[15px] font-semibold text-ink">{t('col.payee')}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('buy.walletName')}><Input value={payee.name} onChange={(e) => setPayee({ ...payee, name: e.target.value })} aria-label={t('buy.walletName')} /></Field>
              <Field label={t('agg.network')}><select value={payee.providerId} onChange={(e) => setPayee({ ...payee, providerId: e.target.value })} aria-label={t('agg.network')} className={select}>{momo.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label={t('buy.walletNumber')}><Input type="tel" value={payee.number} onChange={(e) => setPayee({ ...payee, number: e.target.value })} aria-label={t('buy.walletNumber')} /></Field>
            </div>
            {supplierOf && supplierOf.payout.method === 'MOMO' && <p className="text-[12px] text-muted">{t('agg.payeeDefault')}</p>}
          </section>
          <div className="flex items-center justify-between rounded-ctl bg-canvas px-4 py-3 text-[14px]"><span className="text-muted">{t('col.total')}{n > 0 && total > 0 && <span className="ml-2 text-[12px]">{t('agg.perBagShort', { amount: f.money({ amountMinor: Math.round(total / n), currency: f.org.currency }) })}</span>}</span><span className="tnum text-[20px] font-semibold text-ink">{f.money({ amountMinor: total, currency: f.org.currency })}</span></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={save}>{expense ? t('common.save') : t('buy.submit')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
