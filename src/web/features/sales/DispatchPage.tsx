import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, Download, FileUp, MapPin, Plus, Truck } from 'lucide-react';
import { toast } from 'sonner';
import type { DispatchOrder } from '@/types';
import type { WorkflowRecord } from '@/engines/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import {
  addDispatchDocument, advanceShipment, createDispatch, fulfilment, logDownload, pendingOutbounds, traceOf, updatePosition, verifyDispatch,
} from '@/services/salesService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSalesStore } from '@/stores/salesStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { ApprovalTimeline, WorkflowButtons, mono, useWorkflowDef } from '@/web/features/buying/common';
import { useInventory } from '@/web/features/inventory/shared';
import { ImpactTiles, ShipmentSteps, TraceMap, useKgT, useSalesLookups } from './shared';

type View = 'all' | 'approval' | 'ready' | 'moving' | 'toVerify' | 'verified' | 'rejected';
const VIEWS: View[] = ['all', 'approval', 'ready', 'moving', 'toVerify', 'verified', 'rejected'];
const inView = (d: DispatchOrder, v: View) =>
  v === 'all' || (v === 'approval' ? ['PENDING_APPROVAL', 'ON_HOLD'].includes(d.status) : v === 'ready' ? d.status === 'PENDING' : v === 'moving' ? ['IN_TRANSIT', 'ARRIVED'].includes(d.status) : v === 'toVerify' ? d.status === 'DELIVERED' : v === 'verified' ? d.status === 'VERIFIED' : d.status === 'REJECTED');

/** Where trucks unload: the export port for the company's country. */
const PORT: Record<string, { lat: number; lng: number }> = { GH: { lat: 5.64, lng: 0.01 }, CI: { lat: 5.3, lng: -4.01 } };

/** Dispatch orders (PRD H6): loaded from outbounds or bought direct, approved, tracked, verified with a sale number. */
export function DispatchPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSalesLookups();
  const kgT = useKgT();
  const rows = useOrgRows(useSalesStore((s) => s.dispatches));
  const def = useWorkflowDef('dispatchOrder');
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [client, setClient] = useState('');
  const [commodity, setCommodity] = useState('');
  const [creating, setCreating] = useState(false);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((d) => inView(d, view) && (!client || d.clientId === client) && (!commodity || d.commodityId === commodity)
    && (!query || [d.number, d.waybill, d.truck.plate, d.driver.name, d.verification?.saleNumber ?? '', sl.clientName(d.clientId)].some((x) => x.toLowerCase().includes(query))))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<DispatchOrder, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'client', header: t('sales.client'), accessorFn: (d) => sl.clientName(d.clientId) },
    { id: 'contract', header: t('sales.contract'), accessorFn: (d) => (d.contractId ? sl.contractNumber(d.contractId) : '—'), cell: (c) => (c.getValue() === '—' ? <span className="text-muted">{'—'}</span> : mono(c.getValue() as string)) },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (d) => lk.commodity(d.commodityId) },
    { id: 'kind', header: t('col.type'), accessorKey: 'kind', cell: (c) => t(`sales.kind.${c.getValue() as string}`) },
    { id: 'kg', header: t('sales.weight'), accessorFn: (d) => d.verification?.deliveredKg ?? d.expectedKg, cell: (c) => <span className="whitespace-nowrap">{kgT(c.getValue() as number)}</span> },
    { id: 'truck', header: t('sales.truck'), accessorFn: (d) => d.truck.plate, cell: (c) => <span className="whitespace-nowrap">{c.getValue() as string}</span> },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'sale', header: t('sales.saleNumber'), accessorFn: (d) => d.verification?.saleNumber ?? '', cell: (c) => (c.getValue() ? mono(c.getValue() as string) : <span className="text-muted">{'—'}</span>) },
  ], [t, f, lk, sl, kgT]);
  const current = rows.find((d) => d.id === openId);
  const commodities = [...new Set(rows.map((d) => d.commodityId))];
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.dispatch')} description={t('pages.dispatch')}
        primary={<PermissionGate permission="dispatch.create"><Button onClick={() => setCreating(true)}><Plus /> {t('sales.newDispatch')}</Button></PermissionGate>} />
      <FilterBar search={q} onSearch={setQ} placeholder={t('sales.searchDispatch')}
        views={VIEWS.map((v) => ({ key: v, label: t(`sales.dView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((d) => inView(d, v)).length }))}
        filters={[
          { key: 'client', label: t('sales.client'), value: client, onChange: setClient, options: sl.clients.map((c) => ({ value: c.id, label: c.name })) },
          { key: 'commodity', label: t('col.commodity'), value: commodity, onChange: setCommodity, options: commodities.map((c) => ({ value: c, label: lk.commodity(c) })) },
        ]}
        onClear={() => { setQ(''); setClient(''); setCommodity(''); setView('all'); }} />
      <DataTable columns={columns} data={shown} onRowClick={(d) => open(d.id)} activeId={openId} getRowId={(d) => d.id} empty={t('sales.noDispatches')}
        exportCsv={{ fileName: 'dispatch-orders.csv', columns: [{ header: t('col.number'), value: (d) => d.number }, { header: t('sales.client'), value: (d) => sl.clientName(d.clientId) }, { header: t('sales.weight'), value: (d) => d.verification?.deliveredKg ?? d.expectedKg }, { header: t('col.status'), value: (d) => d.status }, { header: t('sales.saleNumber'), value: (d) => d.verification?.saleNumber ?? '' }] }} />
      {current && def && <DispatchDrawer key={current.id} dispatch={current} onClose={close} />}
      {creating && <NewDispatchSheet onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function DispatchDrawer({ dispatch: d, onClose }: { dispatch: DispatchOrder; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSalesLookups();
  const inv = useInventory();
  const kgT = useKgT();
  const settings = useOrgSettings();
  const def = useWorkflowDef('dispatchOrder')!;
  const purchases = useBuyingStore((s) => s.purchases);
  const plots = useSalesStore((s) => s.plots);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trace = useMemo(() => traceOf(d), [d, purchases, plots]);
  const [dialog, setDialog] = useState<'advance' | 'position' | 'verify' | 'doc' | null>(null);
  const contract = sl.contract(d.contractId);
  const moving = ['IN_TRANSIT', 'ARRIVED'].includes(d.status);
  const truck = d.position && d.status !== 'VERIFIED' && d.status !== 'DELIVERED' ? { lat: d.position.lat, lng: d.position.lng, label: d.truck.plate } : undefined;
  const nextLabel = d.status === 'PENDING' ? t('sales.markInTransit') : d.status === 'IN_TRANSIT' ? t('sales.markArrived') : d.status === 'ARRIVED' ? t('sales.markDelivered') : null;
  return (
    <>
      <DetailDrawer open onClose={onClose} title={d.number} subtitle={`${sl.clientName(d.clientId)} · ${lk.commodity(d.commodityId)} · ${kgT(d.verification?.deliveredKg ?? d.expectedKg)}`}
        badges={<><StatusBadge status={d.status} /><span className="rounded-full bg-canvas px-2.5 py-0.5 text-[12px] font-medium text-body">{t(`sales.kind.${d.kind}`)}</span>{d.verification && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[12px] font-medium text-brand">{d.verification.saleNumber}</span>}</>}
        actions={<>
          {d.wf && ['PENDING_APPROVAL', 'ON_HOLD'].includes(d.status) && <WorkflowButtons docType="dispatchOrder" record={d as unknown as WorkflowRecord & { number: string }} def={def} />}
          {nextLabel && <PermissionGate permission="dispatch.track"><Button size="sm" onClick={() => setDialog('advance')}><Truck /> {nextLabel}</Button></PermissionGate>}
          {moving && <PermissionGate permission="dispatch.track"><Button size="sm" variant="secondary" onClick={() => setDialog('position')}><MapPin /> {t('sales.updatePosition')}</Button></PermissionGate>}
          {d.status === 'DELIVERED' && <PermissionGate permission="dispatch.verify"><Button size="sm" onClick={() => setDialog('verify')}><BadgeCheck /> {t('sales.verify')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'summary', label: t('sales.tab.summary'), content: (
              <div className="space-y-5">
                {!['PENDING_APPROVAL', 'REJECTED', 'ON_HOLD'].includes(d.status) && <ShipmentSteps dispatch={d} />}
                <Facts items={[
                  [t('sales.client'), sl.clientName(d.clientId)],
                  [t('sales.contract'), contract ? `${contract.number} · ${f.number(fulfilment(contract).pct)}%` : t('sales.noContract')],
                  [t('col.commodity'), lk.commodity(d.commodityId)],
                  [t('sales.expected'), kgT(d.expectedKg)],
                  [t('sales.loading'), d.loading.warehouseId ? inv.warehouseName(d.loading.warehouseId) : d.loading.place],
                  [t('sales.waybill'), d.waybill],
                  [t('sales.driver'), `${d.driver.name} · ${d.driver.phone}`],
                  [t('sales.truck'), d.truck.plate],
                  [t('inv.bags'), d.kind === 'INVENTORY' ? f.number(d.bagCodes.length) : t('sales.directBought', { count: d.requestIds.length })],
                  [t('buy.created'), `${lk.user(d.createdBy)} · ${f.dateTime(d.createdAt)}`],
                  ...(d.position?.eta ? [[t('sales.eta'), f.dateTime(d.position.eta)] as [string, string]] : []),
                ]} />
              </div>
            ),
          },
          {
            key: 'tracking', label: t('sales.tracking'), count: d.tracking.length, content: (
              <div className="space-y-4">
                <TraceMap communities={trace.communities} plots={[]} kgByCommunity={trace.kgByCommunity} truck={truck} height={300} />
                <ol className="space-y-2">{[...d.tracking].reverse().map((x, i) => (
                  <li key={i} className="flex gap-3 rounded-ctl border border-line px-3 py-2.5 text-[13px]">
                    <StatusBadge status={x.status} />
                    <span className="min-w-0 flex-1"><span className="block text-ink">{f.dateTime(x.at)} · {lk.user(x.by)}</span>
                      {(x.lat != null || x.eta || x.note) && <span className="text-muted">{[x.lat != null ? `${x.lat.toFixed(3)}, ${x.lng?.toFixed(3)}` : '', x.eta ? t('sales.etaAt', { at: f.dateTime(x.eta) }) : '', x.note ?? ''].filter(Boolean).join(' · ')}</span>}</span>
                  </li>
                ))}</ol>
              </div>
            ),
          },
          {
            key: 'sources', label: t('sales.tab.sources'), count: trace.farmers.length, content: (
              <div className="space-y-4">
                <Facts cols={3} items={[[t('sales.impact.farmers'), f.number(trace.farmers.length)], [t('sales.impact.communities'), f.number(trace.communities.length)], [t('sales.impact.plots'), f.number(trace.plots.length)]]} />
                <TraceMap communities={trace.communities} plots={trace.plots} kgByCommunity={trace.kgByCommunity} height={300} />
                {d.kind === 'INVENTORY' && (
                  <div className="rounded-ctl border border-line">
                    <div className="border-b border-line bg-canvas px-3 py-2 text-[12px] font-semibold text-label">{t('sales.outbounds')}</div>
                    <ul className="divide-y divide-line text-[13px]">{d.outboundIds.map((id) => <OutboundRow key={id} id={id} />)}</ul>
                  </div>
                )}
                <div className="rounded-ctl border border-line">
                  <div className="border-b border-line bg-canvas px-3 py-2 text-[12px] font-semibold text-label">{t('sales.byCommunity')}</div>
                  <ul className="divide-y divide-line text-[13px]">{[...trace.kgByCommunity.entries()].sort((a, b) => b[1] - a[1]).map(([id, kg]) => <li key={id} className="flex justify-between px-3 py-2"><span className="text-ink">{lk.community(id)}</span><span className="tnum">{f.kg(Math.round(kg))}</span></li>)}</ul>
                </div>
              </div>
            ),
          },
          { key: 'impact', label: t('sales.tab.impact'), content: <div className="space-y-3"><p className="text-[13px] text-muted">{t('sales.impactHint')}</p><ImpactTiles impact={d.impact} kpis={settings.sales.impactKpis} /></div> },
          {
            key: 'verification', label: t('sales.tab.verification'), content: d.verification ? (
              <Facts items={[
                [t('sales.saleNumber'), mono(d.verification.saleNumber)], [t('sales.delivered'), kgT(d.verification.deliveredKg)],
                [t('sales.variance'), kgT(d.expectedKg - d.verification.deliveredKg)], [t('inv.bags'), f.number(d.verification.bagsDelivered)],
                [t('sales.unitPrice'), `${f.money(d.verification.unitPrice)} / t`], [t('col.amount'), f.money(d.verification.amount)],
                [t('sales.weighbridge'), d.verification.weighbridge], [t('sales.invoice'), d.verification.invoice],
                ...(d.verification.qualityTest ? [[t('sales.qualityTest'), d.verification.qualityTest] as [string, string]] : []),
                [t('sales.verifiedBy'), `${lk.user(d.verification.by)} · ${f.dateTime(d.verification.at)}`],
              ]} />
            ) : <TabEmpty>{d.status === 'DELIVERED' ? t('sales.readyToVerify') : t('sales.notVerified')}</TabEmpty>,
          },
          { key: 'documents', label: t('sales.tab.documents'), count: d.documents.length, content: <DocumentsTab dispatch={d} onAdd={() => setDialog('doc')} /> },
          { key: 'approvals', label: t('buy.tab.approvals'), content: d.wf ? <ApprovalTimeline record={d as unknown as WorkflowRecord} def={def} /> : <TabEmpty>{t('inv.noApprovals')}</TabEmpty> },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="dispatchOrder" entityId={d.id} /> },
        ]} />
      {(dialog === 'advance' || dialog === 'position') && <AdvanceDialog dispatch={d} positionOnly={dialog === 'position'} onClose={() => setDialog(null)} />}
      {dialog === 'verify' && <VerifyDialog dispatch={d} onClose={() => setDialog(null)} />}
      {dialog === 'doc' && <AddDocDialog dispatchId={d.id} onClose={() => setDialog(null)} />}
    </>
  );
}

function OutboundRow({ id }: { id: string }) {
  const f = useFormat();
  const { t } = useT();
  const inv = useInventory();
  const transfer = useWarehouseStore((s) => s.transfers.find((x) => x.id === id));
  if (!transfer) return null;
  return <li className="flex justify-between gap-3 px-3 py-2"><span><span className="font-mono text-ink">{transfer.number}</span> <span className="text-muted">{`· ${inv.warehouseName(transfer.fromWarehouseId)} · ${t('sales.bagsN', { count: transfer.bagCodes.length })}`}</span></span><span className="tnum">{f.kg(transfer.sentKg)}</span></li>;
}

/** Documents on the order and who downloaded them (supplier or buyer). */
export function DocumentsTab({ dispatch: d, onAdd, readOnly }: { dispatch: DispatchOrder; onAdd?: () => void; readOnly?: boolean }) {
  const { t } = useT();
  const f = useFormat();
  const { userId, orgId } = useActor();
  const users = useAccessStore((s) => s.users);
  const orgs = usePlatformStore((s) => s.orgs);
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const download = (docId: string, name: string) => { logDownload(d.id, docId, userId ?? 'system', orgId); toast.success(t('sales.toast.downloaded', { name })); };
  return (
    <div className="space-y-5">
      {!readOnly && onAdd && <PermissionGate permission="dispatch.update"><Button size="sm" variant="secondary" onClick={onAdd}><FileUp /> {t('sales.addDocument')}</Button></PermissionGate>}
      {d.documents.length ? (
        <ul className="divide-y divide-line rounded-ctl border border-line">{d.documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
            <span className="min-w-0"><span className="block truncate font-medium text-ink">{doc.name}</span><span className="text-[12px] text-muted">{t(`sales.docType.${doc.type}`, { defaultValue: doc.type })} · {f.date(doc.at)}</span></span>
            <Button size="sm" variant="ghost" onClick={() => download(doc.id, doc.name)} aria-label={t('sales.downloadName', { name: doc.name })}><Download /> {t('sales.download')}</Button>
          </li>
        ))}</ul>
      ) : <TabEmpty>{t('sales.noDocuments')}</TabEmpty>}
      <div>
        <h4 className="mb-2 text-[13px] font-semibold text-ink">{t('sales.downloadLog')}</h4>
        {d.downloads.length ? (
          <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{[...d.downloads].reverse().map((x, i) => (
            <li key={i} className="flex justify-between gap-3 px-3 py-2"><span className="text-ink">{d.documents.find((doc) => doc.id === x.docId)?.name ?? '—'}</span><span className="text-right text-muted">{`${userName(x.userId)} · ${orgName(x.orgId)} · ${f.dateTime(x.at)}`}</span></li>
          ))}</ul>
        ) : <p className="text-[13px] text-muted">{t('sales.noDownloads')}</p>}
      </div>
    </div>
  );
}

function FilePick({ label, value, onChange, sample }: { label: string; value?: string; onChange: (v?: string) => void; sample: string }) {
  const { t } = useT();
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-dashed border-line p-2.5">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-ctl bg-surface px-3 text-[13px] font-medium text-ink ring-1 ring-line hover:bg-canvas">
          {t('sales.chooseFile')}
          <input type="file" className="sr-only" aria-label={label} onChange={(e) => { onChange(e.target.files?.[0]?.name); e.target.value = ''; }} />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(sample)}>{t('sales.useSample')}</Button>
        <span className={cn('text-[13px]', value ? 'text-ink' : 'text-muted')}>{value ?? t('sales.noFile')}</span>
      </div>
    </Field>
  );
}

function AdvanceDialog({ dispatch: d, positionOnly, onClose }: { dispatch: DispatchOrder; positionOnly: boolean; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const org = useCurrentOrg();
  const trace = useMemo(() => traceOf(d), [d]);
  const leaving = d.status === 'PENDING';
  const [eta, setEta] = useState(() => (d.position?.eta ?? new Date(Date.now() + 2 * 86_400_000).toISOString()).slice(0, 16));
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  // Simulated GPS: the truck moves a third of the way from where it is (or its sources) towards the port.
  const simulate = () => {
    const port = PORT[org.countries[0] ?? 'GH'] ?? PORT.GH!;
    const from = d.position ?? (trace.communities.length ? { lat: trace.communities.reduce((s, c) => s + c.gps.lat, 0) / trace.communities.length, lng: trace.communities.reduce((s, c) => s + c.gps.lng, 0) / trace.communities.length } : port);
    const k = d.status === 'ARRIVED' ? 1 : 0.35;
    setGps({ lat: Math.round((from.lat + (port.lat - from.lat) * k) * 1e4) / 1e4, lng: Math.round((from.lng + (port.lng - from.lng) * k) * 1e4) / 1e4 });
  };
  const title = positionOnly ? t('sales.updatePosition') : d.status === 'PENDING' ? t('sales.markInTransit') : d.status === 'IN_TRANSIT' ? t('sales.markArrived') : t('sales.markDelivered');
  const save = () => {
    const etaIso = eta ? new Date(eta).toISOString() : undefined;
    if (positionOnly) {
      if (!gps) return;
      updatePosition(d.id, { ...gps, eta: etaIso, note: note.trim() || undefined }, userId ?? 'system');
      toast.success(t('sales.toast.position', { number: d.number }));
    } else {
      const r = advanceShipment(d.id, userId ?? 'system', { ...(gps ?? {}), eta: etaIso, note: note.trim() || undefined });
      if (r.ok) toast.success(t('sales.toast.advanced', { number: d.number, status: t(`status.${r.status}`) }));
    }
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{leaving ? t('sales.inTransitHint') : t('sales.positionHint')}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-ctl border border-line p-3">
            <Button size="sm" variant="secondary" onClick={simulate}><MapPin /> {t('sales.useTruckGps')}</Button>
            <span className="tnum text-[13px] text-muted">{gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : t('sales.noGps')}</span>
          </div>
          {d.status !== 'ARRIVED' && <Field label={t('sales.eta')}><Input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} aria-label={t('sales.eta')} /></Field>}
          <Field label={t('sales.note')}><Input value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('sales.note')} /></Field>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={positionOnly && !gps} onClick={save}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyDialog({ dispatch: d, onClose }: { dispatch: DispatchOrder; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const { userId } = useActor();
  const sl = useSalesLookups();
  const settings = useOrgSettings();
  const contract = sl.contract(d.contractId);
  const currency = contract?.pricePerUnit.currency ?? f.org.currency;
  const dec = currency === 'XOF' ? 0 : 2;
  const list = settings.priceList.find((p) => p.commodityId === d.commodityId);
  const defaultPrice = contract?.pricePerUnit.amountMinor ?? Math.round((list?.price.amountMinor ?? 0) * 1000 * 1.25);
  const [deliveredKg, setDeliveredKg] = useState(String(d.expectedKg));
  const [bags, setBags] = useState(String(d.bagCodes.length));
  const [price, setPrice] = useState(String(defaultPrice / 10 ** dec));
  const [weighbridge, setWeighbridge] = useState<string>();
  const [invoice, setInvoice] = useState<string>();
  const [quality, setQuality] = useState<string>();
  const kg = Number(deliveredKg);
  const amountMinor = Math.round((kg / 1000) * Number(price || 0) * 10 ** dec);
  const variance = d.expectedKg ? Math.round(((d.expectedKg - kg) / d.expectedKg) * 1000) / 10 : 0;
  const invalid = !(kg > 0) || !(Number(price) > 0) || !weighbridge || !invoice;
  const save = () => {
    const v = verifyDispatch(d.id, { weighbridge: weighbridge!, invoice: invoice!, qualityTest: quality, deliveredKg: kg, bagsDelivered: Number(bags) || 0, unitPriceMinor: Math.round(Number(price) * 10 ** dec), currency }, userId ?? 'system');
    toast.success(t('sales.toast.verified', { number: d.number, sale: v.verification!.saleNumber }), { description: contract ? t('sales.toast.contractNow', { number: contract.number, pct: f.number(fulfilment(useSalesStore.getState().contracts.find((c) => c.id === contract.id)!).pct) }) : undefined });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('sales.verifyTitle', { number: d.number })}</DialogTitle><DialogDescription>{t('sales.verifyHint', { client: sl.clientName(d.clientId) })}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('sales.deliveredKg')} helper={t('sales.expectedKg', { kg: f.kg(d.expectedKg) })}><Input type="number" value={deliveredKg} onChange={(e) => setDeliveredKg(e.target.value)} aria-label={t('sales.deliveredKg')} /></Field>
            <Field label={t('inv.bags')}><Input type="number" value={bags} onChange={(e) => setBags(e.target.value)} aria-label={t('inv.bags')} /></Field>
            <Field label={t('sales.pricePerT', { currency })}><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={t('sales.unitPrice')} /></Field>
          </div>
          <FilePick label={t('sales.weighbridge')} value={weighbridge} onChange={setWeighbridge} sample={`weighbridge-${d.number}.pdf`} />
          <FilePick label={t('sales.invoice')} value={invoice} onChange={setInvoice} sample={`invoice-${d.number}.pdf`} />
          <FilePick label={t('sales.qualityTestOptional')} value={quality} onChange={setQuality} sample={`quality-${d.number}.pdf`} />
          <div className="flex items-center justify-between rounded-ctl bg-canvas px-4 py-3 text-[14px]">
            <span className="text-muted">{t('sales.varianceIs', { pct: f.number(variance) })}</span>
            <span className="tnum text-[18px] font-semibold text-ink">{f.money({ amountMinor, currency })}</span>
          </div>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}><BadgeCheck /> {t('sales.verifyAndIssue')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DOC_TYPES = ['waybill', 'qualityTest', 'phytosanitary', 'certificateOrigin', 'other'];

function AddDocDialog({ dispatchId, onClose }: { dispatchId: string; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const [type, setType] = useState(DOC_TYPES[0]!);
  const [name, setName] = useState<string>();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('sales.addDocument')}</DialogTitle><DialogDescription>{t('sales.addDocumentHint')}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label={t('col.type')}><select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('col.type')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">{DOC_TYPES.map((x) => <option key={x} value={x}>{t(`sales.docType.${x}`)}</option>)}</select></Field>
          <FilePick label={t('sales.file')} value={name} onChange={setName} sample={`${type}.pdf`} />
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!name} onClick={() => { addDispatchDocument(dispatchId, { type, name: name! }, userId ?? 'system'); toast.success(t('sales.toast.docAdded', { name })); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** New dispatch order: from inventory (pending outbounds) or bought direct (purchase requests). */
function NewDispatchSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const lk = useLookups();
  const inv = useInventory();
  const sl = useSalesLookups();
  const kgT = useKgT();
  const settings = useOrgSettings();
  const transfers = useWarehouseStore((s) => s.transfers);
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const dispatches = useOrgRows(useSalesStore((s) => s.dispatches));
  const [kind, setKind] = useState<DispatchOrder['kind']>('INVENTORY');
  const [clientId, setClientId] = useState(sl.clients[0]?.id ?? '');
  const openContracts = sl.contracts.filter((c) => c.clientId === clientId && ['AGREED', 'ORDER_CREATED'].includes(c.status));
  const [contractId, setContractId] = useState(openContracts[0]?.id ?? '');
  const contract = sl.contract(contractId);
  const [commodityId, setCommodityId] = useState(contract?.commodityId ?? settings.commodities[0]?.id ?? '');
  const commodity = contract?.commodityId ?? commodityId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const outbounds = useMemo(() => pendingOutbounds(orgId, commodity), [orgId, commodity, transfers]);
  const used = new Set(dispatches.flatMap((d) => d.requestIds));
  const kgOfRequest = (id: string) => purchases.filter((p) => p.requestId === id).reduce((s, p) => s + p.quantity, 0);
  const directRequests = requests.filter((r) => r.commodityId === commodity && !used.has(r.id) && kgOfRequest(r.id) > 0).slice(0, 30);
  const [picked, setPicked] = useState<string[]>([]);
  const [driver, setDriver] = useState({ name: '', phone: '', licence: undefined as string | undefined });
  const [truck, setTruck] = useState({ plate: '', image: undefined as string | undefined });
  const [waybill, setWaybill] = useState('');
  const [place, setPlace] = useState('');
  const pickedOutbounds = outbounds.filter((o) => picked.includes(o.id));
  const expectedKg = kind === 'INVENTORY' ? pickedOutbounds.reduce((s, o) => s + o.sentKg, 0) : picked.reduce((s, id) => s + kgOfRequest(id), 0);
  const fil = contract ? fulfilment(contract) : null;
  const left = fil ? Math.max(0, fil.contractedKg - fil.deliveredKg - fil.inTransitKg) : null;
  const invalid = !clientId || !picked.length || !driver.name.trim() || !driver.phone.trim() || !truck.plate.trim() || !waybill.trim();
  const reset = (patch: () => void) => { patch(); setPicked([]); };
  const save = () => {
    try {
      const d = createDispatch({
        orgId, kind, clientId, contractId: contractId || undefined, commodityId: commodity, actorId: userId ?? 'system',
        outboundIds: kind === 'INVENTORY' ? picked : [], requestIds: kind === 'DIRECT' ? picked : [], expectedKg,
        loading: kind === 'INVENTORY' ? { warehouseId: pickedOutbounds[0]?.fromWarehouseId, place: inv.warehouseName(pickedOutbounds[0]?.fromWarehouseId) } : { place: place.trim() || '—' },
        driver: { name: driver.name.trim(), phone: driver.phone.trim(), licence: driver.licence }, truck: { plate: truck.plate.trim().toUpperCase(), image: truck.image }, waybill: waybill.trim(),
      });
      toast.success(t('sales.toast.created', { number: d.number }), { description: t('dashboard.actedStatus', { status: t(`status.${d.status}`) }) });
      onClose(d.id);
    } catch (e) {
      toast.error(t(`sales.error.${(e as Error).message}`, { defaultValue: (e as Error).message }));
    }
  };
  const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('sales.newDispatch')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('col.type')}>
            {(['INVENTORY', 'DIRECT'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => reset(() => setKind(k))} className={cn('rounded-ctl border px-3 py-3 text-left text-[14px]', kind === k ? 'border-brand bg-brand-soft text-ink' : 'border-line text-body hover:bg-canvas')}>
                <span className="block font-semibold">{t(`sales.kind.${k}`)}</span><span className="text-[12px] text-muted">{t(`sales.kindHint.${k}`)}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('sales.client')}><select value={clientId} onChange={(e) => reset(() => { setClientId(e.target.value); const first = sl.contracts.find((c) => c.clientId === e.target.value && ['AGREED', 'ORDER_CREATED'].includes(c.status)); setContractId(first?.id ?? ''); })} aria-label={t('sales.client')} className={select}>{sl.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={t('sales.contract')}><select value={contractId} onChange={(e) => reset(() => setContractId(e.target.value))} aria-label={t('sales.contract')} className={select}><option value="">{t('sales.noContract')}</option>{openContracts.map((c) => <option key={c.id} value={c.id}>{`${c.number} · ${lk.commodity(c.commodityId)} · ${f.number(c.quantity)} ${c.unitId}`}</option>)}</select></Field>
          </div>
          {contract ? (
            <div className="rounded-ctl bg-canvas px-4 py-3 text-[13px] text-body">{t('sales.contractLeft', { commodity: lk.commodity(contract.commodityId), left: kgT(left ?? 0), pct: f.number(fil!.pct) })}</div>
          ) : (
            <Field label={t('col.commodity')}><select value={commodityId} onChange={(e) => reset(() => setCommodityId(e.target.value))} aria-label={t('col.commodity')} className={select}>{settings.commodities.map((c) => <option key={c.id} value={c.id}>{lk.commodity(c.id)}</option>)}</select></Field>
          )}
          <div>
            <h3 className="mb-2 text-[14px] font-semibold text-ink">{kind === 'INVENTORY' ? t('sales.pickOutbounds') : t('sales.pickRequests')}</h3>
            {(kind === 'INVENTORY' ? outbounds.length : directRequests.length) ? (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
                {kind === 'INVENTORY'
                  ? outbounds.map((o) => <li key={o.id} className="px-3 py-2"><Checkbox checked={picked.includes(o.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))} label={`${o.number} · ${inv.warehouseName(o.fromWarehouseId)}`} description={`${t('sales.bagsN', { count: o.bagCodes.length })} · ${kgT(o.sentKg)} · ${f.date(o.createdAt)}`} /></li>)
                  : directRequests.map((r) => <li key={r.id} className="px-3 py-2"><Checkbox checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} label={`${r.number} · ${lk.community(r.communityId)}`} description={`${lk.agent(r.agentId)} · ${kgT(kgOfRequest(r.id))}`} /></li>)}
              </ul>
            ) : <TabEmpty>{kind === 'INVENTORY' ? t('sales.noOutbounds') : t('sales.noRequests')}</TabEmpty>}
          </div>
          {kind === 'DIRECT' && <Field label={t('sales.loadingPlace')}><Input value={place} onChange={(e) => setPlace(e.target.value)} aria-label={t('sales.loadingPlace')} /></Field>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('sales.driverName')}><Input value={driver.name} onChange={(e) => setDriver({ ...driver, name: e.target.value })} aria-label={t('sales.driverName')} /></Field>
            <Field label={t('sales.driverPhone')}><Input value={driver.phone} inputMode="tel" onChange={(e) => setDriver({ ...driver, phone: e.target.value })} aria-label={t('sales.driverPhone')} /></Field>
            <Field label={t('sales.truckPlate')}><Input value={truck.plate} onChange={(e) => setTruck({ ...truck, plate: e.target.value })} aria-label={t('sales.truckPlate')} /></Field>
            <Field label={t('sales.waybill')}><Input value={waybill} onChange={(e) => setWaybill(e.target.value)} aria-label={t('sales.waybill')} /></Field>
          </div>
          <FilePick label={t('sales.licence')} value={driver.licence} onChange={(v) => setDriver({ ...driver, licence: v })} sample="driver-licence.jpg" />
          <FilePick label={t('sales.truckImage')} value={truck.image} onChange={(v) => setTruck({ ...truck, image: v })} sample="truck.jpg" />
          <div className="flex items-center justify-between rounded-ctl bg-canvas px-4 py-3 text-[14px]"><span className="text-muted">{t('sales.expected')}</span><span className="tnum text-[18px] font-semibold text-ink">{kgT(expectedKg)}</span></div>
          {left != null && expectedKg > left && <p className="text-[13px] text-warning">{t('sales.overContract')}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4"><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('buy.submit')}</Button></div>
      </SheetContent>
    </Sheet>
  );
}
