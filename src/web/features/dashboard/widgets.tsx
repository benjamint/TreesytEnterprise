import { createContext, useContext, useMemo, useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Banknote, Check, ClipboardList, Coins, Database, Pause, Scale, ShoppingBasket, Users, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ModuleKey } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { HBars, Donut, Meter, StackedColumns, seriesColor } from '@/components/charts/charts';
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
}

// ------------------------------------------------------------------ KPI row


function KpiRow() {
  const { kpis } = useData();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const items = [
    { key: 'volume', value: f.kg(Math.round(kpis.volume)), icon: ShoppingBasket, to: '/app/purchases' },
    { key: 'spend', value: f.money(kpis.spend, { compact: true }), hint: f.money(kpis.spend), icon: Banknote, to: '/app/purchases' },
    { key: 'farmersPaid', value: f.number(kpis.farmersPaid), icon: Users, to: '/app/farmers' },
    { key: 'openRequests', value: f.number(kpis.openRequests), icon: ClipboardList, to: '/app/purchase-requests' },
    { key: 'cashWithAgents', value: f.money(kpis.cashWithAgents, { compact: true }), hint: f.money(kpis.cashWithAgents), icon: Coins, to: '/app/reconciliation' },
    { key: 'reconGap', value: f.money(kpis.reconGap, { compact: true }), hint: f.money(kpis.reconGap), icon: Scale, to: '/app/reconciliation' },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((k) => (
        <button key={k.key} type="button" onClick={() => navigate(k.to)} className="flex min-h-[112px] flex-col justify-between rounded-ctl border border-line bg-canvas/60 p-4 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30">
          <span className="flex items-center justify-between gap-2">
            <span className="eyebrow">{t(`dashboard.kpi.${k.key}`)}</span>
            <k.icon className="h-4 w-4 text-muted" aria-hidden="true" />
          </span>
          <span>
            <span className="tnum block text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">{k.value}</span>
            {k.hint && <span className="mt-0.5 block text-[12px] text-muted">{k.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ My approvals

function Approvals() {
  const { queue } = useData();
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const [reason, setReason] = useState<{ item: QueueItem; action: 'REJECT' | 'HOLD' } | null>(null);
  const [comment, setComment] = useState('');
  const [all, setAll] = useState(false);
  const shown = all ? queue : queue.slice(0, 6);

  const run = (item: QueueItem, action: 'APPROVE' | 'REJECT' | 'HOLD', note?: string) => {
    const res = act(orgId, item.docType, item.id, action, userId ?? '', note);
    if (res.ok) toast.success(t(`dashboard.acted.${action}`, { number: item.number }), { description: t('dashboard.actedStatus', { status: t(`status.${res.status}`, { defaultValue: res.status }) }) });
    else if (res.reason === 'reasonRequired') setReason({ item, action: action as 'REJECT' | 'HOLD' });
    else toast.error(t(`dashboard.blocked.${res.reason}`, { defaultValue: t('dashboard.blocked.notAllowed') }));
  };

  if (!queue.length) return <p className="py-8 text-center text-[14px] text-muted">{t('dashboard.approvalsEmptyBody')}</p>;
  return (
    <>
      <p className="-mt-2 mb-3 text-[14px] text-muted">{t('dashboard.approvalsCount', { count: queue.length })}</p>
      <ul className="divide-y divide-line">
        {shown.map((q) => (
          <li key={`${q.docType}:${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <Link to={q.link} className="min-w-0 flex-1 rounded-chip hover:text-brand">
              <span className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-medium text-ink">{q.number}</span>
                {q.risk === 'HIGH' && <Badge tone="danger"><AlertTriangle className="h-3 w-3" /> {t('risk.HIGH')}</Badge>}
              </span>
              <span className="block truncate text-[13px] text-muted">{t(`docType.${q.docType}`)} · {q.by} · {f.relative(q.createdAt)}</span>
            </Link>
            <StatusBadge status={q.status} />
            <span className="tnum w-32 text-right font-medium text-ink">{f.money(q.total)}</span>
            <span className="flex gap-1">
              <Tip label={t('dashboard.approve')}><Button size="iconSm" onClick={() => run(q, 'APPROVE')} aria-label={`${t('dashboard.approve')} ${q.number}`}><Check /></Button></Tip>
              <Tip label={t('dashboard.hold')}><Button size="iconSm" variant="secondary" onClick={() => run(q, 'HOLD')} aria-label={`${t('dashboard.hold')} ${q.number}`}><Pause /></Button></Tip>
              <Tip label={t('dashboard.reject')}><Button size="iconSm" variant="dangerOutline" onClick={() => run(q, 'REJECT')} aria-label={`${t('dashboard.reject')} ${q.number}`}><X /></Button></Tip>
            </span>
          </li>
        ))}
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
  return <Donut data={data} format={(v) => f.kg(v)} center={<><span className="tnum text-[18px] font-semibold text-ink">{f.number(Math.round(total / 1000))}</span><span className="text-[11px] text-muted">{t('chart.tonnes')}</span></>} />;
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
  if (!items.length) return <p className="py-6 text-center text-[14px] text-muted">{t('dashboard.alertsNone')}</p>;
  const dot = { danger: 'bg-danger', warning: 'bg-warning', info: 'bg-info', unknown: 'bg-unknown' };
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.key}>
          <Link to={i.to} className="flex items-start gap-3 rounded-ctl px-2 py-2.5 hover:bg-canvas">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[i.tone]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[14px] text-ink">{t(`dashboard.alert.${i.key}`, { count: i.count, name: i.name })}</span>
          </Link>
        </li>
      ))}
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
          <li key={w.id} className="flex items-center gap-3 py-2.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: seriesColor(i) }} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink">{w.name}</span>
              <span className="block text-[12px] text-muted">{settings.paymentProviders.find((p) => p.id === w.providerId)?.name}</span>
            </span>
            {low && <Wallet className="h-4 w-4 text-warning" aria-label={t('dashboard.lowBalance')} />}
            <span className="tnum text-[14px] font-medium text-ink">{f.money(w.balance)}</span>
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
    <ul className="space-y-3">
      {recent.map((e) => (
        <li key={e.id} className="text-[13px]">
          <span className="text-ink">{t(`activity.${e.key}`, e.params)}</span>
          <span className="block text-muted">{e.entityId.replace(/^.*_/, '')} · {users.find((u) => u.id === e.actorId)?.name ?? t('dashboard.system')} · {f.relative(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-[14px] text-muted">
      <Database className="mb-2 h-5 w-5" aria-hidden="true" />
      {t('dashboard.noData')}
    </div>
  );
}

// ------------------------------------------------------------------ Registry

export const WIDGETS: WidgetDef[] = [
  { id: 'kpis', module: 'buying', permission: 'purchases.view', sizes: ['full'], component: KpiRow, operational: true },
  { id: 'approvals', permission: 'dashboard.view', sizes: ['half', 'twoThirds', 'full'], component: Approvals },
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
