import { useMemo } from 'react';
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip as LTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Check } from 'lucide-react';
import type { DispatchOrder, DispatchStatus, ImpactSnapshot, Plot } from '@/types';
import { Legend } from '@/components/charts/charts';
import { cn } from '@/lib/utils';
import { useSalesStore } from '@/stores/salesStore';
import { useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';

/** Names for sales screens: clients, contracts, terms, packaging. */
export function useSalesLookups() {
  const clients = useOrgRows(useSalesStore((s) => s.clients));
  const contracts = useOrgRows(useSalesStore((s) => s.contracts));
  const settings = useOrgSettings();
  const lang = useLang();
  return useMemo(() => {
    const cl = new Map(clients.map((c) => [c.id, c]));
    const ct = new Map(contracts.map((c) => [c.id, c]));
    const name = (x?: { name: Partial<Record<string, string>> }) => (x ? x.name[lang] ?? x.name.en ?? '' : '—');
    return {
      clients, contracts,
      client: (id?: string) => (id ? cl.get(id) : undefined),
      clientName: (id?: string) => (id ? cl.get(id)?.name ?? '—' : '—'),
      contract: (id?: string) => (id ? ct.get(id) : undefined),
      contractNumber: (id?: string) => (id ? ct.get(id)?.number ?? '—' : '—'),
      termName: (id: string) => name(settings.sales.paymentTerms.find((x) => x.id === id)),
      packagingName: (id: string) => name(settings.sales.packaging.find((x) => x.id === id)),
    };
  }, [clients, contracts, settings.sales, lang]);
}

export const SHIP_STEPS: DispatchStatus[] = ['PENDING', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'VERIFIED'];

/** Pending → In transit → Arrived → Delivered → Verified, with the time each step was reached. */
export function ShipmentSteps({ dispatch: d }: { dispatch: DispatchOrder }) {
  const { t } = useT();
  const f = useFormat();
  const reached = SHIP_STEPS.indexOf(d.status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={t('sales.tracking')}>
      {SHIP_STEPS.map((s, i) => {
        const done = reached >= i;
        const when = [...d.tracking].reverse().find((x) => x.status === s)?.at;
        return (
          <li key={s} className="flex flex-col items-center text-center">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-full border-2 text-[12px] font-semibold', done ? 'border-brand bg-brand text-white' : 'border-line text-muted', reached === i && 'ring-4 ring-brand-soft')}>{done ? <Check className="h-4 w-4" /> : i + 1}</span>
            <span className={cn('mt-1.5 text-[12px] font-medium', done ? 'text-ink' : 'text-muted')}>{t(`status.${s}`)}</span>
            <span className="text-[11px] text-muted">{when ? f.date(when) : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Impact tiles for an order or a buyer's whole supply (company-configurable KPIs). */
export function ImpactTiles({ impact, kpis }: { impact: ImpactSnapshot; kpis: string[] }) {
  const { t } = useT();
  const f = useFormat();
  const tiles: [string, string][] = [
    [t('sales.impact.farmers'), f.number(impact.farmers)], [t('sales.impact.communities'), f.number(impact.communities)],
    ...(kpis.includes('womenShare') ? [[t('sales.impact.women'), `${impact.womenPct}%`] as [string, string]] : []),
    ...(kpis.includes('childrenPerFarmer') ? [[t('sales.impact.children'), f.number(impact.childrenPerFarmer)] as [string, string]] : []),
    ...(kpis.includes('treesPlanted') ? [[t('sales.impact.trees'), f.number(impact.treesPlanted)] as [string, string]] : []),
    ...(kpis.includes('plotsMapped') ? [[t('sales.impact.plots'), f.number(impact.plotsMapped)] as [string, string]] : []),
    ...(kpis.includes('eudr') ? [[t('sales.impact.eudr'), `${impact.eudrPct}%`] as [string, string]] : []),
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map(([k, v]) => <div key={k} className="rounded-ctl border border-line bg-surface px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[20px] font-semibold text-ink">{v}</div></div>)}
    </div>
  );
}

const EUDR_COLOR: Record<Plot['eudrStatus'], string> = { COMPLIANT: 'var(--series-1)', AT_RISK: 'rgb(var(--danger))', PENDING: 'var(--series-4)' };

/** Trace to source: communities (sized by kg) and plot polygons coloured by EUDR status; the truck when moving. */
export function TraceMap({ communities, plots, kgByCommunity, truck, height = 380 }: {
  communities: { id: string; name: string; gps: { lat: number; lng: number } }[]; plots: Plot[]; kgByCommunity: Map<string, number>; truck?: { lat: number; lng: number; label: string }; height?: number;
}) {
  const { t } = useT();
  const f = useFormat();
  const pts = [...communities.map((c) => [c.gps.lat, c.gps.lng] as [number, number]), ...plots.flatMap((p) => p.polygon), ...(truck ? [[truck.lat, truck.lng] as [number, number]] : [])];
  if (!pts.length) return <p className="py-6 text-center text-[14px] text-muted">{t('sales.noTrace')}</p>;
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const bounds: [[number, number], [number, number]] = [[Math.min(...lats) - 0.03, Math.min(...lngs) - 0.03], [Math.max(...lats) + 0.03, Math.max(...lngs) + 0.03]];
  const max = Math.max(1, ...kgByCommunity.values());
  return (
    <div>
      <Legend items={[{ label: t('sales.legend.community'), color: 'var(--series-2)' }, ...(['COMPLIANT', 'AT_RISK', 'PENDING'] as const).map((s) => ({ label: t(`sales.eudr.${s}`), color: EUDR_COLOR[s] })), ...(truck ? [{ label: t('sales.legend.truck'), color: 'var(--series-3)' }] : [])]} />
      <div className="overflow-hidden rounded-ctl border border-line" style={{ height }} role="region" aria-label={t('sales.traceToSource')}>
        <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          {plots.map((p) => <Polygon key={p.id} positions={p.polygon} pathOptions={{ color: EUDR_COLOR[p.eudrStatus], weight: 1.5, fillOpacity: 0.35 }}><LTooltip>{`${p.areaHa} ha · ${t(`sales.eudr.${p.eudrStatus}`)}`}</LTooltip></Polygon>)}
          {communities.map((c) => (
            <CircleMarker key={c.id} center={[c.gps.lat, c.gps.lng]} radius={6 + ((kgByCommunity.get(c.id) ?? 0) / max) * 12} pathOptions={{ color: 'rgb(var(--surface))', weight: 2, fillColor: 'var(--series-2)', fillOpacity: 0.9 }}>
              <LTooltip direction="top">{`${c.name} · ${f.kg(Math.round(kgByCommunity.get(c.id) ?? 0))}`}</LTooltip>
            </CircleMarker>
          ))}
          {truck && <CircleMarker center={[truck.lat, truck.lng]} radius={10} pathOptions={{ color: 'rgb(var(--surface))', weight: 3, fillColor: 'var(--series-3)', fillOpacity: 1 }}><LTooltip permanent direction="top">{truck.label}</LTooltip></CircleMarker>}
        </MapContainer>
      </div>
    </div>
  );
}

/** Kg shown with tonnes alongside (PRD H8: kg and t). */
export function useKgT() {
  const f = useFormat();
  return (kg: number) => `${f.kg(Math.round(kg))} · ${f.number(Math.round(kg / 100) / 10, { maximumFractionDigits: 1 })} t`;
}
