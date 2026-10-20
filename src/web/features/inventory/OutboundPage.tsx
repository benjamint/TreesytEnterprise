import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { PackageMinus, Plus, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import type { Transfer } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { createTransfer, usersWith } from '@/services/inventoryService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { useInventory, variancePct } from './shared';

/** Outbound and transfers (PRD H3): bags leave for dispatch or another warehouse. */
export function OutboundPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const inv = useInventory();
  const transfers = useOrgRows(useWarehouseStore((s) => s.transfers));
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<'all' | 'TRANSFER' | 'OUTBOUND' | 'pending'>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const query = q.trim().toLowerCase();
  const inView = (x: Transfer, v: typeof view) => v === 'all' || (v === 'pending' ? x.status === 'TRANSFER_PENDING' : x.kind === v);
  const rows = transfers.filter((x) => inView(x, view) && (!query || x.number.toLowerCase().includes(query) || x.bagCodes.some((c) => c.toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<Transfer, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'kind', header: t('col.type'), accessorKey: 'kind', cell: (c) => t(`inv.kind.${c.getValue() as string}`) },
    { id: 'from', header: t('inv.from'), accessorFn: (x) => inv.warehouseName(x.fromWarehouseId) },
    { id: 'to', header: t('inv.to'), accessorFn: (x) => (x.kind === 'TRANSFER' ? inv.warehouseName(x.toWarehouseId) : t('inv.toDispatch')) },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (x) => lk.commodity(x.commodityId) },
    { id: 'bags', header: t('inv.bags'), accessorFn: (x) => x.bagCodes.length },
    { id: 'sent', header: t('inv.sentKg'), accessorKey: 'sentKg', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'received', header: t('inv.receivedKg'), accessorFn: (x) => x.receivedKg ?? null, cell: (c) => (c.getValue() == null ? '—' : f.kg(c.getValue() as number)) },
    { id: 'variance', header: t('inv.variance'), accessorFn: (x) => (x.receivedKg == null ? null : variancePct(x.sentKg, x.receivedKg)), cell: (c) => (c.getValue() == null ? '—' : `${f.number(c.getValue() as number, { maximumFractionDigits: 2 })}%`) },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  ], [t, f, lk, inv]);
  const current = transfers.find((x) => x.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.outbound')} description={t('pages.outbound')}
        primary={<PermissionGate permission="outbound.create"><Button onClick={() => setCreating(true)}><Plus /> {t('inv.newOutbound')}</Button></PermissionGate>} />
      <FilterBar search={q} onSearch={setQ} placeholder={t('inv.searchTransfers')}
        views={(['all', 'TRANSFER', 'OUTBOUND', 'pending'] as const).map((v) => ({ key: v, label: t(`inv.tView.${v}`), active: view === v, onSelect: () => setView(v), count: transfers.filter((x) => inView(x, v)).length }))}
        onClear={() => { setQ(''); setView('all'); }} />
      <DataTable columns={columns} data={rows} onRowClick={(x) => open(x.id)} activeId={openId} getRowId={(x) => x.id} empty={t('inv.emptyTransfers')}
        exportCsv={{ fileName: 'transfers.csv', columns: [{ header: t('col.number'), value: (x) => x.number }, { header: t('inv.from'), value: (x) => inv.warehouseName(x.fromWarehouseId) }, { header: t('inv.to'), value: (x) => inv.warehouseName(x.toWarehouseId) }, { header: t('inv.sentKg'), value: (x) => x.sentKg }, { header: t('inv.receivedKg'), value: (x) => x.receivedKg ?? '' }, { header: t('col.status'), value: (x) => x.status }] }} />
      {current && (
        <DetailDrawer open onClose={close} title={current.number} subtitle={`${inv.warehouseName(current.fromWarehouseId)} → ${current.kind === 'TRANSFER' ? inv.warehouseName(current.toWarehouseId) : t('inv.toDispatch')}`} badges={<StatusBadge status={current.status} />}
          tabs={[
            {
              key: 'summary', label: t('inv.tab.summary'), content: (
                <div className="space-y-4">
                  <Facts items={[[t('col.type'), t(`inv.kind.${current.kind}`)], [t('inv.bags'), f.number(current.bagCodes.length)], [t('inv.sentKg'), f.kg(current.sentKg)], [t('inv.receivedKg'), current.receivedKg != null ? f.kg(current.receivedKg) : '—'],
                    [t('inv.receivingOfficer'), inv.user(current.receivingOfficerId)], [t('buy.created'), `${lk.user(current.createdBy)} · ${f.dateTime(current.createdAt)}`],
                    [t('inv.receipt'), current.inboundId ? <Link key="r" to={`/app/inventory/inbound?open=${current.inboundId}`} className="text-brand hover:underline">{t('inv.openReceipt')}</Link> : '—']]} />
                  <div className="flex flex-wrap gap-1.5">{current.bagCodes.map((c) => <span key={c} className="rounded-chip bg-canvas px-2 py-1 font-mono text-[12px] text-ink">{c}</span>)}</div>
                </div>
              ),
            },
            { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="transfer" entityId={current.id} /> },
          ]} />
      )}
      {creating && <NewTransferSheet onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function NewTransferSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const inv = useInventory();
  const memberships = useAccessStore((s) => s.memberships);
  const users = useAccessStore((s) => s.users);
  const withStock = inv.warehouses.filter((w) => inv.stockBags(w.id).length);
  const [from, setFrom] = useState(withStock[0]?.id ?? '');
  const [kind, setKind] = useState<Transfer['kind']>('TRANSFER');
  const [to, setTo] = useState('');
  const [officer, setOfficer] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [scan, setScan] = useState('');
  const bags = inv.stockBags(from).slice().sort((a, b) => a.code.localeCompare(b.code));
  const dests = inv.warehouses.filter((w) => w.id !== from && w.status === 'ACTIVE');
  const dest = to || dests[0]?.id || '';
  const receivers = useMemo(() => new Set(usersWith(orgId, 'inbound.receive')), [orgId, memberships]); // eslint-disable-line react-hooks/exhaustive-deps
  const officers = users.filter((u) => receivers.has(u.id));
  const kg = Math.round(bags.filter((b) => picked.includes(b.code)).reduce((s, b) => s + b.weightKg, 0) * 10) / 10;
  const addScan = () => { const c = scan.trim().toUpperCase(); if (bags.some((b) => b.code === c) && !picked.includes(c)) setPicked([...picked, c]); else if (c) toast.error(t('inv.notInStock', { code: c })); setScan(''); };
  const save = () => {
    try {
      const tr = createTransfer({ orgId, fromWarehouseId: from, kind, toWarehouseId: kind === 'TRANSFER' ? dest : undefined, receivingOfficerId: kind === 'TRANSFER' ? officer || inv.warehouse(dest)?.officerUserIds[0] : undefined, bagCodes: picked, actorId: userId ?? 'system', device: 'web' });
      toast.success(t(kind === 'TRANSFER' ? 'inv.toast.transferSent' : 'inv.toast.outbound', { number: tr.number, count: tr.bagCodes.length }));
      onClose(tr.id);
    } catch (e) { toast.error(t(`inv.err.${(e as Error).message}`)); }
  };
  const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('inv.newOutbound')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label={t('inv.from')}><select value={from} onChange={(e) => { setFrom(e.target.value); setPicked([]); }} aria-label={t('inv.from')} className={select}>{withStock.map((w) => <option key={w.id} value={w.id}>{`${w.name} · ${f.kg(inv.stockKg(w.id))}`}</option>)}</select></Field>
          <div className="flex gap-2" role="radiogroup" aria-label={t('col.type')}>
            {(['TRANSFER', 'OUTBOUND'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('flex-1 rounded-ctl border px-3 py-2.5 text-[14px] font-medium', kind === k ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body')}>{t(`inv.kind.${k}`)}</button>)}
          </div>
          {kind === 'TRANSFER' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('inv.to')}><select value={dest} onChange={(e) => setTo(e.target.value)} aria-label={t('inv.to')} className={select}>{dests.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
              <Field label={t('inv.receivingOfficer')}><select value={officer} onChange={(e) => setOfficer(e.target.value)} aria-label={t('inv.receivingOfficer')} className={select}><option value="">{inv.user(inv.warehouse(dest)?.officerUserIds[0]) === '—' ? '—' : inv.user(inv.warehouse(dest)?.officerUserIds[0])}</option>{officers.filter((u) => u.id !== inv.warehouse(dest)?.officerUserIds[0]).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-ink">{t('inv.pickBags')}</h3><span className="text-[13px] text-muted">{t('inv.pickedLine', { count: picked.length, kg: f.kg(kg) })}</span></div>
            <div className="mb-2 flex gap-2">
              <Input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addScan()} placeholder={t('inv.scanOrType')} aria-label={t('inv.scanOrType')} />
              <Button variant="secondary" onClick={() => (scan ? addScan() : setPicked([...picked, ...bags.map((b) => b.code).filter((c) => !picked.includes(c)).slice(0, 1)]))}><QrCode /> {t('inv.scan')}</Button>
            </div>
            <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
              {bags.map((b) => <div key={b.id} className="flex items-center justify-between px-3 py-2"><Checkbox label={<span className="font-mono text-[13px]">{b.code}</span>} checked={picked.includes(b.code)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.code] : picked.filter((x) => x !== b.code))} /><span className="text-[12px] text-muted">{lk.commodity(b.commodityId)} · {f.kg(b.weightKg)}</span></div>)}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={!picked.length || (kind === 'TRANSFER' && !dest)} onClick={save}><PackageMinus /> {t(kind === 'TRANSFER' ? 'inv.sendTransfer' : 'inv.confirmOutbound')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
