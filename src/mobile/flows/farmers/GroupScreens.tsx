import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FarmerGroup } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/shared/Field';
import { PhotoPicker } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { MobileFormRenderer } from '@/mobile/forms/MobileFormRenderer';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSearch, MSelect, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { useLiveForm } from '@/services/formService';
import { saveOrQueue } from '@/services/mobileSync';
import type { GroupPayload, LeaderInput } from '@/services/profileService';
import { useCommunityStore } from '@/stores/communityStore';
import { useGroupStore } from '@/stores/groupStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useActor, useLang, useOrgRows, useT } from '@/stores/hooks';
import { useMyFarmers } from './FarmerScreens';

const TYPES: FarmerGroup['type'][] = ['COOPERATIVE', 'VSLA', 'WOMENS_GROUP', 'PRODUCER_GROUP'];
const GROUP_ROLES = { en: ['Chairperson', 'Secretary', 'Treasurer'], fr: ['Président(e)', 'Secrétaire', 'Trésorier(ère)'] };

/** M4 Farmer groups in the agent's communities. */
export function GroupsScreen() {
  const { t, terms } = useT();
  const navigate = useNavigate();
  const { agent } = useMobileAgent();
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const memberships = useOrgRows(useGroupStore((s) => s.groupMemberships));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const [q, setQ] = useState('');
  const mine = useMemo(() => {
    const ids = new Set(communities.filter((c) => agent && c.agentIds.includes(agent.id)).map((c) => c.id));
    return groups.filter((g) => ids.has(g.communityId)).sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, communities, agent]);
  const shown = mine.filter((g) => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={terms.farmerGroups} back right={<Button size="sm" onClick={() => navigate('/m/groups/new')}><Plus /> {t('mobile.new')}</Button>} />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-1">
        <MSearch value={q} onChange={setQ} placeholder={t('mobile.m4.searchGroups')} />
        {shown.length ? (
          <MList>
            {shown.map((g) => <li key={g.id}><ListRow title={g.name} subtitle={`${t(`groupType.${g.type}`)} · ${communities.find((c) => c.id === g.communityId)?.name ?? ''} · ${t('mobile.m4.members', { count: memberships.filter((m) => m.groupId === g.id && !m.leftAt).length })}`} onClick={() => navigate(`/m/groups/${g.id}`)} /></li>)}
          </MList>
        ) : <p className="py-8 text-center text-[14px] text-muted">{t('mobile.m4.noGroups')}</p>}
      </div>
    </div>
  );
}

/** M4 Create / edit group: details → group form → members → leaders → payment → documents → save. */
export function GroupFlowScreen() {
  const { id } = useParams();
  const { t, terms } = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const { agent } = useMobileAgent();
  const form = useLiveForm('groupProfile');
  const existing = useGroupStore((s) => s.groups.find((g) => g.id === id));
  const allMembers = useGroupStore((s) => s.groupMemberships);
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const mineC = useMemo(() => communities.filter((c) => agent && c.agentIds.includes(agent.id)).sort((a, b) => a.name.localeCompare(b.name)), [communities, agent]);
  const farmers = useMyFarmers();
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<FarmerGroup['type']>(existing?.type ?? 'COOPERATIVE');
  const [communityId, setCommunityId] = useState(existing?.communityId ?? mineC[0]?.id ?? '');
  const [established, setEstablished] = useState(existing?.established ?? new Date().toISOString().slice(0, 10));
  const [answers, setAnswers] = useState<Record<string, unknown>>(existing?.customFields ?? {});
  const current = useMemo(() => allMembers.filter((m) => m.groupId === existing?.id && !m.leftAt).map((m) => m.farmerId), [allMembers, existing?.id]);
  const [memberIds, setMemberIds] = useState<string[]>(current);
  const [leaders, setLeaders] = useState<LeaderInput[]>([]);
  const [paymentOption, setPaymentOption] = useState<FarmerGroup['paymentOption']>(existing?.paymentOption ?? 'MOMO');
  const [wallet, setWallet] = useState(existing?.wallet ?? { provider: '', number: '', name: '' });
  const [docType, setDocType] = useState('meetingRecords');
  const [photos, setPhotos] = useState<string[]>([]);
  const pool = farmers.filter((f) => f.communityId === communityId);

  const save = async () => {
    const payload: GroupPayload = { id: existing?.id, name, type, communityId, established, paymentOption, wallet: paymentOption === 'MOMO' ? wallet : undefined, answers, memberIds, leaders, photos, docType: photos.length ? docType : undefined };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'group', label: t('mobile.m4.groupLabel', { name }), payload });
    toast.success(t(savedKey(queued)), { description: name });
    navigate('/m/groups');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={existing?.name ?? t('people.group.new')} back />
      <MobileFormRenderer
        form={form}
        answers={answers}
        onChange={setAnswers}
        finishLabel={online ? t('mobile.save') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        before={[{
          title: t('mobile.m3.basics'), valid: !!name.trim() && !!communityId, content: (
            <div className="space-y-4">
              <MField label={t('people.name')} required><input value={name} onChange={(e) => setName(e.target.value)} className={mInput} aria-label={t('people.name')} /></MField>
              <MField label={t('col.type')}><MSelect value={type} onChange={setType} label={t('col.type')} options={TYPES.map((x) => ({ value: x, label: t(`groupType.${x}`) }))} /></MField>
              <MField label={terms.community} required><MSelect value={communityId} onChange={setCommunityId} label={terms.community} options={mineC.map((c) => ({ value: c.id, label: c.name }))} /></MField>
              <MField label={t('mobile.m4.established')}><input type="date" value={established} onChange={(e) => setEstablished(e.target.value)} className={mInput} aria-label={t('mobile.m4.established')} /></MField>
            </div>
          ),
        }]}
        after={[
          {
            title: t('mobile.m4.membersStep'), valid: true, content: (
              <div className="space-y-2">
                <p className="text-[14px] text-muted">{t('mobile.m4.membersHint', { count: memberIds.length })}</p>
                <div className="divide-y divide-line rounded-card border border-line">
                  {pool.map((f) => <div key={f.id} className="px-4 py-3"><Checkbox label={`${f.firstName} ${f.lastName}`} description={f.farmerCode} checked={memberIds.includes(f.id)} disabled={current.includes(f.id)} onChange={(e) => setMemberIds(e.target.checked ? [...memberIds, f.id] : memberIds.filter((x) => x !== f.id))} /></div>)}
                </div>
              </div>
            ),
          },
          {
            title: t('mobile.m3.leaders'), valid: true, content: (
              <div className="space-y-3">
                {leaders.map((l, i) => (
                  <div key={i} className="space-y-2 rounded-card border border-line p-3">
                    <div className="flex gap-2"><input value={l.name} onChange={(e) => setLeaders(leaders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={t('people.name')} aria-label={t('people.name')} className={mInput} /><Button variant="ghost" size="icon" aria-label={t('set.remove')} onClick={() => setLeaders(leaders.filter((_, j) => j !== i))}><Trash2 /></Button></div>
                    <MSelect value={l.role} onChange={(role) => setLeaders(leaders.map((x, j) => (j === i ? { ...x, role } : x)))} label={t('people.role')} options={GROUP_ROLES[lang].map((r) => ({ value: r, label: r }))} />
                    <input type="tel" value={l.phone} onChange={(e) => setLeaders(leaders.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder={t('people.phone')} aria-label={t('people.phone')} className={mInput} />
                  </div>
                ))}
                <Button variant="secondary" size="lg" className="w-full" onClick={() => setLeaders([...leaders, { name: '', role: GROUP_ROLES[lang][0]!, phone: '' }])}><Plus /> {t('people.addLeader')}</Button>
              </div>
            ),
          },
          {
            title: t('mobile.m4.payment'), valid: paymentOption !== 'MOMO' || (!!wallet.number.trim() && !!wallet.name.trim()), content: (
              <div className="space-y-4">
                <Segmented value={paymentOption} onChange={setPaymentOption} label={t('mobile.m4.payment')} options={(['MOMO', 'BANK', 'CASH'] as const).map((x) => ({ value: x, label: t(`mobile.m4.pay.${x}`) }))} />
                {paymentOption === 'MOMO' && (
                  <>
                    <MField label={t('buy.walletNumber')} required><input type="tel" value={wallet.number} onChange={(e) => setWallet({ ...wallet, number: e.target.value })} className={mInput} aria-label={t('buy.walletNumber')} /></MField>
                    <MField label={t('buy.walletName')} required><input value={wallet.name} onChange={(e) => setWallet({ ...wallet, name: e.target.value.toUpperCase() })} className={mInput} aria-label={t('buy.walletName')} /></MField>
                  </>
                )}
              </div>
            ),
          },
          {
            title: t('mobile.m3.documents'), valid: true, content: (
              <div className="space-y-3">
                <MField label={t('people.docTypeLabel')}><MSelect value={docType} onChange={setDocType} label={t('people.docTypeLabel')} options={['meetingRecords', 'contributionRecords', 'membershipList'].map((d) => ({ value: d, label: t(`people.docType.${d}`) }))} /></MField>
                <PhotoPicker value={photos} onChange={setPhotos} max={3} big />
                {photos.length > 0 && <p className="text-[13px] text-muted">{t('mobile.m4.docReview')}</p>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
