import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleMarker, MapContainer, TileLayer, Tooltip as LTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, LayoutGrid, List, Map as MapIcon, PackageOpen, Search, Truck, UserRound } from 'lucide-react';
import type { Bag, Warehouse } from '@/types';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { seriesColor } from '@/components/charts/charts';
import { cn } from '@/lib/utils';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { ageingBuckets, bagAgeDays, useInventory } from './shared';

type Layout = 'cards' | 'list' | 'map';

interface MixRow { commodityId: string; label: string; kg: number; bags: number; color: string; oldestDays: number }

/** Stock in a warehouse grouped by commodity, largest first, each with its fixed series colour. */
function useMix() {
  const inv = useInventory();
  const lk = useLookups();
  const settings = useOrgSettings();
  const index = useMemo(() => new Map(settings.commodities.map((c, i) => [c.id, i])), [settings.commodities]);
  return (warehouseId: string): MixRow[] => {
    const m = new Map<string, MixRow>();
    for (const b of inv.stockBags(warehouseId)) {
      const r = m.get(b.commodityId) ?? { commodityId: b.commodityId, label: lk.commodity(b.commodityId), kg: 0, bags: 0, color: seriesColor(index.get(b.commodityId) ?? 7), oldestDays: 0 };
      r.kg += b.weightKg;
      r.bags += 1;
      r.oldestDays = Math.max(r.oldestDays, bagAgeDays(b));
      m.set(b.commodityId, r);
    }
    return [...m.values()].sort((a, b) => b.kg - a.kg);
  };
}

/** One thin bar split by commodity share, with 2px gaps between segments. */
function MixBar({ rows, className }: { rows: MixRow[]; className?: string }) {
  const total = rows.reduce((s, r) => s + r.kg, 0);
  if (!total) return <div className={cn('h-2 rounded-full bg-canvas', className)} aria-hidden="true" />;
  return (
    <div className={cn('flex h-2 gap-[2px] overflow-hidden rounded-full', className)} aria-hidden="true">
      {rows.map((r) => <span key={r.commodityId} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(r.kg / total) * 100}%`, minWidth: 3, background: r.color }} />)}
    </div>
  );
}

/** Capacity used: "6% of 600,000 kg" with a meter that turns amber over 75% and red over 90%. */
function CapacityMeter({ used, capacity, showFree }: { used: number; capacity: number; showFree?: boolean }) {
  const { t } = useT();
  const f = useFormat();
  const pct = capacity ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
  const label = t('inv.ofCapacity', { pct, capacity: f.kg(capacity) });
  return (
    <div className="min-w-[150px]">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-body">{label}</span>
        {showFree && <span className="tnum text-muted">{t('inv.freeKg', { kg: f.kg(Math.max(0, Math.round(capacity - used))) })}</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-canvas" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full', pct > 90 ? 'bg-danger' : pct > 75 ? 'bg-warning' : 'bg-brand')} style={{ width: `${Math.max(pct, used > 0 ? 1.5 : 0)}%` }} />
      </div>
    </div>
  );
}

/** Warehouses (PRD H1): cards, table or map; stock by commodity, capacity used and what needs attention. */
export function WarehousesPage() {
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const mixOf = useMix();
  const discrepancies = useOrgRows(useWarehouseStore((s) => s.discrepancies));
  const inbounds = useOrgRows(useWarehouseStore((s) => s.inbounds));
  const [openId, open, close] = useDrawerParam();
  const [layout, setLayout] = useState<Layout>('cards');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const openDisc = useMemo(() => { const m = new Map<string, number>(); for (const d of discrepancies) if (d.status === 'OPEN') m.set(d.warehouseId, (m.get(d.warehouseId) ?? 0) + 1); return m; }, [discrepancies]);
  const expected = useMemo(() => { const m = new Map<string, number>(); for (const x of inbounds) if (x.status === 'PENDING') m.set(x.warehouseId, (m.get(x.warehouseId) ?? 0) + 1); return m; }, [inbounds]);
  const query = q.trim().toLowerCase();
  const rows = inv.warehouses.filter((w) => (!type || w.type === type) && (!query || w.name.toLowerCase().includes(query) || inv.place(w).toLowerCase().includes(query)));
  const columns = useMemo<ColumnDef<Warehouse, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="block min-w-0"><span className="block font-medium text-ink">{c.row.original.name}</span><span className="block text-[12px] text-muted">{t(`inv.whType.${c.row.original.type}`)} · {inv.place(c.row.original)}</span></span> },
    { id: 'stock', header: t('inv.stock'), accessorFn: (w) => inv.stockKg(w.id), cell: (c) => <span className="whitespace-nowrap"><span className="font-medium text-ink">{f.kg(Math.round(c.getValue() as number))}</span><span className="ml-2 text-[12px] text-muted">{t('buy.bagsN', { count: inv.stockBags(c.row.original.id).length })}</span></span> },
    { id: 'mix', header: t('inv.mix'), enableSorting: false, cell: (c) => { const mix = mixOf(c.row.original.id); return mix.length ? <span className="block w-40"><MixBar rows={mix} /><span className="mt-1 block truncate text-[12px] text-muted">{mix.slice(0, 2).map((r) => r.label).join(', ')}{mix.length > 2 ? ` ${t('inv.moreN', { count: mix.length - 2 })}` : ''}</span></span> : <span className="text-muted">{'—'}</span>; } },
    { id: 'capacity', header: t('inv.capacityUsed'), accessorFn: (w) => (w.capacityKg ? inv.stockKg(w.id) / w.capacityKg : 0), cell: (c) => <CapacityMeter used={inv.stockKg(c.row.original.id)} capacity={c.row.original.capacityKg} /> },
    { id: 'officers', header: t('inv.officers'), accessorFn: (w) => w.officerUserIds.map((u) => inv.user(u)).join(', ') || '—' },
    { id: 'discrepancies', header: t('inv.openDiscrepancies'), accessorFn: (w) => openDisc.get(w.id) ?? 0, cell: (c) => ((c.getValue() as number) ? <Link to={`/app/inventory/inbound?view=discrepancies&warehouse=${c.row.original.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-danger hover:underline">{String(c.getValue())}</Link> : <span className="text-muted">{'0'}</span>) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  ], [t, f, inv, openDisc, mixOf]);
  const current = inv.warehouses.find((w) => w.id === openId);
  const total = inv.warehouses.reduce((s, w) => s + inv.stockKg(w.id), 0);
  const capacity = inv.warehouses.reduce((s, w) => s + w.capacityKg, 0);
  const layouts: { key: Layout; icon: typeof List; label: string }[] = [{ key: 'cards', icon: LayoutGrid, label: t('inv.whCards') }, { key: 'list', icon: List, label: t('inv.whTable') }, { key: 'map', icon: MapIcon, label: t('inv.layout.map') }];
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.warehouses')} description={t('pages.warehouses')}
        actions={
          <div className="inline-flex rounded-ctl border border-line bg-subtle p-0.5" role="group" aria-label={t('inv.layout.map')}>
            {layouts.map((l) => (
              <button key={l.key} type="button" onClick={() => setLayout(l.key)} aria-pressed={layout === l.key} className={cn('inline-flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors [&_svg]:size-3.5', layout === l.key ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink')}>
                <l.icon aria-hidden="true" /> {l.label}
              </button>
            ))}
          </div>
        } />
      <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line shadow-soft sm:grid-cols-3" data-tour="stat">
        <div className="bg-surface p-5">
          <div className="text-[13px] font-medium text-muted">{t('inv.kpi.stock')}</div>
          <div className="tnum mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">{f.kg(Math.round(total))}</div>
          <div className="mt-3"><CapacityMeter used={total} capacity={capacity} /></div>
        </div>
        <div className="bg-surface p-5">
          <div className="text-[13px] font-medium text-muted">{t('inv.kpi.bags')}</div>
          <div className="tnum mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">{f.number(inv.warehouses.reduce((s, w) => s + inv.stockBags(w.id).length, 0))}</div>
          <div className="mt-3 text-[12px] text-muted">{t('inv.expectedN', { count: [...expected.values()].reduce((s, x) => s + x, 0) })}</div>
        </div>
        <div className="bg-surface p-5">
          <div className="text-[13px] font-medium text-muted">{t('inv.kpi.discrepancies')}</div>
          <div className={cn('tnum mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em]', openDisc.size ? 'text-danger' : 'text-ink')}>{f.number([...openDisc.values()].reduce((s, x) => s + x, 0))}</div>
          {openDisc.size > 0 && <Link to="/app/inventory/inbound?view=discrepancies" className="mt-3 inline-block text-[12px] text-body underline underline-offset-[3px] hover:text-brand">{t('inv.tab.discrepancies')}</Link>}
        </div>
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('inv.searchWarehouses')}
        filters={[{ key: 'type', label: t('col.type'), value: type, onChange: setType, options: (['COMMUNITY_STORE', 'AGGREGATION_HUB', 'CENTRAL', 'PORT'] as const).map((x) => ({ value: x, label: t(`inv.whType.${x}`) })) }]}
        onClear={() => { setQ(''); setType(''); }} />
      {layout === 'cards' && (rows.length ? (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3" data-tour="data-table">
          {rows.map((w) => <li key={w.id}><WarehouseCard warehouse={w} mix={mixOf(w.id)} expected={expected.get(w.id) ?? 0} issues={openDisc.get(w.id) ?? 0} active={w.id === openId} onOpen={() => open(w.id)} /></li>)}
        </ul>
      ) : <TabEmpty>{t('inv.emptyWarehouses')}</TabEmpty>)}
      {layout === 'list' && <DataTable columns={columns} data={rows} onRowClick={(w) => open(w.id)} activeId={openId} getRowId={(w) => w.id} empty={t('inv.emptyWarehouses')} />}
      {layout === 'map' && <WarehouseMap rows={rows} onOpen={open} />}
      {current && <WarehouseDrawer key={current.id} warehouse={current} onClose={close} />}
    </>
  );
}

function WarehouseCard({ warehouse: w, mix, expected, issues, active, onOpen }: { warehouse: Warehouse; mix: MixRow[]; expected: number; issues: number; active: boolean; onOpen: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const inv = useInventory();
  const kg = inv.stockKg(w.id);
  const bags = inv.stockBags(w.id).length;
  const shown = mix.slice(0, 3);
  return (
    <button type="button" onClick={onOpen} data-warehouse-card className={cn('group flex h-full w-full flex-col rounded-card border bg-surface text-left shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', active ? 'border-brand/50' : 'border-line')}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{w.name}</div>
          <div className="mt-0.5 truncate text-[13px] text-muted">{t(`inv.whType.${w.type}`)} · {inv.place(w)}</div>
        </div>
        {w.status !== 'ACTIVE' && <StatusBadge status={w.status} />}
      </div>
      <div className="px-5 pt-5">
        <div className="flex items-baseline gap-2">
          <span className="tnum text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">{f.kg(Math.round(kg))}</span>
          <span className="text-[13px] text-muted">{t('buy.bagsN', { count: bags })}</span>
        </div>
        <MixBar rows={mix} className="mt-4" />
        {shown.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {shown.map((r) => (
              <li key={r.commodityId} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-body">{r.label}</span>
                <span className="tnum text-ink">{f.kg(Math.round(r.kg))}</span>
                <span className="tnum w-10 text-right text-muted">{Math.round((r.kg / kg) * 100)}%</span>
              </li>
            ))}
            {mix.length > 3 && <li className="pl-4 text-[12px] text-muted">{t('inv.moreN', { count: mix.length - 3 })}</li>}
          </ul>
        ) : <p className="mt-3 flex items-center gap-2 text-[13px] text-muted"><PackageOpen className="h-4 w-4" aria-hidden="true" /> {t('inv.noStock')}</p>}
      </div>
      <div className="mt-auto px-5 pb-5 pt-5"><CapacityMeter used={kg} capacity={w.capacityKg} showFree /></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-[12px]">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-muted"><UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{w.officerUserIds.map((u) => inv.user(u)).join(', ') || t('inv.noOfficer')}</span></span>
        {expected > 0 && <span className="flex items-center gap-1 text-info"><Truck className="h-3.5 w-3.5" aria-hidden="true" /> {t('inv.expectedN', { count: expected })}</span>}
        {issues > 0 && <span className="flex items-center gap-1 font-medium text-danger"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {t('inv.issuesN', { count: issues })}</span>}
      </div>
    </button>
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
    <div className="h-[520px] overflow-hidden rounded-card border border-line shadow-soft" role="region" aria-label={t('inv.layout.map')}>
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

function Section({ title, hint, right, children }: { title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const AGE_TONE: Record<string, string> = { '0-30': 'rgb(var(--brand))', '31-60': 'rgb(var(--brand) / 0.62)', '61-90': 'rgb(var(--brand) / 0.35)', '90+': 'rgb(var(--warning))' };

/** Stock tab: summary, what's in stock by commodity, stock age, and the bags themselves. */
function StockTab({ warehouse: w }: { warehouse: Warehouse }) {
  const { t, terms } = useT();
  const f = useFormat();
  const inv = useInventory();
  const lk = useLookups();
  const mix = useMix()(w.id);
  const bags = inv.stockBags(w.id);
  const kg = inv.stockKg(w.id);
  const ageing = ageingBuckets(bags);
  const old = ageing.find((a) => a.key === '90+')!;
  const [commodity, setCommodity] = useState('');
  const [bagQ, setBagQ] = useState('');
  const [limit, setLimit] = useState(25);
  const list = useMemo(() => bags
    .filter((b) => (!commodity || b.commodityId === commodity) && (!bagQ || b.code.toLowerCase().includes(bagQ.trim().toLowerCase())))
    .map((b) => ({ bag: b, days: bagAgeDays(b) }))
    .sort((a, b) => b.days - a.days), [bags, commodity, bagQ]);
  const color = new Map(mix.map((r) => [r.commodityId, r.color]));
  const days = (n: number) => t('inv.daysN', { count: Math.floor(n) });
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-ctl border border-line bg-line sm:grid-cols-3">
        <div className="bg-surface px-4 py-3.5"><dt className="text-[12px] font-medium text-muted">{t('inv.stock')}</dt><dd className="tnum mt-1 text-[20px] font-semibold tracking-[-0.02em] text-ink">{f.kg(Math.round(kg))}</dd></div>
        <div className="bg-surface px-4 py-3.5"><dt className="text-[12px] font-medium text-muted">{t('inv.bags')}</dt><dd className="tnum mt-1 text-[20px] font-semibold tracking-[-0.02em] text-ink">{f.number(bags.length)}</dd></div>
        <div className="bg-surface px-4 py-3.5"><dt className="mb-2 text-[12px] font-medium text-muted">{t('inv.capacityUsed')}</dt><dd><CapacityMeter used={kg} capacity={w.capacityKg} /></dd></div>
      </dl>

      <Section title={t('inv.whatsInStock')} hint={mix.length > 1 ? t('inv.whatsInStockHint') : undefined}>
        {mix.length ? (
          <>
            <MixBar rows={mix} className="mb-4 h-2.5" />
            <div className="overflow-hidden rounded-ctl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-subtle text-[12px] text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium">{t('col.commodity')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('inv.bags')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('inv.stock')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('inv.share')}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t('inv.oldest')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mix.map((r) => {
                    const on = commodity === r.commodityId;
                    return (
                      <tr key={r.commodityId} onClick={() => { setCommodity(on ? '' : r.commodityId); setLimit(25); }} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setCommodity(on ? '' : r.commodityId); }} aria-pressed={on}
                        className={cn('cursor-pointer border-t border-line transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none', on && 'bg-brand-soft/50 hover:bg-brand-soft/60')}>
                        <td className="px-4 py-2.5"><span className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" /><span className="font-medium text-ink">{r.label}</span></span></td>
                        <td className="tnum px-3 py-2.5 text-right text-body">{f.number(r.bags)}</td>
                        <td className="tnum px-3 py-2.5 text-right font-medium text-ink">{f.kg(Math.round(r.kg))}</td>
                        <td className="tnum px-3 py-2.5 text-right text-muted">{`${Math.round((r.kg / kg) * 100)}%`}</td>
                        <td className={cn('tnum px-4 py-2.5 text-right', r.oldestDays > 90 ? 'font-medium text-warning' : 'text-body')}>{days(r.oldestDays)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : <TabEmpty>{t('inv.noStock')}</TabEmpty>}
      </Section>

      {bags.length > 0 && (
        <Section title={t('inv.stockAge')} hint={t('inv.stockAgeHint')}>
          <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
            {ageing.filter((a) => a.bags).map((a) => <span key={a.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(a.bags / bags.length) * 100}%`, minWidth: 3, background: AGE_TONE[a.key] }} />)}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {ageing.map((a) => (
              <div key={a.key}>
                <dt className="flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: AGE_TONE[a.key] }} aria-hidden="true" />{t('inv.ageBucket', { range: a.key })}</dt>
                <dd className="tnum mt-1 text-[14px] font-semibold text-ink">{f.kg(a.kg)}</dd>
                <dd className="text-[12px] text-muted">{t('buy.bagsN', { count: a.bags })}</dd>
              </div>
            ))}
          </dl>
          {old.bags > 0 && (
            <p className="mt-4 flex items-start gap-2.5 rounded-ctl border border-warning/20 bg-warning/[0.07] px-3.5 py-2.5 text-[13px] text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              {t('inv.oldStock', { count: old.bags, kg: f.kg(old.kg) })}
            </p>
          )}
        </Section>
      )}

      {bags.length > 0 && (
        <Section title={t('inv.bagsInStore')} right={<span className="tnum text-[12px] text-muted">{t('inv.showingN', { shown: f.number(Math.min(limit, list.length)), total: f.number(list.length) })}</span>}>
          <div className="mb-3 flex flex-wrap gap-2">
            <select value={commodity} onChange={(e) => { setCommodity(e.target.value); setLimit(25); }} aria-label={t('col.commodity')} className="h-ctl min-w-0 rounded-ctl border border-line-strong bg-surface px-2.5 text-[13px] text-body shadow-xs focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/15">
              <option value="">{t('inv.allCommodities')}</option>
              {mix.map((r) => <option key={r.commodityId} value={r.commodityId}>{r.label}</option>)}
            </select>
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input value={bagQ} onChange={(e) => { setBagQ(e.target.value); setLimit(25); }} placeholder={t('inv.searchBag')} aria-label={t('inv.searchBag')} className="h-ctl w-full rounded-ctl border border-line-strong bg-surface pl-8 pr-3 text-[13px] text-ink shadow-xs placeholder:text-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/15" />
            </div>
          </div>
          {list.length ? (
            <div className="overflow-hidden rounded-ctl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-subtle text-[12px] text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium">{t('inv.bagCol')}</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t('col.commodity')}</th>
                    <th scope="col" className="hidden px-3 py-2 text-left font-medium sm:table-cell">{terms.agent}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('inv.daysInStore')}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t('inv.weightKg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, limit).map(({ bag, days: d }: { bag: Bag; days: number }) => (
                    <tr key={bag.id} className="border-t border-line">
                      <td className="whitespace-nowrap px-4 py-2">{mono(bag.code)}</td>
                      <td className="px-3 py-2"><span className="flex items-center gap-1.5 text-body"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color.get(bag.commodityId) }} aria-hidden="true" />{lk.commodity(bag.commodityId)}</span></td>
                      <td className="hidden truncate px-3 py-2 text-muted sm:table-cell">{lk.agent(inv.agentOfBag(bag))}</td>
                      <td className={cn('tnum whitespace-nowrap px-3 py-2 text-right', d > 90 ? 'font-medium text-warning' : 'text-body')}>{days(d)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-right font-medium text-ink">{f.kg(bag.weightKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <TabEmpty>{t('inv.noBagsMatch')}</TabEmpty>}
          {list.length > limit && <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setLimit((n) => n + 50)}>{t('inv.showMore')}</Button>}
        </Section>
      )}
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
  const expected = inbounds.filter((x) => x.status === 'PENDING');
  const list = (children: ReactNode) => <ul className="divide-y divide-line overflow-hidden rounded-ctl border border-line">{children}</ul>;
  const row = (to: string, left: ReactNode, right: ReactNode, key: string) => <li key={key}><Link to={to} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-subtle">{left}<span className="flex shrink-0 items-center gap-3">{right}</span></Link></li>;
  return (
    <DetailDrawer open onClose={onClose} title={w.name} subtitle={`${t(`inv.whType.${w.type}`)} · ${inv.place(w)}`} badges={<StatusBadge status={w.status} />}
      tabs={[
        { key: 'stock', label: t('inv.tab.stock'), content: <StockTab warehouse={w} /> },
        {
          key: 'movements', label: t('inv.tab.movements'), count: movements.length, content: movements.length ? (
            <div className="overflow-x-auto rounded-ctl border border-line">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead><tr className="border-b border-line bg-subtle text-left text-[12px] text-muted">{['date', 'kind', 'ref', 'kg', 'balance'].map((k) => <th key={k} className={cn('px-3 py-2 font-medium', (k === 'kg' || k === 'balance') && 'text-right')}>{t(`inv.mv.${k}`)}</th>)}</tr></thead>
                <tbody>{movements.slice(0, 120).map((m) => {
                  const sign = m.after >= m.before ? '+' : '−';
                  return <tr key={m.id} className="border-b border-line last:border-0"><td className="whitespace-nowrap px-3 py-2 text-ink">{f.date(m.at)}</td><td className="px-3 py-2 text-body">{t(`inv.mvKind.${m.kind}`)}</td><td className="whitespace-nowrap px-3 py-2">{mono(m.ref)}</td><td className={cn('tnum whitespace-nowrap px-3 py-2 text-right font-medium', sign === '+' ? 'text-success' : 'text-ink')}>{`${sign}${f.kg(m.kg)}`}</td><td className="tnum whitespace-nowrap px-3 py-2 text-right text-muted">{`${f.kg(m.before)} → ${f.kg(m.after)}`}</td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : <TabEmpty>{t('inv.noMovements')}</TabEmpty>,
        },
        { key: 'expected', label: t('inv.tab.expected'), count: expected.length, content: expected.length ? list(expected.map((x) => row(`/app/inventory/inbound?open=${x.id}`, <span>{mono(x.number)} <span className="ml-2 text-muted">{x.source.kind === 'TRANSFER' ? t('inv.fromWarehouse', { name: inv.warehouseName(x.source.fromWarehouseId) }) : lk.agent(x.agentId)}</span></span>, <><span className="text-muted">{t('buy.bagsN', { count: x.bags.length })}</span><span className="tnum font-medium text-ink">{f.kg(x.expectedKg)}</span></>, x.id))) : <TabEmpty>{t('inv.noExpected')}</TabEmpty> },
        { key: 'discrepancies', label: t('inv.tab.discrepancies'), count: discrepancies.length, content: discrepancies.length ? list(discrepancies.map((d) => row(`/app/inventory/inbound?open=${d.inboundId}&tab=discrepancies`, <span>{mono(d.bagCode)} <span className="ml-2 text-muted">{t(`inv.dType.${d.type}`)} · {lk.agent(d.agentId)}</span></span>, <span className="tnum font-medium text-danger">{`−${f.kg(d.openKg)}`}</span>, d.id))) : <TabEmpty>{t('inv.noDiscrepancies')}</TabEmpty> },
        { key: 'counts', label: t('inv.tab.counts'), count: counts.length, content: counts.length ? list(counts.map((c) => row(`/app/inventory/stock-counts?open=${c.id}`, <span>{mono(c.number)} <span className="ml-2 text-muted">{f.date(c.scheduledFor)}</span></span>, <StatusBadge status={c.status} />, c.id))) : <TabEmpty>{t('inv.noCounts')}</TabEmpty> },
        { key: 'expenses', label: t('inv.tab.expenses'), count: expenses.length, content: expenses.length ? list(expenses.map((e) => row(`/app/inventory/expenses?open=${e.id}`, <span>{mono(e.number)} <span className="ml-2 text-muted">{e.description}</span></span>, <><StatusBadge status={e.status} /><span className="tnum font-medium text-ink">{f.money(e.total)}</span></>, e.id))) : <TabEmpty>{t('inv.noExpenses')}</TabEmpty> },
        { key: 'officers', label: t('inv.officers'), count: w.officerUserIds.length, content: w.officerUserIds.length ? list(w.officerUserIds.map((u) => <li key={u} className="flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-ink"><UserRound className="h-4 w-4 text-muted" aria-hidden="true" />{inv.user(u)}</li>)) : <TabEmpty>{t('inv.noOfficers')}</TabEmpty> },
        { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="warehouse" entityId={w.id} /> },
      ]}
    />
  );
}
