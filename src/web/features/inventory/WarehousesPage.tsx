import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleMarker, MapContainer, TileLayer, Tooltip as LTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { List, Map as MapIcon } from 'lucide-react';
import type { Warehouse } from '@/types';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { cn } from '@/lib/utils';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useFormat, useOrgRows, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { Bars } from '@/web/features/aggregators/shared';
import { ageingBuckets, useInventory, Utilisation } from './shared';

/** Warehouses (PRD H1): list or map, stock by commodity, utilisation and open discrepancies. */
export function WarehousesPage() {
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const lk = useLookups();
  const discrepancies = useOrgRows(useWarehouseStore((s) => s.discrepancies));
  const [openId, open, close] = useDrawerParam();
  const [layout, setLayout] = useState<'list' | 'map'>('list');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const openDisc = useMemo(() => { const m = new Map<string, number>(); for (const d of discrepancies) if (d.status === 'OPEN') m.set(d.warehouseId, (m.get(d.warehouseId) ?? 0) + 1); return m; }, [discrepancies]);
  const query = q.trim().toLowerCase();
  const rows = inv.warehouses.filter((w) => (!type || w.type === type) && (!query || w.name.toLowerCase().includes(query) || inv.place(w).toLowerCase().includes(query)));
  const byCommodity = (w: Warehouse) => {
    const m = new Map<string, { bags: number; kg: number }>();
    for (const b of inv.stockBags(w.id)) { const x = m.get(b.commodityId) ?? { bags: 0, kg: 0 }; x.bags += 1; x.kg += b.weightKg; m.set(b.commodityId, x); }
    return [...m];
  };
  const columns = useMemo<ColumnDef<Warehouse, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'type', header: t('col.type'), accessorKey: 'type', cell: (c) => t(`inv.whType.${c.getValue() as string}`) },
    { id: 'location', header: t('inv.location'), accessorFn: (w) => inv.place(w) },
    { id: 'officers', header: t('inv.officers'), accessorFn: (w) => w.officerUserIds.map((u) => inv.user(u)).join(', ') || '—' },
    { id: 'stock', header: t('inv.stock'), accessorFn: (w) => inv.stockKg(w.id), cell: (c) => <span className="flex flex-col">{byCommodity(c.row.original).map(([cid, x]) => <span key={cid} className="whitespace-nowrap text-[13px]">{`${lk.commodity(cid)} · ${t('buy.bagsN', { count: x.bags })} · ${f.kg(Math.round(x.kg))}`}</span>)}{!inv.stockBags(c.row.original.id).length && <span className="text-muted">{'—'}</span>}</span> },
    { id: 'capacity', header: t('inv.capacity'), accessorKey: 'capacityKg', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'utilisation', header: t('inv.utilisationCol'), accessorFn: (w) => (w.capacityKg ? inv.stockKg(w.id) / w.capacityKg : 0), cell: (c) => <Utilisation used={inv.stockKg(c.row.original.id)} capacity={c.row.original.capacityKg} /> },
    { id: 'discrepancies', header: t('inv.openDiscrepancies'), accessorFn: (w) => openDisc.get(w.id) ?? 0, cell: (c) => ((c.getValue() as number) ? <Link to={`/app/inventory/inbound?view=discrepancies&warehouse=${c.row.original.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-danger hover:underline">{String(c.getValue())}</Link> : <span className="text-muted">{'0'}</span>) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  ], [t, f, inv, lk, openDisc]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = inv.warehouses.find((w) => w.id === openId);
  const total = inv.warehouses.reduce((s, w) => s + inv.stockKg(w.id), 0);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.warehouses')} description={t('pages.warehouses')}
        actions={<div className="inline-flex rounded-ctl border border-line bg-surface p-1">{(['list', 'map'] as const).map((k) => <Button key={k} size="sm" variant={layout === k ? 'primary' : 'ghost'} onClick={() => setLayout(k)} aria-pressed={layout === k}>{k === 'list' ? <List /> : <MapIcon />} {t(`inv.layout.${k}`)}</Button>)}</div>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[[t('inv.kpi.stock'), f.kg(Math.round(total))], [t('inv.kpi.bags'), f.number(inv.warehouses.reduce((s, w) => s + inv.stockBags(w.id).length, 0))], [t('inv.kpi.discrepancies'), f.number([...openDisc.values()].reduce((s, x) => s + x, 0))]].map(([k, v]) => (
          <div key={k} className="rounded-card border border-line bg-surface p-5 shadow-soft"><div className="eyebrow">{k}</div><div className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{v}</div></div>
        ))}
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('inv.searchWarehouses')}
        filters={[{ key: 'type', label: t('col.type'), value: type, onChange: setType, options: (['COMMUNITY_STORE', 'AGGREGATION_HUB', 'CENTRAL', 'PORT'] as const).map((x) => ({ value: x, label: t(`inv.whType.${x}`) })) }]}
        onClear={() => { setQ(''); setType(''); }} />
      {layout === 'list'
        ? <DataTable columns={columns} data={rows} onRowClick={(w) => open(w.id)} activeId={openId} getRowId={(w) => w.id} empty={t('inv.emptyWarehouses')} />
        : <WarehouseMap rows={rows} onOpen={open} />}
      {current && <WarehouseDrawer key={current.id} warehouse={current} onClose={close} />}
    </>
  );
}

function WarehouseMap({ rows, onOpen }: { rows: Warehouse[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const pts = rows.filter((w) => w.gps);
  if (!pts.length) return <TabEmpty>{t('inv.emptyWarehouses')}</TabEmpty>;
  const lats = pts.map((w) => w.gps.lat);
  const lngs = pts.map((w) => w.gps.lng);
  const bounds: [[number, number], [number, number]] = [[Math.min(...lats) - 0.4, Math.min(...lngs) - 0.4], [Math.max(...lats) + 0.4, Math.max(...lngs) + 0.4]];
  const max = Math.max(1, ...pts.map((w) => inv.stockKg(w.id)));
  return (
    <div className="h-[520px] overflow-hidden rounded-card border border-line" role="region" aria-label={t('inv.layout.map')}>
      <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        {pts.map((w) => (
          <CircleMarker key={w.id} center={[w.gps.lat, w.gps.lng]} radius={8 + (inv.stockKg(w.id) / max) * 14} eventHandlers={{ click: () => onOpen(w.id) }}
            pathOptions={{ color: 'rgb(var(--surface))', weight: 2, fillColor: 'var(--series-2)', fillOpacity: 0.9 }}>
            <LTooltip direction="top">{`${w.name} · ${f.kg(Math.round(inv.stockKg(w.id)))}`}</LTooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function WarehouseDrawer({ warehouse: w, onClose }: { warehouse: Warehouse; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const lk = useLookups();
  const movements = useOrgRows(useWarehouseStore((s) => s.movements)).filter((m) => m.warehouseId === w.id);
  const inbounds = useOrgRows(useWarehouseStore((s) => s.inbounds)).filter((x) => x.warehouseId === w.id);
  const discrepancies = useOrgRows(useWarehouseStore((s) => s.discrepancies)).filter((x) => x.warehouseId === w.id && x.status === 'OPEN');
  const counts = useOrgRows(useWarehouseStore((s) => s.stockCounts)).filter((x) => x.warehouseId === w.id);
  const expenses = useOrgRows(useWarehouseStore((s) => s.warehouseExpenses)).filter((x) => x.warehouseId === w.id);
  const bags = inv.stockBags(w.id);
  const [bagQ, setBagQ] = useState('');
  const byCommodity = [...bags.reduce((m, b) => m.set(b.commodityId, { bags: (m.get(b.commodityId)?.bags ?? 0) + 1, kg: (m.get(b.commodityId)?.kg ?? 0) + b.weightKg }), new Map<string, { bags: number; kg: number }>())];
  const ageing = ageingBuckets(bags);
  const expected = inbounds.filter((x) => x.status === 'PENDING');
  const row = (to: string, left: ReactNode, right: ReactNode, key: string) => <li key={key}><Link to={to} className="flex items-center justify-between gap-3 px-4 py-3 text-[14px] hover:bg-canvas">{left}<span className="flex shrink-0 items-center gap-3">{right}</span></Link></li>;
  return (
    <DetailDrawer open onClose={onClose} title={w.name} subtitle={`${t(`inv.whType.${w.type}`)} · ${inv.place(w)}`} badges={<StatusBadge status={w.status} />}
      tabs={[
        {
          key: 'stock', label: t('inv.tab.stock'), content: (
            <div className="space-y-5">
              <Facts items={[[t('inv.stock'), f.kg(inv.stockKg(w.id))], [t('inv.bags'), f.number(bags.length)], [t('inv.capacity'), f.kg(w.capacityKg)], [t('inv.utilisationCol'), <Utilisation key="u" used={inv.stockKg(w.id)} capacity={w.capacityKg} />]]} />
              <div className="grid gap-5 md:grid-cols-2">
                <div><div className="eyebrow mb-2">{t('inv.byCommodity')}</div>{byCommodity.length ? <Bars rows={byCommodity.map(([cid, x]) => ({ label: `${lk.commodity(cid)} · ${t('buy.bagsN', { count: x.bags })}`, value: Math.round(x.kg) }))} format={(v) => f.kg(v)} /> : <p className="text-[14px] text-muted">{t('inv.noStock')}</p>}</div>
                <div><div className="eyebrow mb-2">{t('inv.ageing')}</div><Bars rows={ageing.map((a) => ({ label: `${t('inv.days', { range: a.key })} · ${t('buy.bagsN', { count: a.bags })}`, value: a.kg, tone: a.key === '90+' ? 'warning' : 'brand' }))} format={(v) => f.kg(v)} /></div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3"><span className="eyebrow">{t('inv.byBag')}</span><input value={bagQ} onChange={(e) => setBagQ(e.target.value)} placeholder={t('inv.searchBag')} aria-label={t('inv.searchBag')} className="h-9 w-48 rounded-ctl border border-line bg-surface px-3 text-[13px]" /></div>
                <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
                  {bags.filter((b) => !bagQ || b.code.toLowerCase().includes(bagQ.toLowerCase())).slice(0, 200).map((b) => <li key={b.id} className="flex items-center justify-between px-4 py-2 text-[13px]">{mono(b.code)}<span className="text-muted">{lk.commodity(b.commodityId)} · {lk.agent(inv.agentOfBag(b))}</span><span className="tnum font-medium text-ink">{f.kg(b.weightKg)}</span></li>)}
                </ul>
              </div>
            </div>
          ),
        },
        {
          key: 'movements', label: t('inv.tab.movements'), count: movements.length, content: movements.length ? (
            <div className="overflow-x-auto rounded-ctl border border-line">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label">{['date', 'kind', 'ref', 'kg', 'balance'].map((k) => <th key={k} className={cn('px-3 py-2 font-semibold', (k === 'kg' || k === 'balance') && 'text-right')}>{t(`inv.mv.${k}`)}</th>)}</tr></thead>
                <tbody>{movements.slice(0, 120).map((m) => {
                  const sign = m.after >= m.before ? '+' : '−';
                  return <tr key={m.id} className="border-b border-line last:border-0"><td className="whitespace-nowrap px-3 py-2 text-ink">{f.date(m.at)}</td><td className="px-3 py-2">{t(`inv.mvKind.${m.kind}`)}</td><td className="whitespace-nowrap px-3 py-2">{mono(m.ref)}</td><td className={cn('tnum whitespace-nowrap px-3 py-2 text-right font-medium', sign === '+' ? 'text-success' : 'text-ink')}>{`${sign}${f.kg(m.kg)}`}</td><td className="tnum whitespace-nowrap px-3 py-2 text-right text-muted">{`${f.kg(m.before)} → ${f.kg(m.after)}`}</td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : <TabEmpty>{t('inv.noMovements')}</TabEmpty>,
        },
        { key: 'expected', label: t('inv.tab.expected'), count: expected.length, content: expected.length ? <ul className="divide-y divide-line rounded-ctl border border-line">{expected.map((x) => row(`/app/inventory/inbound?open=${x.id}`, <span>{mono(x.number)} <span className="ml-2 text-muted">{x.source.kind === 'TRANSFER' ? t('inv.fromWarehouse', { name: inv.warehouseName(x.source.fromWarehouseId) }) : lk.agent(x.agentId)}</span></span>, <><span className="text-muted">{t('buy.bagsN', { count: x.bags.length })}</span><span className="tnum font-medium text-ink">{f.kg(x.expectedKg)}</span></>, x.id))}</ul> : <TabEmpty>{t('inv.noExpected')}</TabEmpty> },
        { key: 'discrepancies', label: t('inv.tab.discrepancies'), count: discrepancies.length, content: discrepancies.length ? <ul className="divide-y divide-line rounded-ctl border border-line">{discrepancies.map((d) => row(`/app/inventory/inbound?open=${d.inboundId}&tab=discrepancies`, <span>{mono(d.bagCode)} <span className="ml-2 text-muted">{t(`inv.dType.${d.type}`)} · {lk.agent(d.agentId)}</span></span>, <span className="tnum font-medium text-danger">{`−${f.kg(d.openKg)}`}</span>, d.id))}</ul> : <TabEmpty>{t('inv.noDiscrepancies')}</TabEmpty> },
        { key: 'counts', label: t('inv.tab.counts'), count: counts.length, content: counts.length ? <ul className="divide-y divide-line rounded-ctl border border-line">{counts.map((c) => row(`/app/inventory/stock-counts?open=${c.id}`, <span>{mono(c.number)} <span className="ml-2 text-muted">{f.date(c.scheduledFor)}</span></span>, <StatusBadge status={c.status} />, c.id))}</ul> : <TabEmpty>{t('inv.noCounts')}</TabEmpty> },
        { key: 'expenses', label: t('inv.tab.expenses'), count: expenses.length, content: expenses.length ? <ul className="divide-y divide-line rounded-ctl border border-line">{expenses.map((e) => row(`/app/inventory/expenses?open=${e.id}`, <span>{mono(e.number)} <span className="ml-2 text-muted">{e.description}</span></span>, <><StatusBadge status={e.status} /><span className="tnum font-medium text-ink">{f.money(e.total)}</span></>, e.id))}</ul> : <TabEmpty>{t('inv.noExpenses')}</TabEmpty> },
        { key: 'officers', label: t('inv.officers'), count: w.officerUserIds.length, content: w.officerUserIds.length ? <ul className="divide-y divide-line rounded-ctl border border-line">{w.officerUserIds.map((u) => <li key={u} className="px-4 py-3 text-[14px] font-medium text-ink">{inv.user(u)}</li>)}</ul> : <TabEmpty>{t('inv.noOfficers')}</TabEmpty> },
        { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="warehouse" entityId={w.id} /> },
      ]}
    />
  );
}
