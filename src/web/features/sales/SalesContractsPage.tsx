import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, FileSignature, Pencil, Plus, Printer, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { SalesContract } from '@/types';
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
import { Lines } from '@/components/charts/charts';
import { agreeContract, buildSchedule, cancelContract, contractValue, fulfilment, markInstalmentReceived, overdueInstalments, saveContract, toKg } from '@/services/salesService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useSalesStore } from '@/stores/salesStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { usersWith } from '@/services/inventoryService';
import { useKgT, useSalesLookups } from './shared';

type View = 'all' | 'draft' | 'open' | 'fulfilled' | 'attention' | 'cancelled';
const VIEWS: View[] = ['all', 'draft', 'open', 'attention', 'fulfilled', 'cancelled'];

/** Sales contracts (PRD H7): terms from a template, payment schedule, orders against it and fulfilment. */
export function SalesContractsPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSalesLookups();
  const settings = useOrgSettings();
  const rows = useOrgRows(useSalesStore((s) => s.contracts));
  const dispatches = useOrgRows(useSalesStore((s) => s.dispatches));
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [client, setClient] = useState('');
  const [editing, setEditing] = useState<SalesContract | 'new' | null>(null);
  const soon = new Date(Date.now() + settings.sales.overdueAlertDays * 86_400_000).toISOString().slice(0, 10);
  const needsAttention = (c: SalesContract) => ['AGREED', 'ORDER_CREATED'].includes(c.status) && (overdueInstalments(c).length > 0 || (c.shipmentWindow.end <= soon && !fulfilment(c, dispatches).fulfilled));
  const inView = (c: SalesContract, v: View) => v === 'all' || (v === 'draft' ? c.status === 'DRAFT' : v === 'open' ? ['AGREED', 'ORDER_CREATED'].includes(c.status) : v === 'fulfilled' ? c.status === 'FULFILLED' : v === 'cancelled' ? c.status === 'CANCELLED' : needsAttention(c));
  const query = q.trim().toLowerCase();
  const shown = rows.filter((c) => inView(c, view) && (!client || c.clientId === client) && (!query || c.number.toLowerCase().includes(query) || sl.clientName(c.clientId).toLowerCase().includes(query))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<SalesContract, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'client', header: t('sales.client'), accessorFn: (c) => sl.clientName(c.clientId) },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (c) => lk.commodity(c.commodityId) },
    { id: 'quantity', header: t('col.quantity'), accessorFn: (c) => c.quantity, cell: (c) => <span className="whitespace-nowrap">{`${f.number(c.row.original.quantity)} ${c.row.original.unitId}`}</span> },
    { id: 'value', header: t('sales.value'), accessorFn: (c) => contractValue(c).amountMinor, cell: (c) => <span className="whitespace-nowrap font-medium text-ink" title={f.money(contractValue(c.row.original))}>{f.money(contractValue(c.row.original), { compact: true })}</span> },
    { id: 'window', header: t('sales.shipmentWindow'), accessorFn: (c) => c.shipmentWindow.end, cell: (c) => <span className="whitespace-nowrap">{`${f.date(c.row.original.shipmentWindow.start, 'd MMM')} – ${f.date(c.row.original.shipmentWindow.end, 'd MMM yy')}`}</span> },
    { id: 'fulfilment', header: t('sales.fulfilment'), accessorFn: (c) => fulfilment(c, dispatches).pct, cell: (c) => <><FulfilmentBar contract={c.row.original} />{overdueInstalments(c.row.original).length > 0 && c.row.original.status !== 'CANCELLED' && <span className="mt-1 block text-[12px] font-medium text-danger">{t('sales.paymentOverdue')}</span>}</> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <span className="whitespace-nowrap"><StatusBadge status={c.getValue() as string} /></span> },
  ], [t, f, lk, sl, dispatches]);
  const current = rows.find((c) => c.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.salesContracts')} description={t('pages.salesContracts')}
        primary={<PermissionGate permission="salesContracts.create"><Button onClick={() => setEditing('new')}><Plus /> {t('sales.newContract')}</Button></PermissionGate>} />
      <FilterBar search={q} onSearch={setQ} placeholder={t('sales.searchContracts')}
        views={VIEWS.map((v) => ({ key: v, label: t(`sales.cView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((c) => inView(c, v)).length }))}
        filters={[{ key: 'client', label: t('sales.client'), value: client, onChange: setClient, options: sl.clients.map((c) => ({ value: c.id, label: c.name })) }]}
        onClear={() => { setQ(''); setClient(''); setView('all'); }} />
      <DataTable columns={columns} data={shown} onRowClick={(c) => open(c.id)} activeId={openId} getRowId={(c) => c.id} empty={t('sales.noContracts')}
        exportCsv={{ fileName: 'sales-contracts.csv', columns: [{ header: t('col.number'), value: (c) => c.number }, { header: t('sales.client'), value: (c) => sl.clientName(c.clientId) }, { header: t('col.quantity'), value: (c) => c.quantity }, { header: t('sales.value'), value: (c) => contractValue(c).amountMinor }, { header: t('sales.fulfilment'), value: (c) => fulfilment(c, dispatches).pct }, { header: t('col.status'), value: (c) => c.status }] }} />
      {current && <ContractDrawer key={current.id} contract={current} onClose={close} onEdit={() => setEditing(current)} />}
      {editing && <ContractSheet contract={editing === 'new' ? undefined : editing} onClose={(id) => { setEditing(null); if (id) open(id); }} />}
    </>
  );
}

function FulfilmentBar({ contract }: { contract: SalesContract }) {
  const { t } = useT();
  const f = useFormat();
  const dispatches = useSalesStore((s) => s.dispatches);
  const fl = fulfilment(contract, dispatches);
  const transitPct = fl.contractedKg ? Math.min(100 - Math.min(100, fl.pct), (fl.inTransitKg / fl.contractedKg) * 100) : 0;
  return (
    <div className="min-w-[110px]" title={t('sales.fulfilledPct', { pct: f.number(fl.pct) })}>
      <div className="mb-1 text-[12px] text-muted">{t('sales.fulfilledPct', { pct: f.number(fl.pct) })}</div>
      <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-canvas" role="meter" aria-valuenow={Math.round(fl.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t('sales.fulfilment')}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, fl.pct)}%` }} />
        {transitPct > 0 && <div className="h-full rounded-full bg-brand/35" style={{ width: `${transitPct}%` }} />}
      </div>
    </div>
  );
}

function ContractDrawer({ contract: c, onClose, onEdit }: { contract: SalesContract; onClose: () => void; onEdit: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSalesLookups();
  const kgT = useKgT();
  const settings = useOrgSettings();
  const { userId } = useActor();
  const dispatches = useSalesStore((s) => s.dispatches);
  const fl = fulfilment(c, dispatches);
  const print = usePrintContract();
  const [dialog, setDialog] = useState<'agree' | 'cancel' | { pay: string } | null>(null);
  const template = settings.sales.templates.find((x) => x.id === c.templateId);
  const overdue = new Set(overdueInstalments(c).map((p) => p.id));
  // Cumulative delivered against the contracted line, by verification date.
  const verified = fl.linked.filter((d) => d.verification).sort((a, b) => a.verification!.at.localeCompare(b.verification!.at));
  let run = 0;
  const chart = verified.length ? [
    { label: f.date(c.createdAt, 'd MMM'), delivered: 0, contracted: fl.contractedKg / 1000 },
    ...verified.map((d) => { run += d.verification!.deliveredKg; return { label: f.date(d.verification!.at, 'd MMM'), delivered: Math.round(run / 100) / 10, contracted: fl.contractedKg / 1000 }; }),
  ] : [];
  return (
    <>
      <DetailDrawer open onClose={onClose} title={c.number} subtitle={`${sl.clientName(c.clientId)} · ${lk.commodity(c.commodityId)} · ${f.number(c.quantity)} ${c.unitId}`}
        badges={<><StatusBadge status={c.status} />{overdue.size > 0 && c.status !== 'CANCELLED' && <StatusBadge status="OVERDUE" />}</>}
        actions={<>
          {c.status === 'DRAFT' && <PermissionGate permission="salesContracts.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('common.edit')}</Button></PermissionGate>}
          {c.status === 'DRAFT' && <PermissionGate permission="salesContracts.approve"><Button size="sm" onClick={() => setDialog('agree')}><CheckCircle2 /> {t('sales.markAgreed')}</Button></PermissionGate>}
          <Button size="sm" variant="secondary" onClick={() => print(c)}><Printer /> {t('sales.print')}</Button>
          {!['FULFILLED', 'CANCELLED'].includes(c.status) && <PermissionGate permission="salesContracts.edit"><Button size="sm" variant="dangerOutline" onClick={() => setDialog('cancel')}><Ban /> {t('sales.cancelContract')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'terms', label: t('sales.tab.terms'), content: (
              <div className="space-y-5">
                <Facts items={[
                  [t('sales.client'), sl.clientName(c.clientId)], [t('col.commodity'), `${lk.commodity(c.commodityId)}${c.grade ? ` · ${c.grade}` : ''}`],
                  [t('col.quantity'), `${f.number(c.quantity)} ${c.unitId} · ${kgT(fl.contractedKg)}`], [t('sales.pricePer', { unit: c.unitId }), f.money(c.pricePerUnit)],
                  [t('sales.value'), f.money(contractValue(c))], [t('sales.paymentTerms'), sl.termName(c.paymentTermId)],
                  [t('sales.packaging'), sl.packagingName(c.packagingId)], [t('sales.shipmentWindow'), `${f.date(c.shipmentWindow.start)} – ${f.date(c.shipmentWindow.end)}`],
                  [t('sales.deliveryPoint'), c.deliveryPoint], [t('sales.tolerance'), `± ${f.number(c.tolerancePct)}%`],
                  [t('sales.officer'), lk.user(c.officerUserId)], [t('sales.template'), template?.name ?? '—'],
                ]} />
                {c.qualitySpec.length > 0 && (
                  <div className="rounded-ctl border border-line">
                    <div className="border-b border-line bg-canvas px-3 py-2 text-[12px] font-semibold text-label">{t('sales.qualitySpec')}</div>
                    <ul className="divide-y divide-line text-[13px]">{c.qualitySpec.map((q) => <li key={q.key} className="flex justify-between px-3 py-2"><span className="text-ink">{q.label}</span><span className="tnum">{q.max != null ? t('sales.maxValue', { value: `${f.number(q.max)}${q.unit}` }) : q.min != null ? t('sales.minValue', { value: `${f.number(q.min)}${q.unit}` }) : '—'}</span></li>)}</ul>
                  </div>
                )}
                {template?.clauses && <p className="rounded-ctl bg-canvas px-4 py-3 text-[13px] leading-relaxed text-body">{template.clauses}</p>}
                {c.notes && <p className="text-[13px] text-muted">{c.notes}</p>}
              </div>
            ),
          },
          {
            key: 'orders', label: t('sales.tab.orders'), count: fl.linked.length, content: fl.linked.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line">{fl.linked.map((d) => (
                <li key={d.id}><Link to={`/app/dispatch?open=${d.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px] hover:bg-canvas">
                  <span><span className="block font-mono text-[13px] text-ink">{d.number}{d.verification ? ` · ${d.verification.saleNumber}` : ''}</span><span className="text-[12px] text-muted">{`${d.truck.plate} · ${f.date(d.createdAt)}`}</span></span>
                  <span className="flex items-center gap-2"><span className="tnum text-[13px]">{kgT(d.verification?.deliveredKg ?? d.expectedKg)}</span><StatusBadge status={d.status} /></span>
                </Link></li>
              ))}</ul>
            ) : <TabEmpty>{t('sales.noOrders')}</TabEmpty>,
          },
          {
            key: 'deliveries', label: t('sales.tab.deliveries'), content: (
              <div className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-3">
                  {([[t('sales.delivered'), kgT(fl.deliveredKg)], [t('sales.inTransit'), kgT(fl.inTransitKg)], [t('sales.remaining'), kgT(Math.max(0, fl.contractedKg - fl.deliveredKg))]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[16px] font-semibold text-ink">{v}</div></div>)}
                </div>
                <FulfilmentBar contract={c} />
                {chart.length ? <Lines data={chart} series={[{ key: 'delivered', label: t('sales.deliveredT'), index: 0 }, { key: 'contracted', label: t('sales.contractedT'), index: 3, dashed: true }]} format={(v) => `${f.number(v, { maximumFractionDigits: 1 })} t`} /> : <TabEmpty>{t('sales.noDeliveries')}</TabEmpty>}
              </div>
            ),
          },
          {
            key: 'payments', label: t('sales.tab.payments'), count: c.schedule.length, content: (
              <ul className="divide-y divide-line rounded-ctl border border-line">{c.schedule.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-[14px]">
                  <span><span className="block font-medium text-ink">{`${p.label} · ${t(`sales.trigger.${p.trigger}`)}`}</span><span className={cn('text-[12px]', overdue.has(p.id) ? 'text-danger' : 'text-muted')}>{p.received ? t('sales.receivedOn', { date: f.date(p.received.at), ref: p.received.reference ?? '—' }) : p.dueDate ? t('sales.dueOn', { date: f.date(p.dueDate) }) : t('sales.dueOnTrigger')}</span></span>
                  <span className="flex items-center gap-2"><span className="tnum font-semibold text-ink">{f.money(p.amount)}</span>
                    {p.received ? <StatusBadge status="PAID" /> : c.status !== 'DRAFT' && c.status !== 'CANCELLED' ? <PermissionGate permission="salesContracts.recordPayment"><Button size="sm" variant="secondary" onClick={() => setDialog({ pay: p.id })}><Wallet /> {t('sales.markReceived')}</Button></PermissionGate> : <StatusBadge status={overdue.has(p.id) ? 'OVERDUE' : 'NOT_PAID'} />}</span>
                </li>
              ))}</ul>
            ),
          },
          {
            key: 'documents', label: t('sales.tab.documents'), count: c.documents.length, content: c.documents.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line">{c.documents.map((d) => <li key={d.id} className="flex justify-between gap-3 px-3 py-2.5 text-[14px]"><span className="font-medium text-ink">{d.name}</span><span className="text-[12px] text-muted">{`${t(`sales.docType.${d.type}`, { defaultValue: d.type })} · ${f.date(d.at)} · ${lk.user(d.by)}`}</span></li>)}</ul>
            ) : <TabEmpty>{t('sales.noContractDocs')}</TabEmpty>,
          },
          { key: 'timeline', label: t('sales.tab.timeline'), content: <ActivityFeed entity="salesContract" entityId={c.id} /> },
        ]} />
      {dialog === 'agree' && <AgreeDialog contract={c} onClose={() => setDialog(null)} actorId={userId ?? 'system'} />}
      {dialog === 'cancel' && <CancelDialog contract={c} onClose={() => setDialog(null)} actorId={userId ?? 'system'} />}
      {dialog && typeof dialog === 'object' && <ReceivedDialog contract={c} instalmentId={dialog.pay} onClose={() => setDialog(null)} actorId={userId ?? 'system'} />}
    </>
  );
}

function AgreeDialog({ contract: c, onClose, actorId }: { contract: SalesContract; onClose: () => void; actorId: string }) {
  const { t } = useT();
  const [doc, setDoc] = useState<string>();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('sales.agreeTitle', { number: c.number })}</DialogTitle><DialogDescription>{t('sales.agreeHint')}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-dashed border-line p-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-ctl bg-surface px-3 text-[13px] font-medium text-ink ring-1 ring-line hover:bg-canvas">{t('sales.chooseFile')}<input type="file" className="sr-only" aria-label={t('sales.signedContract')} onChange={(e) => { setDoc(e.target.files?.[0]?.name); e.target.value = ''; }} /></label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDoc(`${c.number}-signed.pdf`)}>{t('sales.useSample')}</Button>
          <span className="text-[13px] text-muted">{doc ?? t('sales.signedOptional')}</span>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => { agreeContract(c.id, actorId, doc); toast.success(t('sales.toast.agreed', { number: c.number })); onClose(); }}><FileSignature /> {t('sales.markAgreed')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ contract: c, onClose, actorId }: { contract: SalesContract; onClose: () => void; actorId: string }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('sales.cancelTitle', { number: c.number })}</DialogTitle><DialogDescription>{t('sales.cancelHint')}</DialogDescription></DialogHeader>
        <Field label={t('sales.reason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('sales.reason')} /></Field>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.back')}</Button><Button variant="danger" disabled={!reason.trim()} onClick={() => { cancelContract(c.id, reason.trim(), actorId); toast.success(t('sales.toast.cancelled', { number: c.number })); onClose(); }}>{t('sales.cancelContract')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceivedDialog({ contract: c, instalmentId, onClose, actorId }: { contract: SalesContract; instalmentId: string; onClose: () => void; actorId: string }) {
  const { t } = useT();
  const f = useFormat();
  const p = c.schedule.find((x) => x.id === instalmentId)!;
  const [ref, setRef] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('sales.receivedTitle', { amount: f.money(p.amount) })}</DialogTitle><DialogDescription>{t('sales.receivedHint', { number: c.number })}</DialogDescription></DialogHeader>
        <Field label={t('sales.bankReference')}><Input value={ref} onChange={(e) => setRef(e.target.value)} aria-label={t('sales.bankReference')} /></Field>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!ref.trim()} onClick={() => { markInstalmentReceived(c.id, p.id, ref.trim(), actorId); toast.success(t('sales.toast.received', { amount: f.money(p.amount) })); onClose(); }}>{t('sales.markReceived')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Create from a template, or edit a draft. The payment schedule previews from the chosen terms. */
function ContractSheet({ contract, onClose }: { contract?: SalesContract; onClose: (id?: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const lk = useLookups();
  const sl = useSalesLookups();
  const settings = useOrgSettings();
  const users = useAccessStore((s) => s.users);
  const officers = usersWith(orgId, 'salesContracts.create');
  const templates = settings.sales.templates;
  const first = templates[0];
  const currency = contract?.pricePerUnit.currency ?? (orgId && settings.priceList[0]?.price.currency === 'XOF' ? 'XOF' : 'EUR');
  const [v, setV] = useState(() => ({
    templateId: contract?.templateId ?? first?.id ?? '', clientId: contract?.clientId ?? sl.clients[0]?.id ?? '', commodityId: contract?.commodityId ?? first?.commodityId ?? settings.commodities[0]?.id ?? '',
    grade: contract?.grade ?? '', quantity: contract ? String(contract.quantity) : '', unitId: contract?.unitId ?? first?.unitId ?? 't',
    price: contract ? String(contract.pricePerUnit.amountMinor / 10 ** (currency === 'XOF' ? 0 : 2)) : '', currency,
    paymentTermId: contract?.paymentTermId ?? first?.paymentTermId ?? settings.sales.paymentTerms[0]?.id ?? '', packagingId: contract?.packagingId ?? first?.packagingId ?? settings.sales.packaging[0]?.id ?? '',
    start: contract?.shipmentWindow.start ?? new Date().toISOString().slice(0, 10), end: contract?.shipmentWindow.end ?? new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
    deliveryPoint: contract?.deliveryPoint ?? first?.deliveryPoint ?? '', officerUserId: contract?.officerUserId ?? userId ?? '', tolerancePct: String(contract?.tolerancePct ?? first?.tolerancePct ?? 2), notes: contract?.notes ?? '',
  }));
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch });
  const applyTemplate = (id: string) => {
    const x = templates.find((tp) => tp.id === id);
    set(x ? { templateId: id, commodityId: x.commodityId, unitId: x.unitId, paymentTermId: x.paymentTermId, packagingId: x.packagingId, tolerancePct: String(x.tolerancePct), deliveryPoint: x.deliveryPoint } : { templateId: '' });
  };
  const dec = v.currency === 'XOF' ? 0 : 2;
  const total = { amountMinor: Math.round(Number(v.quantity || 0) * Number(v.price || 0) * 10 ** dec), currency: v.currency };
  const preview = buildSchedule(settings, v.paymentTermId, total);
  const invalid = !v.clientId || !(Number(v.quantity) > 0) || !(Number(v.price) > 0) || !v.deliveryPoint.trim() || v.end < v.start;
  const save = (status: 'DRAFT' | 'AGREED') => {
    const c = saveContract({
      orgId, clientId: v.clientId, templateId: v.templateId || undefined, commodityId: v.commodityId, grade: v.grade.trim() || undefined, quantity: Number(v.quantity), unitId: v.unitId,
      pricePerUnitMinor: Math.round(Number(v.price) * 10 ** dec), currency: v.currency, paymentTermId: v.paymentTermId, packagingId: v.packagingId,
      shipmentWindow: { start: v.start, end: v.end }, deliveryPoint: v.deliveryPoint.trim(), officerUserId: v.officerUserId, tolerancePct: Number(v.tolerancePct) || 0,
      status, notes: v.notes.trim() || undefined, actorId: userId ?? 'system',
    }, contract?.id);
    if (status === 'AGREED' && contract) agreeContract(c.id, userId ?? 'system');
    toast.success(t(contract ? 'sales.toast.contractSaved' : 'sales.toast.contractCreated', { number: c.number }));
    onClose(c.id);
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  const name = (x: { name: Partial<Record<string, string>> }) => x.name[f.lang] ?? x.name.en ?? '';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{contract ? t('sales.editContract', { number: contract.number }) : t('sales.newContract')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label={t('sales.template')} helper={t('sales.templateHint')}><select value={v.templateId} onChange={(e) => applyTemplate(e.target.value)} aria-label={t('sales.template')} className={select}><option value="">{t('sales.noTemplate')}</option>{templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('sales.client')}><select value={v.clientId} onChange={(e) => set({ clientId: e.target.value })} aria-label={t('sales.client')} className={select}>{sl.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={t('col.commodity')}><select value={v.commodityId} onChange={(e) => set({ commodityId: e.target.value })} aria-label={t('col.commodity')} className={select}>{settings.commodities.map((c) => <option key={c.id} value={c.id}>{lk.commodity(c.id)}</option>)}</select></Field>
            <Field label={t('sales.grade')}><Input value={v.grade} onChange={(e) => set({ grade: e.target.value })} aria-label={t('sales.grade')} /></Field>
            <Field label={t('sales.quantityIn', { unit: v.unitId })} helper={Number(v.quantity) > 0 ? f.kg(toKg(Number(v.quantity), v.unitId)) : undefined}><Input type="number" value={v.quantity} onChange={(e) => set({ quantity: e.target.value })} aria-label={t('col.quantity')} /></Field>
            <Field label={t('sales.pricePerIn', { unit: v.unitId, currency: v.currency })}><Input type="number" value={v.price} onChange={(e) => set({ price: e.target.value })} aria-label={t('sales.unitPrice')} /></Field>
            <Field label={t('sales.currency')}><select value={v.currency} onChange={(e) => set({ currency: e.target.value })} aria-label={t('sales.currency')} className={select}>{[...new Set([f.org.currency, 'EUR', 'USD'])].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            <Field label={t('sales.paymentTerms')}><select value={v.paymentTermId} onChange={(e) => set({ paymentTermId: e.target.value })} aria-label={t('sales.paymentTerms')} className={select}>{settings.sales.paymentTerms.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}</select></Field>
            <Field label={t('sales.packaging')}><select value={v.packagingId} onChange={(e) => set({ packagingId: e.target.value })} aria-label={t('sales.packaging')} className={select}>{settings.sales.packaging.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}</select></Field>
            <Field label={t('sales.windowStart')}><Input type="date" value={v.start} onChange={(e) => set({ start: e.target.value })} aria-label={t('sales.windowStart')} /></Field>
            <Field label={t('sales.windowEnd')} error={v.end < v.start ? t('sales.windowError') : undefined}><Input type="date" value={v.end} onChange={(e) => set({ end: e.target.value })} aria-label={t('sales.windowEnd')} /></Field>
            <Field label={t('sales.deliveryPoint')}><Input value={v.deliveryPoint} onChange={(e) => set({ deliveryPoint: e.target.value })} aria-label={t('sales.deliveryPoint')} /></Field>
            <Field label={t('sales.tolerancePct')}><Input type="number" value={v.tolerancePct} onChange={(e) => set({ tolerancePct: e.target.value })} aria-label={t('sales.tolerancePct')} /></Field>
            <Field label={t('sales.officer')}><select value={v.officerUserId} onChange={(e) => set({ officerUserId: e.target.value })} aria-label={t('sales.officer')} className={select}>{officers.map((id) => <option key={id} value={id}>{users.find((u) => u.id === id)?.name ?? id}</option>)}</select></Field>
          </div>
          <Field label={t('sales.notes')}><Input value={v.notes} onChange={(e) => set({ notes: e.target.value })} aria-label={t('sales.notes')} /></Field>
          <div className="rounded-card border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="text-[14px] font-semibold text-ink">{t('sales.schedulePreview')}</span><span className="tnum text-[16px] font-semibold text-ink">{f.money(total)}</span></div>
            <ul className="divide-y divide-line text-[13px]">{preview.map((p) => <li key={p.id} className="flex justify-between px-4 py-2"><span>{`${p.label} · ${t(`sales.trigger.${p.trigger}`)}`}</span><span className="tnum">{f.money(p.amount)}</span></li>)}</ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button variant="secondary" disabled={invalid} onClick={() => save('DRAFT')}>{t('sales.saveDraft')}</Button>
          <PermissionGate permission="salesContracts.approve"><Button disabled={invalid} onClick={() => save('AGREED')}>{t('sales.saveAgreed')}</Button></PermissionGate>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Printable contract: parties, terms, quality spec, schedule and clauses. */
function usePrintContract() {
  const org = useCurrentOrg();
  const f = useFormat();
  const { t } = useT();
  const lk = useLookups();
  const sl = useSalesLookups();
  const settings = useOrgSettings();
  return (c: SalesContract) => {
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) { toast.error(t('buy.popupBlocked')); return; }
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    const row = (k: string, val: string) => `<tr><td>${esc(k)}</td><td>${esc(val)}</td></tr>`;
    const template = settings.sales.templates.find((x) => x.id === c.templateId);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.number)}</title><style>body{font-family:system-ui,sans-serif;color:#0F2A20;margin:48px;max-width:680px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:28px 0 6px}table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:top}td:last-child{text-align:right}.muted{color:#6b7280;font-size:13px}.sig{display:flex;gap:48px;margin-top:56px}.sig div{flex:1;border-top:1px solid #0F2A20;padding-top:6px;font-size:13px}</style></head><body>
      <h1>${esc(t('sales.printTitle'))} · ${esc(c.number)}</h1><div class="muted">${esc(org.legalName ?? org.name)} → ${esc(sl.clientName(c.clientId))}</div>
      <h2>${esc(t('sales.tab.terms'))}</h2><table>
      ${row(t('col.commodity'), `${lk.commodity(c.commodityId)}${c.grade ? ` · ${c.grade}` : ''}`)}${row(t('col.quantity'), `${f.number(c.quantity)} ${c.unitId}`)}${row(t('sales.pricePer', { unit: c.unitId }), f.money(c.pricePerUnit))}
      ${row(t('sales.value'), f.money(contractValue(c)))}${row(t('sales.paymentTerms'), sl.termName(c.paymentTermId))}${row(t('sales.packaging'), sl.packagingName(c.packagingId))}
      ${row(t('sales.shipmentWindow'), `${f.date(c.shipmentWindow.start)} – ${f.date(c.shipmentWindow.end)}`)}${row(t('sales.deliveryPoint'), c.deliveryPoint)}${row(t('sales.tolerance'), `± ${c.tolerancePct}%`)}</table>
      ${c.qualitySpec.length ? `<h2>${esc(t('sales.qualitySpec'))}</h2><table>${c.qualitySpec.map((q) => row(q.label, q.max != null ? `≤ ${q.max}${q.unit}` : q.min != null ? `≥ ${q.min}${q.unit}` : '—')).join('')}</table>` : ''}
      <h2>${esc(t('sales.tab.payments'))}</h2><table>${c.schedule.map((p) => row(`${p.label} · ${t(`sales.trigger.${p.trigger}`)}`, f.money(p.amount))).join('')}</table>
      ${template?.clauses ? `<h2>${esc(t('sales.clauses'))}</h2><p style="font-size:14px;line-height:1.6">${esc(template.clauses)}</p>` : ''}
      <div class="sig"><div>${esc(org.legalName ?? org.name)}</div><div>${esc(sl.clientName(c.clientId))}</div></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
}
