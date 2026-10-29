import { useMemo } from 'react';
import type { Bag, Warehouse } from '@/types';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useLocationStore } from '@/stores/locationStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useOrgRows, useT } from '@/stores/hooks';

/** Names and stock for inventory screens: warehouses, places, officers, bags. */
export function useInventory() {
  const warehouses = useOrgRows(useWarehouseStore((s) => s.warehouses));
  const bags = useOrgRows(useBuyingStore((s) => s.bags));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const users = useAccessStore((s) => s.users);
  return useMemo(() => {
    const wh = new Map(warehouses.map((w) => [w.id, w]));
    const node = new Map(nodes.map((n) => [n.id, n]));
    const user = new Map(users.map((u) => [u.id, u.name]));
    const byCode = new Map(bags.map((b) => [b.code, b]));
    const agentOfPurchase = new Map(purchases.map((p) => [p.id, p.agentId]));
    const stock = new Map<string, Bag[]>();
    for (const b of bags) if (b.status === 'IN_STOCK' && b.warehouseId) stock.set(b.warehouseId, [...(stock.get(b.warehouseId) ?? []), b]);
    const kg = (list: Bag[]) => Math.round(list.reduce((s, b) => s + b.weightKg, 0) * 10) / 10;
    return {
      warehouses,
      warehouse: (id?: string): Warehouse | undefined => (id ? wh.get(id) : undefined),
      warehouseName: (id?: string) => (id ? wh.get(id)?.name ?? '—' : '—'),
      place: (w?: Warehouse) => (w ? node.get(w.locationNodeId)?.name ?? '—' : '—'),
      user: (id?: string) => (id ? user.get(id) ?? id : '—'),
      bag: (code: string) => byCode.get(code),
      agentOfBag: (b: Bag) => agentOfPurchase.get(b.purchaseIds[0] ?? ''),
      stockBags: (warehouseId: string) => stock.get(warehouseId) ?? [],
      stockKg: (warehouseId: string) => kg(stock.get(warehouseId) ?? []),
      kg,
    };
  }, [warehouses, bags, purchases, nodes, users]);
}

/** Days since a bag last came into the warehouse (inbound, top-up or return). */
export function bagAgeDays(b: Bag, now = Date.now()) {
  const lastIn = [...(b.history ?? [])].reverse().find((h) => h.event === 'INBOUND' || h.event === 'TOP_UP' || h.event === 'RETURNED');
  return lastIn ? Math.max(0, (now - new Date(lastIn.at).getTime()) / 86_400_000) : 0;
}

/** Bags in stock, oldest first, grouped by days in the warehouse. */
export function ageingBuckets(bags: Bag[], now = Date.now()) {
  const buckets = [{ key: '0-30', max: 30 }, { key: '31-60', max: 60 }, { key: '61-90', max: 90 }, { key: '90+', max: Infinity }].map((b) => ({ ...b, bags: 0, kg: 0 }));
  for (const b of bags) {
    const days = bagAgeDays(b, now);
    const bucket = buckets.find((x) => days <= x.max)!;
    bucket.bags += 1;
    bucket.kg += b.weightKg;
  }
  return buckets.map((b) => ({ ...b, kg: Math.round(b.kg) }));
}

/** Capacity bar: green under 75%, amber to 90%, red above. */
export function Utilisation({ used, capacity }: { used: number; capacity: number }) {
  const { t } = useT();
  const pct = capacity ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
  return (
    <div className="min-w-[120px]" title={t('inv.utilisation', { pct })}>
      <div className="mb-1 flex justify-between text-[12px]"><span className="text-muted">{t('inv.utilisation', { pct })}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-canvas" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('inv.utilisation', { pct })}>
        <div className={cn('h-full rounded-full', pct > 90 ? 'bg-danger' : pct > 75 ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const variancePct = (expected: number, received: number) => (expected ? Math.round(((expected - received) / expected) * 10000) / 100 : 0);
