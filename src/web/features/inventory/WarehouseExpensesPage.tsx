import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, Plus, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { WarehouseExpense } from '@/types';
import type { WorkflowRecord } from '@/engines/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { createWarehouseExpense, expensePayStatus, payWarehouseExpenseManual, unpaidLines } from '@/services/inventoryService';
import { detectProvider } from '@/services/paymentService';
import { usePaymentStore } from '@/stores/paymentStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { ApprovalTimeline, ProofPicker, WorkflowButtons, mono, useWorkflowDef } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { useInventory } from './shared';

/** Warehouse expenses (PRD H5): handling and maintenance lines, approval route, payment per line. */
export function WarehouseExpensesPage() {
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const lang = useLang();
  const settings = useOrgSettings();
  const rows = useOrgRows(useWarehouseStore((s) => s.warehouseExpenses));
  const def = useWorkflowDef('warehouseExpense');
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<'all' | 'approval' | 'toPay' | 'paid' | 'rejected'>('all');
  const [q, setQ] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [creating, setCreating] = useState(false);
  const typeName = (id: string) => { const x = settings.inventoryRules.expenseTypes?.find((e) => e.id === id); return x ? x.name[lang] ?? x.name.en ?? id : id; };
  const inView = (e: WarehouseExpense, v: typeof view) => v === 'all' || (v === 'approval' ? !['APPROVED', 'REJECTED'].includes(e.status) : v === 'toPay' ? e.status === 'APPROVED' && e.paymentStatus !== 'FULL' : v === 'paid' ? e.paymentStatus === 'FULL' : e.status === 'REJECTED');
  const query = q.trim().toLowerCase();
  const shown = rows.filter((e) => inView(e, view) && (!warehouse || e.warehouseId === warehouse) && (!query || e.number.toLowerCase().includes(query) || (e.description ?? '').toLowerCase().includes(query))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<WarehouseExpense, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'warehouse', header: t('inv.warehouse'), accessorFn: (e) => inv.warehouseName(e.warehouseId) },
    { id: 'description', header: t('inv.description'), accessorFn: (e) => e.description ?? '' },
    { id: 'lines', header: t('inv.lines'), accessorFn: (e) => e.lines.map((l) => typeName(l.typeId)).join(', ') },
    { id: 'total', header: t('col.total'), accessorFn: (e) => e.total.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.total)}</span> },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'payment', header: t('inv.payment'), accessorFn: expensePayStatus, cell: (c) => (c.row.original.status === 'REJECTED' ? <span className="text-muted">{'—'}</span> : <StatusBadge status={`WP_${c.getValue() as string}`} />) },
  ], [t, f, inv]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = rows.find((e) => e.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.warehouseExpenses')} description={t('inv.expensesHint', { count: def?.steps.length ?? 0 })}
        primary={<PermissionGate permission="warehouseExpenses.create"><Button onClick={() => setCreating(true)}><Plus /> {t('inv.newExpense')}</Button></PermissionGate>} />
      <FilterBar search={q} onSearch={setQ} placeholder={t('inv.searchExpenses')}
        views={(['all', 'approval', 'toPay', 'paid', 'rejected'] as const).map((v) => ({ key: v, label: t(`inv.eView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((e) => inView(e, v)).length }))}
        filters={[{ key: 'warehouse', label: t('inv.warehouse'), value: warehouse, onChange: setWarehouse, options: inv.warehouses.map((w) => ({ value: w.id, label: w.name })) }]}
        onClear={() => { setQ(''); setWarehouse(''); setView('all'); }} />
      <DataTable columns={columns} data={shown} onRowClick={(e) => open(e.id)} activeId={openId} getRowId={(e) => e.id} empty={t('inv.noExpenses')}
        exportCsv={{ fileName: 'warehouse-expenses.csv', columns: [{ header: t('col.number'), value: (e) => e.number }, { header: t('inv.warehouse'), value: (e) => inv.warehouseName(e.warehouseId) }, { header: t('col.total'), value: (e) => e.total.amountMinor }, { header: t('col.status'), value: (e) => e.status }, { header: t('inv.payment'), value: expensePayStatus }] }} />
      {current && def && <ExpenseDrawer key={current.id} expense={current} typeName={typeName} onClose={close} />}
      {creating && <NewExpenseSheet typeName={typeName} onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function ExpenseDrawer({ expense: e, typeName, onClose }: { expense: WarehouseExpense; typeName: (id: string) => string; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const lk = useLookups();
  const def = useWorkflowDef('warehouseExpense')!;
  const payments = usePaymentStore((s) => s.payments).filter((p) => p.payableId.startsWith(`${e.id}#`));
  const [dialog, setDialog] = useState<'momo' | 'manual' | null>(null);
  const unpaid = unpaidLines(e);
  const busy = payments.some((p) => ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(p.status) && unpaid.some((l) => p.payableId === `${e.id}#${l.index}`));
  return (
    <>
      <DetailDrawer open onClose={onClose} title={e.number} subtitle={`${inv.warehouseName(e.warehouseId)}${e.description ? ` · ${e.description}` : ''}`} badges={<><StatusBadge status={e.status} />{e.status !== 'REJECTED' && <StatusBadge status={`WP_${expensePayStatus(e)}`} />}</>}
        actions={<>
          {e.wf && <WorkflowButtons docType="warehouseExpense" record={e as unknown as WorkflowRecord & { number: string }} def={def} />}
          {e.status === 'APPROVED' && unpaid.length > 0 && <PermissionGate permission="warehouseExpenses.disburse"><span className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => setDialog('momo')}><Smartphone /> {t('inv.payMomo', { count: unpaid.length })}</Button><Button size="sm" variant="secondary" onClick={() => setDialog('manual')}><Banknote /> {t('buy.markDisbursed')}</Button></span></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'lines', label: t('inv.lines'), count: e.lines.length, content: (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-ctl border border-line">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-3 py-2 font-semibold">{t('inv.expenseType')}</th><th className="px-3 py-2 text-right font-semibold">{t('col.quantity')}</th><th className="px-3 py-2 text-right font-semibold">{t('inv.rate')}</th><th className="px-3 py-2 text-right font-semibold">{t('col.amount')}</th><th className="px-3 py-2 font-semibold">{t('inv.payee')}</th><th className="px-3 py-2 font-semibold">{t('inv.payment')}</th></tr></thead>
                    <tbody>{e.lines.map((l, i) => <tr key={i} className="border-b border-line last:border-0"><td className="px-3 py-2 text-ink">{typeName(l.typeId)}</td><td className="tnum px-3 py-2 text-right">{`${f.number(l.quantity)} ${t(`inv.basis.${l.basis}`)}`}</td><td className="tnum px-3 py-2 text-right">{f.money(l.rate)}</td><td className="tnum px-3 py-2 text-right font-medium">{f.money(l.amount)}</td><td className="px-3 py-2"><span className="block text-ink">{l.payee.name}</span><span className="text-muted">{l.payee.number}</span></td><td className="px-3 py-2"><StatusBadge status={l.paid ? 'PAID' : 'NOT_PAID'} /></td></tr>)}</tbody>
                  </table>
                </div>
                <Facts items={[[t('col.total'), f.money(e.total)], [t('buy.created'), `${lk.user(e.createdBy)} · ${f.dateTime(e.createdAt)}${e.device === 'mobile' ? ` · ${t('sup.fromPhone')}` : ''}`]]} />
              </div>
            ),
          },
          { key: 'approvals', label: t('buy.tab.approvals'), content: e.wf ? <ApprovalTimeline record={e as unknown as WorkflowRecord} def={def} /> : <TabEmpty>{t('inv.noApprovals')}</TabEmpty> },
          {
            key: 'payments', label: t('sup.tabPayments'), count: e.disbursements.length, content: e.disbursements.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line">{e.disbursements.map((d) => <li key={d.id} className="flex items-center justify-between px-4 py-3 text-[14px]"><span><span className="block font-medium text-ink">{d.lineIndex != null ? `${typeName(e.lines[d.lineIndex]?.typeId ?? '')} · ${e.lines[d.lineIndex]?.payee.name ?? ''}` : '—'}</span><span className="text-[12px] text-muted">{t(`buy.method.${d.method}`)} · {f.dateTime(d.at)} · {lk.user(d.by)}{d.proof ? ` · ${d.proof}` : ''}</span></span><span className="tnum font-medium text-ink">{f.money(d.amount)}</span></li>)}</ul>
            ) : <TabEmpty>{t('inv.noPayments')}</TabEmpty>,
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="warehouseExpense" entityId={e.id} /> },
        ]} />
      {dialog === 'momo' && <PayDialog request={{ type: 'WAREHOUSE_EXPENSE', payableId: e.id, title: t('inv.payTitle', { number: e.number }), payees: unpaid.map((l) => ({ name: l.payee.name, number: l.payee.number, providerId: l.payee.providerId, amount: l.amount, payableId: `${e.id}#${l.index}`, label: typeName(l.typeId) })) }} onClose={() => setDialog(null)} />}
      {dialog === 'manual' && <ManualPayDialog expense={e} typeName={typeName} onClose={() => setDialog(null)} onPaid={(n) => toast.success(t('inv.toast.linesPaid', { count: n, number: e.number }))} actorId={userId ?? 'system'} />}
    </>
  );
}

function ManualPayDialog({ expense: e, typeName, onClose, onPaid, actorId }: { expense: WarehouseExpense; typeName: (id: string) => string; onClose: () => void; onPaid: (n: number) => void; actorId: string }) {
  const { t } = useT();
  const f = useFormat();
  const unpaid = unpaidLines(e);
  const [picked, setPicked] = useState<number[]>(unpaid.map((l) => l.index));
  const [proof, setProof] = useState<string | undefined>();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('buy.manualTitle', { number: e.number })}</DialogTitle><DialogDescription>{t('inv.manualHint')}</DialogDescription></DialogHeader>
        <ul className="divide-y divide-line rounded-ctl border border-line">{unpaid.map((l) => <li key={l.index}><label className="flex items-center gap-3 px-3 py-2.5 text-[14px]"><input type="checkbox" checked={picked.includes(l.index)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, l.index] : picked.filter((x) => x !== l.index))} /><span className="flex-1">{typeName(l.typeId)} · {l.payee.name}</span><span className="tnum font-medium">{f.money(l.amount)}</span></label></li>)}</ul>
        <ProofPicker value={proof} onChange={setProof} />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!picked.length || !proof} onClick={() => { payWarehouseExpenseManual(e.id, picked, proof!, actorId); onPaid(picked.length); onClose(); }}>{t('buy.markDisbursed')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewExpenseSheet({ typeName, onClose }: { typeName: (id: string) => string; onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const settings = useOrgSettings();
  const types = settings.inventoryRules.expenseTypes ?? [];
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const [warehouseId, setWarehouseId] = useState(inv.warehouses[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([{ typeId: types[0]?.id ?? '', quantity: '', rate: String((types[0]?.defaultRateMinor ?? 0) / 10 ** dec), name: '', number: '' }]);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + Math.round(Number(l.rate || 0) * 10 ** dec) * Number(l.quantity || 0), 0);
  const invalid = !warehouseId || lines.some((l) => !l.typeId || !(Number(l.quantity) > 0) || !(Number(l.rate) > 0) || !l.name.trim() || !l.number.trim());
  const save = () => {
    const e = createWarehouseExpense({
      orgId, warehouseId, description: description.trim() || undefined, actorId: userId ?? 'system', device: 'web',
      lines: lines.map((l) => ({ typeId: l.typeId, quantity: Number(l.quantity), rateMinor: Math.round(Number(l.rate) * 10 ** dec), payee: { name: l.name.trim().toUpperCase(), number: l.number.trim(), providerId: detectProvider(orgId, l.number.trim())?.id ?? '' } })),
    });
    toast.success(t('inv.toast.expenseCreated', { number: e.number }), { description: t('dashboard.actedStatus', { status: t(`status.${e.status}`) }) });
    onClose(e.id);
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('inv.newExpense')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label={t('inv.warehouse')}><select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} aria-label={t('inv.warehouse')} className={select}>{inv.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <Field label={t('inv.description')}><Input value={description} onChange={(e) => setDescription(e.target.value)} aria-label={t('inv.description')} /></Field>
          {lines.map((l, i) => {
            const type = types.find((x) => x.id === l.typeId);
            return (
              <div key={i} className="space-y-3 rounded-card border border-line p-4">
                <div className="flex items-center justify-between"><span className="eyebrow">{t('inv.lineN', { n: i + 1 })}</span>{lines.length > 1 && <Button variant="ghost" size="iconSm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={t('set.remove')}><Trash2 /></Button>}</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t('inv.expenseType')}><select value={l.typeId} onChange={(e) => { const nt = types.find((x) => x.id === e.target.value); set(i, { typeId: e.target.value, rate: String((nt?.defaultRateMinor ?? 0) / 10 ** dec) }); }} aria-label={t('inv.expenseType')} className={select}>{types.map((x) => <option key={x.id} value={x.id}>{typeName(x.id)}</option>)}</select></Field>
                  <Field label={`${t('col.quantity')} (${t(`inv.basis.${type?.basis ?? 'FLAT'}`)})`}><Input type="number" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} aria-label={t('col.quantity')} /></Field>
                  <Field label={t('inv.rateIn', { currency: f.org.currency })}><Input type="number" value={l.rate} onChange={(e) => set(i, { rate: e.target.value })} aria-label={t('inv.rate')} /></Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('inv.payeeName')}><Input value={l.name} onChange={(e) => set(i, { name: e.target.value })} aria-label={t('inv.payeeName')} /></Field>
                  <Field label={t('inv.payeeWallet')}><Input value={l.number} inputMode="tel" onChange={(e) => set(i, { number: e.target.value })} aria-label={t('inv.payeeWallet')} /></Field>
                </div>
              </div>
            );
          })}
          <Button variant="ghost" size="sm" onClick={() => setLines([...lines, { typeId: types[0]?.id ?? '', quantity: '', rate: String((types[0]?.defaultRateMinor ?? 0) / 10 ** dec), name: '', number: '' }])}><Plus /> {t('inv.addLine')}</Button>
          <div className="flex items-center justify-between rounded-ctl bg-canvas px-4 py-3 text-[14px]"><span className="text-muted">{t('col.total')}</span><span className="tnum text-[20px] font-semibold text-ink">{f.money({ amountMinor: total, currency: f.org.currency })}</span></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4"><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('buy.submit')}</Button></div>
      </SheetContent>
    </Sheet>
  );
}
