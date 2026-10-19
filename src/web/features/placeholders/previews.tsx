import { ReportFieldsPreview } from './ReportFieldsPreview';
import { useMemo, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { pathLabel } from '@/engines/locations';
import { useFormat, useOrgRows, useOrgSettings, useT, useLang } from '@/stores/hooks';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useAgentStore } from '@/stores/agentStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useLocationStore } from '@/stores/locationStore';
import { useAccessStore } from '@/stores/accessStore';
import { formatPhone } from '@/lib/format';

/**
 * Phase 1 previews: the first rows of each area's seeded data, already company-scoped, in the
 * company's currency, terminology and language. Replaced by the full list pages in later phases.
 */
export interface Preview {
  count: number;
  table: ReactNode;
}

const mono = (v: string) => <span className="font-mono text-[13px] text-ink">{v}</span>;

function useNames() {
  const users = useAccessStore((s) => s.users);
  const agents = useOrgRows(useAgentStore((s) => s.agents));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  return useMemo(() => {
    const userName = new Map(users.map((u) => [u.id, u.name]));
    return {
      agent: (id: string) => userName.get(agents.find((a) => a.id === id)?.userId ?? '') ?? '—',
      community: (id: string) => communities.find((c) => c.id === id)?.name ?? '—',
      user: (id: string) => userName.get(id) ?? id,
    };
  }, [users, agents, communities]);
}

function useCommodityName() {
  const settings = useOrgSettings();
  const lang = useLang();
  return (id: string) => {
    const c = settings.commodities.find((x) => x.id === id);
    return c ? c.name[lang] ?? c.name.en ?? c.code : id;
  };
}

function CommunitiesPreview() {
  const rows = useOrgRows(useCommunityStore((s) => s.communities));
  const nodes = useLocationStore((s) => s.nodes);
  const names = useNames();
  const { t } = useT();
  const f = useFormat();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.code'), accessorKey: 'code', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.name'), accessorKey: 'name' },
      { header: t('col.location'), id: 'loc', accessorFn: (r) => pathLabel(nodes, r.locationNodeId) },
      { header: t('col.population'), accessorKey: 'population', cell: (c) => f.number(c.getValue() as number) },
      { header: t('col.agent'), id: 'agent', accessorFn: (r) => r.agentIds.map(names.agent).join(', ') },
      { header: t('col.score'), accessorKey: 'score' },
    ],
    [t, nodes, names, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

function FarmersPreview() {
  const rows = useOrgRows(useFarmerStore((s) => s.farmers));
  const names = useNames();
  const { t } = useT();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.id'), accessorKey: 'farmerCode', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.name'), id: 'name', accessorFn: (r) => `${r.firstName} ${r.lastName}` },
      { header: t('col.gender'), accessorKey: 'gender', cell: (c) => t(`gender.${c.getValue() as string}`) },
      { header: t('col.community'), id: 'com', accessorFn: (r) => names.community(r.communityId) },
      { header: t('col.phone'), accessorKey: 'phone', cell: (c) => formatPhone(c.getValue() as string) },
      { header: t('col.status'), accessorKey: 'qualityStatus', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    ],
    [t, names],
  );
  return <DataTable columns={columns} data={rows} />;
}

function GroupsPreview() {
  const rows = useOrgRows(useGroupStore((s) => s.groups));
  const members = useOrgRows(useGroupStore((s) => s.groupMemberships));
  const names = useNames();
  const { t } = useT();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.name'), accessorKey: 'name' },
      { header: t('col.type'), accessorKey: 'type', cell: (c) => t(`groupType.${c.getValue() as string}`) },
      { header: t('col.community'), id: 'com', accessorFn: (r) => names.community(r.communityId) },
      { header: t('col.members'), id: 'm', accessorFn: (r) => members.filter((m) => m.groupId === r.id).length },
      { header: t('col.score'), accessorKey: 'score' },
    ],
    [t, names, members],
  );
  return <DataTable columns={columns} data={rows} />;
}

function RequestsPreview() {
  const rows = useOrgRows(useBuyingStore((s) => s.requests));
  const names = useNames();
  const commodity = useCommodityName();
  const { t } = useT();
  const f = useFormat();
  const sorted = useMemo(() => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rows]);
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.agent'), id: 'agent', accessorFn: (r) => names.agent(r.agentId) },
      { header: t('col.community'), id: 'com', accessorFn: (r) => names.community(r.communityId) },
      { header: t('col.commodity'), id: 'cmd', accessorFn: (r) => commodity(r.commodityId) },
      { header: t('col.volume'), accessorKey: 'volume', cell: (c) => f.kg(c.getValue() as number) },
      { header: t('col.total'), id: 'total', accessorFn: (r) => r.total.amountMinor, cell: (c) => f.money(c.row.original.total) },
      { header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
      {
        header: t('col.risk'), id: 'risk', accessorFn: (r) => r.riskFlags.length,
        cell: (c) => {
          const top = c.row.original.riskFlags.find((x) => x.severity === 'HIGH') ?? c.row.original.riskFlags[0];
          return top ? <Badge tone={top.severity === 'HIGH' ? 'danger' : 'warning'}><AlertTriangle className="h-3 w-3" />{t(`risk.${top.severity}`)}</Badge> : null;
        },
      },
    ],
    [t, names, commodity, f],
  );
  return <DataTable columns={columns} data={sorted} />;
}

function PurchasesPreview() {
  const rows = useOrgRows(useBuyingStore((s) => s.purchases));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const names = useNames();
  const { t } = useT();
  const f = useFormat();
  const sorted = useMemo(() => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rows]);
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
      { header: t('col.farmers'), id: 'farmer', accessorFn: (r) => { const x = farmers.find((y) => y.id === r.farmerId); return x ? `${x.firstName} ${x.lastName}` : '—'; } },
      { header: t('col.community'), id: 'com', accessorFn: (r) => names.community(r.communityId) },
      { header: t('col.quantity'), accessorKey: 'quantity', cell: (c) => f.kg(c.getValue() as number) },
      { header: t('col.amount'), id: 'amt', accessorFn: (r) => r.amount.amountMinor, cell: (c) => f.money(c.row.original.amount) },
      { header: t('col.bags'), id: 'bags', accessorFn: (r) => r.bagCodes.join(', '), cell: (c) => mono(c.getValue() as string) },
      { header: t('col.status'), accessorKey: 'paymentStatus', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    ],
    [t, names, farmers, f],
  );
  return <DataTable columns={columns} data={sorted} />;
}

function ExpensesPreview() {
  const rows = useOrgRows(useBuyingStore((s) => s.expenses));
  const names = useNames();
  const { t } = useT();
  const f = useFormat();
  const sorted = useMemo(() => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rows]);
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.agent'), id: 'agent', accessorFn: (r) => names.agent(r.agentId) },
      { header: t('col.bags'), accessorKey: 'bags' },
      { header: t('col.total'), id: 'total', accessorFn: (r) => r.total.amountMinor, cell: (c) => f.money(c.row.original.total) },
      { header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
      { header: t('nav.payments'), accessorKey: 'paymentStatus', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    ],
    [t, names, f],
  );
  return <DataTable columns={columns} data={sorted} />;
}

function AggregatorsPreview() {
  const rows = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const suppliers = useOrgRows(useBuyingStore((s) => s.suppliers));
  const { t } = useT();
  const f = useFormat();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.reference'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.name'), id: 'sup', accessorFn: (r) => suppliers.find((s) => s.id === r.supplierId)?.name ?? '—' },
      { header: t('col.bags'), accessorKey: 'expectedBags' },
      { header: t('col.volume'), accessorKey: 'expectedKg', cell: (c) => f.kg(c.getValue() as number) },
      { header: t('col.total'), id: 'total', accessorFn: (r) => r.total.amountMinor, cell: (c) => f.money(c.row.original.total) },
      { header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    ],
    [t, suppliers, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

function PaymentsPreview() {
  const rows = useOrgRows(usePaymentStore((s) => s.payments));
  const settings = useOrgSettings();
  const { t } = useT();
  const f = useFormat();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.reference'), accessorKey: 'reference', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.dateTime(c.getValue() as string) },
      { header: t('col.payee'), id: 'payee', accessorFn: (r) => r.payee.name },
      { header: t('col.provider'), id: 'prov', accessorFn: (r) => settings.paymentProviders.find((p) => p.id === r.providerId)?.name ?? r.providerId },
      { header: t('col.amount'), id: 'amt', accessorFn: (r) => r.amount.amountMinor, cell: (c) => f.money(c.row.original.amount) },
      { header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    ],
    [t, settings, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

function WalletsPreview() {
  const rows = useOrgRows(usePaymentStore((s) => s.wallets));
  const { t } = useT();
  const f = useFormat();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.name'), accessorKey: 'name' },
      { header: t('col.balance'), id: 'bal', accessorFn: (r) => r.balance.amountMinor, cell: (c) => f.money(c.row.original.balance) },
      {
        header: t('col.status'), id: 'low', accessorFn: (r) => r.balance.amountMinor < r.lowBalanceThreshold.amountMinor,
        cell: (c) => <StatusBadge status={c.getValue() ? 'PENDING' : 'ACTIVE'} />,
      },
    ],
    [t, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

function AgentsPreview() {
  const rows = useOrgRows(useAgentStore((s) => s.agents));
  const names = useNames();
  const settings = useOrgSettings();
  const lang = useLang();
  const { t } = useT();
  const f = useFormat();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.name'), id: 'name', accessorFn: (r) => names.user(r.userId) },
      { header: t('col.agentType'), id: 'type', accessorFn: (r) => settings.agentTypes.find((a) => a.id === r.agentTypeId)?.name[lang] ?? '' },
      { header: t('col.phone'), id: 'phone', accessorFn: (r) => formatPhone(r.wallet.number) },
      { header: t('col.provider'), id: 'prov', accessorFn: (r) => settings.paymentProviders.find((p) => p.id === r.wallet.providerId)?.name ?? '' },
      { header: t('col.lastSync'), accessorKey: 'lastSyncAt', cell: (c) => f.relative(c.getValue() as string) },
      { header: t('col.score'), accessorKey: 'score' },
    ],
    [t, names, settings, lang, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

function WarehousesPreview() {
  const rows = useOrgRows(useWarehouseStore((s) => s.warehouses));
  const nodes = useLocationStore((s) => s.nodes);
  const { t } = useT();
  const f = useFormat();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.name'), accessorKey: 'name' },
      { header: t('col.type'), accessorKey: 'type', cell: (c) => t(`warehouseType.${c.getValue() as string}`) },
      { header: t('col.location'), id: 'loc', accessorFn: (r) => pathLabel(nodes, r.locationNodeId) },
      { header: t('col.capacity'), accessorKey: 'capacityKg', cell: (c) => f.kg(c.getValue() as number) },
      { header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    ],
    [t, nodes, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

function BagsPreview() {
  const rows = useOrgRows(useBuyingStore((s) => s.bags));
  const commodity = useCommodityName();
  const { t } = useT();
  const f = useFormat();
  const columns = useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      { header: t('col.code'), accessorKey: 'code', cell: (c) => mono(c.getValue() as string) },
      { header: t('col.commodity'), id: 'c', accessorFn: (r) => commodity(r.commodityId) },
      { header: t('col.quantity'), accessorKey: 'weightKg', cell: (c) => f.kg(c.getValue() as number) },
      { header: t('nav.purchases'), id: 'p', accessorFn: (r) => r.purchaseIds.length },
    ],
    [t, commodity, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

/** Which preview each route shows, and how many seeded records it has. */
export function usePreviewCount(key: string): number | null {
  const s = {
    communities: useOrgRows(useCommunityStore((x) => x.communities)).length,
    communitiesMap: useOrgRows(useCommunityStore((x) => x.communities)).length,
    farmers: useOrgRows(useFarmerStore((x) => x.farmers)).length,
    groups: useOrgRows(useGroupStore((x) => x.groups)).length,
    purchaseRequests: useOrgRows(useBuyingStore((x) => x.requests)).length,
    reconciliation: useOrgRows(useBuyingStore((x) => x.requests)).length,
    purchases: useOrgRows(useBuyingStore((x) => x.purchases)).length,
    expenses: useOrgRows(useBuyingStore((x) => x.expenses)).length,
    aggregators: useOrgRows(useBuyingStore((x) => x.aggregatorPurchases)).length,
    payments: useOrgRows(usePaymentStore((x) => x.payments)).length,
    wallets: useOrgRows(usePaymentStore((x) => x.wallets)).length,
    agents: useOrgRows(useAgentStore((x) => x.agents)).length,
    warehouses: useOrgRows(useWarehouseStore((x) => x.warehouses)).length,
    bags: useOrgRows(useBuyingStore((x) => x.bags)).length,
  } as Record<string, number>;
  return key in s ? s[key]! : null;
}

export const PREVIEWS: Record<string, () => ReactNode> = {
  communities: () => <CommunitiesPreview />,
  communitiesMap: () => <CommunitiesPreview />,
  farmers: () => <FarmersPreview />,
  groups: () => <GroupsPreview />,
  purchaseRequests: () => <RequestsPreview />,
  reconciliation: () => <RequestsPreview />,
  purchases: () => <PurchasesPreview />,
  expenses: () => <ExpensesPreview />,
  aggregators: () => <AggregatorsPreview />,
  payments: () => <PaymentsPreview />,
  wallets: () => <WalletsPreview />,
  agents: () => <AgentsPreview />,
  warehouses: () => <WarehousesPreview />,
  bags: () => <BagsPreview />,
  reports: () => <ReportFieldsPreview />,
};
