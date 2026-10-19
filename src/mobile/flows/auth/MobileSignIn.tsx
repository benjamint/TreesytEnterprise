import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Organisation } from '@/types';
import { Landscape } from '@/components/shared/Landscape';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { CompanyLogo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { COUNTRIES } from '@/data/catalogs/countries';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useDemoStore } from '@/stores/demoStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/stores/hooks';
import { DownloadData } from './DownloadData';

type Step = 'phone' | 'code' | 'company' | 'download' | 'pin';

const digits = (s: string) => s.replace(/\D/g, '');

/** M1 Sign in and setup: phone number → code → company → download data → PIN → home. */
export function MobileSignIn() {
  const { t } = useT();
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const orgs = usePlatformStore((s) => s.orgs);
  const [step, setStep] = useState<Step>('phone');
  const [country, setCountry] = useState('GH');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [orgId, setOrgId] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const dial = COUNTRIES.find((c) => c.code === country)?.dialCode ?? '';
  useDemoNotes([{ id: 'm1', key: 'demo.note.mobileSignIn' }]);

  const local = digits(phone).replace(/^0/, '');
  const user = useMemo(() => (local.length >= 8 ? users.find((u) => digits(u.phone).endsWith(local)) : undefined), [users, local]);
  // Companies where this person has a mobile role.
  const companies = useMemo<Organisation[]>(() => {
    if (!user) return [];
    const ids = memberships.filter((m) => m.userId === user.id && m.status === 'ACTIVE' && roles.some((r) => m.roleIds.includes(r.id) && r.mobile)).map((m) => m.orgId);
    return orgs.filter((o) => ids.includes(o.id));
  }, [user, memberships, roles, orgs]);
  const otpLength = useSettingsStore((s) => s.settings[companies[0]?.id ?? '']?.mobile.otpLength) ?? 6;

  const sendCode = () => {
    setError('');
    if (!user) { setError(t('mobile.m1.unknownPhone')); return; }
    if (!companies.length) { setError(t('mobile.m1.noMobileRole')); return; }
    const c = Array.from({ length: otpLength }, () => Math.floor(Math.random() * 10)).join('');
    setSent(c);
    useDemoStore.getState().pushCode({ label: 'mobileCode', to: user.phone, code: c });
    toast(t('mobile.m1.codeToast', { code: c }));
    setStep('code');
  };
  const checkCode = () => {
    if (code !== sent) { setError(t('mobile.m1.wrongCode')); return; }
    setError('');
    if (companies.length > 1) setStep('company');
    else { setOrgId(companies[0]!.id); setStep('download'); }
  };
  const finish = () => {
    if (!user) return;
    useMobileSessionStore.getState().setPin(pin);
    useMobileSessionStore.getState().signIn(user.id, orgId, user.language);
    toast.success(t('mobile.signedInToast', { name: user.name }));
  };

  const back = step !== 'phone' && step !== 'download' ? () => { setError(''); setStep(step === 'pin' ? 'download' : step === 'company' ? 'code' : 'phone'); } : undefined;

  if (step === 'download') return <DownloadData orgId={orgId} onDone={() => setStep('pin')} />;

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[240px] shrink-0 overflow-hidden">
        <Landscape />
        <div className="absolute left-5 top-6 flex items-center gap-2 rounded-full bg-white/80 py-1.5 pl-1.5 pr-3 backdrop-blur">
          <LogoBadge size={30} />
          <Wordmark className="text-[17px]" />
        </div>
      </div>
      <div className="-mt-6 flex-1 overflow-y-auto rounded-t-panel bg-surface px-6 pb-8 pt-7">
        {back && <button type="button" onClick={back} className="-ml-2 mb-2 flex h-10 items-center gap-1 rounded-full px-2 text-[14px] text-muted" aria-label={t('mobile.back')}><ArrowLeft className="h-4 w-4" /> {t('mobile.back')}</button>}
        {step === 'phone' && (
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
            <div>
              <h1 className="text-[26px]">{t('mobile.signInTitle')}</h1>
              <p className="mt-2 text-[15px] text-muted">{t('mobile.signInBody')}</p>
            </div>
            <div>
              <Label htmlFor="m-phone">{t('demoForm.phone')}</Label>
              <div className="flex gap-2">
                <select aria-label={t('signup.country')} value={country} onChange={(e) => setCountry(e.target.value)} className="h-14 w-28 rounded-ctl border border-line bg-surface px-3 text-[16px] text-ink">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{`${c.code} ${c.dialCode}`}</option>)}
                </select>
                <Input id="m-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={`${dial} …`} />
              </div>
              {error && <p className="mt-2 text-[14px] text-danger" role="alert">{error}</p>}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={local.length < 8}>{t('mobile.sendCode')}</Button>
          </form>
        )}
        {step === 'code' && (
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); checkCode(); }}>
            <div>
              <h1 className="text-[26px]">{t('mobile.m1.codeTitle')}</h1>
              <p className="mt-2 text-[15px] text-muted">{t('mobile.m1.codeBody', { phone: `${dial} ${phone}`, count: otpLength })}</p>
            </div>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={otpLength} value={code} onChange={(e) => setCode(digits(e.target.value))} className="h-16 text-center font-mono text-[28px] tracking-[0.4em]" aria-label={t('mobile.m1.code')} autoFocus />
            {error && <p className="text-[14px] text-danger" role="alert">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={code.length < otpLength}>{t('mobile.m1.verify')}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={sendCode}>{t('mobile.m1.resend')}</Button>
          </form>
        )}
        {step === 'company' && (
          <div className="space-y-4">
            <h1 className="text-[26px]">{t('mobile.m1.companyTitle')}</h1>
            <ul className="space-y-2">
              {companies.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => { setOrgId(o.id); setStep('download'); }} className="flex min-h-[64px] w-full items-center gap-3 rounded-card border border-line px-4 text-left active:bg-brand-soft">
                    <CompanyLogo text={o.branding.logoText} color={o.branding.primaryColor} size={36} />
                    <span className="flex-1"><span className="block font-semibold text-ink">{o.name}</span><span className="block text-[13px] text-muted">{o.countries.join(', ')}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {step === 'pin' && (
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); finish(); }}>
            <div>
              <h1 className="text-[26px]">{t('mobile.m1.pinTitle')}</h1>
              <p className="mt-2 text-[15px] text-muted">{t('mobile.m1.pinBody')}</p>
            </div>
            <PinField label={t('mobile.m1.pin')} value={pin} onChange={setPin} autoFocus />
            <PinField label={t('mobile.m1.pinAgain')} value={pin2} onChange={setPin2} />
            {pin2.length === 4 && pin !== pin2 && <p className="text-[14px] text-danger" role="alert">{t('mobile.m1.pinMismatch')}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={pin.length < 4 || pin !== pin2}><Check /> {t('mobile.m1.start')}</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function PinField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold uppercase tracking-[0.06em] text-label">{label}</span>
      <input type="password" inputMode="numeric" maxLength={4} value={value} onChange={(e) => onChange(digits(e.target.value))} autoFocus={autoFocus} aria-label={label} className={cn('h-14 w-full rounded-ctl border border-line bg-surface px-4 text-center font-mono text-[26px] tracking-[0.6em] text-ink focus-visible:border-brand focus-visible:outline-none')} />
    </label>
  );
}

/** Locks the app after inactivity; the PIN set at sign-in unlocks it (PRD M1). */
export function PinLock() {
  const { t } = useT();
  const { locked, pin: saved, unlock, signOut, lock } = useMobileSessionStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  // Lock after 5 minutes without a tap.
  useEffect(() => {
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    const id = window.setInterval(() => { if (Date.now() - last > 5 * 60_000) lock(); }, 15_000);
    return () => { window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); window.clearInterval(id); };
  }, [lock]);
  if (!locked) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-surface px-8" role="dialog" aria-modal="true" aria-label={t('mobile.m1.locked')}>
      <LogoBadge size={48} />
      <h1 className="text-center text-[22px]">{t('mobile.m1.locked')}</h1>
      <div className="w-full">
        <PinField label={t('mobile.m1.pin')} value={pin} onChange={(v) => { setPin(v); setError(false); if (v.length === 4) { if (v === saved) { unlock(); setPin(''); } else setError(true); } }} autoFocus />
        {error && <p className="mt-2 text-center text-[14px] text-danger" role="alert">{t('mobile.m1.wrongPin')}</p>}
      </div>
      <Button variant="ghost" onClick={signOut}>{t('mobile.m1.forgotPin')}</Button>
    </div>
  );
}
