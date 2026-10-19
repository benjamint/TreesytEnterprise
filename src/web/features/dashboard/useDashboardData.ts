import { useMemo } from 'react';
import type { DocType } from '@/types';
import { canAct, type WorkflowRecord } from '@/engines/workflow';
import { useActor, useOrgRows, useOrgSettings, usePermissionPatterns } from '@/stores/hooks';
import { useAccessStore } from '@/stores/accessStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLoanStore } from '@/stores/loanStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useAgentStore } from '@/stores/agentStore';

const DAY = 86_400_000;
const OPEN_EXCLUDED = new Set(['RECONCILED', 'NOT_APPROVED', 'ARCHIVED']);

export interface QueueItem {
  id: string;
  docType: DocType;
  number: string;
  status: string;
  total: number;
  createdAt: string;
  link: string;
  risk?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Who submitted it (agent or requester). */
  by: string;
}

/** Everything the dashboard widgets read, computed once per change and scoped to the company. */
export function useDashboardData() {
  const settings = useOrgSettings();
  const { userId, orgId } = useActor();
  const patterns = usePermissionPatterns();
  const memberships = useAccessStore((s) => s.memberships);
  const users = useAccessStore((s) => s.users);
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const expenses = useOrgRows(useBuyingStore((s) => s.expenses));
  const acs = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const bags = useOrgRows(useBuyingStore((s) => s.bags));
  const payments = useOrgRows(usePaymentStore((s) => s.payments));
  const wallets = useOrgRows(usePaymentStore((s) => s.wallets));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const loans = useOrgRows(useLoanStore((s) => s.loans));
  const warehouses = useOrgRows(useWarehouseStore((s) => s.warehouses));
  const agents = useOrgRows(useAgentStore((s) => s.agents));

  const names = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const agentName = useMemo(() => {
    const byId = new Map(agents.map((a) => [a.id, names.get(a.userId) ?? a.id]));
    return (id: string) => byId.get(id) ?? names.get(id) ?? '—';
  }, [agents, names]);

  const kpis = useMemo(() => {
    const boughtBy = new Map<string, number>();
    for (const p of purchases) boughtBy.set(p.requestId, (boughtBy.get(p.requestId) ?? 0) + p.amount.amountMinor);
    let cash = 0;
    let gap = 0;
    for (const r of requests) {
      if (r.reconciliationStatus === 'RECONCILED') continue;
      const given = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
      const diff = given - (boughtBy.get(r.id) ?? 0);
      if (r.fundsReceived) cash += Math.max(0, diff);
      if (given > 0) gap += Math.max(0, diff);
    }
    return {
      volume: purchases.reduce((s, p) => s + p.quantity, 0),
      spend: purchases.reduce((s, p) => s + p.amount.amountMinor, 0),
      farmersPaid: new Set(purchases.filter((p) => p.paymentStatus === 'PAID').map((p) => p.farmerId)).size,
      openRequests: requests.filter((r) => !OPEN_EXCLUDED.has(r.status)).length,
      cashWithAgents: cash,
      reconGap: gap,
      farmers: farmers.length,
      communities: communities.length,
      stockKg: bags.filter((b) => b.status === 'IN_STOCK').reduce((s, b) => s + b.weightKg, 0),
      paidOut: payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount.amountMinor, 0),
    };
  }, [purchases, requests, farmers, communities, bags, payments]);

  const queue = useMemo<QueueItem[]>(() => {
    if (!userId) return [];
    const m = memberships.find((x) => x.userId === userId && x.orgId === orgId);
    const me = { id: userId, roleIds: m?.roleIds ?? [], permissions: patterns };
    const items: QueueItem[] = [];
    const add = (rows: (WorkflowRecord & { number: string; total: { amountMinor: number }; createdAt: string; riskFlags?: { severity: 'HIGH' | 'MEDIUM' | 'LOW' }[]; agentId?: string; supplierId?: string })[], docType: DocType, path: string) => {
      const def = settings.workflows.find((w) => w.docType === docType);
      if (!def) return;
      for (const r of rows) {
        if (!canAct(r, def, me)) continue;
        const flags = r.riskFlags ?? [];
        const risk = flags.some((f) => f.severity === 'HIGH') ? 'HIGH' : flags.some((f) => f.severity === 'MEDIUM') ? 'MEDIUM' : flags.length ? 'LOW' : undefined;
        items.push({ id: r.id, docType, number: r.number, status: r.status, total: r.total.amountMinor, createdAt: r.createdAt, link: `${path}?open=${r.id}`, risk, by: r.agentId ? agentName(r.agentId) : names.get(String(r.createdBy)) ?? '—' });
      }
    };
    if (settings.modules.buying) {
      add(requests as never, 'purchaseRequest', '/app/purchase-requests');
      add(expenses as never, 'preExpense', '/app/expenses');
    }
    if (settings.modules.aggregators) add(acs as never, 'aggregatorPurchase', '/app/aggregators');
    return items.sort((a, b) => (a.risk === 'HIGH' ? -1 : 0) - (b.risk === 'HIGH' ? -1 : 0) || b.createdAt.localeCompare(a.createdAt));
  }, [userId, memberships, orgId, patterns, settings.workflows, settings.modules, requests, expenses, acs, agentName, names]);

  const charts = useMemo(() => {
    const now = Date.now();
    const commodityIndex = new Map(settings.commodities.map((c, i) => [c.id, i]));
    // Purchases by week, 12 weeks, stacked by commodity.
    const weekStart = (t: number) => {
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.getTime();
    };
    const thisWeek = weekStart(now);
    const weeks = Array.from({ length: 12 }, (_, i) => thisWeek - (11 - i) * 7 * DAY);
    const byWeek = weeks.map((w) => ({ week: w } as Record<string, number>));
    for (const p of purchases) {
      const w = weekStart(new Date(p.createdAt).getTime());
      const i = weeks.indexOf(w);
      if (i < 0) continue;
      byWeek[i]![p.commodityId] = (byWeek[i]![p.commodityId] ?? 0) + p.quantity;
    }
    const commodityTotals = new Map<string, number>();
    for (const p of purchases) commodityTotals.set(p.commodityId, (commodityTotals.get(p.commodityId) ?? 0) + p.quantity);

    const since30 = now - 30 * DAY;
    const byCommunity = new Map<string, number>();
    for (const p of purchases) if (new Date(p.createdAt).getTime() >= since30) byCommunity.set(p.communityId, (byCommunity.get(p.communityId) ?? 0) + p.quantity);
    const communityName = new Map(communities.map((c) => [c.id, c.name]));
    const topCommunities = [...byCommunity].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, kg]) => ({ label: communityName.get(id) ?? id, value: Math.round(kg) }));

    const byProvider = new Map<string, number>();
    for (const p of payments) if (p.status === 'SUCCESSFUL') byProvider.set(p.providerId, (byProvider.get(p.providerId) ?? 0) + p.amount.amountMinor);
    const providerName = (id: string) => settings.paymentProviders.find((x) => x.id === id)?.name ?? id;
    const payoutsByProvider = [...byProvider].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ label: providerName(id), value: v }));

    const byWarehouse = new Map<string, number>();
    for (const b of bags) if (b.status === 'IN_STOCK' && b.warehouseId) byWarehouse.set(b.warehouseId, (byWarehouse.get(b.warehouseId) ?? 0) + b.weightKg);
    const stockByWarehouse = warehouses.map((w) => ({ label: w.name, value: Math.round(byWarehouse.get(w.id) ?? 0) })).sort((a, b) => b.value - a.value);

    const principal = loans.reduce((s, l) => s + l.principal.amountMinor, 0);
    const repaid = loans.reduce((s, l) => s + l.repayments.reduce((x, r) => x + r.amount.amountMinor, 0), 0);
    return { weeks: byWeek, commodityTotals, commodityIndex, topCommunities, payoutsByProvider, stockByWarehouse, recovery: { principal, repaid, loans: loans.length, settled: loans.filter((l) => l.status === 'SETTLED').length } };
  }, [purchases, payments, bags, warehouses, loans, communities, settings.commodities, settings.paymentProviders]);

  const alerts = useMemo(() => {
    const since7 = Date.now() - 7 * DAY;
    return {
      risky: requests.filter((r) => r.riskFlags.some((f) => f.severity === 'HIGH') && !OPEN_EXCLUDED.has(r.status)),
      failed: payments.filter((p) => (p.status === 'FAILED' || p.status === 'UNKNOWN') && new Date(p.createdAt).getTime() >= since7),
      unknown: payments.filter((p) => p.status === 'UNKNOWN'),
      lowWallets: wallets.filter((w) => w.balance.amountMinor < w.lowBalanceThreshold.amountMinor),
      overdueLoans: loans.filter((l) => l.status === 'ACTIVE' && new Date(l.window.end).getTime() < Date.now()),
      flaggedFarmers: farmers.filter((f) => f.qualityStatus === 'FLAGGED').length,
    };
  }, [requests, payments, wallets, loans, farmers]);

  return { settings, kpis, queue, charts, alerts, communities, warehouses, agents, wallets, agentName };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
