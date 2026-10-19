import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Volume2 } from 'lucide-react';
import { AudioCapture, PhotoPicker, SignaturePad, SimCapture } from '@/components/forms/media';
import { Checkbox } from '@/components/shared/Field';
import { Button } from '@/components/ui/button';
import { saveOrQueue } from '@/services/mobileSync';
import type { FarmerIdentity } from '@/types';
import { useLang, useOrgSettings } from '@/stores/hooks';
import { toast } from 'sonner';
import type { Farmer } from '@/types';
import { allQuestions } from '@/engines/forms';
import { Input } from '@/components/ui/input';
import { AnswersView } from '@/components/forms/FormFields';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { MobileFormRenderer } from '@/mobile/forms/MobileFormRenderer';
import { useLiveForm } from '@/services/formService';
import { registerFarmer, type FarmerCore } from '@/services/farmerService';
import { findDuplicates, normalisePhone } from '@/web/features/people/FarmerForm';
import { isValidPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useActor, useCurrentOrg, useOrgRows, useT } from '@/stores/hooks';

const box = 'h-12 w-full rounded-ctl border border-line bg-surface px-3 text-[16px] text-ink';

/**
 * M4 Register farmer: duplicate check as you type the phone → the company's live farmer profile
 * form → photo and ID card → thumbprints → consent (audio / signature / tick, text read aloud) →
 * NFC card → review → save (offline: kept on the phone until Sync).
 */
export function RegisterFarmerScreen() {
  const { t, terms } = useT();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const org = useCurrentOrg();
  const { agent } = useMobileAgent();
  const online = useMobileSessionStore((s) => s.online);
  const form = useLiveForm('farmerProfile');
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const mine = useMemo(() => { const m = communities.filter((c) => agent && c.agentIds.includes(agent.id)); return (m.length ? m : communities).sort((a, b) => a.name.localeCompare(b.name)); }, [communities, agent]);
  const country = org.countries[0] ?? 'GH';
  const [core, setCore] = useState<FarmerCore>({ firstName: '', lastName: '', gender: 'F', dateOfBirth: '', phone: '', communityId: mine[0]?.id ?? '' });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const settings = useOrgSettings();
  const lang = useLang();
  const bio = settings.biometrics;
  const [photo, setPhoto] = useState<string[]>([]);
  const [idCard, setIdCard] = useState<string[]>([]);
  const [left, setLeft] = useState<string | undefined>();
  const [right, setRight] = useState<string | undefined>();
  const [consent, setConsent] = useState<unknown>(undefined);
  const [reading, setReading] = useState(false);
  const [nfc, setNfc] = useState<string | undefined>();
  const consentOk = bio.consentType === 'TICK' ? consent === true : !!consent;
  const e164 = core.phone ? normalisePhone(core.phone, country) : '';
  const phoneOk = !core.phone || isValidPhone(e164, country);
  const dups = findDuplicates(farmers, e164, String(answers.idNumber ?? '').trim());
  const coreOk = !!core.firstName.trim() && !!core.lastName.trim() && !!core.dateOfBirth && !!core.communityId && phoneOk;
  const set = (patch: Partial<FarmerCore>) => setCore({ ...core, ...patch });

  const save = async () => {
    const c = { ...core, phone: e164 };
    const at = new Date().toISOString();
    const identity: Partial<FarmerIdentity> = {
      photo: photo.length > 0, idCard: idCard.length > 0, thumbprints: { left: !!left, right: !!right },
      consent: consentOk ? { type: bio.consentType, capturedAt: at } : null, nfcCard: nfc ? { number: nfc, status: 'ISSUED' } : null,
    };
    const { queued, result } = await saveOrQueue<ReturnType<typeof registerFarmer>>({ orgId, userId: userId ?? '', type: 'farmer', label: t('mobile.reg.outboxLabel', { name: `${c.firstName} ${c.lastName}` }), payload: { core: c, answers, agentId: agent?.id, identity } });
    if (queued || !result) toast.success(t('mobile.reg.savedOffline'));
    else toast.success(t('mobile.reg.saved', { name: `${result.farmer.firstName} ${result.farmer.lastName}`, code: result.farmer.farmerCode }), result.flags ? { description: t('people.farmer.flagsRaised', { count: result.flags }) } : undefined);
    navigate('/m/farmers');
  };
  const identitySteps = [
    { title: t('mobile.reg.photos'), valid: true, content: (
      <div className="space-y-5">
        <div><div className="mb-2 text-[16px] font-medium text-ink">{t('mobile.reg.photo', { farmer: terms.farmer.toLocaleLowerCase() })}</div><PhotoPicker value={photo} onChange={setPhoto} max={1} big /></div>
        <div><div className="mb-2 text-[16px] font-medium text-ink">{t('mobile.reg.idCard')}</div><PhotoPicker value={idCard} onChange={setIdCard} max={2} big /></div>
      </div>
    ) },
    ...(bio.thumbprint ? [{ title: t('mobile.reg.thumbprints'), valid: true, content: (
      <div className="space-y-5">
        <div><div className="mb-2 text-[16px] font-medium text-ink">{t('mobile.reg.leftThumb')}</div><SimCapture kind="thumbprint" value={left} onChange={setLeft} big /></div>
        <div><div className="mb-2 text-[16px] font-medium text-ink">{t('mobile.reg.rightThumb')}</div><SimCapture kind="thumbprint" value={right} onChange={setRight} big /></div>
      </div>
    ) }] : []),
    { title: t('mobile.reg.consent'), valid: consentOk, content: (
      <div className="space-y-4">
        <blockquote className={cn('rounded-card border border-line p-4 text-[15px] leading-relaxed text-ink transition-colors', reading && 'border-brand bg-brand-soft')}>{bio.consentText[lang] ?? bio.consentText.en}</blockquote>
        <Button variant="secondary" size="lg" className="w-full" disabled={reading} onClick={() => { setReading(true); window.setTimeout(() => setReading(false), 3000); }}><Volume2 /> {reading ? t('mobile.reg.reading') : t('mobile.reg.readAloud')}</Button>
        {bio.consentType === 'AUDIO' && <><p className="text-[14px] text-muted">{t('mobile.reg.consentAudio')}</p><AudioCapture value={consent as { seconds: number } | undefined} onChange={setConsent} big /></>}
        {bio.consentType === 'SIGNATURE' && <><p className="text-[14px] text-muted">{t('mobile.reg.consentSign')}</p><SignaturePad value={consent as string | undefined} onChange={setConsent} big /></>}
        {bio.consentType === 'TICK' && <Checkbox label={t('mobile.reg.consentTick', { farmer: terms.farmer.toLocaleLowerCase() })} checked={consent === true} onChange={(e) => setConsent(e.target.checked)} />}
      </div>
    ) },
    ...(bio.nfcCards ? [{ title: t('mobile.reg.nfc'), valid: true, content: (
      <div className="space-y-3"><p className="text-[15px] text-body">{t('mobile.reg.nfcHint')}</p><SimCapture kind="nfcTap" value={nfc} onChange={setNfc} big /></div>
    ) }] : []),
  ];

  const label = (text: string, req = true) => <span className="mb-1.5 block text-[15px] font-medium text-ink">{text}{req && <span className="text-danger"> *</span>}</span>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.reg.title', { farmer: terms.farmer.toLocaleLowerCase() })} back />
      <MobileFormRenderer
        form={form}
        answers={answers}
        onChange={setAnswers}
        finishLabel={online ? t('mobile.reg.save') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        before={[{
          title: terms.farmer, valid: coreOk, content: (
            <div className="space-y-4">
              <label className="block">{label(t('people.farmer.firstName'))}<Input value={core.firstName} onChange={(e) => set({ firstName: e.target.value })} className="h-12 text-[16px]" aria-label={t('people.farmer.firstName')} /></label>
              <label className="block">{label(t('people.farmer.lastName'))}<Input value={core.lastName} onChange={(e) => set({ lastName: e.target.value })} className="h-12 text-[16px]" aria-label={t('people.farmer.lastName')} /></label>
              <div>
                {label(t('col.gender'))}
                <div className="flex h-14 items-center gap-1 rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={t('col.gender')}>
                  {(['F', 'M'] as const).map((g) => <button key={g} type="button" role="radio" aria-checked={core.gender === g} onClick={() => set({ gender: g as Farmer['gender'] })} className={cn('h-full flex-1 rounded-[8px] text-[16px] font-medium', core.gender === g ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>{t(`gender.${g}`)}</button>)}
                </div>
              </div>
              <label className="block">{label(t('people.farmer.dob'))}<Input type="date" value={core.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} className="h-12 text-[16px]" aria-label={t('people.farmer.dob')} /></label>
              <label className="block">
                {label(t('people.phone'), false)}
                <Input type="tel" inputMode="tel" value={core.phone} onChange={(e) => set({ phone: e.target.value })} className={cn('h-12 text-[16px]', !phoneOk && 'border-danger')} aria-label={t('people.phone')} />
                {!phoneOk && <span className="mt-1 block text-[13px] text-danger">{t('people.farmer.badPhone')}</span>}
              </label>
              {dups.length > 0 && <p className="flex items-start gap-2 rounded-ctl bg-warning/10 px-3 py-2.5 text-[14px] text-ink" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{t('people.farmer.possibleDuplicate', { list: dups.slice(0, 2).map((d) => `${d.firstName} ${d.lastName} (${d.farmerCode})`).join(', ') })}</p>}
              <label className="block">{label(terms.community)}<select value={core.communityId} onChange={(e) => set({ communityId: e.target.value })} className={box} aria-label={terms.community}>{mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
          ),
        }]}
        after={[...identitySteps, {
          title: t('mobile.reg.review'), valid: true, content: (
            <div className="space-y-4">
              <div className="rounded-card bg-brand-soft p-4">
                <div className="text-[18px] font-semibold text-ink">{core.firstName} {core.lastName}</div>
                <div className="text-[14px] text-body">{t(`gender.${core.gender}`)} · {core.dateOfBirth} · {communities.find((c) => c.id === core.communityId)?.name}</div>
              </div>
              <p className="flex items-center gap-2 text-[13px] text-muted"><CheckCircle2 className="h-4 w-4 text-success" /> {t('mobile.reg.formVersion', { name: form.name, n: form.version, count: allQuestions(form).length })}</p>
              <AnswersView form={form} answers={answers} />
            </div>
          ),
        }]}
      />
    </div>
  );
}
