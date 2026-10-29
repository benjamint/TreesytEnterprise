import { tilePath } from '@/mobile/flows/catalog';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CalendarRange, ChevronRight, Wallet } from 'lucide-react';
import { CompanyLogo } from '@/components/shared/Logo';
import { Avatar } from '@/components/shared/Avatar';
import { useCurrentOrg, useCurrentUser, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { useBuyingStore } from '@/stores/buyingStore';
import { useQualityStore } from '@/stores/qualityStore';
import { agentCashHeld } from '@/stores/selectors';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { SyncBar, OfflineBanner } from '@/mobile/layout/SyncBar';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { useInventory } from '@/web/features/inventory/shared';
import { useMyWarehouse } from '@/mobile/flows/warehouse/WarehouseScreens';

/** M2 Home (phase 1 version): greeting, sync status, cash held, plan, alerts, quick actions. */
export function HomeScreen() {
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const { agent, membership, tiles } = useMobileAgent();
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const navigate = useNavigate();
  const tasks = useQualityStore((s) => s.tasks);
  const fixCount = useMemo(() => tasks.filter((x) => x.agentId === agent?.id && x.status === 'OPEN').length, [tasks, agent?.id]);
  const f = useFormat();
  const { t } = useT();
  const cash = useMemo(() => (agent ? agentCashHeld(agent.id, requests, purchases) : 0), [agent, requests, purchases]);
  const alerts = useMemo(
    () =>
      agent
        ? requests
            .filter((r) => r.agentId === agent.id && (((r.status === 'FULL_DISBURSEMENT' || r.status === 'PARTIAL_DISBURSEMENT') && !r.fundsReceived) || r.status === 'NOT_APPROVED'))
            .slice(0, 3)
            .map((r) => ({ id: r.id, to: `/m/buying/requests/${r.id}`, text: t(r.status === 'NOT_APPROVED' ? 'mobile.alertRejected' : 'mobile.alertConfirmFunds', { number: r.number }) }))
        : [],
    [agent, requests, t],
  );
  // Produce lost on the way to the warehouse that the agent still has to pay back (PRD H2).
  const inbounds = useOrgRows(useWarehouseStore((s) => s.inbounds));
  const repayments = useOrgRows(useWarehouseStore((s) => s.agentRepayments));
  const owed = useMemo(() => (agent ? inbounds.filter((x) => x.agentId === agent.id && x.source.kind === 'PRE' && ['DISCREPANCY', 'NEEDS_RESOLUTION'].includes(x.status) && !repayments.some((r) => r.inboundId === x.id && r.status === 'SUBMITTED')) : []), [agent, inbounds, repayments]);
  const officer = agent && (agent.agentTypeId === 'at_wh' || agent.agentTypeId === 'at_mag');
  // Workshops the agent facilitates today (PRD M2 alerts), unless already recorded on this phone.
  const workshops = useOrgRows(useTrainingStore((s) => s.workshops));
  const outbox = useOutboxStore((s) => s.items);
  const todayIso = new Date().toISOString().slice(0, 10);
  const wsToday = agent ? workshops.filter((w) => w.agentId === agent.id && w.status === 'PLANNED' && w.date === todayIso && !outbox.some((i) => i.type === 'workshop' && (i.payload as { workshopId: string }).workshopId === w.id)) : [];
  const allAlerts = [...wsToday.map((w) => ({ id: w.id, to: `/m/workshops/${w.id}`, text: t('mobile.m10.todayAlert', { title: w.title, location: w.location }) })), ...owed.map((x) => ({ id: x.id, to: `/m/warehouse/repay/${x.id}`, text: t('mobile.m8.owedAlert', { number: x.number }) })), ...alerts];
  if (!user) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OfflineBanner />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-5 pb-6 pt-3">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CompanyLogo text={org.branding.logoText} color={org.branding.primaryColor} size={28} />
              <span className="text-[14px] font-semibold text-ink">{org.name}</span>
            </div>
            <Avatar name={user.name} color={user.avatarColor} size={36} />
          </div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em]">{t('mobile.greeting', { name: user.name.split(' ')[0] })}</h1>
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
            <div className="relative w-full overflow-hidden rounded-[22px] bg-badge-dark p-5 text-left text-white shadow-[0_20px_40px_-20px_rgba(15,42,32,0.75)]">
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgb(var(--brand)/0.95),transparent_62%)]" aria-hidden="true" /><span className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full border border-white/10" aria-hidden="true" /><span className="pointer-events-none absolute -bottom-6 -right-20 h-44 w-44 rounded-full border border-white/[0.07]" aria-hidden="true" /><span className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-lime/25 blur-2xl" aria-hidden="true" />
              <div className="relative flex items-center justify-between">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/75">{t('mobile.cashHeld')}</div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15"><Wallet className="h-4 w-4 text-lime" aria-hidden="true" /></span>
              </div>
              <div className="tnum relative mt-3 text-[32px] font-semibold leading-none tracking-[-0.03em]">{f.money(cash)}</div>
            </div>
          )}

          {officer && <WarehouseCard />}

          <section className="flex items-start gap-3.5 rounded-[20px] border border-line bg-surface p-4 shadow-soft">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft"><CalendarRange className="h-5 w-5 text-brand" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">{t('mobile.thisWeek')}</h2>
              <p className="mt-0.5 text-[14px] leading-snug text-muted">{t('mobile.planComing')}</p>
            </div>
          </section>

          <section>
            <h2 className="eyebrow mb-2">{t('mobile.alerts')}</h2>
            {fixCount > 0 && (
              <button type="button" onClick={() => navigate('/m/tasks')} className="mb-2 flex w-full items-center gap-3 rounded-[16px] border border-warning/15 bg-warning/[0.07] px-4 py-3 text-left text-[14px] text-ink active:bg-warning/15">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15"><AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" /></span>
                <span className="flex-1">{t('mobile.fix.alert', { count: fixCount })}</span>
                <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
              </button>
            )}
            {allAlerts.length === 0 && fixCount === 0 ? (
              <p className="text-[14px] text-muted">{t('mobile.noAlerts')}</p>
            ) : (
              <ul className="space-y-2">
                {allAlerts.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => navigate(a.to)} className="flex w-full items-center gap-3 rounded-[16px] border border-warning/15 bg-warning/[0.07] px-4 py-3 text-left text-[14px] leading-snug text-ink active:bg-warning/15">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15"><AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" /></span>
                      <span className="flex-1">{a.text}</span>
                      <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="eyebrow mb-2">{t('mobile.quickActions')}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface shadow-soft">
              {tiles.slice(0, 4).map((tile) => (
                <li key={tile.key}>
                  <button type="button" onClick={() => navigate(tilePath(tile))} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 text-left active:bg-brand-soft">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-soft"><tile.icon className="h-[18px] w-[18px] text-brand" aria-hidden="true" /></span>
                    <span className="flex-1 font-medium text-ink">{t(`mobile.tile.${tile.key}`)}</span>
                    <ChevronRight className="h-5 w-5 text-muted/70" aria-hidden="true" />
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

/** Warehouse officer: stock and deliveries expected today (PRD M8 home). */
function WarehouseCard() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const inv = useInventory();
  const wh = useMyWarehouse();
  const inbounds = useOrgRows(useWarehouseStore((s) => s.inbounds));
  if (!wh) return null;
  const expected = inbounds.filter((x) => x.warehouseId === wh.id && x.status === 'PENDING');
  return (
    <button type="button" onClick={() => navigate('/m/warehouse')} className="relative w-full overflow-hidden rounded-[22px] bg-badge-dark p-5 text-left text-white shadow-[0_20px_40px_-20px_rgba(15,42,32,0.75)]">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgb(var(--brand)/0.95),transparent_62%)]" aria-hidden="true" /><span className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full border border-white/10" aria-hidden="true" /><span className="pointer-events-none absolute -bottom-6 -right-20 h-44 w-44 rounded-full border border-white/[0.07]" aria-hidden="true" /><span className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-lime/25 blur-2xl" aria-hidden="true" />
      <div className="relative text-[12px] font-semibold uppercase tracking-[0.08em] text-white/75">{wh.name}</div>
      <div className="tnum relative mt-3 text-[32px] font-semibold leading-none tracking-[-0.03em]">{f.kg(inv.stockKg(wh.id))}</div>
      <div className="relative mt-3 flex items-center justify-between text-[14px] text-white/85"><span>{t('mobile.m8.expectedN', { count: expected.length })}</span><ChevronRight className="h-5 w-5" aria-hidden="true" /></div>
    </button>
  );
}
