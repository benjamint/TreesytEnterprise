import { useMemo, useState } from 'react';
import { ArrowLeftRight, CircleHelp, Lock, LogOut } from 'lucide-react';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { DownloadData } from '@/mobile/flows/auth/DownloadData';
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
  const { language, setLanguage, signOut, lock, pin, signIn } = useMobileSessionStore();
  const { t } = useT();
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const orgs = usePlatformStore((s) => s.orgs);
  const [switching, setSwitching] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const others = useMemo(() => {
    const ids = memberships.filter((m) => m.userId === user?.id && m.orgId !== org.id && m.status === 'ACTIVE' && roles.some((r) => m.roleIds.includes(r.id) && r.mobile)).map((m) => m.orgId);
    return orgs.filter((o) => ids.includes(o.id));
  }, [memberships, roles, orgs, user?.id, org.id]);
  if (!user) return null;
  if (switching) return <DownloadData orgId={switching} onDone={() => { signIn(user.id, switching, user.language); setSwitching(null); }} />;
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
        {others.length > 0 && (
          <div>
            <div className="eyebrow mb-2">{t('mobile.me.switchCompany')}</div>
            <ul className="space-y-2">
              {others.map((o) => (
                <li key={o.id}><button type="button" onClick={() => setSwitching(o.id)} className="flex min-h-[56px] w-full items-center gap-3 rounded-card border border-line px-4 text-left active:bg-brand-soft"><CompanyLogo text={o.branding.logoText} color={o.branding.primaryColor} size={28} /><span className="flex-1 font-medium text-ink">{o.name}</span><ArrowLeftRight className="h-4 w-4 text-muted" /></button></li>
              ))}
            </ul>
            <p className="mt-1.5 text-[12px] text-muted">{t('mobile.me.switchHint')}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" disabled={!pin} onClick={lock}><Lock /> {t('mobile.me.lock')}</Button>
          <Button variant="secondary" size="lg" onClick={() => setHelp(!help)} aria-expanded={help}><CircleHelp /> {t('mobile.me.help')}</Button>
        </div>
        {help && (
          <ul className="space-y-2 rounded-card bg-canvas p-4 text-[14px] text-body">
            {['offline', 'sync', 'conflict', 'record'].map((k) => <li key={k}>{t(`mobile.me.tip.${k}`)}</li>)}
          </ul>
        )}
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
