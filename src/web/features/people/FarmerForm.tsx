import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Farmer } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { FormFields } from '@/components/forms/FormFields';
import { useLiveForm } from '@/services/formService';
import { validateAnswers } from '@/engines/forms';
import { ancestorAtLevel } from '@/engines/locations';
import { initialsOf } from '@/engines/numbering';
import { recheck } from '@/services/qualityService';
import { isValidPhone } from '@/lib/format';
import { uid } from '@/lib/utils';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLocationStore } from '@/stores/locationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActor, useCurrentOrg, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { Field } from './CommunityForm';
import { logActivity, useLookups } from './shared';

/** Phone typed locally ("024…") or internationally; stored as E.164 for the company's country. */
export function normalisePhone(raw: string, country: string): string {
  const v = raw.replace(/[\s-]/g, '');
  if (!v) return '';
  if (v.startsWith('+')) return v;
  const cc = country === 'CI' ? '225' : '233';
  if (v.startsWith('00')) return `+${v.slice(2)}`;
  if (v.startsWith(cc)) return `+${v}`;
  return `+${cc}${country === 'CI' ? v : v.replace(/^0/, '')}`;
}

const ageOf = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000);

/** Possible duplicates within the company: same phone or ID number (PRD C3). */
export function findDuplicates(farmers: Farmer[], phone: string, idNumber: string, selfId?: string): Farmer[] {
  return farmers.filter((f) => f.id !== selfId && ((phone && f.phone === phone) || (idNumber && String(f.customFields.idNumber ?? '') === idNumber)));
}

/** Register or edit a farmer on the web: core fields + the company's farmer profile form (PRD C3). */
export function FarmerForm({ open, onClose, farmer, onOpenFarmer }: { open: boolean; onClose: (savedId?: string) => void; farmer?: Farmer; onOpenFarmer?: (id: string) => void }) {
  const { orgId, userId } = useActor();
  const org = useCurrentOrg();
  const { t, terms } = useT();
  const settings = useOrgSettings();
  const lk = useLookups();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const form = useLiveForm('farmerProfile');
  const country = org.countries[0] ?? 'GH';
  const communities = useMemo(() => [...lk.communities].sort((a, b) => a.name.localeCompare(b.name)), [lk.communities]);
  const [firstName, setFirstName] = useState(farmer?.firstName ?? '');
  const [lastName, setLastName] = useState(farmer?.lastName ?? '');
  const [gender, setGender] = useState<Farmer['gender']>(farmer?.gender ?? 'F');
  const [dob, setDob] = useState(farmer?.dateOfBirth ?? '');
  const [phone, setPhone] = useState(farmer?.phone ?? '');
  const [communityId, setCommunityId] = useState(farmer?.communityId ?? communities[0]?.id ?? '');
  const [registeredAt, setRegisteredAt] = useState((farmer?.registeredAt ?? new Date().toISOString()).slice(0, 10));
  const [crop, setCrop] = useState(farmer?.primaryCrop ?? settings.commodities[0]?.id ?? '');
  const [answers, setAnswers] = useState<Record<string, unknown>>(farmer?.customFields ?? {});
  const [tried, setTried] = useState(false);
  const [dupOk, setDupOk] = useState(false);

  const e164 = normalisePhone(phone, country);
  const errs = {
    firstName: !firstName.trim() ? t('form.error.required') : undefined,
    lastName: !lastName.trim() ? t('form.error.required') : undefined,
    dob: !dob ? t('form.error.required') : undefined,
    phone: phone && !isValidPhone(e164, country) ? t('people.farmer.badPhone') : undefined,
    community: !communityId ? t('form.error.required') : undefined,
  };
  const formErrors = validateAnswers(form, answers);
  const dups = findDuplicates(farmers, phone ? e164 : '', String(answers.idNumber ?? '').trim(), farmer?.id);
  const lang = useActor().lang;

  const save = () => {
    setTried(true);
    if (Object.values(errs).some(Boolean) || formErrors.length) return;
    if (dups.length && !dupOk) return;
    const now = new Date().toISOString();
    const community = lk.communities.find((c) => c.id === communityId)!;
    const nodes = useLocationStore.getState().nodes;
    const region = ancestorAtLevel(nodes, community.locationNodeId, settings.locationLevels[0]!.id);
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const code = farmer?.farmerCode ?? useSettingsStore.getState().issueNumber(orgId, 'farmerId', { community: community.code, initials: initialsOf(name), region: region?.code ?? '', date: new Date() });
    const next: Farmer = {
      ...(farmer ?? {
        id: uid('far'), createdAt: now, createdBy: userId ?? 'system', agentId: community.agentIds[0] ?? lk.agents[0]?.id ?? '', score: 0, version: 0, qualityStatus: 'OK',
        identity: { photo: false, idCard: false, thumbprints: { left: false, right: false }, consent: null, nfcCard: null },
      }),
      orgId, updatedAt: now, farmerCode: code, firstName: firstName.trim(), lastName: lastName.trim(), gender, dateOfBirth: dob, phone: phone ? e164 : '',
      communityId, locationNodeId: community.locationNodeId, registeredAt: new Date(registeredAt).toISOString(), primaryCrop: crop, customFields: answers,
      version: (farmer?.version ?? 0) + 1,
    } as Farmer;
    useFarmerStore.getState().saveFarmer(next);
    if (farmer) {
      const changed = form.sections.flatMap((s) => s.questions).filter((q) => JSON.stringify(farmer.customFields[q.id]) !== JSON.stringify(answers[q.id])).map((q) => q.label[lang] ?? q.label.en ?? q.id);
      for (const [k, a, b] of [[t('people.farmer.firstName'), farmer.firstName, next.firstName], [t('people.farmer.lastName'), farmer.lastName, next.lastName], [t('people.phone'), farmer.phone, next.phone], [t('people.farmer.dob'), farmer.dateOfBirth, next.dateOfBirth], [terms.community, farmer.communityId, next.communityId]] as const) if (a !== b) changed.push(k);
      logActivity(orgId, 'farmer', next.id, 'farmer.updated', { version: next.version, fields: changed.join(', ') || '—' }, userId ?? 'system');
    } else logActivity(orgId, 'farmer', next.id, 'farmer.registered', { name, code }, userId ?? 'system');
    const raised = recheck(orgId, 'farmer', [next.id], 'WEB', userId ?? 'system');
    toast.success(t(farmer ? 'people.farmer.saved' : 'people.farmer.created', { name, code }), raised.length ? { description: t('people.farmer.flagsRaised', { count: raised.length }) } : undefined);
    onClose(next.id);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5">
          <SheetTitle className="text-xl font-semibold text-ink">{farmer ? t('people.farmer.edit', { name: `${farmer.firstName} ${farmer.lastName}` }) : t('people.farmer.new', { farmer: terms.farmer.toLocaleLowerCase() })}</SheetTitle>
          {farmer && <p className="mt-1 text-[13px] text-muted">{t('people.farmer.versionNote', { version: farmer.version + 1 })}</p>}
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {dups.length > 0 && (
            <div className="rounded-ctl border border-warning/40 bg-warning/10 px-4 py-3 text-[14px]" role="alert">
              <div className="flex items-start gap-2 font-medium text-ink"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {t('people.farmer.possibleDuplicate', { list: dups.slice(0, 3).map((d) => `${d.firstName} ${d.lastName} (${d.farmerCode})`).join(', ') })}</div>
              <div className="mt-2 flex flex-wrap gap-2 pl-6">
                {onOpenFarmer && <Button size="sm" variant="secondary" onClick={() => { onClose(); onOpenFarmer(dups[0]!.id); }}>{t('people.farmer.openExisting')}</Button>}
                <Button size="sm" variant={dupOk ? 'primary' : 'ghost'} onClick={() => setDupOk(!dupOk)}>{dupOk ? t('people.farmer.continuingAnyway') : t('people.farmer.continueAnyway')}</Button>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('people.farmer.firstName')} error={tried ? errs.firstName : undefined}><Input compact value={firstName} onChange={(e) => setFirstName(e.target.value)} aria-label={t('people.farmer.firstName')} /></Field>
            <Field label={t('people.farmer.lastName')} error={tried ? errs.lastName : undefined}><Input compact value={lastName} onChange={(e) => setLastName(e.target.value)} aria-label={t('people.farmer.lastName')} /></Field>
            <Field label={t('col.gender')}>
              <select value={gender} onChange={(e) => setGender(e.target.value as Farmer['gender'])} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink" aria-label={t('col.gender')}>
                {(['F', 'M'] as const).map((g) => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
              </select>
            </Field>
            <Field label={dob ? t('people.farmer.dobAge', { age: ageOf(dob) }) : t('people.farmer.dob')} error={tried ? errs.dob : undefined}><Input compact type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-label={t('people.farmer.dob')} /></Field>
            <Field label={t('people.phone')} error={errs.phone}><Input compact type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setDupOk(false); }} placeholder={country === 'CI' ? '07 01 23 45 67' : '024 123 4567'} aria-label={t('people.phone')} /></Field>
            <Field label={terms.community} error={tried ? errs.community : undefined}>
              <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink" aria-label={terms.community}>
                {communities.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}
              </select>
            </Field>
            <Field label={t('people.farmer.registered')}><Input compact type="date" value={registeredAt} onChange={(e) => setRegisteredAt(e.target.value)} aria-label={t('people.farmer.registered')} /></Field>
            <Field label={t('people.farmer.crop')}>
              <select value={crop} onChange={(e) => setCrop(e.target.value)} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink" aria-label={t('people.farmer.crop')}>
                {settings.commodities.map((c) => <option key={c.id} value={c.id}>{lk.commodity(c.id)}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <h3 className="mb-3 text-[15px] font-semibold text-ink">{t('people.profile')} <span className="text-[12px] font-normal text-muted">{form.name} · {t('set.forms.v', { n: form.version })}</span></h3>
            <FormFields form={form} answers={answers} onChange={(a) => { setAnswers(a); if (a.idNumber !== answers.idNumber) setDupOk(false); }} errors={tried ? formErrors : []} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          {tried && dups.length > 0 && !dupOk && <span className="mr-auto text-[13px] text-warning">{t('people.farmer.resolveDuplicate')}</span>}
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
