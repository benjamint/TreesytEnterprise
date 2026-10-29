import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Polyline, CircleMarker, Tooltip as LTooltip } from 'react-leaflet';
import { BaseTiles } from '@/components/shared/BaseTiles';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Pause, Play, Radius } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { StatCard } from '@/components/shared/StatCard';
import { Field } from '@/components/shared/Field';
import { FilterBar, TabEmpty } from '@/components/shared/ListKit';
import { Legend } from '@/components/charts/charts';
import { fieldPoints, flagsByAgent, saveGeofence, type ActivityKind, type FieldPoint } from '@/services/teamService';
import { cn } from '@/lib/utils';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useFormat, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { LandMap } from '@/web/features/land/shared';
import { AgentName, selectCls, useFieldLookups } from './shared';

export const KINDS: ActivityKind[] = ['purchase', 'profiling', 'support', 'recovery', 'survey', 'monitoring', 'mapping', 'workshop'];
export const KIND_COLOR: Record<ActivityKind, string> = {
  purchase: 'var(--series-1)', profiling: 'var(--series-2)', support: 'var(--series-3)', recovery: 'var(--series-4)', survey: 'var(--series-5)', monitoring: 'var(--series-6)', mapping: 'var(--series-7)', workshop: 'var(--series-8)',
};

/** Field activity map (PRD J11): every GPS-stamped activity with filters, an agent's day played back, geofence flags by agent. */
export function FieldActivityPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const { orgId } = useActor();
  const geofences = useFieldStore((s) => s.geofences);
  const all = useMemo(() => fieldPoints(orgId), [orgId, geofences]); // eslint-disable-line react-hooks/exhaustive-deps
  const [agent, setAgent] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [onlyFlags, setOnlyFlags] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'map' | 'playback' | 'flags'>('map');
  const [fencing, setFencing] = useState(false);
  const shown = all.filter((p) => (!agent || p.agentId === agent) && (!kind || p.kind === kind) && p.at.slice(0, 10) >= from && p.at.slice(0, 10) <= to && (!onlyFlags || p.outOfArea) && (!q.trim() || `${p.label} ${fl.agentName(p.agentId)}`.toLowerCase().includes(q.trim().toLowerCase())));
  const flags = flagsByAgent(all.filter((p) => p.at.slice(0, 10) >= from && p.at.slice(0, 10) <= to));
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.fieldActivity')} description={t('pages.fieldActivity')}
        primary={<PermissionGate permission="fieldActivity.manageGeofences"><Button variant="secondary" onClick={() => setFencing(true)}><Radius /> {t('field.geofences')}</Button></PermissionGate>} />
      <div className="mb-5 stat-strip grid gap-3 sm:grid-cols-3">
        <StatCard label={t('field.activitiesShown')} value={f.number(shown.length)} />
        <StatCard label={t('field.outOfAreaN')} value={f.number(shown.filter((p) => p.outOfArea).length)} icon={AlertTriangle} onClick={() => setOnlyFlags(true)} />
        <StatCard label={t('field.agentsActive')} value={f.number(new Set(shown.map((p) => p.agentId)).size)} />
      </div>
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">{(['map', 'playback', 'flags'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium', tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>{t(`field.mapTab.${k}`)}</button>)}</div>
      {tab !== 'flags' && (
        <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchActivity')}
          views={[{ key: 'all', label: t('field.view.all'), active: !onlyFlags, onSelect: () => setOnlyFlags(false) }, { key: 'flags', label: t('field.outOfAreaN'), active: onlyFlags, onSelect: () => setOnlyFlags(true), count: all.filter((p) => p.outOfArea && p.at.slice(0, 10) >= from && p.at.slice(0, 10) <= to).length }]}
          filters={[
            { key: 'agent', label: t('col.agent'), value: agent, onChange: setAgent, options: [...new Set(all.map((p) => p.agentId))].map((a) => ({ value: a, label: fl.agentName(a) })) },
            { key: 'kind', label: t('field.type'), value: kind, onChange: setKind, options: KINDS.map((k) => ({ value: k, label: t(`field.kind.${k}`) })) },
          ]}
          onClear={() => { setAgent(''); setKind(''); setOnlyFlags(false); }}
          extra={<div className="flex items-center gap-2"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('field.from')} className="h-10 w-40" /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('field.to')} className="h-10 w-40" /></div>} />
      )}
      {tab === 'map' && (
        <LandMap ariaLabel={t('nav.fieldActivity')} height={560} legend={KINDS.map((k) => ({ label: t(`field.kind.${k}`), color: KIND_COLOR[k] }))}
          points={shown.slice(-3000).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: p.outOfArea ? 'rgb(var(--danger))' : KIND_COLOR[p.kind], label: `${fl.agentName(p.agentId)} · ${t(`field.kind.${p.kind}`)} · ${p.label} · ${f.dateTime(p.at)}${p.outOfArea ? ` · ${t('field.outOfArea', { km: p.distanceKm ?? '' })}` : ''}` }))} />
      )}
      {tab === 'playback' && <Playback points={all} agentId={agent} onAgent={setAgent} />}
      {tab === 'flags' && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-soft">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-3 py-2">{t('col.agent')}</th><th className="px-3 py-2 text-right">{t('field.activitiesShown')}</th><th className="px-3 py-2 text-right">{t('field.outOfAreaN')}</th><th className="px-3 py-2 text-right">{'%'}</th></tr></thead>
            <tbody>{flags.map((x) => <tr key={x.agentId} className="border-b border-line last:border-0"><td className="px-3 py-2"><AgentName id={x.agentId} /></td><td className="tnum px-3 py-2 text-right">{f.number(x.total)}</td><td className="tnum px-3 py-2 text-right">{x.flagged ? <Badge tone="warning">{f.number(x.flagged)}</Badge> : '0'}</td><td className="tnum px-3 py-2 text-right">{`${x.pct}%`}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {fencing && <GeofenceDialog onClose={() => setFencing(false)} />}
    </>
  );
}

/** Playback of one agent's day: points in time order, a line between them, a slider and play. */
function Playback({ points, agentId, onAgent }: { points: FieldPoint[]; agentId: string; onAgent: (id: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const lk = useLookups();
  const agents = [...new Set(points.map((p) => p.agentId))];
  const who = agentId || agents[0] || '';
  const days = [...new Set(points.filter((p) => p.agentId === who).map((p) => p.at.slice(0, 10)))].sort().reverse();
  const [day, setDay] = useState('');
  const d = days.includes(day) ? day : days[0] ?? '';
  const seq = points.filter((p) => p.agentId === who && p.at.startsWith(d));
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setI(seq.length ? seq.length - 1 : 0); }, [who, d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setI((x) => { if (x >= seq.length - 1) { setPlaying(false); return x; } return x + 1; }), 900);
    return () => clearInterval(id);
  }, [playing, seq.length]);
  const upTo = seq.slice(0, i + 1);
  const cur = seq[i];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select value={who} onChange={(e) => onAgent(e.target.value)} aria-label={t('col.agent')} className={`${selectCls} max-w-xs`}>{agents.map((a) => <option key={a} value={a}>{fl.agentName(a)}</option>)}</select>
        <select value={d} onChange={(e) => setDay(e.target.value)} aria-label={t('field.day')} className={`${selectCls} max-w-[200px]`}>{days.map((x) => <option key={x} value={x}>{f.date(x, 'EEE d MMM yyyy')}</option>)}</select>
        <Button size="sm" variant="secondary" disabled={seq.length < 2} onClick={() => { if (i >= seq.length - 1) setI(0); setPlaying(!playing); }}>{playing ? <Pause /> : <Play />} {playing ? t('field.pause') : t('field.play')}</Button>
        <input type="range" min={0} max={Math.max(0, seq.length - 1)} value={i} onChange={(e) => setI(Number(e.target.value))} aria-label={t('field.timeline')} className="min-w-[200px] flex-1 accent-[rgb(var(--brand))]" />
      </div>
      {!seq.length ? <TabEmpty>{t('field.noGps')}</TabEmpty> : (
        <>
          <Legend items={KINDS.filter((k) => seq.some((p) => p.kind === k)).map((k) => ({ label: t(`field.kind.${k}`), color: KIND_COLOR[k] }))} />
          <div className="h-[460px] overflow-hidden rounded-ctl border border-line" role="region" aria-label={t('field.mapTab.playback')}>
            <MapContainer key={`${who}-${d}`} bounds={seq.map((p) => [p.lat, p.lng] as [number, number]).concat(seq.length === 1 ? [[seq[0]!.lat + 0.01, seq[0]!.lng + 0.01]] : [])} scrollWheelZoom={false} className="h-full w-full">
              <BaseTiles />
              <Polyline positions={upTo.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#14583F', weight: 3, dashArray: '6 6' }} />
              {upTo.map((p, k) => <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={k === i ? 9 : 6} pathOptions={{ color: 'rgb(var(--surface))', weight: 2, fillColor: p.outOfArea ? 'rgb(var(--danger))' : KIND_COLOR[p.kind], fillOpacity: 0.95 }}><LTooltip>{`${f.dateTime(p.at)} · ${t(`field.kind.${p.kind}`)} · ${p.label}`}</LTooltip></CircleMarker>)}
            </MapContainer>
          </div>
          {cur && <p className="text-[14px] text-ink">{`${new Date(cur.at).toISOString().slice(11, 16)} · ${t(`field.kind.${cur.kind}`)} · ${cur.label} · ${lk.community(cur.communityId)}`}{cur.outOfArea && <Badge tone="warning" className="ml-2">{t('field.outOfArea', { km: cur.distanceKm ?? '' })}</Badge>}<span className="ml-2 text-muted">{t('field.stepOf', { n: i + 1, total: seq.length })}</span></p>}
        </>
      )}
    </div>
  );
}

function GeofenceDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const lk = useLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const fences = useFieldStore((s) => s.geofences).filter((g) => g.orgId === orgId);
  const [communityId, setCommunityId] = useState(lk.communities[0]?.id ?? '');
  const existing = fences.find((g) => g.communityId === communityId);
  const [km, setKm] = useState(String(existing?.radiusKm ?? settings.fieldTeam.geofenceKm));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.geofences')}</DialogTitle><DialogDescription>{t('field.geofenceHint', { km: settings.fieldTeam.geofenceKm })}</DialogDescription></DialogHeader>
        <Field label={t('col.community')}><select value={communityId} onChange={(e) => { setCommunityId(e.target.value); const g = fences.find((x) => x.communityId === e.target.value); setKm(String(g?.radiusKm ?? settings.fieldTeam.geofenceKm)); }} aria-label={t('col.community')} className={selectCls}>{lk.communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label={t('field.radiusKm')}><Input type="number" min={0.5} step={0.5} value={km} onChange={(e) => setKm(e.target.value)} aria-label={t('field.radiusKm')} /></Field>
        <p className="text-[13px] text-muted">{t('field.customFences', { count: fences.length })}</p>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button><Button disabled={!(Number(km) > 0)} onClick={() => { saveGeofence(orgId, communityId, { kind: 'RADIUS', radiusKm: Number(km) }, userId ?? 'system'); toast.success(t('field.toast.geofence')); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
