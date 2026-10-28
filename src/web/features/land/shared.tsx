import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleMarker, MapContainer, Marker, Polygon, TileLayer, Tooltip as LTooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import type { DeforestationResult, Plot, PlotValidation, TreeState } from '@/types';
import { Legend } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';

type LatLng = [number, number];

/** Names for land screens: species, plot types, farmers. */
export function useLandLookups() {
  const settings = useOrgSettings();
  const lang = useLang();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  return useMemo(() => {
    const fm = new Map(farmers.map((f) => [f.id, f]));
    const name = (x?: { name: Partial<Record<string, string>> }) => (x ? x.name[lang] ?? x.name.en ?? '' : '—');
    return {
      species: settings.land.species,
      plotTypes: settings.land.plotTypes,
      speciesName: (id?: string) => name(settings.land.species.find((s) => s.id === id)),
      plotTypeName: (id?: string) => name(settings.land.plotTypes.find((s) => s.id === id)),
      farmerName: (id?: string) => { const f = id ? fm.get(id) : undefined; return f ? `${f.firstName} ${f.lastName}` : '—'; },
      farmer: (id?: string) => (id ? fm.get(id) : undefined),
    };
  }, [settings.land, lang, farmers]);
}

export const STATE_COLOR: Record<TreeState, string> = { ALIVE: 'var(--series-3)', DEAD: 'rgb(var(--danger))', NOT_FOUND: 'var(--series-4)' };
export const CHECK_COLOR: Record<DeforestationResult, string> = { CLEAR: 'var(--series-1)', RISK: 'rgb(var(--danger))', NOT_CHECKED: 'var(--series-4)' };

/** Clear / Risk / Not checked, with an icon so it never relies on colour alone. */
export function CheckBadge({ result }: { result?: DeforestationResult }) {
  const { t } = useT();
  const r = result ?? 'NOT_CHECKED';
  const Icon = r === 'CLEAR' ? CheckCircle2 : r === 'RISK' ? AlertTriangle : CircleDashed;
  return <Badge tone={r === 'CLEAR' ? 'success' : r === 'RISK' ? 'danger' : 'warning'}><Icon className="h-3 w-3" /> {t(`land.check.${r}`)}</Badge>;
}

/** Validation results: closed ring, no self-intersection, ≥ N decimals, polygon over the area limit, overlaps. */
export function ValidationList({ v, minDecimals, overHa }: { v?: PlotValidation; minDecimals: number; overHa: number }) {
  const { t } = useT();
  if (!v) return null;
  const rows: [boolean, string][] = [
    [v.closed, t('land.val.closed')],
    [!v.selfIntersects, t('land.val.noSelf')],
    [v.precisionOk, t('land.val.precision', { n: minDecimals, got: v.decimals })],
    [!v.needsPolygon, t('land.val.polygon', { ha: overHa })],
    [v.overlaps.length === 0, v.overlaps.length ? t('land.val.overlaps', { count: v.overlaps.length }) : t('land.val.noOverlap')],
  ];
  return (
    <ul className="space-y-1.5 text-[13px]" aria-label={t('land.validation')}>
      {rows.map(([ok, label]) => (
        <li key={label} className="flex items-center gap-2">
          {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />}
          <span className={ok ? 'text-body' : 'font-medium text-ink'}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

export interface MapPoint { id: string; lat: number; lng: number; color: string; label: string; onClick?: () => void }
export interface MapShape { id: string; polygon: LatLng[]; color: string; label: string; dashed?: boolean; onClick?: () => void }

const vertexIcon = L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:999px;background:#fff;border:3px solid #14583F;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });

function ClickToAdd({ onAdd }: { onAdd: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onAdd([Number(e.latlng.lat.toFixed(7)), Number(e.latlng.lng.toFixed(7))]) });
  return null;
}

/** Points grouped on a grid below zoom 14, so thousands of trees stay readable. */
function Clustered({ points }: { points: MapPoint[] }) {
  const { t } = useT();
  const [zoom, setZoom] = useState(10);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  if (zoom >= 14) return <>{points.map((p) => <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={6} eventHandlers={p.onClick ? { click: p.onClick } : undefined} pathOptions={{ color: 'rgb(var(--surface))', weight: 2, fillColor: p.color, fillOpacity: 0.95 }}><LTooltip>{p.label}</LTooltip></CircleMarker>)}</>;
  const cell = 0.6 / 2 ** (zoom - 8);
  const groups = new Map<string, MapPoint[]>();
  for (const p of points) { const k = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
  return (
    <>
      {[...groups.entries()].map(([k, g]) => {
        const lat = g.reduce((s, p) => s + p.lat, 0) / g.length;
        const lng = g.reduce((s, p) => s + p.lng, 0) / g.length;
        const counts = new Map<string, number>();
        for (const p of g) counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
        const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
        return g.length === 1
          ? <CircleMarker key={k} center={[lat, lng]} radius={6} eventHandlers={g[0]!.onClick ? { click: g[0]!.onClick } : undefined} pathOptions={{ color: 'rgb(var(--surface))', weight: 2, fillColor: g[0]!.color, fillOpacity: 0.95 }}><LTooltip>{g[0]!.label}</LTooltip></CircleMarker>
          : <CircleMarker key={k} center={[lat, lng]} radius={Math.min(26, 9 + Math.sqrt(g.length) * 1.6)} eventHandlers={{ click: (e) => e.target._map.setView([lat, lng], Math.min(18, zoom + 2)) }} pathOptions={{ color: 'rgb(var(--surface))', weight: 2, fillColor: main, fillOpacity: 0.85 }}><LTooltip direction="top">{t('land.map.cluster', { count: g.length })}</LTooltip></CircleMarker>;
      })}
    </>
  );
}

/**
 * Land map: plot polygons, forest-loss zones (dashed), clustered points; optionally a polygon being
 * drawn (click to add a vertex) or edited (drag vertices).
 */
export function LandMap({ shapes = [], zones = [], points = [], edit, draw, height = 420, legend, ariaLabel }: {
  shapes?: MapShape[]; zones?: MapShape[]; points?: MapPoint[]; height?: number; legend?: { label: string; color: string }[]; ariaLabel: string;
  edit?: { polygon: LatLng[]; onChange: (p: LatLng[]) => void };
  draw?: { onAdd: (p: LatLng) => void; center?: LatLng };
}) {
  const { t } = useT();
  const all: LatLng[] = [...shapes.flatMap((s) => s.polygon), ...zones.flatMap((s) => s.polygon), ...points.map((p) => [p.lat, p.lng] as LatLng), ...(edit?.polygon ?? [])];
  if (!all.length && draw?.center) all.push(draw.center);
  if (!all.length) return <p className="rounded-ctl border border-dashed border-line px-4 py-10 text-center text-[14px] text-muted">{t('land.map.empty')}</p>;
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  const pad = Math.max(0.002, (Math.max(...lats) - Math.min(...lats)) * 0.08);
  const bounds: [LatLng, LatLng] = [[Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad, Math.max(...lngs) + pad]];
  return (
    <div>
      {legend && <Legend items={legend} />}
      <div className={cn('overflow-hidden rounded-ctl border border-line', draw && 'cursor-crosshair')} style={{ height }} role="region" aria-label={ariaLabel}>
        <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          {zones.map((z) => <Polygon key={z.id} positions={z.polygon} pathOptions={{ color: z.color, weight: 2, dashArray: '6 4', fillOpacity: 0.12 }}><LTooltip>{z.label}</LTooltip></Polygon>)}
          {shapes.map((s) => <Polygon key={s.id} positions={s.polygon} eventHandlers={s.onClick ? { click: s.onClick } : undefined} pathOptions={{ color: s.color, weight: 2, fillOpacity: 0.3, dashArray: s.dashed ? '4 4' : undefined }}><LTooltip>{s.label}</LTooltip></Polygon>)}
          {points.length > 0 && <Clustered points={points} />}
          {edit && edit.polygon.length > 0 && (
            <>
              <Polygon positions={edit.polygon} pathOptions={{ color: '#14583F', weight: 3, fillOpacity: 0.25 }} />
              {edit.polygon.map((p, i) => (
                <Marker key={i} position={p} icon={vertexIcon} draggable eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); edit.onChange(edit.polygon.map((q, j) => (j === i ? [Number(ll.lat.toFixed(7)), Number(ll.lng.toFixed(7))] : q))); } }}>
                  <LTooltip>{t('land.map.vertex', { n: i + 1 })}</LTooltip>
                </Marker>
              ))}
            </>
          )}
          {draw && <ClickToAdd onAdd={draw.onAdd} />}
        </MapContainer>
      </div>
    </div>
  );
}

/** Area with the company's unit (ha or acres). */
export function useArea() {
  const f = useFormat();
  const settings = useOrgSettings();
  const acres = settings.units.some((u) => u.id === settings.landUnitId && u.code === 'ac');
  return (ha: number) => (acres ? `${f.number(ha / 0.404686, { maximumFractionDigits: 2 })} ac` : `${f.number(ha, { maximumFractionDigits: 2 })} ha`);
}

export const plotShape = (p: Plot, label: string, onClick?: () => void): MapShape => ({ id: p.id, polygon: p.polygon, color: CHECK_COLOR[p.check?.result ?? 'NOT_CHECKED'], label, onClick });

/**
 * The page's tab: follows `?tab=` from a link, but stays put when a detail drawer opens (opening a
 * drawer drops `tab` from the URL).
 */
export function usePageTab<T extends string>(tabs: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('tab') as T | null;
  const valid = (x: T | null): x is T => !!x && tabs.includes(x);
  const [tab, setState] = useState<T>(valid(fromUrl) ? fromUrl : fallback);
  useEffect(() => { if (valid(fromUrl)) setState(fromUrl); }, [fromUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTab = (k: T) => { setState(k); setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); n.delete('open'); return n; }, { replace: true }); };
  return [tab, setTab] as const;
}
