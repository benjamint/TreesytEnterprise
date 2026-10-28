import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, CheckCircle2, ClipboardCheck, HandHeart, Mic, Plus, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SupportRequest } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AudioCapture, GpsCapture, PhotoPicker, SimCapture, type Gps } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSelect, MobileWizard, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { needsScoring } from '@/services/supportService';
import { saveOrQueue } from '@/services/mobileSync';
import { cn } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useGroupStore } from '@/stores/groupStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useSupportStore } from '@/stores/supportStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useSupportLookups } from '@/web/features/support/shared';

/** Groups in the agent's communities. */
export function useMyGroups() {
  const { agent } = useMobileAgent();
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  return useMemo(() => {
    const ids = new Set(communities.filter((c) => agent && c.agentIds.includes(agent.id)).map((c) => c.id));
    return groups.filter((g) => ids.has(g.communityId)).sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, communities, agent]);
}

/** What the agent has to do next on a request, if anything. */
const todo = (r: SupportRequest) => (r.status === 'AGENT_CONFIRMATION' ? 'confirm' : r.lines.some((l) => l.status === 'PAID') ? 'fulfil' : null);

/** M6 Farmer support: the agent's requests, with what needs doing first. */
export function SupportScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { agent } = useMobileAgent();
  const sl = useSupportLookups();
  const all = useOrgRows(useSupportStore((s) => s.requests));
  const mine = useMemo(() => all.filter((r) => r.agentId === agent?.id).sort((a, b) => Number(!!todo(b)) - Number(!!todo(a)) || b.createdAt.localeCompare(a.createdAt)), [all, agent?.id]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.tile.support')} back right={<Button size="sm" onClick={() => navigate('/m/support/new')}><Plus /> {t('mobile.new')}</Button>} />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-1">
        {mine.length ? (
          <MList>
            {mine.map((r) => {
              const next = todo(r);
              return (
                <li key={r.id}>
                  <ListRow
                    title={sl.groupName(r.groupId)}
                    subtitle={`${r.number} · ${sl.typeName(r.primaryTypeId)} · ${f.money(r.total)}`}
                    badge={next ? <Badge tone="warning">{t(`mobile.m6.todo.${next}`)}</Badge> : undefined}
                    right={<StatusBadge status={r.status} />}
                    onClick={() => navigate(`/m/support/${r.id}`)}
                  />
                </li>
              );
            })}
          </MList>
        ) : (
          <div className="space-y-3 py-10 text-center">
            <HandHeart className="mx-auto h-10 w-10 text-muted" />
            <p className="text-[15px] text-body">{t('mobile.m6.empty')}</p>
            <Button size="lg" onClick={() => navigate('/m/support/new')}><Plus /> {t('sup.new')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** M6 New request: group → services → farmers → evidence (voices, GPS) → review. */
export function NewSupportScreen() {
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const { agent } = useMobileAgent();
  const sl = useSupportLookups();
  const groups = useMyGroups();
  const memberships = useGroupStore((s) => s.groupMemberships);
  const communities = useCommunityStore((s) => s.communities);
  const types = sl.types.filter((x) => x.enabled);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [primary, setPrimary] = useState(types[0]?.id ?? '');
  const [secondary, setSecondary] = useState('');
  const [amount, setAmount] = useState('');
  const [ability, setAbility] = useState(settings.support.abilityToPay[0] ?? '');
  const [agro, setAgro] = useState(false);
  const members = useMemo(() => memberships.filter((m) => m.groupId === groupId && !m.leftAt).map((m) => m.farmerId), [memberships, groupId]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = picked ?? members;
  const [leader, setLeader] = useState<{ seconds: number } | undefined>();
  const [witness, setWitness] = useState<{ seconds: number } | undefined>();
  const [gps, setGps] = useState<Gps | undefined>();
  const type = sl.type(primary);
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const minor = Math.round(Number(amount || 0) * 10 ** dec);
  const over = !!type?.maxAmountMinor && minor > type.maxAmountMinor;
  const group = groups.find((g) => g.id === groupId);
  const gate = !!group && needsScoring(orgId, group.id, [primary, ...(secondary ? [secondary] : [])]);
  const needLeader = type?.evidence?.leaderVoice ?? true;
  const save = async () => {
    if (!agent || !group) return;
    const payload = {
      orgId, groupId, agentId: agent.id, primaryTypeId: primary, secondaryTypeId: secondary || undefined, agroforestry: agro ? { interested: true } : undefined, gps,
      voice: { leaderSeconds: leader?.seconds, witnessSeconds: witness?.seconds }, actorId: userId ?? '',
      lines: chosen.map((farmerId, i) => ({ farmerId, typeId: primary, subType: type?.subTypes.length ? type.subTypes[i % type.subTypes.length] : undefined, amountMinor: minor, abilityToPay: ability })),
    };
    const { queued, result } = await saveOrQueue<SupportRequest>({ orgId, userId: userId ?? '', type: 'supportRequest', label: t('mobile.m6.requestLabel', { group: group.name }), payload });
    toast.success(t(savedKey(queued)), { description: result ? t('sup.toast.created', { number: result.number }) : undefined });
    navigate(result ? `/m/support/${result.id}` : '/m/support');
  };
  if (!groups.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('sup.new')} back />
        <p className="px-5 py-10 text-center text-[15px] text-body">{t('mobile.m4.noGroups')}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('sup.new')} back />
      <MobileWizard
        finishLabel={online ? t('buy.submit') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'group', title: terms.farmerGroup, valid: !!group, content: (
              <div className="space-y-4">
                <MField label={terms.farmerGroup} required><MSelect value={groupId} onChange={(v) => { setGroupId(v); setPicked(null); }} label={terms.farmerGroup} options={groups.map((g) => ({ value: g.id, label: `${g.name} · ${communities.find((c) => c.id === g.communityId)?.name ?? ''}` }))} /></MField>
                {group && <p className="text-[14px] text-body">{t('mobile.m4.members', { count: members.length })}{group.wallet ? ` · ${group.wallet.number}` : ''}</p>}
                {gate && <p className="rounded-ctl border border-warning/40 bg-warning/5 px-4 py-3 text-[14px] text-ink">{t('sup.gateWarning')}</p>}
              </div>
            ),
          },
          {
            key: 'service', title: t('mobile.m6.service'), valid: minor > 0 && !over, content: (
              <div className="space-y-4">
                <MField label={t('sup.col.primary')} required><MSelect value={primary} onChange={setPrimary} label={t('sup.col.primary')} options={types.map((x) => ({ value: x.id, label: sl.typeName(x.id) }))} /></MField>
                <MField label={t('sup.col.secondary')}><MSelect value={secondary} onChange={setSecondary} label={t('sup.col.secondary')} options={[{ value: '', label: '—' }, ...types.filter((x) => x.id !== primary).map((x) => ({ value: x.id, label: sl.typeName(x.id) }))]} /></MField>
                <MField label={t('sup.amountPerFarmer', { currency: f.org.currency })} required error={over ? t('sup.overMax', { amount: f.money({ amountMinor: type!.maxAmountMinor, currency: f.org.currency }) }) : undefined}>
                  <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={mInput} aria-label={t('sup.amountPerFarmer', { currency: f.org.currency })} />
                </MField>
                <MField label={t('sup.col.ability')}><MSelect value={ability} onChange={setAbility} label={t('sup.col.ability')} options={settings.support.abilityToPay.map((a) => ({ value: a, label: a }))} /></MField>
                <MField label={t('sup.agroInterest')} group><Segmented value={agro ? 'yes' : 'no'} onChange={(v) => setAgro(v === 'yes')} label={t('sup.agroInterest')} options={[{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }]} /></MField>
              </div>
            ),
          },
          {
            key: 'farmers', title: terms.farmers, valid: chosen.length > 0, hint: t('sup.pickedN', { count: chosen.length, total: members.length }), content: (
              <MList>
                {members.map((id) => {
                  const on = chosen.includes(id);
                  return (
                    <li key={id}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => setPicked(on ? chosen.filter((x) => x !== id) : [...chosen, id])} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left active:bg-brand-soft">
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border', on ? 'border-brand bg-brand text-on-brand' : 'border-line')}>{on && <Check className="h-4 w-4" />}</span>
                        <span className="flex-1 font-medium text-ink">{sl.farmerName(id)}</span>
                      </button>
                    </li>
                  );
                })}
              </MList>
            ),
          },
          {
            key: 'evidence', title: t('mobile.m6.evidence'), valid: (!needLeader || !!leader) && !!gps, content: (
              <div className="space-y-5">
                <MField label={t('sup.leaderVoice')} required={needLeader} group help={t('mobile.m6.leaderHelp')}><AudioCapture value={leader} onChange={setLeader} big /></MField>
                <MField label={t('sup.witnessVoice')} group><AudioCapture value={witness} onChange={setWitness} big /></MField>
                <MField label={t('mobile.m3.gps')} required group><GpsCapture value={gps} onChange={setGps} base={communities.find((c) => c.id === group?.communityId)?.gps ?? { lat: 10.06, lng: -2.5 }} big /></MField>
              </div>
            ),
          },
          {
            key: 'review', title: t('mobile.m6.review'), content: (
              <div className="space-y-3">
                <dl className="divide-y divide-line rounded-card border border-line text-[15px]">
                  {([
                    [terms.farmerGroup, group?.name ?? ''],
                    [t('sup.col.primary'), sl.typeName(primary)],
                    [t('sup.col.secondary'), secondary ? sl.typeName(secondary) : '—'],
                    [terms.farmers, String(chosen.length)],
                    [t('sup.amountPerFarmer', { currency: f.org.currency }), f.money({ amountMinor: minor, currency: f.org.currency })],
                  ] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>)}
                </dl>
                <div className="flex items-baseline justify-between rounded-ctl bg-brand-soft px-4 py-3"><span className="text-[14px] text-body">{t('col.total')}</span><span className="tnum text-[22px] font-semibold text-ink">{f.money({ amountMinor: minor * chosen.length, currency: f.org.currency })}</span></div>
                {gate && <p className="text-[13px] text-muted">{t('mobile.m6.gateAfter')}</p>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

type Presence = 'present' | 'absent' | 'declined';

/** M6 Request detail: confirm who turned up and the group wallet; record fulfilment audio per farmer; upload assets. */
export function SupportDetailScreen() {
  const { id } = useParams();
  const { t, terms } = useT();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const sl = useSupportLookups();
  const r = useSupportStore((s) => s.requests.find((x) => x.id === id));
  const group = r ? sl.group(r.groupId) : undefined;
  const communities = useCommunityStore((s) => s.communities);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [wallet, setWallet] = useState({ number: group?.wallet?.number ?? '', name: group?.wallet?.name ?? '' });
  const [audio, setAudio] = useState<Record<string, { seconds: number } | undefined>>({});
  const [gps, setGps] = useState<Gps | undefined>(r?.gps);
  const [agreement, setAgreement] = useState<string[]>(r?.assets.agreement ? [r.assets.agreement] : []);
  const [thumbs, setThumbs] = useState<string | undefined>(r?.assets.thumbprints ? `captured:${r.assets.thumbprints}` : undefined);
  if (!r) return null;
  const approved = r.lines.filter((l) => l.status === 'APPROVED');
  const of = (farmerId: string): Presence => presence[farmerId] ?? 'present';
  const confirm = async () => {
    const present = approved.filter((l) => of(l.farmerId) === 'present').map((l) => l.farmerId);
    const declined = approved.filter((l) => of(l.farmerId) === 'declined').map((l) => l.farmerId);
    const w = r.payout.method === 'GROUP_WALLET' && wallet.number ? { providerId: r.payout.wallet?.providerId ?? group?.wallet?.provider ?? '', number: wallet.number, name: wallet.name } : undefined;
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'supportConfirm', label: t('mobile.m6.confirmLabel', { number: r.number }), payload: { requestId: r.id, present, declined, wallet: w } });
    toast.success(t(savedKey(queued)), { description: t('sup.toast.confirmed', { number: r.number }) });
  };
  const fulfil = async (lineId: string, farmerId: string) => {
    const a = audio[lineId];
    if (!a) return;
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'supportFulfil', label: t('mobile.m6.fulfilLabel', { name: sl.farmerName(farmerId) }), payload: { requestId: r.id, lineId, audioSeconds: a.seconds, gps } });
    toast.success(t(savedKey(queued)), { description: t('mobile.m6.fulfilled', { name: sl.farmerName(farmerId) }) });
  };
  const assets = async () => {
    const n = thumbs ? Number(thumbs.split(':')[1]) || r.lines.length : undefined;
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'supportAssets', label: t('mobile.m6.assetsLabel', { number: r.number }), payload: { requestId: r.id, agreement: agreement[0], thumbprints: n } });
    toast.success(t(savedKey(queued)), { description: t('mobile.m6.assetsSaved') });
  };
  const paidLines = r.lines.filter((l) => l.status === 'PAID' || l.status === 'FULFILLED');
  const counts = { present: approved.filter((l) => of(l.farmerId) === 'present').length, absent: approved.filter((l) => of(l.farmerId) === 'absent').length, declined: approved.filter((l) => of(l.farmerId) === 'declined').length };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={r.number} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-brand-soft p-4">
          <div className="flex items-center justify-between gap-2"><StatusBadge status={r.status} /><span className="text-[13px] text-muted">{sl.typeName(r.primaryTypeId)}</span></div>
          <div className="mt-2 text-[15px] text-ink">{group?.name} · {t('sup.farmersN', { count: r.lines.length })}</div>
          <div className="tnum text-[24px] font-semibold text-ink">{f.money(r.total)}</div>
        </div>

        {r.status === 'PENDING_SCORING' && <p className="rounded-ctl border border-warning/40 bg-warning/5 px-4 py-3 text-[14px] text-ink">{t('mobile.m6.waitingScore')}</p>}
        {r.status === 'PENDING_APPROVAL' && <p className="rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body">{t('mobile.m6.waitingApproval')}</p>}
        {r.status === 'PENDING_DISBURSEMENT' && <p className="rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body">{t('mobile.m6.waitingPayment', { count: r.lines.filter((l) => l.status === 'CONFIRMED').length })}</p>}

        {r.status === 'AGENT_CONFIRMATION' && (
          <section className="space-y-3 rounded-card border border-warning/40 bg-warning/5 p-4">
            <h2 className="text-[16px] font-semibold text-ink">{t('mobile.m6.confirmTitle')}</h2>
            <p className="text-[14px] text-body">{t('mobile.m6.confirmHint')}</p>
            <ul className="space-y-2">
              {approved.map((l) => (
                <li key={l.id} className="rounded-ctl border border-line bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between gap-2"><span className="font-medium text-ink">{sl.farmerName(l.farmerId)}</span><span className="tnum text-[14px] text-body">{f.money(l.amount)}</span></div>
                  <Segmented value={of(l.farmerId)} onChange={(v) => setPresence({ ...presence, [l.farmerId]: v })} label={sl.farmerName(l.farmerId)} options={(['present', 'absent', 'declined'] as const).map((k) => ({ value: k, label: t(`mobile.m6.presence.${k}`) }))} />
                </li>
              ))}
            </ul>
            {r.payout.method === 'GROUP_WALLET' && (
              <div className="space-y-3 rounded-ctl border border-line bg-surface p-3">
                <div className="text-[14px] font-semibold text-ink">{t('mobile.m6.groupWallet')}</div>
                <MField label={t('mobile.m6.walletNumber')}><input value={wallet.number} onChange={(e) => setWallet({ ...wallet, number: e.target.value })} inputMode="tel" className={mInput} aria-label={t('mobile.m6.walletNumber')} /></MField>
                <MField label={t('mobile.m6.walletName')}><input value={wallet.name} onChange={(e) => setWallet({ ...wallet, name: e.target.value })} className={mInput} aria-label={t('mobile.m6.walletName')} /></MField>
              </div>
            )}
            <p className="text-[13px] text-muted">{t('mobile.m6.confirmSummary', { present: counts.present, absent: counts.absent, declined: counts.declined })}</p>
            <Button size="lg" className="w-full" disabled={!counts.present} onClick={() => void confirm()}><ClipboardCheck /> {t('mobile.m6.confirm', { count: counts.present })}</Button>
          </section>
        )}

        {paidLines.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="text-[16px] font-semibold text-ink">{t('mobile.m6.fulfilment')}</h2><StatusBadge status={({ PENDING: 'PENDING', PARTIAL: 'PARTIALLY_FULFILLED', FULL: 'FULLY_FULFILLED' } as const)[r.fulfilmentStatus]} /></div>
            <p className="text-[14px] text-body">{t('mobile.m6.fulfilHint')}</p>
            <MField label={t('mobile.m3.gps')} group><GpsCapture value={gps} onChange={setGps} base={communities.find((c) => c.id === r.communityId)?.gps ?? { lat: 10.06, lng: -2.5 }} /></MField>
            <ul className="space-y-2">
              {paidLines.map((l) => (
                <li key={l.id} className="rounded-ctl border border-line p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium text-ink">{sl.farmerName(l.farmerId)}</span>{l.status === 'FULFILLED' ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> {t('status.FULFILLED')}</Badge> : <span className="tnum text-[14px] text-body">{f.money(l.amount)}</span>}</div>
                  {l.status === 'PAID' && (
                    <div className="mt-3 space-y-2">
                      <AudioCapture value={audio[l.id]} onChange={(v) => setAudio({ ...audio, [l.id]: v })} />
                      <Button size="lg" className="w-full" disabled={!audio[l.id]} onClick={() => void fulfil(l.id, l.farmerId)}><Mic /> {t('mobile.m6.saveFulfil')}</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {paidLines.length > 0 && (
          <section className="space-y-3 rounded-card border border-line p-4">
            <h2 className="text-[16px] font-semibold text-ink">{t('mobile.m6.assets')}</h2>
            <MField label={t('mobile.m6.agreement')} group><PhotoPicker value={agreement} onChange={setAgreement} max={1} big /></MField>
            <MField label={t('mobile.m6.thumbprints')} group help={t('mobile.m6.thumbprintsHelp', { count: r.lines.length })}><SimCapture kind="thumbprint" value={thumbs} onChange={setThumbs} make={() => `captured:${paidLines.length}`} big /></MField>
            <Button size="lg" variant="secondary" className="w-full" disabled={!agreement.length && !thumbs} onClick={() => void assets()}>{t('mobile.m6.saveAssets')}</Button>
            {r.assets.at && <p className="text-[13px] text-success">{t('mobile.m6.assetsAt', { date: f.dateTime(r.assets.at) })}</p>}
          </section>
        )}

        <section>
          <h2 className="eyebrow mb-2">{terms.farmers}</h2>
          <MList>
            {r.lines.map((l) => <li key={l.id}><ListRow title={sl.farmerName(l.farmerId)} subtitle={`${sl.typeName(l.typeId)}${l.subType ? ` · ${l.subType}` : ''} · ${f.money(l.amount)}`} right={l.status === 'REJECTED' || l.status === 'DECLINED' ? <span className="flex items-center gap-1 text-[13px] text-danger">{l.status === 'DECLINED' ? <UserX className="h-4 w-4" /> : <X className="h-4 w-4" />}{t(`status.LINE_${l.status}`)}</span> : <StatusBadge status={`LINE_${l.status}`} />} /></li>)}
          </MList>
        </section>
        <p className="text-[12px] text-muted">{t('nav.support')} · {f.dateTime(r.createdAt)}</p>
      </div>
    </div>
  );
}
