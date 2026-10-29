import { useMemo } from 'react';
import { CircleMarker, MapContainer, Tooltip as LTooltip } from 'react-leaflet';
import { BaseTiles } from '@/components/shared/BaseTiles';
import 'leaflet/dist/leaflet.css';
import { Legend } from '@/components/charts/charts';
import { useAccessStore } from '@/stores/accessStore';
import { useT } from '@/stores/hooks';
import { useContext } from 'react';
import { DataContext } from './widgets';

const COLORS = { community: 'var(--series-1)', warehouse: 'var(--series-2)', agent: 'var(--series-3)' };

/** Communities, warehouses and active agents (last known position) on one map (PRD B1.6). */
export function FieldMap() {
  const data = useContext(DataContext)!;
  const { t } = useT();
  const users = useAccessStore((s) => s.users);
  const points = useMemo(() => {
    const name = new Map(users.map((u) => [u.id, u.name]));
    const communities = data.communities.filter((c) => c.gps).map((c) => ({ id: c.id, kind: 'community' as const, lat: c.gps.lat, lng: c.gps.lng, label: c.name }));
    const warehouses = data.warehouses.filter((w) => w.gps).map((w) => ({ id: w.id, kind: 'warehouse' as const, lat: w.gps.lat, lng: w.gps.lng, label: w.name }));
    // An agent's last GPS is near the community they last worked in (their first assigned one).
    const agents = data.agents
      .filter((a) => a.status === 'ACTIVE')
      .map((a, i) => {
        const c = data.communities.find((x) => x.agentIds.includes(a.id));
        return c ? { id: a.id, kind: 'agent' as const, lat: c.gps.lat + 0.01 * Math.sin(i), lng: c.gps.lng + 0.01 * Math.cos(i), label: name.get(a.userId) ?? a.id } : null;
      })
      .filter((p): p is NonNullable<typeof p> => !!p);
    return [...communities, ...warehouses, ...agents];
  }, [data.communities, data.warehouses, data.agents, users]);

  const bounds = useMemo(() => {
    if (!points.length) return null;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    return [[Math.min(...lats) - 0.05, Math.min(...lngs) - 0.05], [Math.max(...lats) + 0.05, Math.max(...lngs) + 0.05]] as [[number, number], [number, number]];
  }, [points]);

  if (!bounds) return <p className="py-8 text-center text-[14px] text-muted">{t('dashboard.noData')}</p>;
  const counts = { community: data.communities.length, warehouse: data.warehouses.length, agent: points.filter((p) => p.kind === 'agent').length };
  return (
    <div>
      <Legend items={(['community', 'warehouse', 'agent'] as const).map((k) => ({ label: t(`dashboard.map.${k}`, { count: counts[k] }), color: COLORS[k] }))} />
      <div className="h-[340px] overflow-hidden rounded-ctl border border-line" role="region" aria-label={t('dashboard.widget.map')}>
        <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-full w-full" attributionControl>
          <BaseTiles />
          {points.map((p) => (
            <CircleMarker
              key={`${p.kind}:${p.id}`}
              center={[p.lat, p.lng]}
              radius={p.kind === 'warehouse' ? 8 : p.kind === 'agent' ? 5 : 6}
              pathOptions={{ color: 'rgb(var(--surface))', weight: 2, fillColor: COLORS[p.kind], fillOpacity: 0.95 }}
            >
              <LTooltip direction="top">{`${t(`dashboard.map.${p.kind}One`)} · ${p.label}`}</LTooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
