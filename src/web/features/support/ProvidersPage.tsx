import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceProvider } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { saveProvider, type ProviderInput } from '@/services/supportService';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSupportStore } from '@/stores/supportStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { useSupportLookups } from './shared';

/** Jobs (support lines served) and amounts paid, per provider. */
function useJobs() {
  const requests = useOrgRows(useSupportStore((s) => s.requests));
  return useMemo(() => {
    const m = new Map<string, { requests: typeof requests; farmers: number; paid: number }>();
    for (const r of requests) {
      for (const s of r.services) {
        if (!s.providerId) continue;
        const x = m.get(s.providerId) ?? { requests: [], farmers: 0, paid: 0 };
        x.requests.push(r);
        x.farmers += r.lines.filter((l) => l.typeId === s.typeId && ['PAID', 'FULFILLED'].includes(l.status)).length;
        if (r.payout.method === 'PROVIDER') x.paid += r.disbursements.reduce((sum, d) => sum + d.amount.amountMinor, 0);
        m.set(s.providerId, x);
      }
    }
    return m;
  }, [requests]);
}

/** Service providers (PRD F3): who ploughs, supplies inputs or seedlings; jobs and amounts paid. */
export function ProvidersPage() {
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const providers = useOrgRows(useSupportStore((s) => s.providers));
  const jobs = useJobs();
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<ServiceProvider | 'new' | null>(null);
  const query = q.trim().toLowerCase();
  const shown = providers.filter((p) => (!type || p.typeIds.includes(type)) && (!status || p.status === status) && (!query || p.name.toLowerCase().includes(query) || p.location.toLowerCase().includes(query) || p.offers.some((o) => o.toLowerCase().includes(query)))).sort((a, b) => a.name.localeCompare(b.name));
  const columns = useMemo<ColumnDef<ServiceProvider, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'category', header: t('sup.category'), accessorFn: (p) => p.typeIds.map((x) => sl.typeName(x)).join(', ') },
    { id: 'offers', header: t('sup.offers'), accessorFn: (p) => p.offers.join(' · '), cell: (c) => <span className="line-clamp-1 text-body">{c.getValue() as string}</span> },
    { id: 'location', header: t('sup.location'), accessorKey: 'location' },
    { id: 'phone', header: t('people.phone'), accessorFn: (p) => formatPhone(p.phone) },
    { id: 'jobs', header: t('sup.jobs'), accessorFn: (p) => jobs.get(p.id)?.requests.length ?? 0 },
    { id: 'paid', header: t('sup.amountPaid'), accessorFn: (p) => jobs.get(p.id)?.paid ?? 0, cell: (c) => f.money({ amountMinor: c.getValue() as number, currency: f.org.currency }) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  ], [t, f, sl, jobs]);
  const current = providers.find((p) => p.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.support')} title={t('nav.providers')} description={t('pages.providers')} primary={<PermissionGate permission="providers.create"><Button onClick={() => setEditing('new')}><Plus /> {t('sup.newProvider')}</Button></PermissionGate>} />
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('sup.searchProviders')}
        filters={[
          { key: 'type', label: t('sup.category'), value: type, onChange: setType, options: sl.types.map((x) => ({ value: x.id, label: sl.typeName(x.id) })) },
          { key: 'status', label: t('col.status'), value: status, onChange: setStatus, options: (['ACTIVE', 'INACTIVE'] as const).map((s) => ({ value: s, label: t(`status.${s}`) })) },
        ]}
        onClear={() => { setQ(''); setType(''); setStatus(''); }}
      />
      <DataTable columns={columns} data={shown} onRowClick={(p) => open(p.id)} activeId={openId} getRowId={(p) => p.id} columnPicker
        exportCsv={{ fileName: 'service-providers.csv', columns: [{ header: t('col.name'), value: (p) => p.name }, { header: t('sup.offers'), value: (p) => p.offers.join(' · ') }, { header: t('sup.location'), value: (p) => p.location }, { header: t('people.phone'), value: (p) => p.phone }, { header: t('col.status'), value: (p) => p.status }] }}
        empty={t('sup.emptyProviders')} />
      {current && <ProviderDrawer key={current.id} provider={current} onClose={close} onEdit={() => setEditing(current)} jobs={jobs.get(current.id)} />}
      {editing && <ProviderSheet provider={editing === 'new' ? undefined : editing} onClose={(id) => { setEditing(null); if (id) open(id); }} />}
    </>
  );
}

function ProviderDrawer({ provider: p, onClose, onEdit, jobs }: { provider: ServiceProvider; onClose: () => void; onEdit: () => void; jobs?: ReturnType<typeof useJobs> extends Map<string, infer V> ? V : never }) {
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={p.name}
      subtitle={`${p.typeIds.map((x) => sl.typeName(x)).join(', ')} · ${p.location}`}
      badges={<StatusBadge status={p.status} />}
      actions={<PermissionGate permission="providers.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('people.edit')}</Button></PermissionGate>}
      tabs={[
        {
          key: 'details', label: t('agg.tabDetails'), content: (
            <div className="space-y-4">
              <Facts items={[[t('people.phone'), formatPhone(p.phone)], [t('sup.location'), p.location], [t('sup.wallet'), p.wallet ? `${p.wallet.name} · ${p.wallet.number}` : '—'], [t('sup.jobs'), f.number(jobs?.requests.length ?? 0)], [t('sup.farmersServed'), f.number(jobs?.farmers ?? 0)], [t('sup.amountPaid'), f.money({ amountMinor: jobs?.paid ?? 0, currency: f.org.currency })]]} />
              <div><div className="eyebrow mb-1.5">{t('sup.offers')}</div><ul className="flex flex-wrap gap-1.5">{p.offers.map((o) => <li key={o} className="rounded-full border border-line px-2.5 py-1 text-[13px] text-ink">{o}</li>)}</ul></div>
            </div>
          ),
        },
        {
          key: 'jobs', label: t('sup.jobs'), count: jobs?.requests.length ?? 0, content: jobs?.requests.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line">
              {jobs.requests.map((r) => <li key={r.id}><Link to={`/app/support?open=${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft/40">{mono(r.number)}<StatusBadge status={r.status} /><span className="min-w-0 flex-1 truncate text-[13px] text-muted">{sl.groupName(r.groupId)} · {t('sup.farmersN', { count: r.lines.length })}</span><span className="tnum font-medium text-ink">{f.money(r.total)}</span></Link></li>)}
            </ul>
          ) : <TabEmpty>{t('sup.noJobs')}</TabEmpty>,
        },
        { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="serviceProvider" entityId={p.id} /> },
      ]}
    />
  );
}

function ProviderSheet({ provider, onClose }: { provider?: ServiceProvider; onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const sl = useSupportLookups();
  const settings = useOrgSettings();
  const momo = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY' && p.enabled);
  const [v, setV] = useState<ProviderInput>(() => provider ? { name: provider.name, typeIds: provider.typeIds, offers: provider.offers, location: provider.location, phone: provider.phone, status: provider.status, wallet: provider.wallet }
    : { name: '', typeIds: [sl.types.find((x) => x.needsProvider)?.id ?? sl.types[0]?.id ?? ''], offers: [], location: '', phone: '', status: 'ACTIVE', wallet: { providerId: momo[0]?.id ?? '', number: '', name: '' } });
  const [offer, setOffer] = useState('');
  const invalid = !v.name.trim() || !v.typeIds.length || !v.phone.trim() || !v.location.trim();
  const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  const save = () => { const p = saveProvider(orgId, userId ?? 'system', { ...v, wallet: v.wallet?.number ? { ...v.wallet, name: v.wallet.name || v.name.toUpperCase() } : undefined }, provider?.id); toast.success(t('sup.toast.providerSaved', { name: p.name })); onClose(p.id); };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{provider ? t('agg.editSupplier', { name: provider.name }) : t('sup.newProvider')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label={t('col.name')}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label={t('col.name')} autoFocus /></Field>
          <div>
            <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('sup.category')}</div>
            <div className="flex flex-wrap gap-4">{sl.types.map((x) => <Checkbox key={x.id} label={sl.typeName(x.id)} checked={v.typeIds.includes(x.id)} onChange={(e) => setV({ ...v, typeIds: e.target.checked ? [...v.typeIds, x.id] : v.typeIds.filter((y) => y !== x.id) })} />)}</div>
          </div>
          <Field label={t('sup.offers')} helper={t('sup.offersHint')}>
            <div className="flex gap-2"><Input value={offer} onChange={(e) => setOffer(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && offer.trim()) { e.preventDefault(); setV({ ...v, offers: [...v.offers, offer.trim()] }); setOffer(''); } }} aria-label={t('sup.offers')} placeholder={t('sup.offerPlaceholder')} /><Button variant="secondary" disabled={!offer.trim()} onClick={() => { setV({ ...v, offers: [...v.offers, offer.trim()] }); setOffer(''); }}><Plus /></Button></div>
            {v.offers.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{v.offers.map((o) => <li key={o}><button type="button" onClick={() => setV({ ...v, offers: v.offers.filter((x) => x !== o) })} className="rounded-full border border-line px-2.5 py-1 text-[13px] text-ink hover:border-danger hover:text-danger" aria-label={t('set.remove')}>{`${o} ×`}</button></li>)}</ul>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('sup.location')}><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} aria-label={t('sup.location')} /></Field>
            <Field label={t('people.phone')}><Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} aria-label={t('people.phone')} /></Field>
            <Field label={t('agg.network')}><select value={v.wallet?.providerId ?? ''} onChange={(e) => setV({ ...v, wallet: { ...(v.wallet ?? { number: '', name: '' }), providerId: e.target.value } })} aria-label={t('agg.network')} className={select}>{momo.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label={t('buy.walletNumber')}><Input type="tel" value={v.wallet?.number ?? ''} onChange={(e) => setV({ ...v, wallet: { ...(v.wallet ?? { providerId: momo[0]?.id ?? '', name: '' }), number: e.target.value } })} aria-label={t('buy.walletNumber')} /></Field>
          </div>
          <div className="inline-flex h-10 rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={t('col.status')}>
            {(['ACTIVE', 'INACTIVE'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={v.status === s} onClick={() => setV({ ...v, status: s })} className={cn('rounded-[8px] px-4 text-[14px] font-medium', v.status === s ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>{t(`status.${s}`)}</button>)}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={save}>{t('common.save')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
