import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarPlus, Check, ClipboardList, X } from 'lucide-react';
import { toast } from 'sonner';
import type { StockCount } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { requestAdjustment, reviewAdjustment, scheduleCount, submitCount } from '@/services/inventoryService';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { Panel, mono } from '@/web/features/buying/common';
import { Bars } from '@/web/features/aggregators/shared';
import { useInventory } from './shared';

/** Stock counts (PRD H4): scheduled by company frequency, expected vs counted, adjustment approval. */
export function StockCountsPage() {
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const settings = useOrgSettings();
  const counts = useOrgRows(useWarehouseStore((s) => s.stockCounts));
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<'all' | StockCount['status'] | 'adjustment'>('all');
  const [warehouse, setWarehouse] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [q, setQ] = useState('');
  const inView = (c: StockCount, v: typeof view) => v === 'all' || (v === 'adjustment' ? c.adjustment?.status === 'PENDING' : c.status === v);
  const rows = counts.filter((c) => inView(c, view) && (!warehouse || c.warehouseId === warehouse) && (!q.trim() || c.number.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  const columns = useMemo<ColumnDef<StockCount, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'warehouse', header: t('inv.warehouse'), accessorFn: (c) => inv.warehouseName(c.warehouseId) },
    { id: 'date', header: t('inv.scheduledFor'), accessorKey: 'scheduledFor', cell: (c) => f.date(c.getValue() as string) },
    { id: 'expected', header: t('inv.expected'), accessorFn: (c) => c.expected?.bags ?? null, cell: (c) => (c.row.original.expected ? `${t('buy.bagsN', { count: c.row.original.expected.bags })} · ${f.kg(c.row.original.expected.kg)}` : '—') },
    { id: 'counted', header: t('inv.counted'), accessorFn: (c) => c.counted?.bags ?? null, cell: (c) => (c.row.original.counted ? `${t('buy.bagsN', { count: c.row.original.counted.bags })} · ${f.kg(c.row.original.counted.kg)}` : '—') },
    { id: 'difference', header: t('inv.difference'), accessorFn: (c) => (c.counted && c.expected ? Math.round((c.counted.kg - c.expected.kg) * 10) / 10 : null), cell: (c) => (c.getValue() == null ? '—' : <span className={(c.getValue() as number) < 0 ? 'text-danger' : 'text-ink'}>{f.kg(c.getValue() as number)}</span>) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <span className="flex items-center gap-1.5"><StatusBadge status={c.getValue() as string} />{c.row.original.adjustment?.status === 'PENDING' && <StatusBadge status="ADJ_PENDING" />}</span> },
  ], [t, f, inv]);
  const current = counts.find((c) => c.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.stockCounts')} description={t('inv.countsHint', { frequency: t(`inv.freq.${settings.inventoryRules.stockCount.frequency}`) })}
        primary={<PermissionGate permission="stockCounts.create"><Button onClick={() => setScheduling(true)}><CalendarPlus /> {t('inv.scheduleCount')}</Button></PermissionGate>} />
      <FilterBar search={q} onSearch={setQ} placeholder={t('inv.searchCounts')}
        views={(['all', 'SCHEDULED', 'RECONCILED', 'INCONSISTENT', 'adjustment'] as const).map((v) => ({ key: v, label: v === 'all' ? t('buy.view.all') : v === 'adjustment' ? t('inv.adjustmentsToApprove') : t(`status.${v}`), active: view === v, onSelect: () => setView(v), count: counts.filter((c) => inView(c, v)).length }))}
        filters={[{ key: 'warehouse', label: t('inv.warehouse'), value: warehouse, onChange: setWarehouse, options: inv.warehouses.map((w) => ({ value: w.id, label: w.name })) }]}
        onClear={() => { setView('all'); setWarehouse(''); setQ(''); }} />
      <DataTable columns={columns} data={rows} onRowClick={(c) => open(c.id)} activeId={openId} getRowId={(c) => c.id} empty={t('inv.noCounts')} />
      {current && <CountDrawer key={current.id} count={current} onClose={close} />}
      {scheduling && <ScheduleDialog onClose={(id) => { setScheduling(false); if (id) open(id); }} />}
    </>
  );
}

function CountDrawer({ count: c, onClose }: { count: StockCount; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const lk = useLookups();
  const [dialog, setDialog] = useState<'count' | 'adjust' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  // Breakdown of what was counted, by agent and by commodity.
  const countedBags = (c.counted?.codes ?? []).map((code) => inv.bag(code)).filter((b): b is NonNullable<typeof b> => !!b);
  const by = (key: (b: (typeof countedBags)[number]) => string) => [...countedBags.reduce((m, b) => m.set(key(b), (m.get(key(b)) ?? 0) + (c.counted?.weighed[b.code] ?? b.weightKg)), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value: Math.round(value) }));
  const review = (approve: boolean, note?: string) => {
    const res = reviewAdjustment(c.id, approve, userId ?? 'system', note);
    if (res.ok) toast.success(t(approve ? 'inv.toast.adjustmentApproved' : 'inv.toast.adjustmentRejected', { number: c.number }));
    else toast.error(t(`inv.err.${res.reason}`));
  };
  return (
    <>
      <DetailDrawer open onClose={onClose} title={c.number} subtitle={`${inv.warehouseName(c.warehouseId)} · ${f.date(c.scheduledFor)}`} badges={<><StatusBadge status={c.status} />{c.adjustment && <StatusBadge status={`ADJ_${c.adjustment.status}`} />}</>}
        actions={<>
          {c.status === 'SCHEDULED' && <PermissionGate permission="stockCounts.create"><Button size="sm" onClick={() => setDialog('count')}><ClipboardList /> {t('inv.recordCount')}</Button></PermissionGate>}
          {c.status === 'INCONSISTENT' && !c.adjustment && <PermissionGate permission="stockCounts.create"><Button size="sm" variant="secondary" onClick={() => setDialog('adjust')}>{t('inv.requestAdjustment')}</Button></PermissionGate>}
          {c.adjustment?.status === 'PENDING' && <PermissionGate permission="stockCounts.approveAdjustment"><span className="flex gap-2"><Button size="sm" onClick={() => review(true)}><Check /> {t('inv.approveAdjustment')}</Button><Button size="sm" variant="dangerOutline" onClick={() => setDialog('reject')}><X /> {t('buy.action.REJECT')}</Button></span></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'summary', label: t('inv.tab.summary'), content: c.counted ? (
              <div className="space-y-5">
                <Facts items={[
                  [t('inv.expected'), c.expected ? `${t('buy.bagsN', { count: c.expected.bags })} · ${f.kg(c.expected.kg)}` : '—'], [t('inv.counted'), `${t('buy.bagsN', { count: c.counted.bags })} · ${f.kg(c.counted.kg)}`],
                  [t('inv.difference'), c.expected ? f.kg(Math.round((c.counted.kg - c.expected.kg) * 10) / 10) : '—'], [t('inv.countedBy'), `${lk.user(c.counted.by)} · ${f.dateTime(c.counted.at)}${c.counted.device === 'mobile' ? ` · ${t('sup.fromPhone')}` : ''}`],
                  [t('inv.missingBags'), c.missingCodes?.length ? c.missingCodes.join(', ') : '—'], [t('inv.extraBags'), c.extraCodes?.length ? c.extraCodes.join(', ') : '—'],
                ]} />
                {c.adjustment && <Panel title={t('inv.adjustment')}><p className="text-[14px] text-ink">{t('inv.adjustmentLine', { kg: f.kg(c.adjustment.kg), reason: c.adjustment.reason, name: lk.user(c.adjustment.requestedBy) })}</p>{c.adjustment.reviewedBy && <p className="mt-1 text-[13px] text-muted">{t('inv.reviewedBy', { name: lk.user(c.adjustment.reviewedBy), date: f.dateTime(c.adjustment.reviewedAt!) })}{c.adjustment.note ? ` · ${c.adjustment.note}` : ''}</p>}</Panel>}
                <div className="grid gap-5 md:grid-cols-2">
                  <div><div className="eyebrow mb-2">{t('inv.byAgent')}</div><Bars rows={by((b) => lk.agent(inv.agentOfBag(b)))} format={(v) => f.kg(v)} /></div>
                  <div><div className="eyebrow mb-2">{t('inv.byCommodity')}</div><Bars rows={by((b) => lk.commodity(b.commodityId))} format={(v) => f.kg(v)} /></div>
                </div>
                {!!c.counted.photos.length && <div><div className="eyebrow mb-2">{t('inv.photos')}</div><div className="flex gap-2">{c.counted.photos.map((p) => <div key={p} className="flex h-20 w-28 items-end rounded-ctl bg-gradient-to-br from-brand-soft to-canvas p-2 text-[11px] text-muted">{p}</div>)}</div></div>}
              </div>
            ) : <TabEmpty>{t('inv.notCountedYet')}</TabEmpty>,
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="stockCount" entityId={c.id} /> },
        ]} />
      {dialog === 'count' && <RecordCountDialog count={c} onClose={() => setDialog(null)} />}
      {(dialog === 'adjust' || dialog === 'reject') && (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t(dialog === 'adjust' ? 'inv.requestAdjustment' : 'inv.rejectAdjustment')}</DialogTitle><DialogDescription>{dialog === 'adjust' ? t('inv.adjustHint') : t('inv.rejectAdjustHint')}</DialogDescription></DialogHeader>
            <Field label={t('dashboard.reason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('dashboard.reason')} autoFocus /></Field>
            <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button disabled={!reason.trim()} variant={dialog === 'reject' ? 'danger' : 'primary'} onClick={() => { if (dialog === 'adjust') { requestAdjustment(c.id, reason.trim(), userId ?? 'system'); toast.success(t('inv.toast.adjustmentRequested', { number: c.number })); } else review(false, reason.trim()); setReason(''); setDialog(null); }}>{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Web count entry: tick the bags found (or scan), optionally reweigh. */
function RecordCountDialog({ count: c, onClose }: { count: StockCount; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const expected = inv.stockBags(c.warehouseId);
  const [found, setFound] = useState<string[]>(() => expected.map((b) => b.code));
  const [extra, setExtra] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const save = () => {
    const res = submitCount(c.id, { codes: [...found, ...extras], photos: ['count-web.jpg'] }, userId ?? 'system', 'web');
    toast[res.status === 'RECONCILED' ? 'success' : 'warning'](t(res.status === 'RECONCILED' ? 'inv.toast.countReconciled' : 'inv.toast.countInconsistent', { number: c.number, count: res.missingCodes?.length ?? 0 }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('inv.recordCountTitle', { number: c.number })}</DialogTitle><DialogDescription>{t('inv.recordCountHint', { count: expected.length })}</DialogDescription></DialogHeader>
        <div className="max-h-[45vh] overflow-y-auto rounded-ctl border border-line">
          <ul className="grid grid-cols-2 gap-x-4 p-2 sm:grid-cols-3">
            {expected.map((b) => <li key={b.id}><label className="flex items-center gap-2 rounded-chip px-2 py-1.5 text-[13px] hover:bg-canvas"><input type="checkbox" checked={found.includes(b.code)} onChange={(e) => setFound(e.target.checked ? [...found, b.code] : found.filter((x) => x !== b.code))} /> <span className="font-mono">{b.code}</span><span className="ml-auto text-muted">{f.kg(b.weightKg)}</span></label></li>)}
          </ul>
        </div>
        <div className="flex gap-2"><Input value={extra} onChange={(e) => setExtra(e.target.value.toUpperCase())} placeholder={t('inv.extraBagPlaceholder')} aria-label={t('inv.extraBagPlaceholder')} /><Button variant="secondary" disabled={!extra.trim()} onClick={() => { setExtras([...extras, extra.trim()]); setExtra(''); }}>{t('inv.addExtra')}</Button></div>
        {!!extras.length && <p className="text-[13px] text-muted">{t('inv.extraBags')}: {extras.join(', ')}</p>}
        <p className="text-[13px] text-body">{t('inv.countSummary', { found: found.length, total: expected.length, extra: extras.length })}</p>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save}><Check /> {t('inv.submitCount')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ onClose }: { onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const inv = useInventory();
  const [warehouseId, setWarehouseId] = useState(inv.warehouses[0]?.id ?? '');
  const [date, setDate] = useState(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('inv.scheduleCount')}</DialogTitle><DialogDescription>{t('inv.scheduleHint')}</DialogDescription></DialogHeader>
        <Field label={t('inv.warehouse')}><select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} aria-label={t('inv.warehouse')} className={select}>{inv.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label={t('inv.scheduledFor')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('inv.scheduledFor')} /></Field>
        <DialogFooter><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={!warehouseId || !date} onClick={() => { const c = scheduleCount(orgId, warehouseId, date, userId ?? 'system'); toast.success(t('inv.toast.countScheduled', { number: c.number })); onClose(c.id); }}><CalendarPlus /> {t('inv.schedule')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
