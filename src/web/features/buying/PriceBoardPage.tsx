import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Settings2, Sparkles } from 'lucide-react';
import type { PriceListEntry } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { FilterBar, TabEmpty } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { Lines } from '@/components/charts/charts';
import { zoneOf } from '@/services/buyingService';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { Panel } from './common';

const DAY = 86_400_000;
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };

interface Row { entry: PriceListEntry; zone: string; paid: number[]; avg: number; med: number; diffPct: number | null; lastChange?: { at: string; fromMinor: number } }

/** Price board (PRD D6): current price per commodity per zone, change history, paid vs list, suggested price. */
export function PriceBoardPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const navigate = useNavigate();
  const settings = useOrgSettings();
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const [commodity, setCommodity] = useState(settings.commodities[0]?.id ?? '');
  const [zone, setZone] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Row | null>(null);
  useDemoNotes([{ id: 'pb', key: 'demo.note.priceBoard' }]);
  const today = new Date().toISOString().slice(0, 10);
  const zoneByCommunity = useMemo(() => new Map(communities.map((c) => [c.id, zoneOf(settings, c.locationNodeId)?.id])), [communities, settings]);

  const rows = useMemo<Row[]>(() => { const since = Date.now() - 30 * DAY; return settings.priceList
    .filter((p) => p.effectiveFrom <= today && (!p.effectiveTo || p.effectiveTo >= today) && (!commodity || p.commodityId === commodity) && (!zone || p.zoneId === zone))
    .map((entry) => {
      const paid = purchases.filter((p) => p.commodityId === entry.commodityId && zoneByCommunity.get(p.communityId) === entry.zoneId && new Date(p.createdAt).getTime() >= since).map((p) => p.unitPrice.amountMinor);
      const avg = paid.length ? Math.round(paid.reduce((s, x) => s + x, 0) / paid.length) : 0;
      const last = settings.pricing.history.find((h) => h.entryId === entry.id);
      return { entry, zone: settings.zones.find((z) => z.id === entry.zoneId)?.name ?? '—', paid, avg, med: median(paid), diffPct: avg ? Math.round(((avg - entry.price.amountMinor) / entry.price.amountMinor) * 1000) / 10 : null, lastChange: last };
    }).filter((r) => !q.trim() || r.zone.toLowerCase().includes(q.trim().toLowerCase())); }, [settings, purchases, commodity, zone, today, zoneByCommunity, q]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'commodity', header: t('col.commodity'), accessorFn: (r) => lk.commodity(r.entry.commodityId) },
    { id: 'zone', header: t('buy.zone'), accessorFn: (r) => r.zone },
    { id: 'grade', header: t('buy.grade'), accessorFn: (r) => r.entry.grade ?? t('buy.anyGrade') },
    { id: 'price', header: t('buy.listPrice'), accessorFn: (r) => r.entry.price.amountMinor, cell: (c) => <span className="font-semibold text-ink">{f.money(c.row.original.entry.price)}</span> },
    { id: 'tolerance', header: t('buy.tolerance'), accessorFn: (r) => r.entry.tolerancePct, cell: (c) => `± ${c.getValue() as number}%` },
    { id: 'since', header: t('buy.effectiveFrom'), accessorFn: (r) => r.entry.effectiveFrom, cell: (c) => f.date(c.getValue() as string) },
    { id: 'last', header: t('buy.lastChange'), accessorFn: (r) => r.lastChange?.at ?? '', cell: (c) => { const l = c.row.original.lastChange; return l ? <span>{`${f.money({ amountMinor: l.fromMinor, currency: c.row.original.entry.price.currency })} → ${f.money(c.row.original.entry.price)}`}<span className="block text-[12px] text-muted">{f.date(l.at)}</span></span> : '—'; } },
    { id: 'avg', header: t('buy.avgPaid30'), accessorFn: (r) => r.avg, cell: (c) => (c.row.original.avg ? f.money({ amountMinor: c.row.original.avg, currency: c.row.original.entry.price.currency }) : '—') },
    { id: 'diff', header: t('buy.paidVsList'), accessorFn: (r) => r.diffPct ?? -999, cell: (c) => { const d = c.row.original.diffPct; return d == null ? '—' : <Badge tone={Math.abs(d) > c.row.original.entry.tolerancePct / 2 ? 'warning' : 'neutral'}>{`${d > 0 ? '+' : ''}${f.number(d, { maximumFractionDigits: 1 })}%`}</Badge>; } },
    { id: 'n', header: t('buy.purchases30'), accessorFn: (r) => r.paid.length },
  ], [t, f, lk]);

  const chosen = rows.find((r) => r.entry.id === selected) ?? rows.find((r) => r.paid.length) ?? rows[0];
  const series = useMemo(() => {
    if (!chosen) return [];
    const m = new Map<string, number[]>();
    const start = (d: string) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    for (const p of purchases) if (p.commodityId === chosen.entry.commodityId && zoneByCommunity.get(p.communityId) === chosen.entry.zoneId) { const k = start(p.createdAt); m.set(k, [...(m.get(k) ?? []), p.unitPrice.amountMinor]); }
    const history = settings.pricing.history.filter((h) => h.entryId === chosen.entry.id).sort((a, b) => a.at.localeCompare(b.at));
    const listAt = (d: string) => { let v = history[0]?.fromMinor ?? chosen.entry.price.amountMinor; for (const h of history) if (h.at.slice(0, 10) <= d) v = h.toMinor; return v; };
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).slice(-16).map(([k, xs]) => ({ label: f.date(k, 'd MMM'), paid: Math.round(xs.reduce((s, x) => s + x, 0) / xs.length), list: listAt(k) }));
  }, [chosen, purchases, zoneByCommunity, settings.pricing.history, f]);
  const history = settings.pricing.history.filter((h) => settings.priceList.some((p) => p.id === h.entryId && (!commodity || p.commodityId === commodity) && (!zone || p.zoneId === zone)));

  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.buying')}
        title={t('nav.priceBoard')}
        description={t('pages.priceBoard')}
        primary={<PermissionGate permission="settings.view"><Button variant="secondary" onClick={() => navigate('/app/settings/priceLists')}><Settings2 /> {t('buy.editPriceLists')}</Button></PermissionGate>}
      />
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('buy.searchPrices')}
        views={settings.commodities.map((c) => ({ key: c.id, label: lk.commodity(c.id), active: commodity === c.id, onSelect: () => { setCommodity(c.id); setSelected(null); } }))}
        filters={[{ key: 'zone', label: t('buy.zone'), value: zone, onChange: (v) => { setZone(v); setSelected(null); }, options: settings.zones.map((z) => ({ value: z.id, label: z.name })) }]}
        onClear={() => { setZone(''); setQ(''); }}
      />
      <div className="space-y-4">
        <DataTable columns={columns} data={rows} onRowClick={(r) => setSelected(r.entry.id)} activeId={chosen?.entry.id} getRowId={(r) => r.entry.id} empty={t('buy.emptyPrices')} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2" title={chosen ? t('buy.paidVsListFor', { commodity: lk.commodity(chosen.entry.commodityId), zone: chosen.zone }) : t('buy.paidVsList')}
            actions={chosen && <PermissionGate permission="priceBoard.suggest"><Button size="sm" variant="secondary" disabled={!chosen.paid.length} onClick={() => setSuggest(chosen)}><Sparkles /> {t('buy.suggestPrice')}</Button></PermissionGate>}>
            {series.length ? <Lines data={series} series={[{ key: 'paid', label: t('buy.avgPaid'), index: 0 }, { key: 'list', label: t('buy.listPrice'), index: 2, dashed: true }]} format={(v) => f.money({ amountMinor: v, currency: chosen!.entry.price.currency })} axisFormat={(v) => f.number(v / (chosen!.entry.price.currency === 'XOF' ? 1 : 100), { maximumFractionDigits: 2, minimumFractionDigits: chosen!.entry.price.currency === 'XOF' ? 0 : 2 })} /> : <TabEmpty>{t('buy.noPaidPrices')}</TabEmpty>}
          </Panel>
          <Panel title={t('buy.changeHistory')}>
            {history.length ? (
              <ul className="max-h-72 space-y-3 overflow-y-auto" tabIndex={0}>
                {history.slice(0, 20).map((h) => {
                  const e = settings.priceList.find((p) => p.id === h.entryId)!;
                  const up = h.toMinor > h.fromMinor;
                  return (
                    <li key={h.id} className="text-[13px]">
                      <div className="text-ink">{lk.commodity(e.commodityId)} · {settings.zones.find((z) => z.id === e.zoneId)?.name}</div>
                      <div className="text-muted"><span className={cn('tnum font-medium', up ? 'text-warning' : 'text-success')}>{`${f.money({ amountMinor: h.fromMinor, currency: e.price.currency })} → ${f.money({ amountMinor: h.toMinor, currency: e.price.currency })}`}</span>{` · ${lk.user(h.by)} · ${f.date(h.at)}`}</div>
                    </li>
                  );
                })}
              </ul>
            ) : <TabEmpty>{t('buy.noChanges')}</TabEmpty>}
          </Panel>
        </div>
      </div>
      {suggest && <SuggestDialog row={suggest} onClose={() => setSuggest(null)} onOpenSettings={() => navigate('/app/settings/priceLists')} />}
    </>
  );
}

/** "AI" suggestion: median paid over 30 days, kept inside the tolerance band and rounded to the price step. */
function SuggestDialog({ row, onClose, onOpenSettings }: { row: Row; onClose: () => void; onOpenSettings: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const list = row.entry.price.amountMinor;
  const band = (list * row.entry.tolerancePct) / 100;
  const step = 5;
  const raw = Math.max(list - band, Math.min(list + band, row.med));
  const suggested = Math.round(raw / step) * step;
  const change = Math.round(((suggested - list) / list) * 1000) / 10;
  const above = row.paid.filter((x) => x > list).length;
  const money = (v: number) => f.money({ amountMinor: v, currency: row.entry.price.currency });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('buy.suggestTitle', { commodity: lk.commodity(row.entry.commodityId), zone: row.zone })}</DialogTitle>
          <DialogDescription>{t('buy.suggestHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-baseline gap-3"><span className="tnum text-[32px] font-semibold text-ink">{money(suggested)}</span><span className={cn('tnum text-[14px] font-medium', change > 0 ? 'text-warning' : change < 0 ? 'text-success' : 'text-muted')}>{`${change > 0 ? '+' : ''}${f.number(change, { maximumFractionDigits: 1 })}%`}</span></div>
          <ul className="list-disc space-y-1 pl-5 text-[14px] text-body">
            <li>{t('buy.suggestWhy.median', { median: money(row.med), count: row.paid.length })}</li>
            <li>{t('buy.suggestWhy.above', { count: above, total: row.paid.length })}</li>
            <li>{t('buy.suggestWhy.band', { list: money(list), pct: row.entry.tolerancePct })}</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
          <PermissionGate permission="settings.edit"><Button onClick={onOpenSettings}>{t('buy.applyInSettings')}</Button></PermissionGate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
