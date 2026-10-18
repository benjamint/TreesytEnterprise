import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { Organisation } from '@/types';
import { DataTable } from '@/components/shared/DataTable';
import { CompanyLogo } from '@/components/shared/Logo';
import { Flag } from '@/components/shared/Flag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { usePlatformStore } from '@/stores/platformStore';
import { useFormat, useT } from '@/stores/hooks';
import { CompanyActions } from './CompanyActions';
import { usePlatformStats } from './usePlatformStats';

/** Companies list (PRD A3). */
export function CompaniesPage() {
  const orgs = usePlatformStore((s) => s.orgs);
  const plans = usePlatformStore((s) => s.plans);
  const stats = usePlatformStats();
  const navigate = useNavigate();
  const f = useFormat();
  const { t } = useT();
  const sorted = useMemo(() => [...orgs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [orgs]);
  const columns = useMemo<ColumnDef<Organisation, unknown>[]>(
    () => [
      {
        header: t('col.name'), accessorKey: 'name',
        cell: (c) => (
          <span className="flex items-center gap-3">
            <CompanyLogo text={c.row.original.branding.logoText} color={c.row.original.branding.primaryColor} size={30} />
            <span className="font-medium text-ink">{c.row.original.name}</span>
          </span>
        ),
      },
      { header: t('platform.col.countries'), id: 'countries', accessorFn: (r) => r.countries.join(','), cell: (c) => <span className="flex gap-1">{c.row.original.countries.map((x) => <Flag key={x} code={x} />)}</span> },
      { header: t('col.type'), accessorKey: 'type', cell: (c) => t(`orgType.${c.getValue() as string}`) },
      { header: t('platform.col.plan'), id: 'plan', accessorFn: (r) => plans.find((p) => p.id === r.planId)?.name ?? '' },
      { header: t('platform.col.modules'), id: 'modules', accessorFn: (r) => stats.modules[r.id] ?? 0 },
      { header: t('platform.col.agents'), id: 'agents', accessorFn: (r) => stats.activeAgents[r.id] ?? 0, cell: (c) => f.number(c.getValue() as number) },
      { header: t('col.farmers'), id: 'farmers', accessorFn: (r) => stats.farmerCount[r.id] ?? 0, cell: (c) => f.number(c.getValue() as number) },
      { header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
      { header: t('platform.col.created'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
      { header: '', id: 'actions', enableSorting: false, cell: (c) => <CompanyActions org={c.row.original} /> },
    ],
    [t, plans, stats, f],
  );
  return <DataTable columns={columns} data={sorted} onRowClick={(o) => navigate(`/app/platform/companies/${o.id}`)} />;
}
