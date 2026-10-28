import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Plus, QrCode, Sprout, Trees, X } from 'lucide-react';
import { toast } from 'sonner';
import type { NurseryRoundValues, TreeState } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GpsCapture, PhotoPicker, SimCapture, type Gps } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { MobileFormRenderer } from '@/mobile/forms/MobileFormRenderer';
import { ListRow, MField, MList, MSearch, MobileWizard, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { useMyFarmers } from '@/mobile/flows/farmers/FarmerScreens';
import { agentStock, farmerSeedlings, nextRound, nurseryTotals, roundsDue, treeDue } from '@/services/landService';
import { useLiveForm } from '@/services/formService';
import { saveOrQueue } from '@/services/mobileSync';
import { cn } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useLandStore } from '@/stores/landStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { CAUSES, ISSUES } from '@/web/features/land/TreesPage';
import { useLandLookups } from '@/web/features/land/shared';

const today = () => new Date().toISOString().slice(0, 10);
const roundName = (r: { kind: 'PRIMARY' | 'SECONDARY'; seq: number }, t: (k: string, o?: Record<string, unknown>) => string) => (r.kind === 'PRIMARY' ? t('land.round.PRIMARY') : t('land.round.SECONDARY', { n: r.seq }));

/** The agent's nurseries, seedlings in hand and trees due (M9 trees hub). */
export function TreesHomeScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const { agent } = useMobileAgent();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const nurseries = useOrgRows(useLandStore((s) => s.nurseries)).filter((n) => n.agentId === agent?.id);
  const allocations = useLandStore((s) => s.allocations);
  const trees = useOrgRows(useLandStore((s) => s.trees));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stock = useMemo(() => (agent ? agentStock(orgId, agent.id) : []), [orgId, agent, allocations]);
  const due = trees.filter((x) => x.createdBy === userId && treeDue(x, settings) != null);
  const inHand = stock.reduce((s, x) => s + x.codes.length, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m9.trees')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{t('mobile.m9.inHand')}</div>
          <div className="tnum mt-1 text-[30px] font-semibold tracking-[-0.02em]">{f.number(inHand)}</div>
          <div className="text-[13px] text-white/80">{stock.map((x) => `${ll.speciesName(x.speciesId)} ${f.number(x.codes.length)}`).join(' · ') || t('mobile.m9.noStock')}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => navigate('/m/trees/allocate')} disabled={!inHand}><Sprout /> {t('mobile.m9.give')}</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/trees/visits')}><ClipboardCheck /> {t('mobile.m9.visits', { count: due.length })}</Button>
        </div>
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="eyebrow">{t('nav.nurseries')}</h2><Button size="sm" variant="ghost" onClick={() => navigate('/m/trees/nursery/new')}><Plus /> {t('mobile.m9.register')}</Button></div>
          {nurseries.length ? (
            <MList>{nurseries.map((n) => { const late = roundsDue(n); const nx = nextRound(n); const tot = nurseryTotals(n); return (
              <li key={n.id}><ListRow title={n.name} subtitle={`${f.number(tot.alive)} ${t('land.alive').toLowerCase()} · ${nx ? `${roundName(nx, t)} ${f.date(nx.dueDate, 'd MMM')}` : n.rounds.length ? t('mobile.m9.roundsDone') : t('mobile.m9.noRounds')}`} badge={late.length ? <Badge tone="danger"><AlertTriangle className="h-3 w-3" /> {t('land.overdue')}</Badge> : undefined} onClick={() => navigate(`/m/trees/nursery/${n.id}`)} /></li>
            ); })}</MList>
          ) : <p className="rounded-card border border-line px-4 py-5 text-center text-[14px] text-muted">{t('land.noNurseries')}</p>}
        </section>
      </div>
    </div>
  );
}

export function NurseryScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const lk = useLookups();
  const ll = useLandLookups();
  const n = useLandStore((s) => s.nurseries.find((x) => x.id === id));
  if (!n) return null;
  const tot = nurseryTotals(n);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={n.name} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="grid grid-cols-3 gap-2">{([[t('land.germinationPct'), `${f.number(tot.germinationPct)}%`], [t('land.survivalPct'), `${f.number(tot.survivalPct)}%`], [t('land.inStock'), f.number(tot.inStock)]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[18px] font-semibold text-ink">{v}</div></div>)}</div>
        <p className="text-[13px] text-muted">{`${n.code} · ${lk.community(n.communityId)} · ${n.representative.name}`}</p>
        <section>
          <h2 className="eyebrow mb-2">{t('land.tab.monitoring')}</h2>
          <MList>{n.rounds.map((r) => { const late = !r.doneAt && r.dueDate < today(); return (
            <li key={r.id}><ListRow title={roundName(r, t)} subtitle={r.doneAt ? t('land.doneOnDate', { date: f.date(r.doneAt) }) : t('land.dueOn', { date: f.date(r.dueDate) })}
              badge={r.doneAt ? <Badge tone="success">{t('land.done')}</Badge> : late ? <Badge tone="danger">{t('land.overdue')}</Badge> : undefined}
              onClick={r.doneAt ? undefined : () => navigate(`/m/trees/nursery/${n.id}/round/${r.id}`)} /></li>
          ); })}</MList>
        </section>
        <section>
          <h2 className="eyebrow mb-2">{t('land.batches')}</h2>
          <MList>{n.batches.map((b) => { const free = b.alive - b.disbursed; return (
            <li key={b.id}><ListRow title={`${b.number} · ${ll.speciesName(b.speciesId)}`} subtitle={`${f.number(b.alive)} ${t('land.alive').toLowerCase()} · ${f.number(b.disbursed)} ${t('land.disbursed').toLowerCase()}`}
              right={free > 0 ? <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/m/trees/allocate?nursery=${n.id}&batch=${b.id}`); }}>{t('mobile.m9.giveShort')}</Button> : undefined} /></li>
          ); })}</MList>
        </section>
      </div>
    </div>
  );
}

/** Register a nursery: profile, representative, batches, images and agreement. */
export function NurseryNewScreen() {
  const { t } = useT();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const { agent } = useMobileAgent();
  const ll = useLandLookups();
  const communities = useOrgRows(useCommunityStore((s) => s.communities)).filter((c) => agent && c.agentIds.includes(agent.id));
  const [v, setV] = useState({ name: '', communityId: communities[0]?.id ?? '', waterSource: 'borehole', fenced: 'yes' as 'yes' | 'no', material: 'Poly bags', repName: '', repGender: 'F' as 'F' | 'M', repPhone: '' });
  const [batches, setBatches] = useState([{ speciesId: ll.species[0]?.id ?? '', quantity: '', sownAt: today() }]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [agreement, setAgreement] = useState<string[]>([]);
  const [gps, setGps] = useState<Gps | undefined>();
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const c = communities.find((x) => x.id === v.communityId);
  const save = async () => {
    const payload = {
      orgId, name: v.name.trim(), communityId: v.communityId, agentId: agent?.id, gps: gps ?? { lat: c?.gps.lat ?? 0, lng: c?.gps.lng ?? 0, accuracy: 9 }, fenced: v.fenced === 'yes', waterSource: v.waterSource, material: v.material,
      representative: { name: v.repName.trim(), gender: v.repGender, phone: v.repPhone.trim() }, batches: batches.map((b) => ({ speciesId: b.speciesId, quantity: Number(b.quantity), sownAt: b.sownAt })),
      images: photos, agreement: agreement[0], actorId: userId ?? '',
    };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'nursery', label: t('mobile.m9.nurseryLabel', { name: payload.name }), payload });
    toast.success(t(savedKey(queued)));
    navigate('/m/trees');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m9.registerNursery')} back />
      <MobileWizard finishLabel={t('mobile.m9.save')} onFinish={save} steps={[
        { key: 'profile', title: t('land.tab.profile'), valid: !!v.name.trim() && !!v.communityId, content: (
          <div className="space-y-4">
            <MField label={t('land.nurseryName')} required><input className={mInput} value={v.name} onChange={(e) => set({ name: e.target.value })} /></MField>
            <MField label={t('col.community')} required><select className={mInput} value={v.communityId} onChange={(e) => set({ communityId: e.target.value })}>{communities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></MField>
            <MField label={t('land.water')}><select className={mInput} value={v.waterSource} onChange={(e) => set({ waterSource: e.target.value })}>{['borehole', 'dam', 'river', 'well', 'pipe'].map((w) => <option key={w} value={w}>{t(`land.waterSource.${w}`)}</option>)}</select></MField>
            <MField label={t('land.fenced')} group><Segmented label={t('land.fenced')} value={v.fenced} onChange={(fenced) => set({ fenced })} options={[{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }]} /></MField>
            <MField label={t('land.location')} group><GpsCapture value={gps} onChange={setGps} base={{ lat: c?.gps.lat ?? 0, lng: c?.gps.lng ?? 0 }} big /></MField>
          </div>
        ) },
        { key: 'rep', title: t('land.representative'), valid: !!v.repName.trim(), content: (
          <div className="space-y-4">
            <MField label={t('land.representative')} required><input className={mInput} value={v.repName} onChange={(e) => set({ repName: e.target.value })} /></MField>
            <MField label={t('land.repGender')} group><Segmented label={t('land.repGender')} value={v.repGender} onChange={(repGender) => set({ repGender })} options={[{ value: 'F', label: t('gender.F') }, { value: 'M', label: t('gender.M') }]} /></MField>
            <MField label={t('land.repPhone')}><input className={mInput} inputMode="tel" value={v.repPhone} onChange={(e) => set({ repPhone: e.target.value })} /></MField>
          </div>
        ) },
        { key: 'batches', title: t('land.batches'), valid: batches.every((b) => Number(b.quantity) > 0), content: (
          <div className="space-y-3">
            {batches.map((b, i) => (
              <div key={i} className="space-y-3 rounded-card border border-line p-3">
                <div className="flex items-center justify-between"><span className="eyebrow">{t('land.batchN', { n: i + 1 })}</span>{batches.length > 1 && <button type="button" onClick={() => setBatches(batches.filter((_, j) => j !== i))} aria-label={t('set.remove')}><X className="h-5 w-5 text-muted" /></button>}</div>
                <MField label={t('land.species')}><select className={mInput} value={b.speciesId} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, speciesId: e.target.value } : x)))}>{ll.species.map((s) => <option key={s.id} value={s.id}>{ll.speciesName(s.id)}</option>)}</select></MField>
                <MField label={t('land.polyBags')} required><input className={mInput} inputMode="numeric" value={b.quantity} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/\D/g, '') } : x)))} /></MField>
                <MField label={t('land.sownAt')}><input type="date" className={mInput} value={b.sownAt} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, sownAt: e.target.value } : x)))} /></MField>
              </div>
            ))}
            <Button variant="secondary" className="w-full" onClick={() => setBatches([...batches, { speciesId: ll.species[0]?.id ?? '', quantity: '', sownAt: today() }])}><Plus /> {t('land.addBatch')}</Button>
          </div>
        ) },
        { key: 'images', title: t('land.tab.images'), valid: photos.length > 0, content: (
          <div className="space-y-5">
            <MField label={t('land.profilePhoto')} required group><PhotoPicker value={photos} onChange={setPhotos} max={3} big /></MField>
            <MField label={t('land.agreementFile')} group><PhotoPicker value={agreement} onChange={setAgreement} max={1} big /></MField>
          </div>
        ) },
      ]} />
    </div>
  );
}

/** A monitoring round on the phone: the company's fields for each batch, then photos. */
export function NurseryRoundScreen() {
  const { id, roundId } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const n = useLandStore((s) => s.nurseries.find((x) => x.id === id));
  const r = n?.rounds.find((x) => x.id === roundId);
  const def = settings.land.nurseryRounds.find((d) => d.id === r?.defId);
  const fields = def?.fields ?? (r?.kind === 'PRIMARY' ? ['polyBags', 'potted', 'germinated'] : ['alive', 'dead', 'newGerminations']);
  const [vals, setVals] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries((n?.batches ?? []).map((b) => [b.id, Object.fromEntries(fields.map((k) => [k, k === 'polyBags' ? String(b.quantity) : k === 'alive' ? String(b.alive) : '']))])));
  const [photos, setPhotos] = useState<string[]>([]);
  if (!n || !r) return null;
  const optional = new Set(['dead', 'newGerminations']);
  const batchValid = (bid: string) => fields.every((k) => optional.has(k) || (vals[bid]?.[k] ?? '') !== '') && Number(vals[bid]?.potted ?? 0) <= Number(vals[bid]?.polyBags ?? Infinity) && Number(vals[bid]?.germinated ?? 0) <= Number(vals[bid]?.potted ?? Infinity);
  const save = async () => {
    const values: NurseryRoundValues[] = n.batches.map((b) => ({ batchId: b.id, ...Object.fromEntries(fields.map((k) => [k, vals[b.id]?.[k] === '' ? undefined : Number(vals[b.id]?.[k])])) }));
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'nurseryRound', label: t('mobile.m9.roundLabel', { round: roundName(r, t), name: n.name }), payload: { nurseryId: n.id, roundId: r.id, values, photos } });
    toast.success(t(savedKey(queued)));
    navigate(`/m/trees/nursery/${n.id}`);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={`${roundName(r, t)} · ${n.name}`} back />
      <MobileWizard finishLabel={t('mobile.m9.save')} onFinish={save} steps={[
        ...n.batches.map((b) => ({ key: b.id, title: `${b.number} · ${ll.speciesName(b.speciesId)}`, valid: batchValid(b.id), content: (
          <div className="space-y-4">
            {fields.map((k) => <MField key={k} label={t(`land.${k}`)} required={!optional.has(k)}><input className={mInput} inputMode="numeric" value={vals[b.id]?.[k] ?? ''} onChange={(e) => setVals({ ...vals, [b.id]: { ...vals[b.id], [k]: e.target.value.replace(/\D/g, '') } })} /></MField>)}
            {r.kind === 'PRIMARY' && Number(vals[b.id]?.potted ?? 0) > 0 && <p className="text-[14px] text-body">{t('mobile.m9.germination', { pct: Math.round((Number(vals[b.id]?.germinated || 0) / Number(vals[b.id]?.potted)) * 100) })}</p>}
          </div>
        ) })),
        { key: 'photos', title: t('land.roundPhoto'), valid: photos.length > 0, content: <MField label={t('land.roundPhoto')} required group><PhotoPicker value={photos} onChange={setPhotos} max={3} big /></MField> },
      ]} />
    </div>
  );
}

/** Seedlings to a farmer: farmer → species → scan or enter codes (count must match) → save. */
export function AllocateScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { orgId, userId } = useActor();
  const { agent } = useMobileAgent();
  const lk = useLookups();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const farmers = useMyFarmers();
  const allocations = useLandStore((s) => s.allocations);
  const nursery = useLandStore((s) => s.nurseries.find((x) => x.id === params.get('nursery')));
  const batch = nursery?.batches.find((b) => b.id === params.get('batch'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stock = useMemo(() => (agent ? agentStock(orgId, agent.id) : []), [orgId, agent, allocations]);
  const [q, setQ] = useState('');
  const [farmerId, setFarmerId] = useState('');
  const [speciesId, setSpeciesId] = useState(batch?.speciesId ?? stock[0]?.speciesId ?? '');
  const [qty, setQty] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const held = stock.find((x) => x.speciesId === speciesId)?.codes ?? [];
  const had = farmerId ? farmerSeedlings(orgId, farmerId) : 0;
  const room = settings.land.maxSeedlingsPerFarmer - had;
  const n = Number(qty);
  const shown = farmers.filter((x) => !q || `${x.firstName} ${x.lastName} ${x.farmerCode}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const farmer = farmers.find((x) => x.id === farmerId);
  const fromBatch = !!batch;
  const maxQty = fromBatch ? Math.min(room, batch!.alive - batch!.disbursed) : Math.min(room, held.length);
  const addCode = (c: string) => {
    const code = c.trim().toUpperCase();
    if (!code) return;
    if (codes.includes(code)) { toast.error(t('mobile.m9.codeTwice', { code })); return; }
    if (!held.includes(code)) { toast.error(t('mobile.m9.codeNotYours', { code })); return; }
    setCodes([...codes, code]);
  };
  const nextHeld = () => held.find((c) => !codes.includes(c)) ?? '';
  const save = async () => {
    const payload = { orgId, farmerId, speciesId, codes: fromBatch ? [] : codes, quantity: n, agentId: fromBatch ? undefined : agent?.id, nurseryId: nursery?.id, batchId: batch?.id, actorId: userId ?? '' };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'seedlingAllocation', label: t('mobile.m9.allocLabel', { n, name: farmer ? `${farmer.firstName} ${farmer.lastName}` : '' }), payload });
    toast.success(t(savedKey(queued)), { description: t('mobile.m9.treesCreated', { n }) });
    navigate(fromBatch ? `/m/trees/nursery/${nursery!.id}` : '/m/trees');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={fromBatch ? t('mobile.m9.fromBatch', { number: batch!.number }) : t('mobile.m9.give')} back />
      <MobileWizard finishLabel={t('mobile.m9.save')} onFinish={save} steps={[
        { key: 'farmer', title: t('land.farmer'), valid: !!farmerId && room > 0, hint: farmerId ? t('mobile.m9.farmerHad', { had, max: settings.land.maxSeedlingsPerFarmer }) : undefined, content: (
          <div className="space-y-3">
            <MSearch value={q} onChange={setQ} placeholder={t('land.searchFarmer')} />
            <MList>{shown.map((x) => { const h = farmerSeedlings(orgId, x.id); return <li key={x.id}><ListRow title={`${x.firstName} ${x.lastName}`} subtitle={`${x.farmerCode} · ${lk.community(x.communityId)}`} badge={h >= settings.land.maxSeedlingsPerFarmer ? <Badge tone="warning">{t('mobile.m9.full')}</Badge> : h ? <Badge tone="neutral">{f.number(h)}</Badge> : undefined} right={farmerId === x.id ? <Badge tone="success">{'✓'}</Badge> : undefined} onClick={() => setFarmerId(x.id)} /></li>; })}</MList>
          </div>
        ) },
        { key: 'species', title: t('land.species'), valid: !!speciesId && n > 0 && n <= maxQty, hint: t('mobile.m9.maxHere', { n: maxQty }), content: (
          <div className="space-y-4">
            {fromBatch ? <p className="rounded-ctl bg-canvas px-4 py-3 text-[15px] text-ink">{`${ll.speciesName(batch!.speciesId)} · ${t('mobile.m9.inBatch', { n: batch!.alive - batch!.disbursed })}`}</p> : (
              <MList>{stock.map((x) => <li key={x.speciesId}><ListRow title={ll.speciesName(x.speciesId)} subtitle={t('mobile.m9.youHold', { n: x.codes.length })} right={speciesId === x.speciesId ? <Badge tone="success">{'✓'}</Badge> : undefined} onClick={() => { setSpeciesId(x.speciesId); setCodes([]); }} /></li>)}</MList>
            )}
            <MField label={t('col.quantity')} required error={n > maxQty ? t('mobile.m9.tooMany', { n: maxQty }) : undefined}><input className={mInput} inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value.replace(/\D/g, '')); setCodes([]); }} /></MField>
          </div>
        ) },
        { key: 'codes', title: t('land.codes'), valid: fromBatch || codes.length === n, hint: fromBatch ? undefined : t('mobile.m9.codesCount', { got: codes.length, n }), content: fromBatch ? (
          <p className="rounded-ctl bg-canvas px-4 py-3 text-[15px] text-ink">{t('mobile.m9.batchCodes', { n })}</p>
        ) : (
          <div className="space-y-4">
            <SimCapture kind="scanCode" big make={nextHeld} label={t('mobile.m9.scanTag')} onChange={(c) => c && addCode(c)} />
            <div className="flex gap-2"><input className={mInput} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('mobile.m9.typeCode')} aria-label={t('mobile.m9.typeCode')} /><Button size="lg" variant="secondary" onClick={() => { addCode(typed); setTyped(''); }}>{t('mobile.m9.add')}</Button></div>
            {codes.length < n && <Button variant="ghost" className="w-full" onClick={() => setCodes([...codes, ...held.filter((c) => !codes.includes(c)).slice(0, n - codes.length)])}><QrCode /> {t('mobile.m9.scanAll', { n: n - codes.length })}</Button>}
            <ul className="flex flex-wrap gap-1.5">{codes.map((c) => <li key={c} className="flex items-center gap-1 rounded-chip bg-canvas px-2.5 py-1 font-mono text-[12px] text-ink">{c}<button type="button" onClick={() => setCodes(codes.filter((x) => x !== c))} aria-label={t('set.remove')}><X className="h-3.5 w-3.5 text-muted" /></button></li>)}</ul>
            {codes.length > n && <p className="text-[13px] text-danger" role="alert">{t('mobile.m9.tooManyCodes')}</p>}
          </div>
        ) },
      ]} />
    </div>
  );
}

/** Trees due a monitoring visit, by farmer; or scan a tree tag. */
export function TreeVisitsScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { userId } = useActor();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const trees = useOrgRows(useLandStore((s) => s.trees));
  const due = trees.filter((x) => x.createdBy === userId && treeDue(x, settings) != null);
  const byFarmer = [...due.reduce((m, x) => m.set(x.farmerId, [...(m.get(x.farmerId) ?? []), x]), new Map<string, typeof due>()).entries()];
  const scan = (code?: string) => {
    const tr = trees.find((x) => x.code === code);
    if (!tr) { toast.error(t('mobile.m9.treeUnknown', { code: code ?? '' })); return; }
    navigate(`/m/trees/visit/${tr.id}`);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m9.treeVisits')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <SimCapture kind="scanCode" big label={t('mobile.m9.scanTree')} make={() => due[0]?.code ?? trees.find((x) => x.createdBy === userId && x.state === 'ALIVE')?.code ?? ''} onChange={scan} />
        <h2 className="eyebrow">{t('mobile.m9.dueN', { count: due.length })}</h2>
        {byFarmer.length ? byFarmer.map(([fid, list]) => (
          <section key={fid}>
            <h3 className="mb-1.5 text-[14px] font-semibold text-ink">{ll.farmerName(fid)}</h3>
            <MList>{list.map((x) => <li key={x.id}><ListRow title={x.code} subtitle={`${ll.speciesName(x.speciesId)} · ${t('land.plantedOn')} ${f.date(x.plantedAt)}`} badge={<Badge tone="warning">{t('land.dueRound', { n: treeDue(x, settings) })}</Badge>} onClick={() => navigate(`/m/trees/visit/${x.id}`)} /></li>)}</MList>
          </section>
        )) : <p className="rounded-card border border-line px-4 py-5 text-center text-[14px] text-muted">{t('mobile.m9.nothingDue')}</p>}
      </div>
    </div>
  );
}

/** A tree visit: found? → the company's tree monitoring form (alive / dead logic) → save. */
export function TreeVisitScreen() {
  const { id } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const tree = useLandStore((s) => s.trees.find((x) => x.id === id));
  const bound = !!settings.formBindings.treeMonitoring;
  const form = useLiveForm('treeMonitoring');
  const [found, setFound] = useState<'yes' | 'no' | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({ treeCode: tree?.code });
  if (!tree) return null;
  const base = { lat: tree.gps.lat, lng: tree.gps.lng };
  const send = async (state: TreeState, v: { heightM?: number; rating?: number; issues: string[]; causeOfDeath?: string; photos: string[]; gps?: Gps; answers: Record<string, unknown> }) => {
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'treeVisit', label: t('mobile.m9.visitLabel', { code: tree.code, state: t(`land.state.${state}`) }), payload: { treeId: tree.id, state, ...v } });
    toast.success(t(savedKey(queued)), { description: t('mobile.m9.visitSaved', { code: tree.code, state: t(`land.state.${state}`) }) });
    navigate('/m/trees/visits');
  };
  const header = <MobileHeader title={`${tree.code} · ${ll.speciesName(tree.speciesId)}`} back />;
  if (found === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex-1 space-y-4 px-5 pt-2">
          <p className="text-[15px] text-body">{t('mobile.m9.foundQ', { farmer: ll.farmerName(tree.farmerId) })}</p>
          <Button size="lg" className="w-full" onClick={() => setFound('yes')}><Trees /> {t('mobile.m9.found')}</Button>
          <Button size="lg" variant="secondary" className="w-full" onClick={() => setFound('no')}>{t('mobile.m9.notFound')}</Button>
        </div>
      </div>
    );
  }
  if (found === 'no') return <div className="flex min-h-0 flex-1 flex-col">{header}<NotFoundSteps base={base} onSave={(photos, gps) => send('NOT_FOUND', { issues: [], photos, gps, answers: { found: false } })} /></div>;
  if (bound && form.sections.length) {
    // The company's species form: alive (yes/no) → cause of death, or height, health and pests.
    const finish = () => {
      const alive = answers.alive !== false;
      const gps = answers.location as Gps | undefined;
      const photos = (answers.photo as string[] | undefined) ?? [];
      send(alive ? 'ALIVE' : 'DEAD', { heightM: alive ? Number(answers.heightM) || undefined : undefined, rating: alive ? Number(answers.health) || undefined : undefined, issues: alive ? ((answers.pests as string[] | undefined) ?? []) : [], causeOfDeath: alive ? undefined : String(answers.causeOfDeath ?? ''), photos, gps, answers });
    };
    return <div className="flex min-h-0 flex-1 flex-col">{header}<MobileFormRenderer form={form} answers={answers} onChange={setAnswers} onFinish={finish} finishLabel={t('mobile.m9.save')} /></div>;
  }
  return <div className="flex min-h-0 flex-1 flex-col">{header}<VisitSteps base={base} onSave={send} /></div>;
}

function NotFoundSteps({ base, onSave }: { base: { lat: number; lng: number }; onSave: (photos: string[], gps?: Gps) => void }) {
  const { t } = useT();
  const [photos, setPhotos] = useState<string[]>([]);
  const [gps, setGps] = useState<Gps | undefined>();
  return <MobileWizard finishLabel={t('mobile.m9.save')} onFinish={() => onSave(photos, gps)} steps={[
    { key: 'evidence', title: t('mobile.m9.evidence'), valid: photos.length > 0 && !!gps, content: <div className="space-y-5"><MField label={t('land.photo')} required group><PhotoPicker value={photos} onChange={setPhotos} max={2} big /></MField><MField label={t('land.location')} required group><GpsCapture value={gps} onChange={setGps} base={base} big /></MField></div> },
  ]} />;
}

/** Built-in visit steps for companies without a tree monitoring form. */
function VisitSteps({ base, onSave }: { base: { lat: number; lng: number }; onSave: (state: TreeState, v: { heightM?: number; rating?: number; issues: string[]; causeOfDeath?: string; photos: string[]; gps?: Gps; answers: Record<string, unknown> }) => void }) {
  const { t } = useT();
  const [alive, setAlive] = useState<'yes' | 'no'>('yes');
  const [height, setHeight] = useState('');
  const [rating, setRating] = useState(4);
  const [issues, setIssues] = useState<string[]>([]);
  const [cause, setCause] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [gps, setGps] = useState<Gps | undefined>();
  return <MobileWizard finishLabel={t('mobile.m9.save')} onFinish={() => onSave(alive === 'yes' ? 'ALIVE' : 'DEAD', { heightM: alive === 'yes' ? Number(height) : undefined, rating, issues: alive === 'yes' ? issues : [], causeOfDeath: alive === 'no' ? cause : undefined, photos, gps, answers: { alive: alive === 'yes' } })} steps={[
    { key: 'state', title: t('land.stateCol'), valid: alive === 'yes' ? Number(height) > 0 : !!cause, content: (
      <div className="space-y-4">
        <MField label={t('mobile.m9.isAlive')} group><Segmented label={t('mobile.m9.isAlive')} value={alive} onChange={setAlive} options={[{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }]} /></MField>
        {alive === 'yes' ? (
          <>
            <MField label={t('land.heightM')} required><input className={mInput} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></MField>
            <MField label={t('land.rating')} group><div className="flex gap-2">{[1, 2, 3, 4, 5].map((r) => <button key={r} type="button" aria-pressed={rating === r} onClick={() => setRating(r)} className={cn('h-12 flex-1 rounded-ctl border text-[18px]', rating >= r ? 'border-brand bg-brand-soft' : 'border-line')}>{'★'}</button>)}</div></MField>
            <MField label={t('land.issues')} group><div className="flex flex-wrap gap-2">{ISSUES.map((i) => <button key={i} type="button" aria-pressed={issues.includes(i)} onClick={() => setIssues(issues.includes(i) ? issues.filter((x) => x !== i) : [...issues, i])} className={cn('rounded-chip border px-3 py-2 text-[14px]', issues.includes(i) ? 'border-brand bg-brand-soft' : 'border-line')}>{t(`land.issue.${i}`)}</button>)}</div></MField>
          </>
        ) : <MField label={t('land.causeOfDeath')} required><select className={mInput} value={cause} onChange={(e) => setCause(e.target.value)}><option value="">{t('land.pickCause')}</option>{CAUSES.map((c) => <option key={c} value={c}>{t(`land.cause.${c}`)}</option>)}</select></MField>}
      </div>
    ) },
    { key: 'evidence', title: t('mobile.m9.evidence'), valid: photos.length > 0, content: <div className="space-y-5"><MField label={t('land.photo')} required group><PhotoPicker value={photos} onChange={setPhotos} max={2} big /></MField><MField label={t('land.location')} group><GpsCapture value={gps} onChange={setGps} base={base} big /></MField></div> },
  ]} />;
}
