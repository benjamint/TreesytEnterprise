import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { AuditEntry } from '@/types';
import { DataTable } from '@/components/shared/DataTable';
import { SelectField } from '@/components/shared/Field';
import { useActivityStore } from '@/stores/activityStore';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useFormat, useT } from '@/stores/hooks';

function summarise(v: unknown): string {
  if (v == null) return '';
  if (typeof v !== 'object') return String(v);
  return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${String(x)}`).join(', ');
}

export function AuditTable({ rows }: { rows: AuditEntry[] }) {
  const users = useAccessStore((s) => s.users);
  const orgs = usePlatformStore((s) => s.orgs);
  const f = useFormat();
  const { t } = useT();
  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      { header: t('platform.col.when'), accessorKey: 'at', cell: (c) => f.dateTime(c.getValue() as string) },
      { header: t('platform.col.actor'), id: 'actor', accessorFn: (r) => users.find((u) => u.id === r.actorId)?.name ?? r.actorId },
      { header: t('platform.col.company'), id: 'org', accessorFn: (r) => orgs.find((o) => o.id === r.orgId)?.name ?? r.orgId },
      { header: t('platform.col.action'), accessorKey: 'key', cell: (c) => <span className="font-medium text-ink">{t(`audit.${c.getValue() as string}`)}</span> },
      {
        header: t('platform.col.change'), id: 'change', enableSorting: false, accessorFn: (r) => `${summarise(r.before)} ${summarise(r.after)}`,
        cell: (c) => {
          const r = c.row.original;
          const b = summarise(r.before);
          const a = summarise(r.after);
          return <span className="text-[13px] text-muted">{b && a ? `${b} → ${a}` : b || a}</span>;
        },
      },
    ],
    [t, users, orgs, f],
  );
  return <DataTable columns={columns} data={rows} />;
}

/** Platform audit (PRD A3): admin actions across all companies. */
export function PlatformAuditPage() {
  const audit = useActivityStore((s) => s.audit);
  const orgs = usePlatformStore((s) => s.orgs);
  const [org, setOrg] = useState('all');
  const { t } = useT();
  const rows = useMemo(() => [...audit].filter((a) => org === 'all' || a.orgId === org).sort((a, b) => b.at.localeCompare(a.at)), [audit, org]);
  return (
    <>
      <div className="mb-5 max-w-xs">
        <SelectField label={t('platform.col.company')} value={org} onChange={(e) => setOrg(e.target.value)} options={[{ value: 'all', label: t('platform.allCompanies') }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
      </div>
      <AuditTable rows={rows} />
    </>
  );
}
