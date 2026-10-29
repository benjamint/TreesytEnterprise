import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FarmerGroup } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnswersView } from '@/components/forms/FormFields';
import { GpsCapture, PhotoPicker, type Gps } from '@/components/forms/media';
import { pathLabel } from '@/engines/locations';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { MobileFormRenderer } from '@/mobile/forms/MobileFormRenderer';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSearch, MSelect, mInput, savedKey } from '@/mobile/components/kit';
import { useLiveForm } from '@/services/formService';
import { LEADER_ROLES } from '@/web/features/people/CommunitiesPage';
import { saveOrQueue } from '@/services/mobileSync';
import type { CommunityPayload, LeaderInput } from '@/services/profileService';
import { useCommunityStore } from '@/stores/communityStore';
import { useLocationStore } from '@/stores/locationStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useActor, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';

const GROUP_TYPES: FarmerGroup['type'][] = ['COOPERATIVE', 'VSLA', 'WOMENS_GROUP', 'PRODUCER_GROUP'];

/** M3: the agent's communities (visibility scope), search, create. */
export function CommunitiesScreen() {
  const { t, terms } = useT();
  const navigate = useNavigate();
  const { agent, type } = useMobileAgent();
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const [q, setQ] = useState('');
  // Visibility per agent type (Settings → Field team): ALL sees every community, otherwise their own.
  const mine = useMemo(() => communities.filter((c) => type?.visibility === 'ALL' || (agent && c.agentIds.includes(agent.id))).sort((a, b) => a.name.localeCompare(b.name)), [communities, agent, type]);
  const shown = mine.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.code.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={terms.communities} back right={<Button size="sm" onClick={() => navigate('/m/communities/new')}><Plus /> {t('mobile.new')}</Button>} />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-1">
        <MSearch value={q} onChange={setQ} placeholder={t('mobile.m3.search', { communities: terms.communities.toLocaleLowerCase() })} />
        {shown.length ? (
          <MList>
            {shown.map((c) => <li key={c.id}><ListRow title={c.name} subtitle={`${c.code} · ${t('mobile.m3.score', { score: c.score })}`} badge={c.flags.length ? <Badge tone="warning">{t('mobile.m3.flagged')}</Badge> : undefined} onClick={() => navigate(`/m/communities/${c.id}`)} /></li>)}
          </MList>
        ) : <p className="py-8 text-center text-[14px] text-muted">{t('mobile.m3.none')}</p>}
      </div>
    </div>
  );
}

/** M3 Community profiling: location → GPS → profile form → leaders → groups → documents → review → save. */
export function CommunityFlowScreen() {
  const { id } = useParams();
  const { t, terms } = useT();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const lang = useMobileSessionStore((s) => s.language);
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const { agent } = useMobileAgent();
  const form = useLiveForm('communityProfile');
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const existing = useCommunityStore((s) => s.communities.find((c) => c.id === id));
  const parentLevel = settings.locationLevels[settings.locationLevels.length - 2]?.id;
  const parents = useMemo(() => nodes.filter((n) => n.levelId === parentLevel).sort((a, b) => a.name.localeCompare(b.name)), [nodes, parentLevel]);
  const leaf = existing ? nodes.find((n) => n.id === existing.locationNodeId) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [parentId, setParentId] = useState(leaf?.parentId ?? parents[0]?.id ?? '');
  const [population, setPopulation] = useState(String(existing?.population ?? ''));
  const [contact, setContact] = useState(existing?.contactPerson ?? { name: '', phone: '' });
  const parentNode = nodes.find((n) => n.id === parentId);
  const [gps, setGps] = useState<Gps | undefined>(existing?.gps ? { ...existing.gps, accuracy: existing.gps.accuracy ?? 10 } : undefined);
  const [answers, setAnswers] = useState<Record<string, unknown>>(existing?.customFields ?? {});
  const [leaders, setLeaders] = useState<LeaderInput[]>([]);
  const [groups, setGroups] = useState<{ name: string; type: FarmerGroup['type'] }[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const roles = LEADER_ROLES[lang];
  const roleLabel = (r: string) => r;

  const save = async () => {
    const payload: CommunityPayload = {
      id: existing?.id, name, parentNodeId: parentId, gps: gps!, population: Number(population || 0), contact, answers, leaders, groups, photos,
      agentIds: existing?.agentIds ?? (agent ? [agent.id] : []),
    };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'community', label: t(existing ? 'mobile.m3.labelEdit' : 'mobile.m3.labelNew', { name }), payload, base: existing ? { entity: 'community', id: existing.id, updatedAt: existing.updatedAt } : undefined });
    toast.success(t(savedKey(queued)), { description: name });
    navigate('/m/communities');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={existing ? existing.name : t('mobile.m3.new', { community: terms.community.toLocaleLowerCase() })} back />
      <MobileFormRenderer
        form={form}
        answers={answers}
        onChange={setAnswers}
        finishLabel={online ? t('mobile.save') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        before={[
          {
            title: t('mobile.m3.basics'), valid: !!name.trim() && !!parentId, content: (
              <div className="space-y-4">
                <MField label={t('people.name')} required><input value={name} onChange={(e) => setName(e.target.value)} className={mInput} aria-label={t('people.name')} /></MField>
                <MField label={settings.locationLevels.find((l) => l.id === parentLevel)?.label[lang] ?? t('people.location')} required>
                  <MSelect value={parentId} onChange={setParentId} label={t('people.location')} options={parents.map((p) => ({ value: p.id, label: pathLabel(nodes, p.id) }))} />
                </MField>
                <MField label={t('people.community.population')}><input type="number" inputMode="numeric" value={population} onChange={(e) => setPopulation(e.target.value)} className={mInput} aria-label={t('people.community.population')} /></MField>
                <MField label={t('people.community.contact')}><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={mInput} aria-label={t('people.community.contact')} /></MField>
                <MField label={t('people.phone')}><input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={mInput} aria-label={t('people.phone')} /></MField>
              </div>
            ),
          },
          {
            title: t('mobile.m3.gps'), valid: !!gps, content: (
              <div className="space-y-3">
                <p className="text-[15px] text-body">{t('mobile.m3.gpsHint')}</p>
                <GpsCapture value={gps} onChange={setGps} base={existing?.gps ?? parentNode?.center ?? { lat: 10.06, lng: -2.5 }} big />
              </div>
            ),
          },
        ]}
        after={[
          {
            title: t('mobile.m3.leaders'), valid: true, content: (
              <div className="space-y-3">
                {leaders.map((l, i) => (
                  <div key={i} className="space-y-2 rounded-card border border-line p-3">
                    <div className="flex gap-2"><input value={l.name} onChange={(e) => setLeaders(leaders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={t('people.name')} aria-label={t('people.name')} className={mInput} /><Button variant="ghost" size="icon" aria-label={t('set.remove')} onClick={() => setLeaders(leaders.filter((_, j) => j !== i))}><Trash2 /></Button></div>
                    <MSelect value={l.role} onChange={(role) => setLeaders(leaders.map((x, j) => (j === i ? { ...x, role } : x)))} label={t('people.role')} options={roles.map((r) => ({ value: r, label: roleLabel(r) }))} />
                    <input type="tel" value={l.phone} onChange={(e) => setLeaders(leaders.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder={t('people.phone')} aria-label={t('people.phone')} className={mInput} />
                  </div>
                ))}
                <Button variant="secondary" size="lg" className="w-full" onClick={() => setLeaders([...leaders, { name: '', role: roles[0] ?? '', phone: '' }])}><Plus /> {t('people.addLeader')}</Button>
              </div>
            ),
          },
          {
            title: terms.farmerGroups, valid: true, content: (
              <div className="space-y-3">
                <p className="text-[14px] text-muted">{t('mobile.m3.groupsHint')}</p>
                {groups.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={g.name} onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={t('people.name')} aria-label={t('people.name')} className={mInput} />
                    <select value={g.type} onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, type: e.target.value as FarmerGroup['type'] } : x)))} aria-label={t('col.type')} className={`${mInput} w-40`}>{GROUP_TYPES.map((x) => <option key={x} value={x}>{t(`groupType.${x}`)}</option>)}</select>
                    <Button variant="ghost" size="icon" aria-label={t('set.remove')} onClick={() => setGroups(groups.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                ))}
                <Button variant="secondary" size="lg" className="w-full" onClick={() => setGroups([...groups, { name: '', type: 'COOPERATIVE' }])}><Plus /> {t('mobile.m3.addGroup')}</Button>
              </div>
            ),
          },
          { title: t('mobile.m3.documents'), valid: true, content: <div className="space-y-3"><p className="text-[14px] text-muted">{t('mobile.m3.documentsHint')}</p><PhotoPicker value={photos} onChange={setPhotos} max={4} big /></div> },
          {
            title: t('mobile.reg.review'), valid: true, content: (
              <div className="space-y-4">
                <div className="rounded-card bg-brand-soft p-4">
                  <div className="text-[18px] font-semibold text-ink">{name}</div>
                  <div className="text-[14px] text-body">{parentNode ? pathLabel(nodes, parentNode.id) : ''}{gps ? ` · ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} (±${gps.accuracy} m)` : ''}</div>
                  <div className="mt-1 text-[13px] text-muted">{t('mobile.m3.reviewCounts', { leaders: leaders.filter((l) => l.name.trim()).length, groups: groups.filter((g) => g.name.trim()).length, photos: photos.length })}</div>
                </div>
                <AnswersView form={form} answers={answers} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
