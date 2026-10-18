import { useState } from 'react';
import { Landscape } from '@/components/shared/Landscape';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { comingSoon } from '@/components/shared/coming-soon';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { COUNTRIES } from '@/data/catalogs/countries';
import { useT } from '@/stores/hooks';

/**
 * Mobile sign-in (M1 shape): phone number with the country prefix. The full phone + code flow
 * arrives in phase 9; until then field users sign in from the Demo panel.
 */
export function MobileSignIn() {
  const [country, setCountry] = useState('GH');
  const [phone, setPhone] = useState('');
  const { t } = useT();
  const dial = COUNTRIES.find((c) => c.code === country)?.dialCode ?? '';
  useDemoNotes([{ id: 'm1', key: 'demo.note.mobileSignIn' }]);
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[300px] shrink-0 overflow-hidden">
        <Landscape />
        <div className="absolute left-5 top-6 flex items-center gap-2 rounded-full bg-white/80 py-1.5 pl-1.5 pr-3 backdrop-blur">
          <LogoBadge size={30} />
          <Wordmark className="text-[17px]" />
        </div>
      </div>
      <div className="-mt-6 flex-1 overflow-y-auto rounded-t-panel bg-surface px-6 pb-8 pt-7">
        <h1 className="text-[26px]">{t('mobile.signInTitle')}</h1>
        <p className="mt-2 text-[15px] text-muted">{t('mobile.signInBody')}</p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            comingSoon();
          }}
        >
          <div>
            <Label htmlFor="m-phone">{t('demoForm.phone')}</Label>
            <div className="flex gap-2">
              <select aria-label={t('signup.country')} value={country} onChange={(e) => setCountry(e.target.value)} className="h-14 w-28 rounded-ctl border border-line bg-surface px-3 text-[16px] text-ink">
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{`${c.code} ${c.dialCode}`}</option>
                ))}
              </select>
              <Input id="m-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={`${dial} …`} />
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full">{t('mobile.sendCode')}</Button>
        </form>
      </div>
    </div>
  );
}
