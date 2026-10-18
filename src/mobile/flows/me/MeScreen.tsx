import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/shared/Avatar';
import { CompanyLogo } from '@/components/shared/Logo';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { formatPhone } from '@/lib/format';
import { useCurrentOrg, useCurrentUser, useOrgSettings, useT } from '@/stores/hooks';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import type { Lang } from '@/types';

/** M2 Me: profile, wallet, language, company, device, app version, sign out. */
export function MeScreen() {
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const settings = useOrgSettings();
  const { agent, membership } = useMobileAgent();
  const { language, setLanguage, signOut } = useMobileSessionStore();
  const { t } = useT();
  if (!user) return null;
  const provider = settings.paymentProviders.find((p) => p.id === agent?.wallet.providerId);
  const rows: [string, React.ReactNode][] = [
    ['mobile.company', <span key="c" className="flex items-center gap-2"><CompanyLogo text={org.branding.logoText} color={org.branding.primaryColor} size={22} />{org.name}</span>],
    ...(agent ? ([['mobile.wallet', `${provider?.name ?? ''} · ${formatPhone(agent.wallet.number)}`]] as [string, React.ReactNode][]) : []),
    ['mobile.device', 'Android 14 · Tecno Spark 20'],
    ['mobile.appVersion', agent?.appVersion ?? '3.9.2'],
  ];
  const langs: Lang[] = ['en', 'fr'];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.meTitle')} />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-2">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} color={user.avatarColor} size={56} />
          <div>
            <div className="text-[19px] font-semibold text-ink">{user.name}</div>
            <div className="text-[14px] text-muted">{membership?.title}</div>
            <div className="text-[14px] text-muted">{formatPhone(user.phone)}</div>
          </div>
        </div>
        <dl className="divide-y divide-line rounded-card border border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 text-[15px]">
              <dt className="text-muted">{t(k)}</dt>
              <dd className="text-right text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <div className="eyebrow mb-2">{t('mobile.language')}</div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('mobile.language')}>
            {langs.map((l) => (
              <button key={l} type="button" aria-pressed={language === l} onClick={() => setLanguage(l)} className={`h-12 rounded-ctl border text-[15px] font-semibold uppercase ${language === l ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-line p-4">
        <Button size="lg" variant="secondary" className="w-full" onClick={signOut}>
          <LogOut /> {t('mobile.signOut')}
        </Button>
      </div>
    </div>
  );
}
