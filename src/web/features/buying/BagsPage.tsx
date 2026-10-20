import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Replace } from 'lucide-react';
import { toast } from 'sonner';
import type { Bag } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { Field } from '@/components/shared/Field';
import { nextBagCode, replaceBag } from '@/services/buyingService';
import { useBuyingStore } from '@/stores/buyingStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono, useFarmerNames } from './common';
import { QrCode } from './qr';

const TONE = { IN_STOCK: 'success', IN_TRANSIT: 'info', OUT_OF_STOCK: 'neutral', REPLACED: 'warningOutline', WITH_AGENT: 'teal', MISSING: 'danger' } as const;
type View = 'all' | Bag['status'];

/** Bag registry (PRD D2): every bag code, weight, status, warehouse, history and replacement log. */
export function BagsPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const bags = useOrgRows(useBuyingStore((s) => s.bags));
  const warehouses = useOrgRows(useWarehouseStore((s) => s.warehouses));
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [commodity, setCommodity] = useState('');
  const [warehouse, setWarehouse] = useState('');
  useDemoNotes([{ id: 'bags', key: 'demo.note.bags' }]);
  const whName = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => bags.filter((b) => (view === 'all' || b.status === view) && (!commodity || b.commodityId === commodity) && (!warehouse || b.warehouseId === warehouse) && (!query || b.code.toLowerCase().includes(query)))
    .sort((a, b) => b.code.localeCompare(a.code)), [bags, view, commodity, warehouse, query]);

  const columns = useMemo<ColumnDef<Bag, unknown>[]>(() => [
    { id: 'code', header: t('buy.bagCode'), accessorKey: 'code', cell: (c) => mono(c.getValue() as string) },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (b) => lk.commodity(b.commodityId) },
    { id: 'weight', header: t('buy.weight'), accessorKey: 'weightKg', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <Badge tone={TONE[c.getValue() as Bag['status']]}>{t(`buy.bagStatus.${c.getValue() as string}`)}</Badge> },
    { id: 'warehouse', header: t('buy.warehouse'), accessorFn: (b) => (b.warehouseId ? whName.get(b.warehouseId) ?? '—' : '—') },
    { id: 'farmers', header: t('buy.contributions'), accessorFn: (b) => b.purchaseIds.length, cell: (c) => ((c.getValue() as number) > 1 ? <Badge tone="info">{t('buy.consolidatedN', { count: c.getValue() as number })}</Badge> : '1') },
    { id: 'last', header: t('buy.lastMovement'), accessorFn: (b) => b.history?.[b.history.length - 1]?.at ?? '', cell: (c) => { const h = c.row.original.history?.[c.row.original.history.length - 1]; return h ? `${t(`buy.bagEvent.${h.event}`)} · ${f.date(h.at)}` : '—'; } },
  ], [t, f, lk, whName]);

  const counts = (s: View) => bags.filter((b) => s === 'all' || b.status === s).length;
  const current = bags.find((b) => b.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.buying')} title={t('nav.bags')} description={t('pages.bags')} />
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('buy.searchBags')}
        views={(['all', 'WITH_AGENT', 'IN_TRANSIT', 'IN_STOCK', 'OUT_OF_STOCK', 'REPLACED', 'MISSING'] as const).map((v) => ({ key: v, label: v === 'all' ? t('buy.view.all') : t(`buy.bagStatus.${v}`), active: view === v, onSelect: () => setView(v), count: counts(v) }))}
        filters={[
          { key: 'commodity', label: t('col.commodity'), value: commodity, onChange: setCommodity, options: settings.commodities.filter((c) => bags.some((b) => b.commodityId === c.id)).map((c) => ({ value: c.id, label: lk.commodity(c.id) })) },
          { key: 'warehouse', label: t('buy.warehouse'), value: warehouse, onChange: setWarehouse, options: warehouses.map((w) => ({ value: w.id, label: w.name })) },
        ]}
        onClear={() => { setQ(''); setCommodity(''); setWarehouse(''); setView('all'); }}
      />
      <DataTable
        columns={columns}
        data={shown}
        onRowClick={(b) => open(b.id)}
        activeId={openId}
        getRowId={(b) => b.id}
        pageSize={15}
        exportCsv={{ fileName: 'bags.csv', columns: [
          { header: t('buy.bagCode'), value: (b) => b.code }, { header: t('col.commodity'), value: (b) => lk.commodity(b.commodityId) }, { header: t('buy.weight'), value: (b) => b.weightKg },
          { header: t('col.status'), value: (b) => b.status }, { header: t('buy.warehouse'), value: (b) => (b.warehouseId ? whName.get(b.warehouseId) ?? '' : '') },
        ] }}
        empty={t('buy.emptyBags')}
      />
      {current && <BagDrawer key={current.id} bag={current} warehouse={current.warehouseId ? whName.get(current.warehouseId) : undefined} onClose={close} />}
    </>
  );
}

function BagDrawer({ bag: b, warehouse, onClose }: { bag: Bag; warehouse?: string; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const fn = useFarmerNames();
  const settings = useOrgSettings();
  const purchases = useBuyingStore((s) => s.purchases);
  const bags = useBuyingStore((s) => s.bags);
  const [replacing, setReplacing] = useState(false);
  const mine = purchases.filter((p) => b.purchaseIds.includes(p.id));
  const pack = settings.packaging.find((p) => p.commodityId === b.commodityId);
  const replacedBy = b.status === 'REPLACED' ? bags.find((x) => x.replacement?.oldCode === b.code && x.id !== b.id) : undefined;
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{b.code}</span>}
        subtitle={`${lk.commodity(b.commodityId)} · ${f.kg(b.weightKg)}`}
        badges={<Badge tone={TONE[b.status]}>{t(`buy.bagStatus.${b.status}`)}</Badge>}
        actions={b.status !== 'REPLACED' && b.status !== 'OUT_OF_STOCK' ? <PermissionGate permission="purchases.edit"><Button size="sm" variant="secondary" onClick={() => setReplacing(true)}><Replace /> {t('buy.replaceBag')}</Button></PermissionGate> : undefined}
        tabs={[
          {
            key: 'detail', label: t('buy.tab.summary'), content: (
              <div className="space-y-5">
                <div className="flex gap-5">
                  <QrCode value={b.code} className="h-32 w-32 shrink-0" />
                  <Facts items={[[t('buy.weight'), f.kg(b.weightKg)], [t('buy.packaging'), pack ? t('buy.bounds', { min: pack.minKg, max: pack.maxKg }) : '—'], [t('buy.warehouse'), warehouse ?? '—'], [t('buy.contributions'), f.number(b.purchaseIds.length)]]} />
                </div>
                {replacedBy && <p className="rounded-ctl bg-canvas px-3 py-2 text-[14px] text-body">{t('buy.replacedBy', { code: replacedBy.code })}</p>}
                {b.replacement && (
                  <div className="rounded-ctl border border-warning/30 bg-warning/5 p-3 text-[14px]">
                    <div className="font-medium text-ink">{t('buy.replacementLog')}</div>
                    <p className="mt-1 text-body">{t('buy.replacementLine', { old: b.replacement.oldCode, new: b.replacement.newCode, variance: f.kg(Math.round((b.replacement.newKg - b.replacement.oldKg) * 10) / 10), name: lk.user(b.replacement.by), date: f.dateTime(b.replacement.at) })}</p>
                    <p className="text-[13px] text-muted">{b.replacement.reason}</p>
                  </div>
                )}
                <div>
                  <h4 className="mb-2 text-[13px] font-semibold text-ink">{t('buy.contributions')}</h4>
                  {mine.length ? (
                    <ul className="divide-y divide-line rounded-ctl border border-line">
                      {mine.map((p) => <li key={p.id}><Link to={`/app/purchases?open=${p.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-brand-soft/40"><span className="font-mono text-[13px] text-ink">{p.number}</span><span className="min-w-0 flex-1 truncate text-body">{fn.name(p.farmerId)}</span><span className="tnum text-muted">{f.kg(b.contributions?.find((c) => c.purchaseId === p.id)?.kg ?? p.quantity)}</span></Link></li>)}
                    </ul>
                  ) : <TabEmpty>{t('buy.noPurchases')}</TabEmpty>}
                </div>
              </div>
            ),
          },
          {
            key: 'history', label: t('buy.tab.history'), count: b.history?.length, content: b.history?.length ? (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {[...b.history].reverse().map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" aria-hidden="true" />
                    <div className="text-[14px] text-ink">{t(`buy.bagEvent.${h.event}`)} <span className="font-mono text-[13px] text-muted">{h.ref}</span></div>
                    <div className="text-[12px] text-muted">{h.by ? `${lk.user(h.by)} · ` : ''}{f.dateTime(h.at)}{h.note ? ` · ${h.note}` : ''}</div>
                  </li>
                ))}
              </ol>
            ) : <TabEmpty>{t('buy.noHistory')}</TabEmpty>,
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="bag" entityId={b.id} /> },
        ]}
      />
      {replacing && <ReplaceDialog bag={b} onClose={() => setReplacing(false)} />}
    </>
  );
}

function ReplaceDialog({ bag, onClose }: { bag: Bag; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const [code, setCode] = useState(() => nextBagCode(bag.orgId));
  const [kg, setKg] = useState(String(bag.weightKg));
  const [reason, setReason] = useState('');
  const taken = useBuyingStore((s) => s.bags).some((b) => b.code === code.trim() && b.orgId === bag.orgId);
  const variance = Math.round((Number(kg || 0) - bag.weightKg) * 10) / 10;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('buy.replaceTitle', { code: bag.code })}</DialogTitle>
          <DialogDescription>{t('buy.replaceHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t('buy.newCode')} error={taken ? t('buy.codeTaken') : undefined}><Input compact value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label={t('buy.newCode')} className="font-mono" /></Field>
          <Field label={t('buy.weightKg')} helper={variance ? t('buy.variance') + `: ${variance > 0 ? '+' : ''}${f.kg(variance)}` : undefined}><Input compact type="number" value={kg} onChange={(e) => setKg(e.target.value)} aria-label={t('buy.weightKg')} /></Field>
          <Field label={t('dashboard.reason')}><Input compact value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('dashboard.reason')} placeholder={t('buy.replacePlaceholder')} /></Field>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!code.trim() || taken || !(Number(kg) > 0) || !reason.trim()} onClick={() => {
            replaceBag(bag.id, code.trim(), Number(kg), reason.trim(), userId ?? 'system');
            toast.success(t('buy.toast.bagReplaced', { from: bag.code, to: code.trim() }));
            onClose();
          }}>{t('buy.replaceBag')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
