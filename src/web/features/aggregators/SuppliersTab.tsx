import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Check, Pencil, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { Supplier } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { PermissionGate } from '@/components/shared/Gates';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { Field } from '@/components/shared/Field';
import { banksFor } from '@/data/catalogs/banks';
import { createSupplier, decideSupplier, updateSupplier, type SupplierInput } from '@/services/aggregatorService';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, DocumentsPanel, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';

type View = 'all' | 'pending' | 'approved' | 'blocked';
const VIEW_STATUS: Record<View, Supplier['status'] | null> = { all: null, pending: 'PENDING_APPROVAL', approved: 'APPROVED', blocked: 'BLOCKED' };

/** Supplier (aggregator) registry (PRD D4): KYC, payout methods, approval and purchase history. */
export function SuppliersTab() {
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const suppliers = useOrgRows(useBuyingStore((s) => s.suppliers));
  const purchases = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const stats = useMemo(() => {
    const m = new Map<string, { count: number; kg: number }>();
    for (const a of purchases.filter((x) => x.status !== 'REJECTED')) {
      const s = m.get(a.supplierId) ?? { count: 0, kg: 0 };
      m.set(a.supplierId, { count: s.count + 1, kg: s.kg + a.expectedKg });
    }
    return m;
  }, [purchases]);
  const provider = (id: string) => settings.paymentProviders.find((p) => p.id === id)?.name ?? id;
  const payoutLabel = (s: Supplier) => (s.payout.method === 'MOMO' ? `${provider(s.payout.providerOrBank)} · ${formatPhone(s.payout.number)}` : `${s.payout.providerOrBank} · ${s.payout.number}`);
  const query = q.trim().toLowerCase();
  const shown = suppliers
    .filter((s) => (!VIEW_STATUS[view] || s.status === VIEW_STATUS[view]) && (!kind || s.kind === kind) && (!query || s.name.toLowerCase().includes(query) || s.phone.includes(query) || (s.contactPerson ?? '').toLowerCase().includes(query)))
    .sort((a, b) => (a.status === 'PENDING_APPROVAL' ? -1 : 0) - (b.status === 'PENDING_APPROVAL' ? -1 : 0) || a.name.localeCompare(b.name));
  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'kind', header: t('col.type'), accessorKey: 'kind', cell: (c) => t(`agg.kind.${c.getValue() as string}`) },
    { id: 'contact', header: t('agg.contact'), accessorFn: (s) => s.contactPerson ?? '—' },
    { id: 'phone', header: t('people.phone'), accessorFn: (s) => formatPhone(s.phone) },
    { id: 'address', header: t('agg.address'), accessorKey: 'address' },
    { id: 'payout', header: t('agg.payout'), accessorFn: payoutLabel },
    { id: 'orders', header: t('agg.orders'), accessorFn: (s) => stats.get(s.id)?.count ?? 0 },
    { id: 'volume', header: t('col.volume'), accessorFn: (s) => stats.get(s.id)?.kg ?? 0, cell: (c) => f.kg(c.getValue() as number) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'created', header: t('buy.created'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, stats, settings.paymentProviders]);
  const current = suppliers.find((s) => s.id === openId);
  return (
    <>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('agg.searchSuppliers')}
        views={(Object.keys(VIEW_STATUS) as View[]).map((v) => ({ key: v, label: t(`agg.supplierView.${v}`), active: view === v, onSelect: () => setView(v), count: suppliers.filter((s) => !VIEW_STATUS[v] || s.status === VIEW_STATUS[v]).length }))}
        filters={[{ key: 'kind', label: t('col.type'), value: kind, onChange: setKind, options: (['INDIVIDUAL', 'COMPANY'] as const).map((k) => ({ value: k, label: t(`agg.kind.${k}`) })) }]}
        onClear={() => { setQ(''); setKind(''); setView('all'); }}
        extra={<PermissionGate permission="aggregators.create"><Button size="sm" onClick={() => setEditing('new')}><Plus /> {t('agg.newSupplier')}</Button></PermissionGate>}
      />
      <DataTable
        columns={columns}
        data={shown}
        onRowClick={(s) => open(s.id)}
        activeId={openId}
        getRowId={(s) => s.id}
        columnPicker
        initialHidden={['address', 'created']}
        exportCsv={{ fileName: 'suppliers.csv', columns: [
          { header: t('col.name'), value: (s) => s.name }, { header: t('col.type'), value: (s) => s.kind }, { header: t('people.phone'), value: (s) => s.phone },
          { header: t('agg.payout'), value: payoutLabel }, { header: t('col.status'), value: (s) => s.status }, { header: t('agg.orders'), value: (s) => stats.get(s.id)?.count ?? 0 },
        ] }}
        empty={t('agg.emptySuppliers')}
      />
      {current && <SupplierDrawer key={current.id} supplier={current} onClose={close} onEdit={() => setEditing(current)} />}
      {editing && <SupplierSheet supplier={editing === 'new' ? undefined : editing} onClose={(id) => { setEditing(null); if (id) open(id); }} />}
    </>
  );
}

function SupplierDrawer({ supplier: s, onClose, onEdit }: { supplier: Supplier; onClose: () => void; onEdit: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const all = useBuyingStore((x) => x.aggregatorPurchases);
  const orders = useMemo(() => all.filter((a) => a.supplierId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [all, s.id]);
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState('');
  const decide = (d: 'approve' | 'block' | 'unblock', why?: string) => {
    const r = decideSupplier(s.id, d, userId ?? 'system', why);
    if (r.ok) toast.success(t(`agg.toast.supplier.${d}`, { name: s.name }));
    else toast.error(t(`agg.err.${r.reason}`));
  };
  const provider = settings.paymentProviders.find((p) => p.id === s.payout.providerOrBank)?.name ?? s.payout.providerOrBank;
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={s.name}
        subtitle={`${t(`agg.kind.${s.kind}`)} · ${s.address}`}
        badges={<StatusBadge status={s.status} />}
        actions={
          <>
            {s.status === 'PENDING_APPROVAL' && <PermissionGate permission="aggregators.approveSupplier"><Button size="sm" onClick={() => decide('approve')}><Check /> {t('agg.approveSupplier')}</Button></PermissionGate>}
            {s.status !== 'BLOCKED' && <PermissionGate permission="aggregators.approveSupplier"><Button size="sm" variant="dangerOutline" onClick={() => setBlocking(true)}><Ban /> {t('agg.block')}</Button></PermissionGate>}
            {s.status === 'BLOCKED' && <PermissionGate permission="aggregators.approveSupplier"><Button size="sm" variant="secondary" onClick={() => decide('unblock')}><RotateCcw /> {t('agg.unblock')}</Button></PermissionGate>}
            <PermissionGate permission="aggregators.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('people.edit')}</Button></PermissionGate>
          </>
        }
        tabs={[
          {
            key: 'details', label: t('agg.tabDetails'), content: (
              <div className="space-y-4">
                {s.status === 'PENDING_APPROVAL' && <p className="rounded-ctl border border-warning/30 bg-warning/5 px-3 py-2 text-[14px] text-ink">{t('agg.pendingHint')}</p>}
                {s.status === 'BLOCKED' && <p className="rounded-ctl border border-danger/30 bg-danger/5 px-3 py-2 text-[14px] text-ink">{t('agg.blockedHint', { reason: s.blockedReason ?? '—' })}</p>}
                <Facts items={[
                  [t('agg.contact'), s.contactPerson ?? '—'], [t('people.phone'), formatPhone(s.phone)], [t('agg.email'), s.email ?? '—'], [t('agg.address'), s.address],
                  [t('agg.idType'), s.idType ?? '—'], [t('agg.idNumber'), s.idNumber ? mono(s.idNumber) : '—'],
                  [t('agg.payout'), s.payout.method === 'MOMO' ? `${t('agg.method.MOMO')} · ${provider}` : `${t('agg.method.BANK')} · ${s.payout.providerOrBank}`],
                  [t('agg.payoutNumber'), mono(s.payout.number)], ...(s.payout.accountName ? [[t('agg.accountName'), s.payout.accountName] as [string, string]] : []),
                  [t('agg.approvedBy'), s.approvedBy ? `${lk.user(s.approvedBy)} · ${f.date(s.approvedAt!)}` : '—'], [t('buy.created'), `${lk.user(s.createdBy)} · ${f.date(s.createdAt)}`],
                ]} />
              </div>
            ),
          },
          { key: 'kyc', label: t('agg.tabKyc'), content: <DocumentsPanel entity="supplier" entityId={s.id} types={['kyc', 'businessRegistration', 'other']} permission="aggregators.edit" /> },
          {
            key: 'orders', label: t('agg.tabOrders'), count: orders.length, content: orders.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line">
                {orders.map((a) => (
                  <li key={a.id}>
                    <Link to={`/app/aggregators?open=${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft/40">
                      <span className="font-mono text-[13px] text-ink">{a.number}</span>
                      <StatusBadge status={a.status} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{a.poNumber} · {lk.commodity(a.commodityId)} · {f.date(a.plannedDate)}</span>
                      <span className="tnum text-[13px] text-body">{f.kg(a.expectedKg)}</span>
                      <span className="tnum w-32 text-right font-medium text-ink">{f.money(a.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <TabEmpty>{t('agg.noOrders')}</TabEmpty>,
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="supplier" entityId={s.id} /> },
        ]}
      />
      <Dialog open={blocking} onOpenChange={setBlocking}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('agg.blockTitle', { name: s.name })}</DialogTitle><DialogDescription>{t('agg.blockHint')}</DialogDescription></DialogHeader>
          <Field label={t('dashboard.reason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('dashboard.reason')} autoFocus /></Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBlocking(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={!reason.trim()} onClick={() => { decide('block', reason); setBlocking(false); setReason(''); }}>{t('agg.block')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Create or edit a supplier. New suppliers wait for approval; payout edits are logged. */
export function SupplierSheet({ supplier, onClose, initialName }: { supplier?: Supplier; onClose: (id?: string) => void; initialName?: string }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const org = useCurrentOrg();
  const settings = useOrgSettings();
  const momo = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY' && p.enabled);
  const banks = banksFor(org.countries);
  const [v, setV] = useState<SupplierInput>(() => supplier
    ? { name: supplier.name, kind: supplier.kind, phone: supplier.phone, address: supplier.address, contactPerson: supplier.contactPerson, email: supplier.email, idType: supplier.idType, idNumber: supplier.idNumber, payout: supplier.payout }
    : { name: initialName ?? '', kind: 'COMPANY', phone: '', address: '', contactPerson: '', email: '', idType: '', idNumber: '', payout: { method: 'MOMO', providerOrBank: momo[0]?.id ?? '', number: '' } });
  const set = (patch: Partial<SupplierInput>) => setV({ ...v, ...patch });
  const setPayout = (patch: Partial<Supplier['payout']>) => setV({ ...v, payout: { ...v.payout, ...patch } });
  const duplicate = useBuyingStore((s) => s.suppliers.find((x) => x.orgId === orgId && x.id !== supplier?.id && x.name.trim().toLowerCase() === v.name.trim().toLowerCase()));
  const invalid = !v.name.trim() || !v.phone.trim() || !v.address.trim() || !v.payout.number.trim() || !v.payout.providerOrBank || !!duplicate;
  const save = () => {
    if (invalid) return;
    if (supplier) { updateSupplier(supplier.id, v, userId ?? 'system'); toast.success(t('agg.toast.supplierSaved', { name: v.name })); onClose(supplier.id); return; }
    const s = createSupplier(orgId, userId ?? 'system', v);
    toast.success(t('agg.toast.supplierCreated', { name: s.name }), { description: t('agg.pendingHint') });
    onClose(s.id);
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{supplier ? t('agg.editSupplier', { name: supplier.name }) : t('agg.newSupplier')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('col.name')} error={duplicate ? t('agg.err.duplicateSupplier') : undefined} className="sm:col-span-2"><Input value={v.name} onChange={(e) => set({ name: e.target.value })} aria-label={t('col.name')} autoFocus /></Field>
            <Field label={t('col.type')}>
              <div className="inline-flex h-ctl rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={t('col.type')}>
                {(['COMPANY', 'INDIVIDUAL'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={v.kind === k} onClick={() => set({ kind: k })} className={cn('rounded-[8px] px-4 text-[14px] font-medium', v.kind === k ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>{t(`agg.kind.${k}`)}</button>)}
              </div>
            </Field>
            <Field label={t('agg.contact')}><Input value={v.contactPerson ?? ''} onChange={(e) => set({ contactPerson: e.target.value })} aria-label={t('agg.contact')} /></Field>
            <Field label={t('people.phone')}><Input type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} aria-label={t('people.phone')} /></Field>
            <Field label={t('agg.email')}><Input type="email" value={v.email ?? ''} onChange={(e) => set({ email: e.target.value })} aria-label={t('agg.email')} /></Field>
            <Field label={t('agg.address')} className="sm:col-span-2"><Input value={v.address} onChange={(e) => set({ address: e.target.value })} aria-label={t('agg.address')} /></Field>
            <Field label={t('agg.idType')}><Input value={v.idType ?? ''} onChange={(e) => set({ idType: e.target.value })} aria-label={t('agg.idType')} placeholder={v.kind === 'COMPANY' ? t('agg.idTypeCompany') : t('agg.idTypePerson')} /></Field>
            <Field label={t('agg.idNumber')}><Input value={v.idNumber ?? ''} onChange={(e) => set({ idNumber: e.target.value })} aria-label={t('agg.idNumber')} /></Field>
          </div>
          <section className="space-y-3 rounded-card border border-line p-4">
            <h3 className="text-[14px] font-semibold text-ink">{t('agg.payout')}</h3>
            <div className="inline-flex h-ctl rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={t('agg.payout')}>
              {(['MOMO', 'BANK'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={v.payout.method === m} onClick={() => setPayout({ method: m, providerOrBank: m === 'MOMO' ? momo[0]?.id ?? '' : banks[0] ?? '' })} className={cn('rounded-[8px] px-4 text-[14px] font-medium', v.payout.method === m ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>{t(`agg.method.${m}`)}</button>)}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={v.payout.method === 'MOMO' ? t('agg.network') : t('agg.bank')}>
                <select value={v.payout.providerOrBank} onChange={(e) => setPayout({ providerOrBank: e.target.value })} aria-label={v.payout.method === 'MOMO' ? t('agg.network') : t('agg.bank')} className={select}>
                  {(v.payout.method === 'MOMO' ? momo.map((p) => ({ value: p.id, label: p.name })) : banks.map((b) => ({ value: b, label: b }))).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={v.payout.method === 'MOMO' ? t('buy.walletNumber') : t('agg.accountNumber')}><Input value={v.payout.number} onChange={(e) => setPayout({ number: e.target.value })} aria-label={t('agg.payoutNumber')} /></Field>
              {v.payout.method === 'BANK' && <Field label={t('agg.accountName')} className="sm:col-span-2"><Input value={v.payout.accountName ?? ''} onChange={(e) => setPayout({ accountName: e.target.value.toUpperCase() })} aria-label={t('agg.accountName')} /></Field>}
            </div>
          </section>
          {!supplier && <p className="text-[13px] text-muted">{t('agg.newSupplierHint')}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={save}>{supplier ? t('common.save') : t('agg.createSupplier')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const supplierBadge = (s: Supplier | undefined, t: (k: string) => string) => (s && s.status !== 'APPROVED' ? <Badge tone={s.status === 'BLOCKED' ? 'danger' : 'warning'}>{t(`status.${s.status}`)}</Badge> : null);
