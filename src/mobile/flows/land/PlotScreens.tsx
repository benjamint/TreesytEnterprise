import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Footprints, MapPinned, Pause, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PhotoPicker } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSearch, MobileWizard, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { useMyFarmers } from '@/mobile/flows/farmers/FarmerScreens';
import { NEW_FARM_OFFSET, polygonAreaHa, walkBoundary, type LatLng } from '@/engines/geo';
import { checkGeometry, plotsDueMonitoring } from '@/services/landService';
import { saveOrQueue } from '@/services/mobileSync';
import { cn } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useLandStore } from '@/stores/landStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { CheckBadge, LandMap, ValidationList, useArea, useLandLookups } from '@/web/features/land/shared';

/** M9 plots: my plots, plots due monitoring, map a plot. */
export function PlotsHomeScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId } = useActor();
  const { agent } = useMobileAgent();
  const ll = useLandLookups();
  const area = useArea();
  const plots = useOrgRows(useLandStore((s) => s.plots)).filter((p) => p.agentId === agent?.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const due = useMemo(() => (agent ? plotsDueMonitoring(orgId, agent.id) : []), [orgId, agent, plots]);
  const recent = [...plots].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m9.plots')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{t('mobile.m9.myPlots')}</div>
          <div className="tnum mt-1 text-[30px] font-semibold tracking-[-0.02em]">{f.number(plots.length)}</div>
          <div className="text-[13px] text-white/80">{area(plots.reduce((s, p) => s + p.areaHa, 0))} · {t('mobile.m9.dueMonitoring', { count: due.length })}</div>
        </div>
        <Button size="lg" className="w-full" onClick={() => navigate('/m/plots/new')}><MapPinned /> {t('land.mapPlot')}</Button>
        {due.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2">{t('mobile.m9.monitoringDue')}</h2>
            <MList>{due.slice(0, 10).map((p) => <li key={p.id}><ListRow title={`${p.code} · ${ll.farmerName(p.farmerId)}`} subtitle={`${ll.plotTypeName(p.typeId)} · ${area(p.areaHa)}`} onClick={() => navigate(`/m/plots/${p.id}/monitor`)} /></li>)}</MList>
          </section>
        )}
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.m9.recentPlots')}</h2>
          {recent.length ? <MList>{recent.map((p) => <li key={p.id}><ListRow title={`${p.code} · ${ll.farmerName(p.farmerId)}`} subtitle={`${area(p.areaHa)} · ${f.date(p.createdAt)}`} right={<CheckBadge result={p.check?.result} />} /></li>)}</MList> : <p className="rounded-card border border-line px-4 py-5 text-center text-[14px] text-muted">{t('land.noPlots')}</p>}
        </section>
      </div>
    </div>
  );
}

/**
 * Walk the boundary (simulated): points appear along the path every few metres with the live area
 * and GPS accuracy; the agent stops when back at the start. Or tap points on the map.
 */
function BoundaryCapture({ base, value, onChange }: { base: { lat: number; lng: number }; value: LatLng[]; onChange: (v: LatLng[]) => void }) {
  const { t } = useT();
  const area = useArea();
  const [mode, setMode] = useState<'walk' | 'tap'>('walk');
  const [walking, setWalking] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const path = useMemo(() => walkBoundary(base, { points: 14, seed: Math.round(base.lat * 1000) % 97 + 3 }), [base]);
  const ref = useRef(value);
  ref.current = value;
  useEffect(() => {
    if (!walking) return;
    const id = setInterval(() => {
      const next = path[ref.current.length];
      if (!next) { setWalking(false); return; }
      onChange([...ref.current, next]);
      setAccuracy(3 + Math.round(Math.random() * 3));
    }, 380);
    return () => clearInterval(id);
  }, [walking, path, onChange]);
  const done = value.length >= path.length;
  return (
    <div className="space-y-3">
      <Segmented label={t('mobile.m9.howToMap')} value={mode} onChange={(m) => { setMode(m); setWalking(false); onChange([]); }} options={[{ value: 'walk', label: t('mobile.m9.walk') }, { value: 'tap', label: t('mobile.m9.tap') }]} />
      <LandMap ariaLabel={t('mobile.m9.boundary')} height={260} edit={value.length ? { polygon: value, onChange } : undefined} draw={mode === 'tap' ? { onAdd: (p) => onChange([...value, p]), center: [base.lat, base.lng] } : { onAdd: () => undefined, center: [base.lat, base.lng] }} />
      <div className="grid grid-cols-3 gap-2 text-center" aria-live="polite">
        <div className="rounded-ctl border border-line px-2 py-2"><div className="text-[12px] text-muted">{t('mobile.m9.points')}</div><div className="tnum text-[18px] font-semibold text-ink">{value.length}</div></div>
        <div className="rounded-ctl border border-line px-2 py-2"><div className="text-[12px] text-muted">{t('land.area')}</div><div className="tnum text-[18px] font-semibold text-ink">{area(polygonAreaHa(value))}</div></div>
        <div className="rounded-ctl border border-line px-2 py-2"><div className="text-[12px] text-muted">{t('land.gpsAccuracy')}</div><div className={cn('tnum text-[18px] font-semibold', accuracy != null && accuracy > 5 ? 'text-warning' : 'text-ink')}>{accuracy != null ? `±${accuracy} m` : '—'}</div></div>
      </div>
      {mode === 'walk' ? (
        <div className="flex gap-2">
          {!done && <Button size="lg" className="flex-1" onClick={() => setWalking(!walking)}>{walking ? <Pause /> : value.length ? <Play /> : <Footprints />} {walking ? t('mobile.m9.pause') : value.length ? t('mobile.m9.resume') : t('mobile.m9.startWalk')}</Button>}
          {done && <p className="flex-1 rounded-ctl bg-success/10 px-4 py-3 text-[14px] font-medium text-ink">{t('mobile.m9.backAtStart')}</p>}
          {value.length > 0 && <Button size="lg" variant="secondary" onClick={() => { setWalking(false); onChange([]); }} aria-label={t('land.clear')}><RotateCcw /></Button>}
        </div>
      ) : <p className="text-[13px] text-muted">{t('mobile.m9.tapHint')}</p>}
    </div>
  );
}

/** Map a plot: type → farmer → walk the boundary → validation → agreement photo → images → save. */
export function MapPlotScreen() {
  const { t } = useT();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const { agent } = useMobileAgent();
  const lk = useLookups();
  const ll = useLandLookups();
  const area = useArea();
  const settings = useOrgSettings();
  const farmers = useMyFarmers();
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const [typeId, setTypeId] = useState(ll.plotTypes[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [farmerId, setFarmerId] = useState('');
  const [ring, setRing] = useState<LatLng[]>([]);
  const [agreement, setAgreement] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const farmer = farmers.find((f) => f.id === farmerId);
  const community = communities.find((c) => c.id === farmer?.communityId);
  // The walk starts at the farm, a short way from the village centre.
  const base = useMemo(() => ({ lat: (community?.gps.lat ?? 0) + NEW_FARM_OFFSET[0], lng: (community?.gps.lng ?? 0) + NEW_FARM_OFFSET[1] }), [community]);
  const v = ring.length >= 3 ? checkGeometry(orgId, { polygon: ring }) : undefined;
  const type = ll.plotTypes.find((x) => x.id === typeId);
  const shown = farmers.filter((x) => !q || `${x.firstName} ${x.lastName} ${x.farmerCode}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const save = async () => {
    const payload = { orgId, farmerId, typeId, polygon: ring, gpsAccuracyM: 4, agreement: agreement[0], images, source: 'MAPPED' as const, actorId: userId ?? '', agentId: agent?.id };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'plot', label: t('mobile.m9.plotLabel', { name: farmer ? `${farmer.firstName} ${farmer.lastName}` : '', area: area(polygonAreaHa(ring)) }), payload });
    toast.success(t(savedKey(queued)), { description: t('mobile.m9.plotSaved', { area: area(polygonAreaHa(ring)) }) });
    navigate('/m/plots');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('land.mapPlot')} back />
      <MobileWizard finishLabel={t('mobile.m9.save')} onFinish={save} steps={[
        { key: 'type', title: t('mobile.m9.plotType'), valid: !!typeId, content: (
          <MList>{ll.plotTypes.map((x) => <li key={x.id}><ListRow title={ll.plotTypeName(x.id)} subtitle={x.requiresFarmer ? t('land.farmerRequired') : undefined} right={typeId === x.id ? <Badge tone="success">{'✓'}</Badge> : undefined} onClick={() => setTypeId(x.id)} /></li>)}</MList>
        ) },
        { key: 'farmer', title: t('land.farmer'), valid: !type?.requiresFarmer || !!farmerId, content: (
          <div className="space-y-3">
            <MSearch value={q} onChange={setQ} placeholder={t('land.searchFarmer')} />
            <MList>{shown.map((x) => <li key={x.id}><ListRow title={`${x.firstName} ${x.lastName}`} subtitle={`${x.farmerCode} · ${lk.community(x.communityId)}`} right={farmerId === x.id ? <Badge tone="success">{'✓'}</Badge> : undefined} onClick={() => { setFarmerId(x.id); setRing([]); }} /></li>)}</MList>
          </div>
        ) },
        { key: 'walk', title: t('mobile.m9.walkTitle'), valid: ring.length >= 3, hint: ring.length >= 3 ? undefined : t('mobile.m9.needThree'), content: <BoundaryCapture base={base} value={ring} onChange={setRing} /> },
        { key: 'check', title: t('land.validation'), valid: !!v && v.closed && !v.selfIntersects, content: v ? (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between"><span className="text-[15px] text-body">{t('land.area')}</span><span className="tnum text-[28px] font-semibold text-ink">{area(polygonAreaHa(ring))}</span></div>
            <ValidationList v={v} minDecimals={settings.land.eudr.minDecimals} overHa={settings.land.eudr.polygonOverHa} />
            {!v.ok && <p className="rounded-ctl bg-warning/10 px-4 py-3 text-[14px] text-ink">{t('mobile.m9.fixOrContinue')}</p>}
          </div>
        ) : null },
        { key: 'agreement', title: t('land.agreementFile'), valid: agreement.length > 0, content: <MField label={t('mobile.m9.agreementPhoto')} required group><PhotoPicker value={agreement} onChange={setAgreement} max={1} big /></MField> },
        { key: 'images', title: t('land.tab.images'), valid: images.length > 0, content: <MField label={t('mobile.m9.plotPhotos')} required group><PhotoPicker value={images} onChange={setImages} max={3} big /></MField> },
      ]} />
    </div>
  );
}

/** Plot monitoring: the company's questionnaire for the plot's land type, then photos. */
export function PlotMonitorScreen() {
  const { id } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const lang = useLang();
  const { orgId, userId } = useActor();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const p = useLandStore((s) => s.plots.find((x) => x.id === id));
  const qs = settings.land.plotMonitoring.filter((q) => !p?.typeId || q.plotTypeIds.includes(p.typeId));
  const [answers, setAnswers] = useState<Record<string, boolean | string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  if (!p) return null;
  const save = async () => {
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'plotVisit', label: t('mobile.m9.plotVisitLabel', { code: p.code }), payload: { plotId: p.id, answers, photos } });
    toast.success(t(savedKey(queued)));
    navigate('/m/plots');
  };
  const yn = qs.filter((q) => q.kind === 'YES_NO');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={`${p.code} · ${ll.farmerName(p.farmerId)}`} back />
      <MobileWizard finishLabel={t('mobile.m9.save')} onFinish={save} steps={[
        { key: 'q', title: t('mobile.m9.questions'), valid: yn.every((q) => typeof answers[q.id] === 'boolean'), content: (
          <div className="space-y-4">{qs.map((q) => q.kind === 'YES_NO'
            ? <MField key={q.id} label={q.label[lang] ?? q.label.en} group required><Segmented label={q.label[lang] ?? q.label.en ?? ''} value={answers[q.id] === true ? 'yes' : answers[q.id] === false ? 'no' : ('' as 'yes')} onChange={(x) => setAnswers({ ...answers, [q.id]: x === 'yes' })} options={[{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }]} /></MField>
            : <MField key={q.id} label={q.label[lang] ?? q.label.en}><input className={mInput} value={String(answers[q.id] ?? '')} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} /></MField>)}</div>
        ) },
        { key: 'photos', title: t('land.photo'), valid: photos.length > 0, content: <MField label={t('land.photo')} required group><PhotoPicker value={photos} onChange={setPhotos} max={3} big /></MField> },
      ]} />
    </div>
  );
}
