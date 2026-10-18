import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CalendarRange, ChevronRight } from 'lucide-react';
import { CompanyLogo } from '@/components/shared/Logo';
import { Avatar } from '@/components/shared/Avatar';
import { useCurrentOrg, useCurrentUser, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { useBuyingStore } from '@/stores/buyingStore';
import { agentCashHeld } from '@/stores/selectors';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { SyncBar, OfflineBanner } from '@/mobile/layout/SyncBar';

/** M2 Home (phase 1 version): greeting, sync status, cash held, plan, alerts, quick actions. */
export function HomeScreen() {
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const { agent, membership, tiles } = useMobileAgent();
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const navigate = useNavigate();
  const f = useFormat();
  const { t } = useT();
  const cash = useMemo(() => (agent ? agentCashHeld(agent.id, requests, purchases) : 0), [agent, requests, purchases]);
  const alerts = useMemo(
    () =>
      agent
        ? requests
            .filter((r) => r.agentId === agent.id && (r.status === 'FULL_DISBURSEMENT' || r.status === 'PARTIAL_DISBURSEMENT' || r.status === 'NOT_APPROVED'))
            .slice(0, 3)
            .map((r) => ({ id: r.id, text: t(r.status === 'NOT_APPROVED' ? 'mobile.alertRejected' : 'mobile.alertConfirmFunds', { number: r.number }) }))
        : [],
    [agent, requests, t],
  );
  if (!user) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OfflineBanner />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="bg-gradient-to-b from-brand-soft to-surface px-5 pb-6 pt-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CompanyLogo text={org.branding.logoText} color={org.branding.primaryColor} size={28} />
              <span className="text-[14px] font-semibold text-ink">{org.name}</span>
            </div>
            <Avatar name={user.name} color={user.avatarColor} size={36} />
          </div>
          <h1 className="text-[28px] leading-tight">{t('mobile.greeting', { name: user.name.split(' ')[0] })}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {membership?.title}
            {agent ? ` · ${t('mobile.area', { count: agent.areaNodeIds.length })}` : ''}
          </p>
          <div className="mt-4">
            <SyncBar />
          </div>
        </div>

        <div className="space-y-4 px-5 pb-6">
          {agent && agent.agentTypeId !== 'at_wh' && agent.agentTypeId !== 'at_mag' && (
            <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft">
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{t('mobile.cashHeld')}</div>
              <div className="tnum mt-1 text-[30px] font-semibold tracking-[-0.02em]">{f.money(cash)}</div>
            </div>
          )}

          <section className="rounded-card border border-line p-5">
            <div className="mb-2 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2 className="text-[16px]">{t('mobile.thisWeek')}</h2>
            </div>
            <p className="text-[14px] text-muted">{t('mobile.planComing')}</p>
          </section>

          <section>
            <h2 className="eyebrow mb-2">{t('mobile.alerts')}</h2>
            {alerts.length === 0 ? (
              <p className="text-[14px] text-muted">{t('mobile.noAlerts')}</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-ctl bg-warning/10 px-4 py-3 text-[14px] text-ink">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="eyebrow mb-2">{t('mobile.quickActions')}</h2>
            <ul className="divide-y divide-line rounded-card border border-line">
              {tiles.slice(0, 4).map((tile) => (
                <li key={tile.key}>
                  <button type="button" onClick={() => navigate(`/m/flow/${tile.flow}`)} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left active:bg-brand-soft">
                    <tile.icon className="h-5 w-5 text-brand" aria-hidden="true" />
                    <span className="flex-1 font-medium text-ink">{t(`mobile.tile.${tile.key}`)}</span>
                    <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
