import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Banknote, CheckCheck, PackageCheck, Plus, Printer, Smartphone, Truck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AggregatorPurchase } from '@/types';
import { canAct, type WorkflowRecord } from '@/engines/workflow';
import { aggResult, toCompany } from '@/engines/aggregators';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { PermissionGate } from '@/components/shared/Gates';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import {
  aggListPrice, canDisburse, canLoad, createAggregatorPurchase, disburseAggregatorManual, markAggReconciled, poTaken, recordAggRefund, recordDelivery, recordProof,
  remainingToPay, supplierApproved, supplierPayee,
} from '@/services/aggregatorService';
import { inFlight } from '@/services/paymentService';
import { workflowUser } from '@/services/workflowService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, DocumentsPanel, useLookups } from '@/web/features/people/shared';
import { AmountDialog, ApprovalTimeline, Panel, PaymentState, PriceCompare, WorkflowButtons, mono, usePrintReceipt, useWorkflowDef } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { Bars, FileSlot, Stat, useSuppliers } from './shared';
import { SupplierSheet, supplierBadge } from './SuppliersTab';
import { AggExpenseSheet } from './ExpensesTab';

type View = 'all' | 'mine' | 'toPay' | 'inTransit' | 'toReconcile' | 'closed';
/** Suggested deal-currency rates (company currency per unit); always editable on the order. */
const FX_HINT: Record<string, Record<string, number>> = { GHS: { USD: 15.2, EUR: 16.5 }, XOF: { USD: 605, EUR: 655.957 } };

export function PurchasesTab() {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sup = useSuppliers();
  const settings = useOrgSettings();
  const def = useWorkflowDef('aggregatorPurchase');
  const rows = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const memberships = useAccessStore((s) => s.memberships);
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [supplier, setSupplier] = useState('');
  const [order, setOrder] = useState('');
  const [payment, setPayment] = useState('');
  const [creating, setCreating] = useState(false);
  useDemoNotes([{ id: 'acs', key: 'demo.note.aggregators' }]);
  const cur = f.org.currency;
  const companyTotal = (a: AggregatorPurchase) => toCompany(a.total, a.exchangeRate, cur);

  const mine = useMemo(() => {
    if (!def || !userId) return new Set<string>();
    const u = workflowUser(userId, orgId);
    return new Set(rows.filter((a) => canAct(a as unknown as WorkflowRecord, def, u)).map((a) => a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, def, userId, orgId, memberships]);
  const inView = (a: AggregatorPurchase, v: View) =>
    v === 'all' ? true : v === 'mine' ? mine.has(a.id) : v === 'toPay' ? canDisburse(a) : v === 'inTransit' ? a.orderStatus === 'IN_TRANSIT'
      : v === 'toReconcile' ? a.orderStatus === 'DELIVERED' && a.paymentStatus !== 'RECONCILED' : a.paymentStatus === 'RECONCILED' || a.status === 'REJECTED';
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => rows
    .filter((a) => inView(a, view) && (!status || a.status === status) && (!supplier || a.supplierId === supplier) && (!order || a.orderStatus === order) && (!payment || a.paymentStatus === payment) &&
      (!query || a.number.toLowerCase().includes(query) || a.poNumber.toLowerCase().includes(query) || sup.name(a.supplierId).toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, view, status, supplier, order, payment, query, sup, mine]);

  const columns = useMemo<ColumnDef<AggregatorPurchase, unknown>[]>(() => [
    { id: 'number', header: t('agg.col.reference'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'po', header: t('agg.col.po'), accessorKey: 'poNumber', cell: (c) => mono(c.getValue() as string) },
    { id: 'supplier', header: t('agg.col.supplier'), accessorFn: (a) => sup.name(a.supplierId), cell: (c) => <span className="flex items-center gap-2 text-ink">{c.getValue() as string}{supplierBadge(sup.get(c.row.original.supplierId), t)}</span> },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (a) => lk.commodity(a.commodityId) },
    { id: 'planned', header: t('buy.plannedDate'), accessorKey: 'plannedDate', cell: (c) => f.date(c.getValue() as string) },
    { id: 'perBag', header: t('agg.col.perBag'), accessorKey: 'weightPerBagKg', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'bags', header: t('agg.col.bags'), accessorKey: 'expectedBags', cell: (c) => f.number(c.getValue() as number) },
    { id: 'volume', header: t('agg.col.volume'), accessorKey: 'expectedKg', cell: (c) => <span className="tnum">{f.kg(c.getValue() as number)}<span className="ml-1 text-[12px] text-muted">{`· ${f.number((c.getValue() as number) / 1000, { maximumFractionDigits: 1 })} t`}</span></span> },
    { id: 'unitPrice', header: t('col.unitPrice'), accessorFn: (a) => a.unitPrice.amountMinor, cell: (c) => f.money(c.row.original.unitPrice) },
    { id: 'total', header: t('col.total'), accessorFn: (a) => companyTotal(a).amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.total)}{c.row.original.dealCurrency !== cur && <span className="block text-[12px] font-normal text-muted">{f.money(companyTotal(c.row.original))}</span>}</span> },
    { id: 'currency', header: t('agg.col.deal'), accessorFn: (a) => (a.dealCurrency === cur ? a.dealCurrency : `${a.dealCurrency} @ ${a.exchangeRate}`) },
    { id: 'pre', header: t('agg.col.includesPre'), accessorKey: 'includesPre', cell: (c) => (c.getValue() ? t('common.yes') : t('common.no')) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'order', header: t('agg.col.order'), accessorKey: 'orderStatus', cell: (c) => (c.getValue() === 'NONE' ? <span className="text-muted">{'—'}</span> : <StatusBadge status={c.getValue() as string} />) },
    { id: 'payment', header: t('agg.col.payment'), accessorKey: 'paymentStatus', cell: (c) => (c.getValue() === 'NONE' ? <span className="text-muted">{'—'}</span> : <StatusBadge status={c.getValue() as string} />) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, lk, sup, cur]);

  const openRows = rows.filter((a) => a.status !== 'REJECTED' && a.paymentStatus !== 'RECONCILED');
  const statuses = def?.statuses ?? [];
  const current = rows.find((a) => a.id === openId);
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('agg.stat.open')} value={f.number(openRows.length)} hint={f.money({ amountMinor: openRows.reduce((s, a) => s + companyTotal(a).amountMinor, 0), currency: cur }, { compact: true })} onClick={() => setView('all')} active={view === 'all'} />
        <Stat label={t('buy.stat.mine')} value={f.number(mine.size)} onClick={() => setView('mine')} active={view === 'mine'} />
        <Stat label={t('agg.stat.toPay')} value={f.number(rows.filter((a) => canDisburse(a)).length)} hint={f.money({ amountMinor: rows.filter((a) => canDisburse(a)).reduce((s, a) => s + remainingToPay(a), 0), currency: cur }, { compact: true })} onClick={() => setView('toPay')} active={view === 'toPay'} />
        <Stat label={t('agg.stat.toReconcile')} value={f.number(rows.filter((a) => inView(a, 'toReconcile')).length)} onClick={() => setView('toReconcile')} active={view === 'toReconcile'} />
      </div>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('agg.searchPurchases')}
        views={(['all', 'mine', 'toPay', 'inTransit', 'toReconcile', 'closed'] as const).map((v) => ({ key: v, label: t(`agg.view.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((a) => inView(a, v)).length }))}
        filters={[
          { key: 'status', label: t('col.status'), value: status, onChange: setStatus, options: statuses.filter((s) => rows.some((a) => a.status === s)).map((s) => ({ value: s, label: t(`status.${s}`, { defaultValue: s }) })) },
          { key: 'supplier', label: t('agg.col.supplier'), value: supplier, onChange: setSupplier, options: sup.list.map((s) => ({ value: s.id, label: s.name })).sort((a, b) => a.label.localeCompare(b.label)) },
          { key: 'order', label: t('agg.col.order'), value: order, onChange: setOrder, options: (['IN_TRANSIT', 'DELIVERED'] as const).map((s) => ({ value: s, label: t(`status.${s}`) })) },
          { key: 'payment', label: t('agg.col.payment'), value: payment, onChange: setPayment, options: (['FULFILLED', 'RECEIVE_REFUND', 'REFUND_SUPPLIER', 'RECONCILED'] as const).map((s) => ({ value: s, label: t(`status.${s}`) })) },
        ]}
        onClear={() => { setQ(''); setStatus(''); setSupplier(''); setOrder(''); setPayment(''); setView('all'); }}
        extra={<PermissionGate permission="aggregators.create"><Button size="sm" onClick={() => setCreating(true)}><Plus /> {t('agg.newPurchase')}</Button></PermissionGate>}
      />
      <DataTable
        columns={columns}
        data={shown}
        onRowClick={(a) => open(a.id)}
        activeId={openId}
        getRowId={(a) => a.id}
        columnPicker
        initialHidden={['perBag', 'planned', 'currency', 'pre']}
        exportCsv={{ fileName: 'aggregator-purchases.csv', columns: [
          { header: t('agg.col.reference'), value: (a) => a.number }, { header: t('agg.col.po'), value: (a) => a.poNumber }, { header: t('agg.col.supplier'), value: (a) => sup.name(a.supplierId) },
          { header: t('col.commodity'), value: (a) => lk.commodity(a.commodityId) }, { header: t('agg.col.bags'), value: (a) => a.expectedBags }, { header: t('agg.col.volume'), value: (a) => a.expectedKg },
          { header: t('col.unitPrice'), value: (a) => a.unitPrice.amountMinor }, { header: t('col.total'), value: (a) => a.total.amountMinor }, { header: t('agg.col.deal'), value: (a) => `${a.dealCurrency} ${a.exchangeRate}` },
          { header: t('col.status'), value: (a) => a.status }, { header: t('agg.col.order'), value: (a) => a.orderStatus }, { header: t('agg.col.payment'), value: (a) => a.paymentStatus },
        ] }}
        empty={view === 'mine' ? t('buy.emptyMine') : t('agg.emptyPurchases')}
      />
      {current && def && <AcsDrawer key={current.id} acs={current} onClose={close} />}
      {creating && <AcsSheet settingsCommodities={settings.commodities.map((c) => c.id)} onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

/** Create an aggregator purchase (PRD D4): supplier (or a new one inline), unique PO, volumes, price from the list, deal currency, files. */
function AcsSheet({ onClose, settingsCommodities }: { onClose: (id?: string) => void; settingsCommodities: string[] }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const org = useCurrentOrg();
  const settings = useOrgSettings();
  const sup = useSuppliers();
  const currencies = [org.currency, ...['USD', 'EUR'].filter((c) => c !== org.currency)];
  const usable = sup.list.filter((s) => s.status !== 'BLOCKED').sort((a, b) => a.name.localeCompare(b.name));
  const [supplierId, setSupplierId] = useState(usable.find((s) => s.status === 'APPROVED')?.id ?? '');
  const [newSupplier, setNewSupplier] = useState(false);
  const [po, setPo] = useState('');
  const [commodityId, setCommodityId] = useState(settingsCommodities[0] ?? '');
  const pack = settings.packaging.find((p) => p.commodityId === commodityId);
  const [planned, setPlanned] = useState(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
  const [bags, setBags] = useState('100');
  const [perBag, setPerBag] = useState(String(pack ? Math.round((pack.minKg + pack.maxKg) / 2) : 85));
  const [kgEdit, setKgEdit] = useState<string | null>(null);
  const [currency, setCurrency] = useState(org.currency);
  const [rate, setRate] = useState('1');
  const [price, setPrice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [includesPre, setIncludesPre] = useState(false);
  const [poFile, setPoFile] = useState<string | undefined>();
  const [weighbridge, setWeighbridge] = useState<string | undefined>();
  const [error, setError] = useState('');
  const kg = kgEdit != null ? Number(kgEdit || 0) : Number(bags || 0) * Number(perBag || 0);
  const list = aggListPrice(orgId, commodityId);
  const listEntry = settings.priceList.find((p) => p.commodityId === commodityId);
  const fx = currency === org.currency ? 1 : Number(rate || 0);
  const dealDec = currency === 'XOF' ? 0 : 2;
  const listInDeal = list && fx ? toCompany(list, 1 / fx, currency) : undefined;
  const priceStr = price ?? (listInDeal ? String(listInDeal.amountMinor / 10 ** dealDec) : '');
  const priceMinor = Math.round(Number(priceStr || 0) * 10 ** dealDec);
  const variance = listInDeal?.amountMinor ? ((priceMinor - listInDeal.amountMinor) / listInDeal.amountMinor) * 100 : 0;
  const beyond = !!listEntry && Math.abs(variance) > listEntry.tolerancePct;
  const commodity = settings.commodities.find((c) => c.id === commodityId);
  const belowThreshold = !!commodity?.aggregatorThresholdKg && kg > 0 && kg < commodity.aggregatorThresholdKg;
  const poDup = !!po.trim() && poTaken(orgId, po);
  const total = { amountMinor: Math.round(priceMinor * kg), currency };
  const invalid = !supplierId || !po.trim() || poDup || !(kg > 0) || !(priceMinor > 0) || !(fx > 0) || (beyond && !reason.trim()) || !poFile;
  const selected = sup.get(supplierId);
  useEffect(() => { if (pack) setPerBag(String(Math.round((pack.minKg + pack.maxKg) / 2))); setPrice(null); }, [commodityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    if (invalid) return;
    try {
      const a = createAggregatorPurchase({
        orgId, supplierId, poNumber: po, commodityId, plannedDate: planned, expectedBags: Number(bags || 0), weightPerBagKg: Number(perBag || 0), expectedKg: kg,
        unitPriceMinor: priceMinor, dealCurrency: currency, exchangeRate: fx, includesPre, overrideReason: beyond ? reason : undefined, poFile, weighbridgeFile: weighbridge, actorId: userId ?? 'system',
      });
      toast.success(t('agg.toast.created', { number: a.number }), { description: t('dashboard.actedStatus', { status: t(`status.${a.status}`, { defaultValue: a.status }) }) });
      onClose(a.id);
    } catch (e) { setError(t(`agg.err.${(e as Error).message}`)); }
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
          <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('agg.newPurchase')}</SheetTitle></div>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <Field label={t('agg.col.supplier')}>
              <div className="flex gap-2">
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label={t('agg.col.supplier')} className={select}>
                  <option value="">{t('agg.pickSupplier')}</option>
                  {usable.map((s) => <option key={s.id} value={s.id}>{s.status === 'APPROVED' ? s.name : `${s.name} · ${t(`status.${s.status}`)}`}</option>)}
                </select>
                <PermissionGate permission="aggregators.create"><Button variant="secondary" onClick={() => setNewSupplier(true)}><Plus /> {t('agg.newSupplierShort')}</Button></PermissionGate>
              </div>
              {selected && selected.status !== 'APPROVED' && <p className="mt-1.5 text-[13px] text-warning">{t('agg.supplierPendingHint')}</p>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('agg.col.po')} error={poDup ? t('agg.err.poTaken') : undefined}><Input value={po} onChange={(e) => setPo(e.target.value)} placeholder="PO-04291" aria-label={t('agg.col.po')} /></Field>
              <Field label={t('col.commodity')}>
                <select value={commodityId} onChange={(e) => setCommodityId(e.target.value)} aria-label={t('col.commodity')} className={select}>
                  {settingsCommodities.map((c) => <option key={c} value={c}>{lk.commodity(c)}</option>)}
                </select>
              </Field>
              <Field label={t('buy.plannedDate')}><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} aria-label={t('buy.plannedDate')} /></Field>
              <Field label={t('agg.col.bags')}><Input type="number" min={1} value={bags} onChange={(e) => { setBags(e.target.value); setKgEdit(null); }} aria-label={t('agg.col.bags')} /></Field>
              <Field label={t('agg.weightPerBag')} helper={pack ? t('agg.packRange', { name: pack.name, min: pack.minKg, max: pack.maxKg }) : undefined}><Input type="number" min={1} value={perBag} onChange={(e) => { setPerBag(e.target.value); setKgEdit(null); }} aria-label={t('agg.weightPerBag')} /></Field>
              <Field label={t('agg.expectedVolume')} helper={t('agg.tonnes', { t: f.number(kg / 1000, { maximumFractionDigits: 2 }) })}><Input type="number" min={1} value={kgEdit ?? String(kg)} onChange={(e) => setKgEdit(e.target.value)} aria-label={t('agg.expectedVolume')} /></Field>
            </div>
            {belowThreshold && <p className="flex items-start gap-2 rounded-ctl border border-info/30 bg-info/5 px-3 py-2 text-[13px] text-ink"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-info" />{t('agg.belowThreshold', { kg: f.kg(commodity!.aggregatorThresholdKg) })}</p>}
            <section className="space-y-3 rounded-card border border-line p-4">
              <h3 className="text-[14px] font-semibold text-ink">{t('agg.priceAndCurrency')}</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t('agg.dealCurrency')}>
                  <select value={currency} onChange={(e) => { setCurrency(e.target.value); setRate(String(FX_HINT[org.currency]?.[e.target.value] ?? 1)); setPrice(null); }} aria-label={t('agg.dealCurrency')} className={select}>
                    {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label={t('agg.exchangeRate')} helper={currency !== org.currency ? t('agg.rateHint', { deal: currency, company: org.currency }) : undefined}><Input type="number" step="0.0001" min={0} value={currency === org.currency ? '1' : rate} disabled={currency === org.currency} onChange={(e) => { setRate(e.target.value); setPrice(null); }} aria-label={t('agg.exchangeRate')} /></Field>
                <Field label={t('agg.pricePerKg', { currency })}><Input type="number" step={dealDec ? '0.01' : '1'} value={priceStr} onChange={(e) => setPrice(e.target.value)} aria-label={t('agg.pricePerKg', { currency })} /></Field>
              </div>
              <p className={cn('rounded-ctl px-3 py-2 text-[13px]', beyond ? 'bg-warning/10 text-ink' : 'bg-canvas text-body')}>
                {list ? t('agg.listHint', { price: f.money(list), pct: listEntry?.tolerancePct ?? 0 }) : t('buy.noListPrice')}
                {beyond && <span className="mt-1 flex items-center gap-1.5 text-warning"><AlertTriangle className="h-4 w-4" />{t('buy.beyondTolerance', { pct: f.number(variance, { maximumFractionDigits: 1 }) })}</span>}
              </p>
              {beyond && <Field label={t('buy.overrideReason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('buy.overrideReason')} /></Field>}
              <Checkbox label={t('agg.includesPre')} description={t('agg.includesPreHint')} checked={includesPre} onChange={(e) => setIncludesPre(e.target.checked)} />
            </section>
            <div className="grid gap-4 sm:grid-cols-2">
              <FileSlot label={t('agg.poFile')} value={poFile} onChange={setPoFile} sample={`${po.trim() || 'PO'}.pdf`} />
              <FileSlot label={t('agg.weighbridgeReport')} value={weighbridge} onChange={setWeighbridge} optional sample="weighbridge-report.pdf" />
            </div>
            <div className="flex items-baseline justify-between rounded-ctl bg-canvas px-4 py-3">
              <span className="text-[14px] text-muted">{t('col.total')}</span>
              <span className="text-right"><span className="tnum block text-[20px] font-semibold text-ink">{f.money(total)}</span>{currency !== org.currency && <span className="tnum text-[13px] text-muted">{f.money(toCompany(total, fx, org.currency))}</span>}</span>
            </div>
            {error && <p className="text-[14px] text-danger" role="alert">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
            <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
            <Button disabled={invalid} onClick={save}>{t('buy.submit')}</Button>
          </div>
        </SheetContent>
      </Sheet>
      {newSupplier && <SupplierSheet onClose={(id) => { setNewSupplier(false); if (id) setSupplierId(id); }} />}
    </>
  );
}

type DialogKind = 'momo' | 'manual' | 'load' | 'proof' | 'refund' | 'refundMomo' | 'expense' | null;

function AcsDrawer({ acs: a, onClose }: { acs: AggregatorPurchase; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sup = useSuppliers();
  const settings = useOrgSettings();
  const def = useWorkflowDef('aggregatorPurchase')!;
  const payments = usePaymentStore((s) => s.payments);
  const allExpenses = useBuyingStore((s) => s.aggregatorExpenses);
  const expenses = useMemo(() => allExpenses.filter((e) => e.aggregatorPurchaseId === a.id), [allExpenses, a.id]);
  const attempts = useMemo(() => payments.filter((p) => p.payableId === a.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)), [payments, a.id]);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const print = usePrintReceipt();
  const s = sup.get(a.supplierId);
  const cur = f.org.currency;
  const r = aggResult(a, settings.buyingRules, cur);
  const money = (v: number) => f.money({ amountMinor: v, currency: cur });
  const busy = inFlight(a.id) && attempts.some((p) => ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(p.status));
  const approvedSupplier = supplierApproved(a);
  const pay = canDisburse(a);
  const contract = toCompany(a.total, a.exchangeRate, cur);
  const receipt: [string, string][] = [
    [t('agg.col.po'), a.poNumber], [t('agg.col.supplier'), s?.name ?? '—'], [t('col.commodity'), lk.commodity(a.commodityId)], [t('agg.col.bags'), f.number(a.expectedBags)],
    [t('agg.col.volume'), f.kg(a.expectedKg)], [t('col.unitPrice'), f.money(a.unitPrice)], [t('col.total'), f.money(a.total)],
    ...(a.dealCurrency !== cur ? [[t('agg.inCompany', { currency: cur }), `${f.money(contract)} @ ${a.exchangeRate}`] as [string, string]] : []),
    ...a.disbursements.map((d, i) => [t('buy.tranche', { n: i + 1 }), `${f.money(d.amount)} · ${t(`buy.method.${d.method}`)} · ${f.date(d.at)}`] as [string, string]),
  ];
  const actions = (
    <>
      <PaymentState payableId={a.id} />
      <WorkflowButtons docType="aggregatorPurchase" record={a as unknown as WorkflowRecord & { number: string }} def={def} />
      {pay && <PermissionGate permission="aggregators.disburse"><Button size="sm" disabled={busy || !approvedSupplier} onClick={() => setDialog('momo')}><Smartphone /> {t('agg.paySupplier')}</Button></PermissionGate>}
      {pay && <PermissionGate permission="aggregators.disburse"><Button size="sm" variant="secondary" disabled={busy || !approvedSupplier} onClick={() => setDialog('manual')}><Banknote /> {t('buy.manualDisbursement')}</Button></PermissionGate>}
      {canLoad(a) && <PermissionGate permission="aggregators.edit"><Button size="sm" variant="secondary" onClick={() => setDialog('load')}><Truck /> {t('agg.loadTruck')}</Button></PermissionGate>}
      {a.orderStatus === 'IN_TRANSIT' && <PermissionGate permission="aggregators.edit"><Button size="sm" onClick={() => setDialog('proof')}><PackageCheck /> {t('agg.proofOfDelivery')}</Button></PermissionGate>}
      {(a.paymentStatus === 'RECEIVE_REFUND' || a.paymentStatus === 'REFUND_SUPPLIER') && <PermissionGate permission="aggregators.reconcile"><Button size="sm" onClick={() => setDialog('refund')}><Undo2 /> {t(a.paymentStatus === 'RECEIVE_REFUND' ? 'agg.recordRefund' : 'agg.refundSupplier')}</Button></PermissionGate>}
      {a.paymentStatus === 'REFUND_SUPPLIER' && approvedSupplier && <PermissionGate permission="aggregators.disburse"><Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog('refundMomo')}><Smartphone /> {t('agg.payDifference')}</Button></PermissionGate>}
      {a.paymentStatus === 'FULFILLED' && <PermissionGate permission="aggregators.reconcile"><Button size="sm" onClick={() => { markAggReconciled(a.id, userId ?? 'system'); toast.success(t('agg.toast.reconciled', { number: a.number })); }}><CheckCheck /> {t('agg.markReconciled')}</Button></PermissionGate>}
      <Button size="sm" variant="ghost" onClick={() => print(t('agg.receiptTitle'), a.number, receipt)}><Printer /> {t('buy.printReceipt')}</Button>
    </>
  );
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{a.number}</span>}
        subtitle={`${s?.name ?? '—'} · ${a.poNumber} · ${lk.commodity(a.commodityId)}`}
        badges={<><StatusBadge status={a.status} />{a.orderStatus !== 'NONE' && <StatusBadge status={a.orderStatus} />}{a.paymentStatus !== 'NONE' && <StatusBadge status={a.paymentStatus} />}{supplierBadge(s, t)}{a.dealCurrency !== cur && <Badge tone="neutral">{`${a.dealCurrency} @ ${a.exchangeRate}`}</Badge>}</>}
        actions={actions}
        tabs={[
          {
            key: 'summary', label: t('buy.tab.summary'), content: (
              <div className="space-y-5">
                {!approvedSupplier && s && <p className="rounded-ctl border border-warning/30 bg-warning/5 px-3 py-2 text-[14px] text-ink">{t(s.status === 'BLOCKED' ? 'agg.supplierBlockedHint' : 'agg.supplierPendingHint')} <Link to={`/app/aggregators/suppliers?open=${s.id}`} className="text-link">{t('agg.openSupplier')}</Link></p>}
                <Facts items={[
                  [t('agg.col.supplier'), s ? <Link key="s" to={`/app/aggregators/suppliers?open=${s.id}`} className="text-brand hover:underline">{s.name}</Link> : '—'], [t('agg.col.po'), mono(a.poNumber)],
                  [t('buy.plannedDate'), f.date(a.plannedDate)], [t('agg.col.bags'), `${f.number(a.expectedBags)} × ${f.kg(a.weightPerBagKg)}`],
                  [t('agg.col.volume'), `${f.kg(a.expectedKg)} · ${f.number(a.expectedKg / 1000, { maximumFractionDigits: 2 })} t`], [t('col.unitPrice'), f.money(a.unitPrice)],
                  [t('col.total'), f.money(a.total)], [t('agg.inCompany', { currency: cur }), a.dealCurrency === cur ? '—' : `${f.money(contract)} · ${t('agg.rateUsed', { rate: a.exchangeRate })}`],
                  [t('agg.col.includesPre'), a.includesPre ? t('common.yes') : t('common.no')], [t('buy.createdBy'), `${lk.user(a.createdBy)} · ${f.dateTime(a.createdAt)}`],
                ]} />
                {a.overrideReason && <p className="rounded-ctl bg-canvas px-3 py-2 text-[14px] text-body"><span className="font-medium text-ink">{t('buy.overrideReason')}</span>{`: ${a.overrideReason}`}</p>}
                {a.listPrice && (
                  <Panel title={t('buy.priceVsList')}>
                    <PriceCompare items={[{ label: t('buy.listPrice'), value: a.listPrice.amountMinor, tone: 'muted' }, { label: t('agg.dealPrice'), value: a.unitPrice.amountMinor, tone: a.unitPrice.amountMinor > a.listPrice.amountMinor * 1.05 ? 'warning' : 'brand' }]} />
                  </Panel>
                )}
              </div>
            ),
          },
          { key: 'approvals', label: t('buy.tab.approvals'), content: <ApprovalTimeline record={a as unknown as WorkflowRecord} def={def} /> },
          {
            key: 'disbursements', label: t('buy.tab.disbursements'), count: a.disbursements.length, content: (
              <div className="space-y-4">
                <Facts cols={3} items={[[t('col.total'), money(r.contract)], [t('buy.amountGiven'), money(r.paid)], [t('buy.remaining'), money(r.remainingToPay)]]} />
                {s && <p className="text-[13px] text-muted">{t('agg.payoutTo', { name: s.payout.accountName ?? s.name, method: t(`agg.method.${s.payout.method}`), number: s.payout.number })}</p>}
                {a.disbursements.length ? (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {a.disbursements.map((d, i) => <li key={d.id} className="px-4 py-3"><div className="text-[14px] font-medium text-ink">{t('buy.tranche', { n: i + 1 })} · {f.money(d.amount)}</div><div className="text-[12px] text-muted">{t(`buy.method.${d.method}`)} · {lk.user(d.by)} · {f.dateTime(d.at)}</div></li>)}
                  </ul>
                ) : <TabEmpty>{t('buy.noDisbursements')}</TabEmpty>}
                {attempts.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-semibold text-ink">{t('buy.paymentAttempts')}</h4>
                    <ul className="divide-y divide-line rounded-ctl border border-line">
                      {attempts.map((p) => <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"><span className="font-mono text-ink">{p.reference}</span><StatusBadge status={p.status} /><span className="min-w-0 flex-1 truncate text-muted">{p.failureReason ?? ''}</span><span className="tnum text-ink">{f.money(p.amount)}</span><span className="text-muted">{f.dateTime(p.createdAt)}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'delivery', label: t('agg.tabDelivery'), content: (
              <div className="space-y-4">
                <Panel title={t('agg.loading')}>
                  {a.delivery ? <Facts items={[[t('agg.driver'), `${a.delivery.driver} · ${a.delivery.contact}`], [t('agg.plate'), mono(a.delivery.plate)], [t('agg.loaded'), `${f.number(a.delivery.bags)} · ${f.kg(a.delivery.kg)}`], [t('agg.waybill'), a.delivery.waybill ?? '—'], [t('agg.at'), `${lk.user(a.delivery.by)} · ${f.dateTime(a.delivery.at)}`]]} /> : <TabEmpty>{t('agg.notLoaded')}</TabEmpty>}
                </Panel>
                <Panel title={t('agg.proofOfDelivery')}>
                  {a.proof ? <Facts items={[[t('agg.customer'), a.proof.customer], [t('agg.deliveredBags'), f.number(a.proof.bags)], [t('agg.deliveredKg'), `${f.kg(a.proof.kg)} · ${f.number(a.proof.kg / 1000, { maximumFractionDigits: 2 })} t`], [t('col.unitPrice'), f.money(a.proof.unitPrice)], [t('agg.documents'), [a.proof.weighbridge, a.proof.invoice, a.proof.qualityReport].filter(Boolean).join(' · ') || '—'], [t('agg.at'), `${lk.user(a.proof.by)} · ${f.dateTime(a.proof.at)}`]]} /> : <TabEmpty>{a.delivery ? t('agg.awaitingProof') : t('agg.notLoaded')}</TabEmpty>}
                </Panel>
              </div>
            ),
          },
          {
            key: 'recon', label: t('nav.reconciliation'), content: (
              <div className="space-y-4">
                {a.proof ? (
                  <p className={cn('rounded-ctl border px-3 py-2 text-[14px] text-ink', r.status === 'RECEIVE_REFUND' || r.status === 'REFUND_SUPPLIER' ? 'border-warning/30 bg-warning/5' : 'border-success/30 bg-success/5')}>
                    {t(`agg.result.${r.status}`, { gap: money(Math.abs(r.gap)), tolerance: money(r.tolerance) })}
                  </p>
                ) : <TabEmpty>{t('agg.reconAfterProof')}</TabEmpty>}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title={t('agg.moneyRecon', { currency: cur })}>
                    <Bars format={money} rows={[
                      { label: t('agg.paid'), value: r.paid + r.paidToSupplier, tone: 'brand' },
                      { label: t('agg.deliveredValue'), value: r.delivered, tone: 'success' },
                      ...(r.goodsRefund ? [{ label: t('agg.goodsRefund'), value: r.goodsRefund, tone: 'success' as const }] : []),
                      ...(r.moneyReceived ? [{ label: t('agg.moneyReceived'), value: r.moneyReceived, tone: 'success' as const }] : []),
                      { label: t('agg.gap'), value: r.gap, tone: Math.abs(r.gap) > r.tolerance ? 'warning' : 'muted' },
                    ]} />
                    <p className="mt-3 text-[12px] text-muted">{t('agg.toleranceLine', { amount: money(r.tolerance) })}</p>
                  </Panel>
                  <Panel title={t('agg.volumeRecon')}>
                    <Bars format={(v) => f.kg(v)} rows={[
                      { label: t('agg.expected'), value: r.kg.expected, tone: 'muted' },
                      { label: t('agg.loaded'), value: r.kg.loaded, tone: 'brand' },
                      { label: t('agg.deliveredKg'), value: r.kg.delivered, tone: 'success' },
                      ...(r.kg.goodsRefund ? [{ label: t('agg.goodsRefund'), value: r.kg.goodsRefund, tone: 'success' as const }] : []),
                    ]} />
                    <p className={cn('mt-3 text-[12px]', r.kg.variance < 0 ? 'text-warning' : 'text-muted')}>{t('agg.volumeVariance', { kg: f.kg(r.kg.variance), pct: f.number(r.kg.variancePct, { maximumFractionDigits: 1 }) })}</p>
                  </Panel>
                </div>
                {!!a.refunds?.length && (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {a.refunds.map((x) => (
                      <li key={x.id} className="px-4 py-3 text-[14px]">
                        <div className="font-medium text-ink">{t(`agg.refund.${x.kind}_${x.method}`)} · {x.amount ? f.money(x.amount) : `${t('buy.bagsN', { count: x.bags ?? 0 })} · ${f.kg(x.kg ?? 0)}`}</div>
                        <div className="text-[12px] text-muted">{[x.poNumber, x.proof, x.note, lk.user(x.by), f.dateTime(x.at)].filter(Boolean).join(' · ')}</div>
                      </li>
                    ))}
                  </ul>
                )}
                {a.reconciledAt && <p className="text-[13px] text-success">{!a.reconciledBy || a.reconciledBy === 'system' ? t('agg.reconciledAuto', { date: f.dateTime(a.reconciledAt) }) : t('agg.reconciledAt', { date: f.dateTime(a.reconciledAt), name: lk.user(a.reconciledBy) })}</p>}
              </div>
            ),
          },
          {
            key: 'expenses', label: t('agg.tabExpenses'), count: expenses.length, content: (
              <div className="space-y-3">
                {['APPROVED', 'PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'].includes(a.status) && <PermissionGate permission="aggregators.create"><Button size="sm" variant="secondary" onClick={() => setDialog('expense')}><Plus /> {t('agg.newExpense')}</Button></PermissionGate>}
                {expenses.length ? (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {expenses.map((e) => <li key={e.id}><Link to={`/app/aggregators/expenses?open=${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft/40"><span className="font-mono text-[13px] text-ink">{e.number}</span><StatusBadge status={e.status} /><StatusBadge status={e.paymentStatus} /><span className="flex-1 text-[13px] text-muted">{t('buy.bagsN', { count: e.bags })}</span><span className="tnum font-medium text-ink">{f.money(e.total)}</span></Link></li>)}
                  </ul>
                ) : <TabEmpty>{t('agg.noExpenses')}</TabEmpty>}
              </div>
            ),
          },
          { key: 'files', label: t('buy.tab.files'), content: <DocumentsPanel entity="aggregatorPurchase" entityId={a.id} types={['poFile', 'weighbridge', 'waybill', 'invoice', 'qualityReport', 'proof', 'other']} permission="aggregators.edit" /> },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="aggregatorPurchase" entityId={a.id} /> },
        ]}
      />
      {dialog === 'momo' && s && (
        <PayDialog
          request={{ type: 'AGGREGATOR_PURCHASE', payableId: a.id, title: t('agg.payTitle', { number: a.number }), editableMaxMinor: r.remainingToPay, payees: [{ ...supplierPayee(a, { amountMinor: r.remainingToPay, currency: cur }), label: `${s.name} · ${t('agg.supplierLabel')}` }] }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'refundMomo' && s && (
        <PayDialog
          request={{ type: 'AGGREGATOR_PURCHASE', payableId: a.id, title: t('agg.payDifferenceTitle', { number: a.number }), meta: { kind: 'refundSupplier' }, payees: [{ ...supplierPayee(a, { amountMinor: Math.abs(r.gap), currency: cur }), label: s.name, meta: { kind: 'refundSupplier' } }] }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'manual' && (
        <AmountDialog open onClose={() => setDialog(null)} title={t('buy.manualTitle', { number: a.number })} description={t('agg.manualHint')} initialMinor={r.remainingToPay} maxMinor={r.remainingToPay} currency={cur} proof confirm={t('buy.markDisbursed')}
          onConfirm={(v) => { if (disburseAggregatorManual(a.id, v.amountMinor, v.proof ?? '', userId ?? 'system')) toast.success(t('agg.toast.disbursed', { number: a.number, amount: f.money({ amountMinor: v.amountMinor, currency: cur }) })); setDialog(null); }} />
      )}
      {dialog === 'load' && <LoadDialog acs={a} onClose={() => setDialog(null)} />}
      {dialog === 'proof' && <ProofDialog acs={a} onClose={() => setDialog(null)} />}
      {dialog === 'refund' && <RefundDialog acs={a} gap={r.gap} onClose={() => setDialog(null)} />}
      {dialog === 'expense' && <AggExpenseSheet acsId={a.id} onClose={() => setDialog(null)} />}
    </>
  );
}

const num = (v: string) => Number(v || 0);

function LoadDialog({ acs: a, onClose }: { acs: AggregatorPurchase; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const [v, setV] = useState({ driver: '', contact: '', plate: '', bags: String(a.expectedBags), kg: String(a.expectedKg) });
  const [waybill, setWaybill] = useState<string | undefined>();
  const invalid = !v.driver.trim() || !v.contact.trim() || !v.plate.trim() || !(num(v.bags) > 0) || !(num(v.kg) > 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('agg.loadTitle', { number: a.number })}</DialogTitle><DialogDescription>{t('agg.loadHint')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('agg.driver')}><Input value={v.driver} onChange={(e) => setV({ ...v, driver: e.target.value })} aria-label={t('agg.driver')} autoFocus /></Field>
          <Field label={t('agg.driverContact')}><Input type="tel" value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} aria-label={t('agg.driverContact')} /></Field>
          <Field label={t('agg.plate')}><Input value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value.toUpperCase() })} aria-label={t('agg.plate')} /></Field>
          <div />
          <Field label={t('agg.bagsLoaded')}><Input type="number" value={v.bags} onChange={(e) => setV({ ...v, bags: e.target.value })} aria-label={t('agg.bagsLoaded')} /></Field>
          <Field label={t('agg.kgLoaded')}><Input type="number" value={v.kg} onChange={(e) => setV({ ...v, kg: e.target.value })} aria-label={t('agg.kgLoaded')} /></Field>
          <div className="sm:col-span-2"><FileSlot label={t('agg.waybill')} value={waybill} onChange={setWaybill} optional sample={`waybill-${a.poNumber}.pdf`} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={() => { recordDelivery(a.id, { driver: v.driver.trim(), contact: v.contact.trim(), plate: v.plate.trim(), bags: num(v.bags), kg: num(v.kg), waybill }, userId ?? 'system'); toast.success(t('agg.toast.inTransit', { number: a.number })); onClose(); }}><Truck /> {t('agg.markInTransit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProofDialog({ acs: a, onClose }: { acs: AggregatorPurchase; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const dec = a.unitPrice.currency === 'XOF' ? 0 : 2;
  const [v, setV] = useState({ customer: '', bags: String(a.delivery?.bags ?? a.expectedBags), kg: String(a.delivery?.kg ?? a.expectedKg), price: String(a.unitPrice.amountMinor / 10 ** dec) });
  const [files, setFiles] = useState<{ weighbridge?: string; invoice?: string; qualityReport?: string }>({});
  const unitPrice = { amountMinor: Math.round(num(v.price) * 10 ** dec), currency: a.unitPrice.currency };
  const preview = aggResult({ ...a, proof: { customer: v.customer, bags: num(v.bags), kg: num(v.kg), unitPrice, at: '', by: '' } }, settings.buyingRules, f.org.currency);
  const invalid = !v.customer.trim() || !(num(v.kg) > 0) || !(unitPrice.amountMinor > 0) || !files.weighbridge || !files.invoice;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('agg.proofTitle', { number: a.number })}</DialogTitle><DialogDescription>{t('agg.proofHint')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('agg.customer')} className="sm:col-span-2"><Input value={v.customer} onChange={(e) => setV({ ...v, customer: e.target.value })} aria-label={t('agg.customer')} autoFocus placeholder={t('agg.customerPlaceholder')} /></Field>
          <Field label={t('agg.deliveredBags')}><Input type="number" value={v.bags} onChange={(e) => setV({ ...v, bags: e.target.value })} aria-label={t('agg.deliveredBags')} /></Field>
          <Field label={t('agg.deliveredKg')} helper={t('agg.tonnes', { t: f.number(num(v.kg) / 1000, { maximumFractionDigits: 2 }) })}><Input type="number" value={v.kg} onChange={(e) => setV({ ...v, kg: e.target.value })} aria-label={t('agg.deliveredKg')} /></Field>
          <Field label={t('agg.pricePerKg', { currency: a.unitPrice.currency })}><Input type="number" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} aria-label={t('agg.pricePerKg', { currency: a.unitPrice.currency })} /></Field>
          <div />
          <FileSlot label={t('agg.weighbridgeReport')} value={files.weighbridge} onChange={(x) => setFiles({ ...files, weighbridge: x })} sample={`weighbridge-${a.poNumber}.pdf`} />
          <FileSlot label={t('agg.invoice')} value={files.invoice} onChange={(x) => setFiles({ ...files, invoice: x })} sample={`invoice-${a.poNumber}.pdf`} />
          <FileSlot label={t('agg.qualityReport')} value={files.qualityReport} onChange={(x) => setFiles({ ...files, qualityReport: x })} optional sample={`quality-${a.poNumber}.pdf`} />
        </div>
        <p className={cn('rounded-ctl border px-3 py-2 text-[14px] text-ink', preview.status === 'RECEIVE_REFUND' || preview.status === 'REFUND_SUPPLIER' ? 'border-warning/30 bg-warning/5' : 'border-success/30 bg-success/5')} role="status">
          {t(`agg.result.${preview.status}`, { gap: f.money({ amountMinor: Math.abs(preview.gap), currency: f.org.currency }), tolerance: f.money({ amountMinor: preview.tolerance, currency: f.org.currency }) })}
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={() => { recordProof(a.id, { customer: v.customer.trim(), bags: num(v.bags), kg: num(v.kg), unitPrice, ...files }, userId ?? 'system'); toast.success(t('agg.toast.delivered', { number: a.number }), { description: t(`status.${preview.status}`) }); onClose(); }}><PackageCheck /> {t('agg.markDelivered')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Receive a refund from the supplier (goods on a new PO, or money), or refund the supplier with proof. */
function RefundDialog({ acs: a, gap, onClose }: { acs: AggregatorPurchase; gap: number; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const receive = gap > 0;
  const cur = f.org.currency;
  const dec = cur === 'XOF' ? 0 : 2;
  const price = a.proof?.unitPrice ?? a.unitPrice;
  const kgOwed = Math.max(0, Math.round(gap / Math.max(1, toCompany({ amountMinor: price.amountMinor, currency: price.currency }, a.exchangeRate, cur).amountMinor)));
  const [method, setMethod] = useState<'GOODS' | 'MONEY'>(receive ? 'GOODS' : 'MONEY');
  const [po, setPo] = useState(`${a.poNumber}-R`);
  const [bags, setBags] = useState(String(Math.max(1, Math.round(kgOwed / Math.max(1, a.weightPerBagKg)))));
  const [kg, setKg] = useState(String(kgOwed));
  const [amount, setAmount] = useState(String(Math.abs(gap) / 10 ** dec));
  const [proof, setProof] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const minor = Math.round(num(amount) * 10 ** dec);
  const invalid = method === 'GOODS' ? !po.trim() || !(num(kg) > 0) : !(minor > 0) || !proof;
  const save = () => {
    const status = recordAggRefund(a.id, method === 'GOODS'
      ? { kind: 'RECEIVE', method: 'GOODS', poNumber: po.trim(), bags: num(bags), kg: num(kg), note: note.trim() || undefined }
      : { kind: receive ? 'RECEIVE' : 'SUPPLIER', method: 'MONEY', amount: { amountMinor: minor, currency: cur }, proof, note: note.trim() || undefined }, userId ?? 'system');
    toast.success(t('agg.toast.refund', { number: a.number }), { description: t(`status.${status}`) });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(receive ? 'agg.receiveTitle' : 'agg.refundSupplierTitle', { number: a.number })}</DialogTitle>
          <DialogDescription>{t(receive ? 'agg.receiveHint' : 'agg.refundSupplierHint', { amount: f.money({ amountMinor: Math.abs(gap), currency: cur }), kg: f.kg(kgOwed) })}</DialogDescription>
        </DialogHeader>
        {receive && (
          <div className="inline-flex h-10 rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={t('agg.refundMethod')}>
            {(['GOODS', 'MONEY'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={cn('rounded-[8px] px-4 text-[14px] font-medium', method === m ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>{t(`agg.refundMethodName.${m}`)}</button>)}
          </div>
        )}
        {method === 'GOODS' ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('agg.newPo')}><Input value={po} onChange={(e) => setPo(e.target.value)} aria-label={t('agg.newPo')} /></Field>
            <Field label={t('agg.col.bags')}><Input type="number" value={bags} onChange={(e) => setBags(e.target.value)} aria-label={t('agg.col.bags')} /></Field>
            <Field label={t('buy.weightKg')}><Input type="number" value={kg} onChange={(e) => setKg(e.target.value)} aria-label={t('buy.weightKg')} /></Field>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label={t('buy.amountIn', { currency: cur })}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('buy.amountIn', { currency: cur })} /></Field>
            <FileSlot label={t('agg.proof')} value={proof} onChange={setProof} sample="transfer-slip.jpg" />
          </div>
        )}
        <Field label={t('agg.note')}><Input value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('agg.note')} /></Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={save}><Undo2 /> {t('agg.saveRefund')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
