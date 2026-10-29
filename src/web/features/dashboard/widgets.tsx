import { createContext, useContext, useMemo, useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Check, ChevronRight, ClipboardList, Clock, Coins, Database, FileText, HelpCircle, Package, Pause, Receipt, Scale, ShieldAlert, ShoppingBasket, Store, Truck, Users, Wallet, X, XCircle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { ModuleKey } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { HBars, Donut, Meter, Sparkline, StackedColumns, seriesColor } from '@/components/charts/charts';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/web/features/settings/kit';
import { act } from '@/services/workflowService';
import { useActivityStore } from '@/stores/activityStore';
import { useAccessStore } from '@/stores/accessStore';
import { useActor, useFormat, useLang, useOrgRows, useT } from '@/stores/hooks';
import type { WidgetSize } from '@/stores/dashboardStore';
import type { DashboardData, QueueItem } from './useDashboardData';
import { FieldMap } from './FieldMap';

export const DataContext = createContext<DashboardData | null>(null);
const useData = () => useContext(DataContext)!;

export interface WidgetDef {
  id: string;
  module?: ModuleKey;
  permission: string;
  sizes: WidgetSize[];
  component: ComponentType;
  /** Shown only when the company does buying-type work (hides on buyer workspaces). */
  operational?: boolean;
  /** Renders without the card frame and title (outside edit mode). */
  bare?: boolean;
  /** Hides the one-line description under the title (the widget shows its own summary). */
  noDesc?: boolean;
}

// ------------------------------------------------------------------ KPI row


function KpiRow() {
  const { kpis, charts } = useData();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const items: { key: string; value: string; hint?: string; icon: LucideIcon; to: string; trend?: number[] }[] = [
    { key: 'volume', value: f.kg(Math.round(kpis.volume)), icon: ShoppingBasket, to: '/app/purchases', trend: charts.trend.volume },
    { key: 'spend', value: f.money(kpis.spend, { compact: true }), hint: f.money(kpis.spend), icon: Banknote, to: '/app/purchases', trend: charts.trend.spend },
    { key: 'farmersPaid', value: f.number(kpis.farmersPaid), icon: Users, to: '/app/farmers', trend: charts.trend.farmersPaid },
    { key: 'openRequests', value: f.number(kpis.openRequests), icon: ClipboardList, to: '/app/purchase-requests' },
    { key: 'cashWithAgents', value: f.money(kpis.cashWithAgents, { compact: true }), hint: f.money(kpis.cashWithAgents), icon: Coins, to: '/app/reconciliation' },
    { key: 'reconGap', value: f.money(kpis.reconGap, { compact: true }), hint: f.money(kpis.reconGap), icon: Scale, to: '/app/reconciliation' },
  ];
  const change = (v: number[]) => {
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const last = sum(v.slice(-4));
    const prev = sum(v.slice(-8, -4));
    return prev > 0 ? (last - prev) / prev : null;
  };
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line shadow-soft sm:grid-cols-2 xl:grid-cols-3" data-tour="stat">
      {items.map((k) => {
        const pct = k.trend ? change(k.trend) : null;
        const up = (pct ?? 0) >= 0;
        return (
          <button key={k.key} type="button" onClick={() => navigate(k.to)} className="group flex min-h-[148px] flex-col bg-surface p-5 text-left transition-colors hover:bg-subtle focus-visible:relative lg:p-6">
            <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
              <k.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`dashboard.kpi.${k.key}`)}
              <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </span>
            <span className="mt-3 flex items-end justify-between gap-4">
              <span className="min-w-0">
                <span className="tnum block text-[28px] font-semibold leading-none tracking-[-0.03em] text-ink">{k.value}</span>
                <span className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
                  {pct != null ? (
                    <>
                      <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-medium', up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')} aria-label={t(up ? 'dashboard.kpiUp' : 'dashboard.kpiDown', { pct: f.number(Math.abs(pct), { style: 'percent', maximumFractionDigits: 1 }) })}>
                        {up ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
                        {f.number(Math.abs(pct), { style: 'percent', maximumFractionDigits: 1 })}
                      </span>
                      {t('dashboard.kpiVs')}
                    </>
                  ) : k.hint ? <span className="tnum">{k.hint}</span> : <span aria-hidden="true">&nbsp;</span>}
                </span>
              </span>
              {k.trend && <Sparkline values={k.trend} className="mb-0.5 w-24 shrink-0" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ My approvals

const DOC_ICON: Partial<Record<string, LucideIcon>> = {
  purchaseRequest: ClipboardList, preExpense: Receipt, aggregatorPurchase: Store, aggregatorExpense: Receipt,
  supportRequest: Package, warehouseExpense: Receipt, dispatchOrder: Truck,
};

function Approvals() {
  const { queue } = useData();
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const [reason, setReason] = useState<{ item: QueueItem; action: 'REJECT' | 'HOLD' } | null>(null);
  const [comment, setComment] = useState('');
  const [all, setAll] = useState(false);
  const navigate = useNavigate();
  const shown = all ? queue : queue.slice(0, 6);

  const run = (item: QueueItem, action: 'APPROVE' | 'REJECT' | 'HOLD', note?: string) => {
    // Support approvals set amounts and providers per service, so they open the request instead.
    if (item.docType === 'supportRequest' && action === 'APPROVE') { navigate(`${item.link}&approve=1`); return; }
    const res = act(orgId, item.docType, item.id, action, userId ?? '', note);
    if (res.ok) toast.success(t(`dashboard.acted.${action}`, { number: item.number }), { description: t('dashboard.actedStatus', { status: t(`status.${res.status}`, { defaultValue: res.status }) }) });
    else if (res.reason === 'reasonRequired') setReason({ item, action: action as 'REJECT' | 'HOLD' });
    else toast.error(t(`dashboard.blocked.${res.reason}`, { defaultValue: t('dashboard.blocked.notAllowed') }));
  };

  if (!queue.length) return <p className="py-10 text-center text-[13px] text-muted">{t('dashboard.approvalsEmptyBody')}</p>;
  return (
    <>
      <p className="-mt-3 mb-4 text-[13px] text-muted">{t('dashboard.approvalsCount', { count: queue.length })}</p>
      <ul className="-mx-2">
        {shown.map((q) => {
          const Icon = DOC_ICON[q.docType] ?? FileText;
          return (
            <li key={`${q.docType}:${q.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ctl px-2 py-2.5 transition-colors hover:bg-subtle">
              <Link to={q.link} className="flex min-w-0 flex-1 items-center gap-3 rounded-chip">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-line bg-surface text-muted shadow-xs"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-medium text-ink group-hover:text-brand">{q.number}</span>
                    {q.risk === 'HIGH' && <Badge tone="danger"><AlertTriangle className="h-3 w-3" /> {t('risk.HIGH')}</Badge>}
                  </span>
                  <span className="block truncate text-[12px] text-muted">{t(`docType.${q.docType}`)} · {q.by} · {f.relative(q.createdAt)}</span>
                </span>
              </Link>
              <StatusBadge status={q.status} />
              <span className="tnum w-28 text-right text-[14px] font-semibold text-ink">{q.kg != null ? f.kg(Math.round(q.kg)) : f.money(q.total)}</span>
              <span className="flex items-center rounded-ctl border border-line bg-surface p-0.5 shadow-xs">
                <Tip label={t('dashboard.approve')}><Button size="iconSm" variant="ghost" className="text-success hover:bg-success/10 hover:text-success" onClick={() => run(q, 'APPROVE')} aria-label={`${t('dashboard.approve')} ${q.number}`}><Check /></Button></Tip>
                <Tip label={t('dashboard.hold')}><Button size="iconSm" variant="ghost" onClick={() => run(q, 'HOLD')} aria-label={`${t('dashboard.hold')} ${q.number}`}><Pause /></Button></Tip>
                <Tip label={t('dashboard.reject')}><Button size="iconSm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => run(q, 'REJECT')} aria-label={`${t('dashboard.reject')} ${q.number}`}><X /></Button></Tip>
              </span>
            </li>
          );
        })}
      </ul>
      {queue.length > shown.length && <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setAll(true)}>{t('ai.showAll', { count: queue.length })}</Button>}
      <ConfirmDialog
        open={!!reason}
        onOpenChange={(o) => { if (!o) { setReason(null); setComment(''); } }}
        title={reason ? t(`dashboard.reasonTitle.${reason.action}`, { number: reason.item.number }) : ''}
        body={t('dashboard.reasonBody')}
        confirm={reason ? t(`dashboard.${reason.action === 'REJECT' ? 'reject' : 'hold'}`) : ''}
        danger={reason?.action === 'REJECT'}
        onConfirm={() => {
          if (!reason || !comment.trim()) return;
          run(reason.item, reason.action, comment.trim());
          setReason(null);
          setComment('');
        }}
      >
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} autoFocus aria-label={t('dashboard.reason')} placeholder={t('dashboard.reasonPlaceholder')} className="w-full rounded-ctl border border-line bg-surface p-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" />
      </ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------ Charts

function PurchasesByWeek() {
  const { charts, settings } = useData();
  const lang = useLang();
  const f = useFormat();
  const { t } = useT();
  const ranked = [...charts.commodityTotals].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const shown = ranked.slice(0, 4);
  const other = ranked.length > 4;
  const series = [
    ...shown.map((id) => {
      const c = settings.commodities.find((x) => x.id === id);
      return { key: id, label: c ? c.name[lang] ?? c.name.en ?? c.code : id, index: charts.commodityIndex.get(id) ?? 7 };
    }),
    ...(other ? [{ key: 'other', label: t('chart.other'), index: -1 }] : []),
  ];
  const data = charts.weeks.map((w) => {
    const row: Record<string, number | string> = { label: f.date(new Date(w.week!), 'd MMM') };
    for (const id of shown) row[id] = Math.round(w[id] ?? 0);
    if (other) row.other = Math.round(ranked.slice(4).reduce((s, id) => s + (w[id] ?? 0), 0));
    return row;
  });
  if (!ranked.length) return <Empty />;
  return <StackedColumns data={data} series={series} format={(v) => f.kg(v)} axisFormat={(v) => f.number(v, { notation: 'compact' })} />;
}

function VolumeByCommodity() {
  const { charts, settings } = useData();
  const lang = useLang();
  const f = useFormat();
  const { t } = useT();
  const ranked = [...charts.commodityTotals].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return <Empty />;
  const head = ranked.slice(0, 5).map(([id, kg]) => {
    const c = settings.commodities.find((x) => x.id === id);
    return { label: c ? c.name[lang] ?? c.name.en ?? c.code : id, value: Math.round(kg), index: charts.commodityIndex.get(id) ?? 7 };
  });
  const rest = ranked.slice(5).reduce((s, [, kg]) => s + kg, 0);
  const data = rest ? [...head, { label: t('chart.other'), value: Math.round(rest), index: -1 }] : head;
  const total = data.reduce((s, d) => s + d.value, 0);
  return <Donut data={data} format={(v) => f.kg(v)} center={<><span className="tnum text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">{f.number(Math.round(total / 1000))}</span><span className="mt-1 text-[11px] text-muted">{t('chart.tonnes')}</span></>} />;
}

function TopCommunities() {
  const { charts } = useData();
  const f = useFormat();
  return charts.topCommunities.length ? <HBars data={charts.topCommunities} format={(v) => f.kg(v)} /> : <Empty />;
}

function PayoutsByProvider() {
  const { charts } = useData();
  const f = useFormat();
  return charts.payoutsByProvider.length ? <HBars data={charts.payoutsByProvider} format={(v) => f.money(v, { compact: true })} /> : <Empty />;
}

function StockByWarehouse() {
  const { charts } = useData();
  const f = useFormat();
  return charts.stockByWarehouse.some((d) => d.value) ? <HBars data={charts.stockByWarehouse} format={(v) => f.kg(v)} /> : <Empty />;
}

function RecoveryProgress() {
  const { charts } = useData();
  const f = useFormat();
  const { t } = useT();
  const r = charts.recovery;
  if (!r.loans) return <Empty />;
  return <Meter value={r.repaid} max={r.principal} label={t('dashboard.recovered')} detail={t('dashboard.recoveryDetail', { repaid: f.money(r.repaid), principal: f.money(r.principal), loans: r.loans, settled: r.settled })} />;
}

function Alerts() {
  const { alerts } = useData();
  const { t } = useT();
  const items = [
    alerts.risky.length && { tone: 'danger', key: 'risky', count: alerts.risky.length, to: '/app/purchase-requests' },
    alerts.failed.length && { tone: 'danger', key: 'failed', count: alerts.failed.length, to: '/app/payments' },
    alerts.unknown.length && { tone: 'unknown', key: 'unknown', count: alerts.unknown.length, to: '/app/payments' },
    alerts.lowWallets.length && { tone: 'warning', key: 'lowWallets', count: alerts.lowWallets.length, to: '/app/payments/wallets', name: alerts.lowWallets[0]!.name },
    alerts.overdueLoans.length && { tone: 'warning', key: 'overdueLoans', count: alerts.overdueLoans.length, to: '/app/recovery' },
    alerts.flaggedFarmers && { tone: 'info', key: 'flagged', count: alerts.flaggedFarmers, to: '/app/data-quality' },
  ].filter(Boolean) as { tone: 'danger' | 'warning' | 'info' | 'unknown'; key: string; count: number; to: string; name?: string }[];
  if (!items.length) return <p className="py-8 text-center text-[13px] text-muted">{t('dashboard.alertsNone')}</p>;
  const tone = { danger: 'bg-danger/10 text-danger', warning: 'bg-warning/10 text-warning', info: 'bg-info/10 text-info', unknown: 'bg-unknown/10 text-unknown' };
  const icon: Record<string, LucideIcon> = { risky: AlertTriangle, failed: XCircle, unknown: HelpCircle, lowWallets: Wallet, overdueLoans: Clock, flagged: ShieldAlert };
  return (
    <ul className="-mx-2 space-y-0.5">
      {items.map((i) => {
        const Icon = icon[i.key] ?? AlertTriangle;
        return (
          <li key={i.key}>
            <Link to={i.to} className="group flex items-center gap-3 rounded-ctl px-2 py-2 transition-colors hover:bg-subtle">
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl', tone[i.tone])}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{t(`dashboard.alert.${i.key}`, { count: i.count, name: i.name })}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted/60 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function WalletBalances() {
  const { wallets, settings } = useData();
  const f = useFormat();
  const { t } = useT();
  if (!wallets.length) return <Empty />;
  return (
    <ul className="divide-y divide-line">
      {wallets.map((w, i) => {
        const low = w.balance.amountMinor < w.lowBalanceThreshold.amountMinor;
        return (
          <li key={w.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-line bg-surface shadow-xs" aria-hidden="true"><Wallet className="h-4 w-4" style={{ color: seriesColor(i) }} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{w.name}</span>
              <span className="block text-[12px] text-muted">{settings.paymentProviders.find((p) => p.id === w.providerId)?.name}</span>
            </span>
            {low && <Badge tone="warning">{t('dashboard.lowBalance')}</Badge>}
            <span className="tnum text-[14px] font-semibold text-ink">{f.money(w.balance)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function RecentActivity() {
  const all = useActivityStore((s) => s.activity);
  const rows = useOrgRows(all);
  const users = useAccessStore((s) => s.users);
  const { t } = useT();
  const f = useFormat();
  const recent = useMemo(() => [...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8), [rows]);
  if (!recent.length) return <Empty />;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
      {recent.map((e) => (
        <li key={e.id} className="relative pl-6 text-[13px]">
          <span className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-surface bg-line-strong" aria-hidden="true" />
          <span className="leading-snug text-ink">{t(`activity.${e.key}`, e.params)}</span>
          <span className="mt-0.5 block text-[12px] text-muted">{users.find((u) => u.id === e.actorId)?.name ?? t('dashboard.system')} · {f.relative(e.at)}</span>
        </li>
      ))}
    </ol>
  );
}

function Empty() {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-[13px] text-muted">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-canvas"><Database className="h-4 w-4" aria-hidden="true" /></span>
      {t('dashboard.noData')}
    </div>
  );
}

// ------------------------------------------------------------------ Registry

export const WIDGETS: WidgetDef[] = [
  { id: 'kpis', module: 'buying', permission: 'purchases.view', sizes: ['full'], component: KpiRow, operational: true, bare: true },
  { id: 'approvals', permission: 'dashboard.view', sizes: ['half', 'twoThirds', 'full'], component: Approvals, noDesc: true },
  { id: 'alerts', permission: 'dashboard.view', sizes: ['third', 'half'], component: Alerts },
  { id: 'purchasesByWeek', module: 'buying', permission: 'purchases.view', sizes: ['half', 'twoThirds', 'full'], component: PurchasesByWeek },
  { id: 'volumeByCommodity', module: 'buying', permission: 'purchases.view', sizes: ['third', 'half'], component: VolumeByCommodity },
  { id: 'topCommunities', module: 'buying', permission: 'purchases.view', sizes: ['third', 'half'], component: TopCommunities },
  { id: 'payoutsByProvider', module: 'payments', permission: 'payments.view', sizes: ['third', 'half'], component: PayoutsByProvider },
  { id: 'recoveryProgress', module: 'recovery', permission: 'recovery.view', sizes: ['third', 'half'], component: RecoveryProgress },
  { id: 'stockByWarehouse', module: 'inventory', permission: 'warehouses.view', sizes: ['third', 'half'], component: StockByWarehouse },
  { id: 'map', module: 'farmers', permission: 'communities.view', sizes: ['half', 'twoThirds', 'full'], component: FieldMap },
  { id: 'wallets', module: 'payments', permission: 'wallets.view', sizes: ['third', 'half'], component: WalletBalances },
  { id: 'activity', permission: 'dashboard.view', sizes: ['third', 'half'], component: RecentActivity },
];

export const widgetById = (id: string) => WIDGETS.find((w) => w.id === id);
