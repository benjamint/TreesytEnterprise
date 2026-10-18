import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, ClipboardList, Coins, Scale, ShoppingBasket, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Flag } from '@/components/shared/Flag';
import { usePageTour } from '@/components/shared/PageTour';
import { canAct, type WorkflowRecord } from '@/engines/workflow';
import { previewNumber } from '@/engines/numbering';
import { toMinor } from '@/engines/money';
import { formatDate } from '@/lib/format';
import { TOUR_EVENT } from '@/web/layout/HelpMenu';
import { useActor, useCurrentOrg, useCurrentUser, useFormat, useOrgRows, useOrgSettings, usePermissionPatterns, useT, useLang } from '@/stores/hooks';
import { useBuyingStore } from '@/stores/buyingStore';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';

const OPEN_EXCLUDED = new Set(['RECONCILED', 'NOT_APPROVED', 'ARCHIVED']);

/**
 * Phase 1 dashboard: KPI row and approval queue from the seeded data plus a "company facts" card
 * that makes company switching visible (currency, language, levels, providers, workflow, numbering).
 * The full widget dashboard arrives in phase 4.
 */
export function DashboardPage() {
  const org = useCurrentOrg();
  const user = useCurrentUser();
  const settings = useOrgSettings();
  const { userId } = useActor();
  const patterns = usePermissionPatterns();
  const memberships = useAccessStore((s) => s.memberships);
  const countries = usePlatformStore((s) => s.countries);
  const sequences = useSettingsStore((s) => s.sequences[org.id] ?? {});
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const expenses = useOrgRows(useBuyingStore((s) => s.expenses));
  const acs = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const navigate = useNavigate();
  const lang = useLang();
  const f = useFormat();
  const { t } = useT();
  const tour = usePageTour();
  const startTour = tour.start;
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, startTour);
    return () => window.removeEventListener(TOUR_EVENT, startTour);
  }, [startTour]);

  const kpis = useMemo(() => {
    const boughtBy = new Map<string, number>();
    for (const p of purchases) boughtBy.set(p.requestId, (boughtBy.get(p.requestId) ?? 0) + p.amount.amountMinor);
    let cash = 0;
    let gap = 0;
    for (const r of requests) {
      if (r.reconciliationStatus === 'RECONCILED') continue;
      const given = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
      const diff = given - (boughtBy.get(r.id) ?? 0);
      if (r.fundsReceived) cash += diff;
      if (given > 0) gap += Math.max(0, diff);
    }
    return {
      volume: purchases.reduce((s, p) => s + p.quantity, 0),
      spend: purchases.reduce((s, p) => s + p.amount.amountMinor, 0),
      farmersPaid: new Set(purchases.filter((p) => p.paymentStatus === 'PAID').map((p) => p.farmerId)).size,
      open: requests.filter((r) => !OPEN_EXCLUDED.has(r.status)).length,
      cash,
      gap,
    };
  }, [purchases, requests]);

  const queue = useMemo(() => {
    const m = memberships.find((x) => x.userId === userId && x.orgId === org.id);
    const me = { id: userId ?? '', roleIds: m?.roleIds ?? [], permissions: patterns };
    const wf = (d: string) => settings.workflows.find((w) => w.docType === d);
    const items: { id: string; type: string; number: string; status: string; total: number; createdAt: string; link: string }[] = [];
    const add = (rows: { id: string; number: string; status: string; total: { amountMinor: number }; createdAt: string }[], type: string, path: string) => {
      const def = wf(type);
      if (!def) return;
      for (const r of rows) if (canAct(r as unknown as WorkflowRecord, def, me)) items.push({ id: r.id, type, number: r.number, status: r.status, total: r.total.amountMinor, createdAt: r.createdAt, link: `${path}?open=${r.id}` });
    };
    add(requests, 'purchaseRequest', '/app/purchase-requests');
    add(expenses, 'preExpense', '/app/expenses');
    add(acs, 'aggregatorPurchase', '/app/aggregators');
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [memberships, userId, org.id, patterns, settings.workflows, requests, expenses, acs]);

  const country = countries.find((c) => c.code === org.countries[0]);
  const prWorkflow = settings.workflows.find((w) => w.docType === 'purchaseRequest');
  const prPattern = settings.numbering.find((p) => p.docType === 'purchaseRequest');
  const weekLabel = formatDate(new Date(2026, 0, org.weekStart === 0 ? 4 : org.weekStart === 6 ? 10 : 5), org.timezone, lang, 'EEEE');
  const risky = requests.find((r) => r.riskFlags.some((x) => x.severity === 'HIGH') && queue.some((q) => q.id === r.id));

  const facts: [string, React.ReactNode][] = [
    ['country', <span key="c" className="inline-flex items-center gap-2"><Flag code={org.countries[0]!} />{country?.name[lang] ?? org.countries[0]}</span>],
    ['currency', <span key="cur" className="tnum">{`${org.currency} · ${f.money(toMinor(1_234_567.5, org.currency))}`}</span>],
    ['language', org.language.toUpperCase()],
    ['timezone', org.timezone],
    ['localTime', f.dateTime(new Date())],
    ['weekStart', weekLabel],
    ['levels', settings.locationLevels.map((l) => l.label[lang] ?? l.label.en).join(' → ')],
    ['commodities', settings.commodities.map((c) => c.name[lang] ?? c.name.en).join(', ') || '—'],
    ['providers', settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY').map((p) => p.name).join(', ') || '—'],
    ['approval', prWorkflow ? prWorkflow.steps.map((s) => s.name + (s.condition ? ` (> ${f.money(Number(s.condition.value))})` : '')).join(' → ') : '—'],
    ['numbering', prPattern ? <span key="n" className="font-mono text-[13px]">{`${prPattern.pattern} → ${previewNumber(prPattern, sequences, { date: new Date() })}`}</span> : '—'],
  ];

  const isOperational = org.type !== 'BUYER' && org.type !== 'PLATFORM';

  return (
    <>
      {tour.element}
      <PageHeader
        eyebrow={t('dashboard.subtitle', { company: org.name })}
        title={t('dashboard.greeting', { name: user?.name.split(' ')[0] ?? '' })}
        description={t('pages.dashboard')}
        onTour={startTour}
        primary={
          <Button onClick={() => navigate('/app/ai')}>
            {t('nav.ai')} <ArrowRight />
          </Button>
        }
      />

      {isOperational && (
        <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" aria-label={t('nav.dashboard')}>
          <StatCard label={t('dashboard.kpi.volume')} value={f.kg(Math.round(kpis.volume))} icon={ShoppingBasket} onClick={() => navigate('/app/purchases')} />
          <StatCard label={t('dashboard.kpi.spend')} value={f.money(kpis.spend, { compact: true })} hint={f.money(kpis.spend)} icon={Banknote} onClick={() => navigate('/app/purchases')} />
          <StatCard label={t('dashboard.kpi.farmersPaid')} value={f.number(kpis.farmersPaid)} icon={Users} onClick={() => navigate('/app/farmers')} />
          <StatCard label={t('dashboard.kpi.openRequests')} value={f.number(kpis.open)} icon={ClipboardList} onClick={() => navigate('/app/purchase-requests')} />
          <StatCard label={t('dashboard.kpi.cashWithAgents')} value={f.money(kpis.cash, { compact: true })} hint={f.money(kpis.cash)} icon={Coins} onClick={() => navigate('/app/agents')} />
          <StatCard label={t('dashboard.kpi.reconGap')} value={f.money(kpis.gap, { compact: true })} hint={f.money(kpis.gap)} icon={Scale} onClick={() => navigate('/app/reconciliation')} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>{t('dashboard.approvals')}</CardTitle>
              <p className="mt-1 text-[14px] text-muted">{queue.length ? t('dashboard.approvalsCount', { count: queue.length }) : t('dashboard.approvalsEmpty')}</p>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {risky && (
              <div className="mb-4 flex items-start gap-3 rounded-ctl border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('notification.riskHigh', { number: risky.number, pct: risky.variancePct })}</span>
              </div>
            )}
            <ul className="divide-y divide-line">
              {queue.slice(0, 8).map((q) => (
                <li key={q.id}>
                  <Link to={q.link} className="flex items-center gap-4 rounded-ctl px-2 py-3 transition-colors hover:bg-brand-soft/50">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[13px] font-medium text-ink">{q.number}</span>
                      <span className="block text-[13px] text-muted">{t(`docType.${q.type}`)}</span>
                    </span>
                    <StatusBadge status={q.status} />
                    <span className="tnum w-36 text-right font-medium text-ink">{f.money(q.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.facts')}</CardTitle>
            <Badge tone="brand">{t(`orgType.${org.type}`)}</Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="divide-y divide-line">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[150px_1fr] gap-3 py-2.5 text-[14px]">
                  <dt className="eyebrow pt-0.5">{t(`dashboard.fact.${k}`)}</dt>
                  <dd className="min-w-0 text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-dashed shadow-none">
        <CardContent className="flex flex-col gap-1 py-5">
          <span className="eyebrow">{t('dashboard.previewTitle')}</span>
          <p className="text-[14px] text-muted">{t('dashboard.previewBody')}</p>
        </CardContent>
      </Card>
    </>
  );
}
