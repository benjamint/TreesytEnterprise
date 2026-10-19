import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import { cn, uid } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { useActor, useCurrentOrg, useOrgRows, useT } from '@/stores/hooks';

const box = 'h-12 w-full rounded-ctl border border-line bg-surface px-3 text-[16px] text-ink';

/**
 * M4 Register farmer (phase 6 version): duplicate check as you type the phone → the company's
 * live farmer profile form → review → save. Photo, ID card, thumbprints, consent and NFC steps
 * arrive with the full mobile flow in phase 9.
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
  const e164 = core.phone ? normalisePhone(core.phone, country) : '';
  const phoneOk = !core.phone || isValidPhone(e164, country);
  const dups = findDuplicates(farmers, e164, String(answers.idNumber ?? '').trim());
  const coreOk = !!core.firstName.trim() && !!core.lastName.trim() && !!core.dateOfBirth && !!core.communityId && phoneOk;
  const set = (patch: Partial<FarmerCore>) => setCore({ ...core, ...patch });

  const save = () => {
    const c = { ...core, phone: e164 };
    if (!online) {
      useOutboxStore.getState().add({ id: uid('ob'), orgId, userId: userId ?? '', type: 'farmer', label: t('mobile.reg.outboxLabel', { name: `${c.firstName} ${c.lastName}` }), payload: { core: c, answers, agentId: agent?.id }, createdAt: new Date().toISOString() });
      toast.success(t('mobile.reg.savedOffline'));
      navigate('/m');
      return;
    }
    const { farmer, flags } = registerFarmer(orgId, userId ?? 'system', c, form, answers, { agentId: agent?.id });
    toast.success(t('mobile.reg.saved', { name: `${farmer.firstName} ${farmer.lastName}`, code: farmer.farmerCode }), flags ? { description: t('people.farmer.flagsRaised', { count: flags }) } : undefined);
    navigate('/m');
  };

  const label = (text: string, req = true) => <span className="mb-1.5 block text-[15px] font-medium text-ink">{text}{req && <span className="text-danger"> *</span>}</span>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.reg.title', { farmer: terms.farmer.toLocaleLowerCase() })} back />
      <MobileFormRenderer
        form={form}
        answers={answers}
        onChange={setAnswers}
        finishLabel={online ? t('mobile.reg.save') : t('mobile.surveys.saveForSync')}
        onFinish={save}
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
        after={[{
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
