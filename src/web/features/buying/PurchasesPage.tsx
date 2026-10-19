import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Lock, Pencil, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { Purchase } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { Tip } from '@/components/ui/tooltip';
import { Field } from '@/components/shared/Field';
import { Photo } from '@/components/forms/media';
import { Donut, HBars, StackedColumns } from '@/components/charts/charts';
import { debtCheck } from '@/services/buyingService';
import { providerOfPhone } from '@/services/paymentService';
import { PayDialog, type PayRequest } from '@/web/features/payments/PayDialog';
import type { Farmer, OrgSettings, PurchaseRequest } from '@/types';
import { formatPhone } from '@/lib/format';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, logActivity, useLookups } from '@/web/features/people/shared';
import { EvidenceIcons, Panel, PaymentState, SignatureImage, VoicePlayer, mono, useFarmerNames } from './common';
import { QrCode } from './qr';

type Tab = 'cash' | 'direct' | 'unpaid';

/** Farmer purchases (PRD D2): three tabs, evidence, debt banner, detail drawer and the purchases dashboard. */
export function PurchasesPage() {
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const fn = useFarmerNames();
  const settings = useOrgSettings();
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const [openId, open, close] = useDrawerParam();
  const [tab, setTab] = useState<Tab>('cash');
  const [q, setQ] = useState('');
  const [agent, setAgent] = useState('');
  const [community, setCommunity] = useState('');
  const [commodity, setCommodity] = useState('');
  const [status, setStatus] = useState('');
  useDemoNotes([{ id: 'pur', key: 'demo.note.purchases' }]);

  const reqById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);
  const model = (p: Purchase) => reqById.get(p.requestId)?.sourcingModel ?? 'CASH_ADVANCE';
  const inTab = (p: Purchase, v: Tab) => (v === 'unpaid' ? p.paymentStatus !== 'PAID' : v === 'direct' ? model(p) === 'DIRECT_PAYMENT' : model(p) === 'CASH_ADVANCE');
  const query = q.trim().toLowerCase();
  const rows = useMemo(() => purchases
    .filter((p) => (!agent || p.agentId === agent) && (!community || p.communityId === community) && (!commodity || p.commodityId === commodity) && (!status || p.paymentStatus === status) &&
      (!query || p.number.toLowerCase().includes(query) || fn.name(p.farmerId).toLowerCase().includes(query) || p.bagCodes.some((c) => c.toLowerCase().includes(query))))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [purchases, agent, community, commodity, status, query, fn]);
  const shown = rows.filter((p) => inTab(p, tab));

  const columns = useMemo<ColumnDef<Purchase, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'farmer', header: terms.farmer, accessorFn: (p) => fn.name(p.farmerId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'community', header: terms.community, accessorFn: (p) => lk.community(p.communityId) },
    { id: 'agent', header: terms.agent, accessorFn: (p) => lk.agent(p.agentId) },
    { id: 'request', header: terms.purchaseRequest, accessorFn: (p) => reqById.get(p.requestId)?.number ?? '—', cell: (c) => mono(c.getValue() as string) },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (p) => lk.commodity(p.commodityId) },
    { id: 'quantity', header: t('col.quantity'), accessorKey: 'quantity', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'unitPrice', header: t('col.unitPrice'), accessorFn: (p) => p.unitPrice.amountMinor, cell: (c) => f.money(c.row.original.unitPrice) },
    { id: 'amount', header: t('col.amount'), accessorFn: (p) => p.amount.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.amount)}</span> },
    { id: 'paid', header: t('buy.paidToFarmer', { farmer: terms.farmer.toLocaleLowerCase() }), accessorFn: (p) => p.paidToFarmer.amountMinor, cell: (c) => <span>{f.money(c.row.original.paidToFarmer)}{c.row.original.deductedForLoan && <Badge tone="warning" className="ml-1.5">{t('buy.loanDeducted')}</Badge>}</span> },
    { id: 'status', header: t('buy.paymentStatus'), accessorKey: 'paymentStatus', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'bags', header: t('col.bags'), accessorFn: (p) => p.bagCodes.join(', '), cell: (c) => <span className="font-mono text-[12px]">{c.getValue() as string}</span> },
    { id: 'consolidated', header: t('buy.consolidatedRef'), accessorFn: (p) => p.consolidationRef ?? '', cell: (c) => ((c.getValue() as string) ? <Badge tone="info">{c.getValue() as string}</Badge> : '—') },
    { id: 'evidence', header: t('buy.evidenceCol'), enableSorting: false, cell: (c) => <EvidenceIcons evidence={c.row.original.evidence} /> },
    { id: 'plot', header: t('buy.plot'), accessorFn: (p) => p.plotId ?? '—' },
  ], [t, f, lk, fn, terms, reqById]);

  const current = purchases.find((p) => p.id === openId);
  const maxBulk = settings.bulkBatchSize || 20;
  const [paying, setPaying] = useState<PayRequest | null>(null);
  const country = f.org.countries[0] ?? 'GH';
  const startPay = (sel: Purchase[], clear?: () => void) => {
    const unpaid = sel.filter((p) => ['NOT_PAID', 'FAILED'].includes(p.paymentStatus));
    const req = reqById.get(unpaid[0]?.requestId ?? '');
    if (!req) return;
    setPaying(farmerPayRequest(unpaid, req, settings, country, fn.get, t));
    clear?.();
  };
  return (
    <>
      <PageHeader eyebrow={t('nav.section.buying')} title={t('nav.purchases')} description={t('pages.purchases')} />
      <Tabs defaultValue="list">
        <TabsList className="mb-5">
          <TabsTrigger value="list">{t('buy.purchasesList')}</TabsTrigger>
          <TabsTrigger value="dashboard">{t('buy.dashboard')}</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <FilterBar
            search={q}
            onSearch={setQ}
            placeholder={t('buy.searchPurchases')}
            views={(['cash', 'direct', 'unpaid'] as const).map((v) => ({ key: v, label: t(`buy.purchaseTab.${v}`), active: tab === v, onSelect: () => setTab(v), count: rows.filter((p) => inTab(p, v)).length }))}
            filters={[
              { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => purchases.some((p) => p.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })).sort((a, b) => a.label.localeCompare(b.label)) },
              { key: 'community', label: terms.community, value: community, onChange: setCommunity, options: lk.communities.filter((c) => purchases.some((p) => p.communityId === c.id)).map((c) => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)) },
              { key: 'commodity', label: t('col.commodity'), value: commodity, onChange: setCommodity, options: settings.commodities.map((c) => ({ value: c.id, label: lk.commodity(c.id) })) },
              { key: 'status', label: t('buy.paymentStatus'), value: status, onChange: setStatus, options: (['NOT_PAID', 'PENDING', 'PAID', 'FAILED'] as const).map((s) => ({ value: s, label: t(`status.${s}`) })) },
            ]}
            onClear={() => { setQ(''); setAgent(''); setCommunity(''); setCommodity(''); setStatus(''); }}
          />
          <DataTable
            columns={columns}
            data={shown}
            onRowClick={(p) => open(p.id)}
            activeId={openId}
            getRowId={(p) => p.id}
            columnPicker
            initialHidden={['unitPrice', 'commodity', 'plot', 'request']}
            bulkActions={tab === 'cash' ? undefined : (sel, clear) => {
              const unpaid = sel.filter((p) => ['NOT_PAID', 'FAILED'].includes(p.paymentStatus) && model(p) === 'DIRECT_PAYMENT');
              const reason = !unpaid.length ? t('buy.bulk.noneUnpaid') : new Set(unpaid.map((p) => p.requestId)).size > 1 ? t('buy.bulk.sameRequest') : unpaid.length > maxBulk ? t('buy.bulk.tooMany', { max: maxBulk }) : '';
              const btn = <Button size="sm" disabled={!!reason} onClick={() => startPay(unpaid, clear)}><Send /> {t('buy.bulkPay', { count: unpaid.length })}</Button>;
              return <PermissionGate permission="purchases.pay">{reason ? <Tip label={reason}><span>{btn}</span></Tip> : btn}</PermissionGate>;
            }}
            exportCsv={{ fileName: 'purchases.csv', columns: [
              { header: t('col.number'), value: (p) => p.number }, { header: t('col.date'), value: (p) => p.createdAt.slice(0, 10) }, { header: terms.farmer, value: (p) => fn.name(p.farmerId) },
              { header: terms.community, value: (p) => lk.community(p.communityId) }, { header: terms.agent, value: (p) => lk.agent(p.agentId) }, { header: t('col.quantity'), value: (p) => p.quantity },
              { header: t('col.amount'), value: (p) => p.amount.amountMinor / 100 }, { header: t('buy.paymentStatus'), value: (p) => p.paymentStatus }, { header: t('col.bags'), value: (p) => p.bagCodes.join(' ') },
            ] }}
            empty={t('buy.emptyPurchases')}
          />
        </TabsContent>
        <TabsContent value="dashboard"><PurchasesDashboard purchases={purchases} /></TabsContent>
      </Tabs>
      {current && <PurchaseDrawer key={current.id} purchase={current} onClose={close} onPay={(sel) => startPay(sel)} />}
      {paying && <PayDialog request={paying} onClose={() => setPaying(null)} />}
    </>
  );
}

function PurchaseDrawer({ purchase: p, onClose, onPay }: { purchase: Purchase; onClose: () => void; onPay: (sel: Purchase[]) => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const fn = useFarmerNames();
  const settings = useOrgSettings();
  const bags = useBuyingStore((s) => s.bags);
  const allPurchases = useBuyingStore((s) => s.purchases);
  const requests = useBuyingStore((s) => s.requests);
  const payments = usePaymentStore((s) => s.payments);
  const farmer = fn.get(p.farmerId);
  const req = requests.find((r) => r.id === p.requestId);
  const myBags = bags.filter((b) => p.bagCodes.includes(b.code));
  const attempts = payments.filter((x) => x.payableId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const debt = debtCheck(p.orgId, p.farmerId);
  const pack = settings.packaging.find((x) => x.commodityId === p.commodityId);
  const country = f.org.countries[0] ?? 'GH';
  const wallet = p.wallet ?? (farmer ? { providerId: providerOfPhone(settings, farmer.phone, country)?.id ?? '', number: farmer.phone, name: `${farmer.firstName} ${farmer.lastName}`.toUpperCase() } : undefined);
  const locked = p.paymentStatus !== 'NOT_PAID' || attempts.length > 0;
  const [editing, setEditing] = useState(false);
  const direct = req?.sourcingModel === 'DIRECT_PAYMENT';
  const unpaid = (x: Purchase) => ['NOT_PAID', 'FAILED'].includes(x.paymentStatus);
  const related = direct ? allPurchases.filter((x) => x.requestId === p.requestId && x.id !== p.id && unpaid(x)) : [];
  const canPay = direct && unpaid(p) && !attempts.some((x) => ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(x.status));
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{p.number}</span>}
        subtitle={`${fn.name(p.farmerId)} · ${lk.community(p.communityId)} · ${f.dateTime(p.createdAt)}`}
        badges={<><StatusBadge status={p.paymentStatus} /><Badge tone="neutral">{t(`buy.sourcingName.${req?.sourcingModel ?? 'CASH_ADVANCE'}`)}</Badge>{p.syncedFrom && <Badge tone="neutral">{t(`buy.source.${p.syncedFrom}`)}</Badge>}{p.consolidationRef && <Badge tone="info">{t('buy.consolidated')}</Badge>}</>}
        tabs={[
          {
            key: 'detail', label: t('buy.tab.summary'), content: (
              <div className="space-y-5">
                {debt.balance > 0 && (
                  <p className={`flex items-start gap-2 rounded-ctl border px-4 py-3 text-[14px] ${debt.blocked ? 'border-danger/30 bg-danger/5 text-danger' : 'border-warning/30 bg-warning/5 text-ink'}`} role="status">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {t(`buy.debtBanner.${debt.policy}`, { amount: f.money({ amountMinor: debt.balance, currency: p.amount.currency }), farmer: terms.farmer.toLocaleLowerCase() })}
                  </p>
                )}
                {farmer && (
                  <Link to={`/app/farmers?open=${farmer.id}`} className="flex items-center gap-3 rounded-ctl border border-line p-3 hover:border-brand/40">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-[14px] font-semibold text-brand">{farmer.firstName[0]}{farmer.lastName[0]}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-ink">{fn.name(farmer.id)}</span><span className="block text-[12px] text-muted"><span className="font-mono">{farmer.farmerCode}</span> · {formatPhone(farmer.phone)}</span></span>
                  </Link>
                )}
                <Facts items={[
                  [t('col.quantity'), f.kg(p.quantity)], [t('col.unitPrice'), f.money(p.unitPrice)], [t('col.amount'), f.money(p.amount)], [t('buy.paidToFarmer', { farmer: terms.farmer.toLocaleLowerCase() }), f.money(p.paidToFarmer)],
                  ...(p.deductedForLoan ? [[t('buy.loanDeduction'), f.money(p.deductedForLoan)] as [string, string]] : []),
                  [terms.purchaseRequest, req ? <Link key="r" to={`/app/purchase-requests?open=${req.id}`} className="font-mono text-brand hover:underline">{req.number}</Link> : '—'], [terms.agent, lk.agent(p.agentId)],
                  [t('buy.plot'), p.plotId ?? t('buy.noPlot')],
                ]} />
                <Panel title={t('buy.bagsTitle')}>
                  {myBags.length ? (
                    <ul className="space-y-3">
                      {myBags.map((b) => {
                        const shares = b.purchaseIds.map((id) => allPurchases.find((x) => x.id === id)).filter(Boolean) as Purchase[];
                        return (
                          <li key={b.id} className="flex gap-4">
                            <QrCode value={b.code} className="h-20 w-20 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <Link to={`/app/purchases/bags?open=${b.id}`} className="font-mono text-[14px] font-medium text-ink hover:text-brand">{b.code}</Link>
                              <div className="text-[12px] text-muted">{f.kg(b.weightKg)}{pack ? ` · ${t('buy.bounds', { min: pack.minKg, max: pack.maxKg })}` : ''} · {t(`buy.bagStatus.${b.status}`)}</div>
                              {shares.length > 1 && (
                                <ul className="mt-1.5 space-y-0.5 text-[12px] text-body">
                                  {shares.map((x) => {
                                    const kgIn = b.contributions?.find((c) => c.purchaseId === x.id)?.kg;
                                    return <li key={x.id} className={x.id === p.id ? 'font-medium text-ink' : ''}>{`${fn.name(x.farmerId)} · ${kgIn != null ? f.kg(kgIn) : `≈ ${f.kg(Math.round((x.quantity / Math.max(1, x.bagCodes.length)) * 10) / 10)}`}`}</li>;
                                  })}
                                </ul>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="text-[14px] text-muted">{t('buy.noBags')}</p>}
                </Panel>
              </div>
            ),
          },
          {
            key: 'evidence', label: t('buy.tab.evidence'), content: (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="eyebrow mb-2">{t('buy.evidence.scalePhoto')}</div>
                    {p.evidence.scalePhoto ? <Photo src={p.evidence.scalePhoto.startsWith('data:') ? p.evidence.scalePhoto : 'sample:farm-1'} className="h-40 w-full rounded-ctl border border-line" alt={t('buy.evidence.scalePhoto')} /> : <TabEmpty>{t('buy.none')}</TabEmpty>}
                  </div>
                  <div>
                    <div className="eyebrow mb-2">{t('buy.evidence.signature')}</div>
                    {p.evidence.signature ? <SignatureImage value={p.evidence.signature} className="h-40 w-full" /> : <TabEmpty>{direct ? t('buy.noSignatureDirect') : t('buy.none')}</TabEmpty>}
                  </div>
                </div>
                <div>
                  <div className="eyebrow mb-2">{t('buy.evidence.voiceNote')}</div>
                  {p.evidence.voiceNote ? <VoicePlayer id={p.id} /> : <p className="text-[14px] text-muted">{t('buy.none')}</p>}
                </div>
                <div>
                  <div className="eyebrow mb-2">{t('buy.evidence.gps')}</div>
                  {p.evidence.gps ? (
                    <>
                      <div className="h-56 overflow-hidden rounded-ctl border border-line">
                        <MapContainer center={[p.evidence.gps.lat, p.evidence.gps.lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl={false}>
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <CircleMarker center={[p.evidence.gps.lat, p.evidence.gps.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#14583F', fillOpacity: 1 }} />
                        </MapContainer>
                      </div>
                      <p className="mt-1 text-[12px] text-muted">{t('buy.gpsLine', { lat: p.evidence.gps.lat.toFixed(5), lng: p.evidence.gps.lng.toFixed(5), acc: p.evidence.gps.accuracy })}</p>
                    </>
                  ) : <p className="text-[14px] text-muted">{t('buy.none')}</p>}
                </div>
              </div>
            ),
          },
          {
            key: 'payment', label: t('buy.tab.payment'), count: attempts.length, content: (
              <div className="space-y-4">
                {!direct && <p className="text-[14px] text-muted">{t('buy.cashPaidNote', { farmer: terms.farmer.toLocaleLowerCase() })}</p>}
                <PaymentState payableId={p.id} />
                {canPay && (
                  <PermissionGate permission="purchases.pay">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => onPay([p])}><Send /> {t('buy.payFarmer', { farmer: terms.farmer.toLocaleLowerCase() })}</Button>
                      {related.length > 0 && <Button size="sm" variant="secondary" onClick={() => onPay([p, ...related].slice(0, settings.bulkBatchSize || 20))}>{t('buy.payRelated', { count: related.length + 1 })}</Button>}
                    </div>
                  </PermissionGate>
                )}
                {canPay && related.length > 0 && <p className="text-[13px] text-muted">{t('buy.relatedUnpaid', { count: related.length })}</p>}
                {wallet && (
                  <div className="rounded-ctl border border-line p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="eyebrow">{t('buy.wallet')}</div>
                      {locked ? <Badge tone="neutral"><Lock className="h-3 w-3" /> {t('buy.walletLocked')}</Badge> : <PermissionGate permission="purchases.editWallet"><Button size="xs" variant="ghost" onClick={() => setEditing(true)}><Pencil /> {t('people.edit')}</Button></PermissionGate>}
                    </div>
                    <Facts cols={3} items={[[t('buy.walletName'), wallet.name], [t('buy.walletNumber'), formatPhone(wallet.number)], [t('col.provider'), settings.paymentProviders.find((x) => x.id === wallet.providerId)?.name ?? '—']]} />
                  </div>
                )}
                {attempts.length ? (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {attempts.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"><span className="font-mono text-ink">{x.reference}</span><StatusBadge status={x.status} /><span className="min-w-0 flex-1 truncate text-muted">{x.failureReason ?? ''}</span><span className="tnum text-ink">{f.money(x.amount)}</span><span className="text-muted">{f.dateTime(x.createdAt)}</span></li>
                    ))}
                  </ul>
                ) : direct ? <TabEmpty>{t('buy.noAttempts')}</TabEmpty> : null}
              </div>
            ),
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="purchase" entityId={p.id} /> },
        ]}
      />
      {editing && wallet && (
        <WalletDialog
          initial={wallet}
          providers={settings.paymentProviders.filter((x) => x.kind === 'MOBILE_MONEY' && x.enabled)}
          onClose={() => setEditing(false)}
          onSave={(w) => {
            useBuyingStore.getState().updatePurchases([p.id], () => ({ wallet: w }));
            logActivity(orgId, 'purchase', p.id, 'purchase.walletChanged', { number: w.number }, userId ?? 'system');
            toast.success(t('buy.toast.walletSaved'));
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

function WalletDialog({ initial, providers, onClose, onSave }: { initial: { providerId: string; number: string; name: string }; providers: { id: string; name: string }[]; onClose: () => void; onSave: (w: { providerId: string; number: string; name: string }) => void }) {
  const { t } = useT();
  const [w, setW] = useState(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('buy.editWallet')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label={t('col.provider')}>
            <select value={w.providerId} onChange={(e) => setW({ ...w, providerId: e.target.value })} aria-label={t('col.provider')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
              {providers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label={t('buy.walletNumber')}><Input compact type="tel" value={w.number} onChange={(e) => setW({ ...w, number: e.target.value })} aria-label={t('buy.walletNumber')} /></Field>
          <Field label={t('buy.walletName')}><Input compact value={w.name} onChange={(e) => setW({ ...w, name: e.target.value.toUpperCase() })} aria-label={t('buy.walletName')} /></Field>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!w.number.trim() || !w.name.trim()} onClick={() => onSave(w)}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Purchases dashboard (PRD D2). */
function PurchasesDashboard({ purchases }: { purchases: Purchase[] }) {
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const expenses = useOrgRows(useBuyingStore((s) => s.expenses));
  const [days, setDays] = useState(90);
  const rows = useMemo(() => { const since = Date.now() - days * 86_400_000; return purchases.filter((p) => new Date(p.createdAt).getTime() >= since); }, [purchases, days]);
  const volume = rows.reduce((s, p) => s + p.quantity, 0);
  const spend = rows.reduce((s, p) => s + p.amount.amountMinor, 0);
  const byFarmer = new Map<string, { kg: number; amount: number; commodityId: string }>();
  for (const p of rows) { const x = byFarmer.get(p.farmerId) ?? { kg: 0, amount: 0, commodityId: p.commodityId }; x.kg += p.quantity; x.amount += p.amount.amountMinor; byFarmer.set(p.farmerId, x); }
  const farmers = byFarmer.size;
  let aggregatorKg = 0;
  for (const x of byFarmer.values()) if (x.kg > (settings.commodities.find((c) => c.id === x.commodityId)?.aggregatorThresholdKg ?? Infinity)) aggregatorKg += x.kg;
  const tally = (key: (p: Purchase) => string, label: (k: string) => string) => {
    const m = new Map<string, number>();
    for (const p of rows) m.set(key(p), (m.get(key(p)) ?? 0) + p.quantity);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => ({ label: label(k), value: Math.round(v) }));
  };
  const preBags = expenses.reduce((s, e) => s + e.bags, 0);
  const costPerBag = preBags ? Math.round(expenses.reduce((s, e) => s + e.total.amountMinor, 0) / preBags) : 0;
  const weeks = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    const start = (d: string) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    for (const p of rows) { const k = start(p.createdAt); const cur = m.get(k) ?? {}; cur[p.commodityId] = (cur[p.commodityId] ?? 0) + p.quantity; m.set(k, cur); }
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: f.date(k, 'd MMM'), ...Object.fromEntries(Object.entries(v).map(([c, kg]) => [c, Math.round(kg)])) }));
  }, [rows, f]);
  const commodities = settings.commodities.filter((c) => rows.some((p) => p.commodityId === c.id));
  const cur = (minor: number, compact?: boolean) => f.money({ amountMinor: minor, currency: f.org.currency }, { compact });
  const kpi = (label: string, value: string, hint?: string) => (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><div className="eyebrow">{label}</div><div className="tnum mt-2 text-[24px] font-semibold leading-none text-ink">{value}</div>{hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}</div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('buy.period')}>
        {[30, 90, 365].map((d) => <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)} className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${days === d ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-body hover:border-brand/40'}`}>{t('buy.lastDays', { count: d })}</button>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpi(t('buy.kpi.volume'), f.kg(Math.round(volume)))}
        {kpi(t('buy.kpi.spend'), cur(spend, true), cur(spend))}
        {kpi(t('buy.kpi.farmers', { farmers: terms.farmers.toLocaleLowerCase() }), f.number(farmers))}
        {kpi(t('buy.kpi.costPerBag'), costPerBag ? cur(costPerBag) : '—', t('buy.kpi.fromPre', { count: expenses.length }))}
        {kpi(t('buy.kpi.avgVolume', { farmer: terms.farmer.toLocaleLowerCase() }), f.kg(farmers ? Math.round(volume / farmers) : 0))}
        {kpi(t('buy.kpi.avgIncome', { farmer: terms.farmer.toLocaleLowerCase() }), cur(farmers ? Math.round(spend / farmers) : 0))}
        {kpi(t('buy.kpi.purchases'), f.number(rows.length))}
        {kpi(t('buy.kpi.avgPrice'), cur(volume ? Math.round(spend / volume) : 0), t('buy.perKg'))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('buy.split')}>
          <Donut data={[{ label: t('buy.smallholder'), value: Math.round(volume - aggregatorKg), index: 0 }, { label: t('buy.aggregator'), value: Math.round(aggregatorKg), index: 1 }]} format={(v) => f.kg(v)} />
        </Panel>
        <Panel title={t('buy.topAgents', { agents: terms.agents.toLocaleLowerCase() })}><HBars data={tally((p) => p.agentId, (k) => lk.agent(k))} format={(v) => f.kg(v)} /></Panel>
        <Panel title={t('buy.topCommunities', { communities: terms.communities.toLocaleLowerCase() })}><HBars data={tally((p) => p.communityId, (k) => lk.community(k))} format={(v) => f.kg(v)} /></Panel>
      </div>
      <Panel title={t('buy.overTime')}>
        {weeks.length ? <StackedColumns data={weeks} series={commodities.map((c) => ({ key: c.id, label: lk.commodity(c.id), index: settings.commodities.indexOf(c) }))} format={(v) => f.kg(v)} axisFormat={(v) => f.number(v, { notation: 'compact' })} /> : <TabEmpty>{t('buy.emptyPurchases')}</TabEmpty>}
      </Panel>
    </div>
  );
}

/** Payees for direct farmer payments: the purchase's wallet, else the farmer's phone. */
export function farmerPayRequest(sel: Purchase[], req: PurchaseRequest, settings: OrgSettings, country: string, farmerOf: (id: string) => Farmer | undefined, t: (k: string, o?: Record<string, unknown>) => string): PayRequest {
  const payees = sel.map((p) => {
    const fa = farmerOf(p.farmerId);
    const name = p.wallet?.name ?? (fa ? `${fa.firstName} ${fa.lastName}`.toUpperCase() : p.number);
    const number = p.wallet?.number ?? fa?.phone ?? '';
    return { name, number, providerId: p.wallet?.providerId ?? providerOfPhone(settings, number, country)?.id, amount: p.paidToFarmer, payableId: p.id, label: `${p.number} · ${p.quantity} kg` };
  });
  return { type: sel.length > 1 ? 'BULK_FARMER_PURCHASE' : 'FARMER_PURCHASE', payableId: sel.length > 1 ? req.id : sel[0]!.id, title: sel.length > 1 ? t('pay.titleBulk', { count: sel.length, number: req.number }) : t('pay.titleFarmer', { number: sel[0]!.number }), payees };
}
