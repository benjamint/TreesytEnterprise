import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { MessageSquarePlus, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { DispatchOrder, InsightRequest, Organisation } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StatCard } from '@/components/shared/StatCard';
import { CompanyLogo } from '@/components/shared/Logo';
import { Checkbox, Field, TextAreaField } from '@/components/shared/Field';
import { DetailDrawer, Facts, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { Donut, HBars, StackedColumns } from '@/components/charts/charts';
import { answerInsight, buyerDispatches, impactOf, requestInsights, setGrantScopes, traceOf } from '@/services/salesService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSalesStore } from '@/stores/salesStore';
import { useLandStore } from '@/stores/landStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActor, useCan, useCurrentOrg, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { mono } from '@/web/features/buying/common';
import { DocumentsTab } from './DispatchPage';
import { ImpactTiles, ShipmentSteps, TraceMap, useKgT, useSalesLookups } from './shared';

const SCOPES = ['orders', 'traceability', 'impact'] as const;
/** Headline weight in tonnes (kg in the hint or detail). */
function useTonnes() {
  const f = useFormat();
  return (kg: number) => `${f.number(Math.round(kg / 100) / 10, { maximumFractionDigits: 1 })} t`;
}

const OPEN_STATES = ['PENDING', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

function useTab(keys: string[]) {
  const [params, setParams] = useSearchParams();
  const want = params.get('tab');
  const tab = want && keys.includes(want) ? want : keys[0]!;
  const setTab = (k: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); n.delete('open'); return n; }, { replace: true });
  return [tab, setTab] as const;
}

function Tabs({ tabs, tab, onTab }: { tabs: { key: string; label: string; count?: number }[]; tab: string; onTab: (k: string) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((x) => (
        <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => onTab(x.key)} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-medium', tab === x.key ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>
          {x.label}{x.count != null && <span className="ml-1.5 tnum text-[12px] text-muted">{x.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Traceboard (PRD H8): the supplier's view of what it shares, or the buyer's portal. */
export function TraceboardPage() {
  const org = useCurrentOrg();
  return org.type === 'BUYER' ? <BuyerView buyer={org} /> : <SupplierView />;
}

/** Orders delivered per month, by commodity, for the last six months (t). */
function monthly(dispatches: DispatchOrder[], commodityName: (id: string) => string, label: (iso: string) => string) {
  const months: string[] = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) months.push(new Date(d.getFullYear(), d.getMonth() - i, 1).toISOString().slice(0, 7));
  const commodities = [...new Set(dispatches.map((x) => x.commodityId))];
  const data = months.map((m) => {
    const row: Record<string, number | string> = { label: label(`${m}-15T00:00:00Z`) };
    for (const c of commodities) row[c] = Math.round(dispatches.filter((x) => x.verification && x.verification.at.slice(0, 7) === m && x.commodityId === c).reduce((s, x) => s + x.verification!.deliveredKg, 0) / 100) / 10;
    return row;
  });
  return { data, series: commodities.map((c, i) => ({ key: c, label: commodityName(c), index: i })) };
}

// ---------------------------------------------------------------- Supplier view

function SupplierView() {
  const { t } = useT();
  const f = useFormat();
  const tonnes = useTonnes();
  const kgT = useKgT();
  const sl = useSalesLookups();
  const settings = useOrgSettings();
  const lang = useLang();
  const { orgId, userId } = useActor();
  const dispatches = useOrgRows(useSalesStore((s) => s.dispatches));
  const insights = useSalesStore((s) => s.insights).filter((x) => x.orgId === orgId);
  const grants = usePlatformStore((s) => s.grants).filter((g) => g.fromOrgId === orgId);
  const orgs = usePlatformStore((s) => s.orgs);
  const [tab, setTab] = useTab(['overview', 'sharing', 'insights']);
  const verified = dispatches.filter((d) => d.verification);
  const commodityName = (id: string) => { const c = settings.commodities.find((x) => x.id === id); return c ? c.name[lang] ?? c.name.en ?? c.code : id; };
  const byClient = new Map<string, number>();
  for (const d of verified) byClient.set(d.clientId, (byClient.get(d.clientId) ?? 0) + d.verification!.deliveredKg);
  const top = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, kg]) => ({ label: sl.clientName(id), value: Math.round(kg / 100) / 10 }));
  const moving = dispatches.filter((d) => ['IN_TRANSIT', 'ARRIVED'].includes(d.status));
  const amount = verified.reduce((s, d) => s + d.verification!.amount.amountMinor, 0);
  const currency = verified[0]?.verification!.amount.currency ?? f.org.currency;
  const chart = monthly(dispatches, commodityName, (iso) => f.date(iso, 'MMM'));
  const open = insights.filter((x) => x.status === 'OPEN').length;
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.traceboard')} description={t('sales.tb.supplierHint')} />
      <Tabs tab={tab} onTab={setTab} tabs={[{ key: 'overview', label: t('sales.tb.overview') }, { key: 'sharing', label: t('sales.tb.sharing'), count: grants.length }, { key: 'insights', label: t('sales.tb.insights'), count: open }]} />
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('sales.tb.buyersServed')} value={f.number(byClient.size)} hint={t('sales.tb.onPlatform', { count: sl.clients.filter((c) => c.buyerOrgId).length })} />
            <StatCard label={t('sales.tb.delivered')} value={tonnes(verified.reduce((s, d) => s + d.verification!.deliveredKg, 0))} hint={t('sales.tb.ordersN', { count: verified.length })} />
            <StatCard label={t('sales.tb.amount')} value={f.money({ amountMinor: amount, currency }, { compact: true })} />
            <StatCard label={t('sales.tb.inTransit')} value={f.number(moving.length)} hint={kgT(moving.reduce((s, d) => s + d.expectedKg, 0))} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('sales.tb.byMonth')}</h3><StackedColumns data={chart.data} series={chart.series} format={(v) => `${f.number(v, { maximumFractionDigits: 1 })} t`} /></section>
            <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('sales.tb.topCustomers')}</h3>{top.length ? <HBars data={top} format={(v) => `${f.number(v, { maximumFractionDigits: 1 })} t`} /> : <TabEmpty>{t('sales.noDeliveries')}</TabEmpty>}</section>
          </div>
          <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
            <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('sales.tb.ordersInTransit')}</h3>
            {moving.length ? <ul className="divide-y divide-line">{moving.map((d) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]"><Link to={`/app/dispatch?open=${d.id}`} className="font-mono text-[13px] text-ink hover:underline">{d.number}</Link><span className="text-muted">{`${sl.clientName(d.clientId)} · ${d.truck.plate}${d.position?.eta ? ` · ${t('sales.etaAt', { at: f.dateTime(d.position.eta) })}` : ''}`}</span><StatusBadge status={d.status} /></li>)}</ul> : <TabEmpty>{t('sales.tb.nothingMoving')}</TabEmpty>}
          </section>
        </div>
      )}
      {tab === 'sharing' && (
        <div className="space-y-3">
          <p className="text-[14px] text-muted">{t('sales.tb.sharingHint')}</p>
          {grants.length ? grants.map((g) => {
            const buyer = orgs.find((o) => o.id === g.toOrgId);
            const clients = sl.clients.filter((c) => c.buyerOrgId === g.toOrgId);
            return (
              <section key={g.id} className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">{buyer && <CompanyLogo text={buyer.branding.logoText} color={buyer.branding.primaryColor} size={36} />}<div><div className="text-[14px] font-semibold text-ink">{buyer?.name ?? g.toOrgId}</div><div className="text-[12px] text-muted">{clients.length ? t('sales.tb.asClient', { names: clients.map((c) => `${c.name} (${c.code})`).join(', ') }) : t('sales.tb.noClient')}</div></div></div>
                  <StatusBadge status={g.status} />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {SCOPES.map((s) => (
                    <ScopeToggle key={s} label={t(`sales.scope.${s}`)} description={t(`sales.scopeHint.${s}`)} checked={g.scopes.includes(s)}
                      onChange={(on) => { setGrantScopes(g.id, SCOPES.filter((x) => (x === s ? on : g.scopes.includes(x))), userId ?? 'system'); toast.success(t('sales.toast.sharingSaved', { buyer: buyer?.name ?? '' })); }} />
                  ))}
                </div>
              </section>
            );
          }) : <TabEmpty>{t('sales.tb.noGrants')}</TabEmpty>}
        </div>
      )}
      {tab === 'insights' && <InsightsInbox insights={insights} />}
    </>
  );
}

function ScopeToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  const can = useCan();
  return <div className="rounded-ctl border border-line px-3 py-2.5"><Checkbox label={label} description={description} checked={checked} disabled={!can('traceboard.share')} onChange={(e) => onChange(e.target.checked)} /></div>;
}

function InsightsInbox({ insights }: { insights: InsightRequest[] }) {
  const { t } = useT();
  const f = useFormat();
  const { userId } = useActor();
  const orgs = usePlatformStore((s) => s.orgs);
  const users = useAccessStore((s) => s.users);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const list = [...insights].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'OPEN' ? -1 : 1));
  if (!list.length) return <TabEmpty>{t('sales.tb.noInsights')}</TabEmpty>;
  return (
    <ul className="space-y-3">{list.map((r) => (
      <li key={r.id} className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-[14px] font-semibold text-ink">{r.topic}</div><div className="text-[12px] text-muted">{`${users.find((u) => u.id === r.userId)?.name ?? ''} · ${orgs.find((o) => o.id === r.fromOrgId)?.name ?? ''} · ${f.dateTime(r.createdAt)}`}</div></div><StatusBadge status={r.status === 'OPEN' ? 'INS_OPEN' : 'INS_ANSWERED'} /></div>
        <p className="mt-2 text-[14px] text-body">{r.message}</p>
        {r.answer ? <p className="mt-3 rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body"><span className="block text-[12px] text-muted">{`${users.find((u) => u.id === r.answer!.by)?.name ?? ''} · ${f.dateTime(r.answer.at)}`}</span>{r.answer.text}</p> : (
          <PermissionGate permission="traceboard.share">
            <div className="mt-3 flex gap-2">
              <Input value={drafts[r.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} aria-label={t('sales.tb.answer')} placeholder={t('sales.tb.answerPlaceholder')} />
              <Button disabled={!drafts[r.id]?.trim()} onClick={() => { answerInsight(r.id, drafts[r.id]!.trim(), userId ?? 'system'); toast.success(t('sales.toast.answered')); }}><Send /> {t('sales.tb.send')}</Button>
            </div>
          </PermissionGate>
        )}
      </li>
    ))}</ul>
  );
}

// ---------------------------------------------------------------- Buyer view

function BuyerView({ buyer }: { buyer: Organisation }) {
  const { t } = useT();
  const f = useFormat();
  const tonnes = useTonnes();
  const kgT = useKgT();
  const lang = useLang();
  const all = useSalesStore((s) => s.dispatches);
  const clients = useSalesStore((s) => s.clients);
  const plots = useLandStore((s) => s.plots);
  const insights = useSalesStore((s) => s.insights).filter((x) => x.fromOrgId === buyer.id);
  const grants = usePlatformStore((s) => s.grants).filter((g) => g.toOrgId === buyer.id && g.status === 'ACTIVE');
  const orgs = usePlatformStore((s) => s.orgs);
  const allSettings = useSettingsStore((s) => s.settings);
  const [supplierId, setSupplierId] = useState(grants[0]?.fromOrgId ?? '');
  const supplier = orgs.find((o) => o.id === supplierId);
  const grant = grants.find((g) => g.fromOrgId === supplierId);
  const ss = allSettings[supplierId];
  const [openId, open, close] = useDrawerParam();
  const [tab, setTab] = useTab(['overview', 'orders', 'insights']);
  const [asking, setAsking] = useState(false);
  const orders = useMemo(() => buyerDispatches(buyer.id, all, clients).filter((d) => d.orgId === supplierId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [buyer.id, all, clients, supplierId]);
  const commodityName = (id: string) => { const c = ss?.commodities.find((x) => x.id === id); return c ? c.name[lang] ?? c.name.en ?? c.code : id; };
  const supply = useMemo(() => ({ orgId: supplierId, kind: 'INVENTORY' as const, bagCodes: orders.flatMap((d) => d.bagCodes), requestIds: orders.flatMap((d) => d.requestIds) }), [orders, supplierId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trace = useMemo(() => traceOf(supply), [supply, plots]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const impact = useMemo(() => impactOf(supply), [supply, plots]);
  const verified = orders.filter((d) => d.verification);
  const totalKg = verified.reduce((s, d) => s + d.verification!.deliveredKg, 0);
  const amount = verified.reduce((s, d) => s + d.verification!.amount.amountMinor, 0);
  const currency = verified[0]?.verification!.amount.currency ?? buyer.currency;
  const upcoming = orders.filter((d) => OPEN_STATES.includes(d.status));
  const crops = [...new Set(orders.map((d) => d.commodityId))].map((c, i) => ({ label: commodityName(c), value: Math.round(orders.filter((d) => d.commodityId === c).reduce((s, d) => s + (d.verification?.deliveredKg ?? d.expectedKg), 0) / 100) / 10, index: i }));
  const current = orders.find((d) => d.id === openId);
  const columns = useMemo<ColumnDef<DispatchOrder, unknown>[]>(() => [
    { id: 'number', header: t('sales.orderNumber'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'sale', header: t('sales.saleNumber'), accessorFn: (d) => d.verification?.saleNumber ?? '', cell: (c) => (c.getValue() ? mono(c.getValue() as string) : <span className="text-muted">{'—'}</span>) },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (d) => commodityName(d.commodityId) },
    { id: 'kg', header: t('sales.weight'), accessorFn: (d) => d.verification?.deliveredKg ?? d.expectedKg, cell: (c) => <span className="whitespace-nowrap">{kgT(c.getValue() as number)}</span> },
    { id: 'amount', header: t('col.amount'), accessorFn: (d) => d.verification?.amount.amountMinor ?? 0, cell: (c) => (c.row.original.verification ? f.money(c.row.original.verification.amount) : <span className="text-muted">{'—'}</span>) },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  ], [t, f, kgT, ss]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!supplier || !grant) return (<><PageHeader title={t('nav.traceboard')} description={t('sales.tb.buyerHint')} /><TabEmpty>{t('sales.tb.noSuppliers')}</TabEmpty></>);
  const showImpact = grant.scopes.includes('impact');
  const showTrace = grant.scopes.includes('traceability');
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-soft" style={{ borderTop: `4px solid ${supplier.branding.primaryColor}` }}>
        <div className="flex items-center gap-4">
          <CompanyLogo text={supplier.branding.logoText} color={supplier.branding.primaryColor} size={52} />
          <div><div className="eyebrow">{t('nav.traceboard')}</div><h1 className="text-[24px] font-semibold leading-tight text-ink">{supplier.name}</h1><p className="text-[13px] text-muted">{t('sales.tb.suppliedTo', { buyer: buyer.name })}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {grants.length > 1 && <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); close(); }} aria-label={t('sales.tb.supplier')} className="h-10 rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">{grants.map((g) => <option key={g.id} value={g.fromOrgId}>{orgs.find((o) => o.id === g.fromOrgId)?.name}</option>)}</select>}
          <PermissionGate permission="traceboard.requestInsights"><Button onClick={() => setAsking(true)}><MessageSquarePlus /> {t('sales.tb.requestInsights')}</Button></PermissionGate>
        </div>
      </div>
      <Tabs tab={tab} onTab={setTab} tabs={[{ key: 'overview', label: t('sales.tb.dashboard') }, { key: 'orders', label: t('sales.tb.orders'), count: orders.length }, { key: 'insights', label: t('sales.tb.myRequests'), count: insights.length }]} />
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('sales.tb.totalWeight')} value={tonnes(totalKg)} hint={f.kg(Math.round(totalKg))} />
            <StatCard label={t('sales.tb.amount')} value={f.money({ amountMinor: amount, currency }, { compact: true })} />
            <StatCard label={t('sales.tb.orders')} value={f.number(orders.length)} hint={t('sales.tb.verifiedN', { count: verified.length })} />
            <StatCard label={t('sales.tb.sourcedFrom')} value={t('sales.tb.farmersN', { count: trace.farmers.length })} hint={t('sales.tb.communitiesN', { count: trace.communities.length })} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('sales.tb.crops')}</h3>{crops.length ? <Donut data={crops} format={(v) => `${f.number(v, { maximumFractionDigits: 1 })} t`} /> : <TabEmpty>{t('sales.noDeliveries')}</TabEmpty>}</section>
            <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
              <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('sales.tb.upcoming')}</h3>
              {upcoming.length ? <ul className="divide-y divide-line">{upcoming.map((d) => <li key={d.id}><button type="button" onClick={() => open(d.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left text-[14px] hover:bg-canvas"><span><span className="block font-mono text-[13px] text-ink">{d.number}</span><span className="text-[12px] text-muted">{`${commodityName(d.commodityId)} · ${kgT(d.expectedKg)}${d.position?.eta ? ` · ${t('sales.etaAt', { at: f.dateTime(d.position.eta) })}` : ''}`}</span></span><StatusBadge status={d.status} /></button></li>)}</ul> : <TabEmpty>{t('sales.tb.nothingUpcoming')}</TabEmpty>}
            </section>
          </div>
          {showImpact && (
            <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[14px] font-semibold text-ink">{t('sales.tb.impact')}</h3><div className="flex flex-wrap gap-1.5">{(ss?.sales.certifications ?? []).map((c) => <span key={c} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-medium text-brand">{c}</span>)}</div></div>
              <ImpactTiles impact={impact} kpis={ss?.sales.impactKpis ?? []} />
            </section>
          )}
          {showTrace && (
            <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
              <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('sales.traceToSource')}</h3>
              <TraceMap communities={trace.communities} plots={trace.plots} kgByCommunity={trace.kgByCommunity} height={360} />
            </section>
          )}
        </div>
      )}
      {tab === 'orders' && <DataTable columns={columns} data={orders} onRowClick={(d) => open(d.id)} activeId={openId} getRowId={(d) => d.id} empty={t('sales.noDispatches')} />}
      {tab === 'insights' && (
        insights.length ? <ul className="space-y-3">{[...insights].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-surface p-5 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-[14px] font-semibold text-ink">{r.topic}</div><div className="text-[12px] text-muted">{f.dateTime(r.createdAt)}</div></div><StatusBadge status={r.status === 'OPEN' ? 'INS_OPEN' : 'INS_ANSWERED'} /></div>
            <p className="mt-2 text-[14px] text-body">{r.message}</p>
            {r.answer && <p className="mt-3 rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body"><span className="block text-[12px] text-muted">{`${supplier.name} · ${f.dateTime(r.answer.at)}`}</span>{r.answer.text}</p>}
          </li>
        ))}</ul> : <TabEmpty>{t('sales.tb.noRequests')}</TabEmpty>
      )}
      {current && <BuyerOrderDrawer key={current.id} dispatch={current} commodityName={commodityName} kpis={ss?.sales.impactKpis ?? []} showImpact={showImpact} showTrace={showTrace} onClose={close} />}
      {asking && <InsightDialog buyerOrgId={buyer.id} supplierId={supplierId} orders={orders} onClose={() => setAsking(false)} />}
    </>
  );
}

function BuyerOrderDrawer({ dispatch: d, commodityName, kpis, showImpact, showTrace, onClose }: { dispatch: DispatchOrder; commodityName: (id: string) => string; kpis: string[]; showImpact: boolean; showTrace: boolean; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const kgT = useKgT();
  const can = useCan();
  const plots = useLandStore((s) => s.plots);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trace = useMemo(() => traceOf(d), [d, plots]);
  const truck = d.position && ['IN_TRANSIT', 'ARRIVED'].includes(d.status) ? { lat: d.position.lat, lng: d.position.lng, label: d.truck.plate } : undefined;
  return (
    <DetailDrawer open onClose={onClose} title={d.number} subtitle={`${commodityName(d.commodityId)} · ${kgT(d.verification?.deliveredKg ?? d.expectedKg)}`}
      badges={<><StatusBadge status={d.status} />{d.verification && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[12px] font-medium text-brand">{d.verification.saleNumber}</span>}</>}
      tabs={[
        {
          key: 'summary', label: t('sales.tab.summary'), content: (
            <div className="space-y-5">
              <ShipmentSteps dispatch={d} />
              <Facts items={[
                [t('sales.orderNumber'), mono(d.number)], [t('sales.saleNumber'), d.verification ? mono(d.verification.saleNumber) : '—'],
                [t('sales.expected'), kgT(d.expectedKg)], [t('sales.delivered'), d.verification ? kgT(d.verification.deliveredKg) : '—'],
                [t('sales.driver'), d.driver.name], [t('sales.truck'), d.truck.plate],
                [t('sales.waybill'), d.waybill], [t('col.amount'), d.verification ? f.money(d.verification.amount) : '—'],
                ...(d.position?.eta && !d.verification ? [[t('sales.eta'), f.dateTime(d.position.eta)] as [string, string]] : []),
              ]} />
            </div>
          ),
        },
        {
          key: 'timeline', label: t('sales.tab.timeline'), count: d.tracking.length, content: (
            <div className="space-y-4">
              {truck && <TraceMap communities={[]} plots={[]} kgByCommunity={new Map()} truck={truck} height={240} />}
              <ol className="space-y-2">{[...d.tracking].reverse().filter((x) => !['PENDING_APPROVAL', 'ON_HOLD'].includes(x.status)).map((x, i) => <li key={i} className="flex items-center gap-3 rounded-ctl border border-line px-3 py-2.5 text-[13px]"><StatusBadge status={x.status} /><span className="text-ink">{f.dateTime(x.at)}</span>{x.eta && <span className="text-muted">{t('sales.etaAt', { at: f.dateTime(x.eta) })}</span>}</li>)}</ol>
            </div>
          ),
        },
        ...(showTrace ? [{
          key: 'trace', label: t('sales.tab.trace'), count: trace.farmers.length, content: (
            <div className="space-y-4">
              <Facts cols={3} items={[[t('sales.impact.farmers'), f.number(trace.farmers.length)], [t('sales.impact.communities'), f.number(trace.communities.length)], [t('sales.impact.plots'), f.number(trace.plots.length)]]} />
              <TraceMap communities={trace.communities} plots={trace.plots} kgByCommunity={trace.kgByCommunity} height={340} />
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{trace.communities.map((c) => <li key={c.id} className="flex justify-between px-3 py-2"><span className="text-ink">{c.name}</span><span className="tnum">{`${t('sales.tb.farmersN', { count: trace.farmers.filter((x) => x.communityId === c.id).length })} · ${f.kg(Math.round(trace.kgByCommunity.get(c.id) ?? 0))}`}</span></li>)}</ul>
            </div>
          ),
        }] : []),
        ...(showImpact ? [{ key: 'impact', label: t('sales.tab.impact'), content: <ImpactTiles impact={d.impact} kpis={kpis} /> }] : []),
        { key: 'documents', label: t('sales.tab.documents'), count: d.documents.length, content: can('traceboard.downloadDocuments') ? <DocumentsTab dispatch={d} readOnly /> : <TabEmpty>{t('sales.tb.noDocAccess')}</TabEmpty> },
      ]} />
  );
}

function InsightDialog({ buyerOrgId, supplierId, orders, onClose }: { buyerOrgId: string; supplierId: string; orders: DispatchOrder[]; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [dispatchId, setDispatchId] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('sales.tb.requestInsights')}</DialogTitle><DialogDescription>{t('sales.tb.requestHint')}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label={t('sales.tb.topic')}><Input value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={t('sales.tb.topic')} /></Field>
          <TextAreaField label={t('sales.tb.message')} value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
          <Field label={t('sales.tb.aboutOrder')}><select value={dispatchId} onChange={(e) => setDispatchId(e.target.value)} aria-label={t('sales.tb.aboutOrder')} className="h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink"><option value="">{t('sales.tb.anyOrder')}</option>{orders.map((d) => <option key={d.id} value={d.id}>{d.number}</option>)}</select></Field>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!topic.trim() || !message.trim()} onClick={() => { requestInsights({ fromOrgId: buyerOrgId, orgId: supplierId, userId: userId ?? 'system', topic: topic.trim(), message: message.trim(), dispatchId: dispatchId || undefined }); toast.success(t('sales.toast.insightSent')); onClose(); }}><Send /> {t('sales.tb.send')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
