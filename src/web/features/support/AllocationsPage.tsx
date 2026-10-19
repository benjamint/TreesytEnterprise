import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { LegacyAllocation } from '@/types';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { migrateLegacy } from '@/services/recoveryService';
import { useSupportStore } from '@/stores/supportStore';
import { useActor, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { VoicePlayer } from '@/web/features/buying/common';
import { useSupportLookups } from './shared';

/** Allocations archive (PRD F5): read-only past allocations; one can be migrated into a loan. */
export function AllocationsPage() {
  const { t, terms } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const rows = useOrgRows(useSupportStore((s) => s.legacy));
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const paid = (a: LegacyAllocation) => a.repayments.reduce((s, r) => s + r.amount.amountMinor, 0);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((a) => (!status || a.status === status) && (!mode || a.repaymentMode === mode) && (!query || sl.farmerName(a.farmerId).toLowerCase().includes(query) || a.type.toLowerCase().includes(query))).sort((a, b) => b.date.localeCompare(a.date));
  const perFarmer = useMemo(() => { const m = new Map<string, number>(); for (const a of rows) m.set(a.farmerId, (m.get(a.farmerId) ?? 0) + a.amount.amountMinor - paid(a)); return m; }, [rows]);
  const columns = useMemo<ColumnDef<LegacyAllocation, unknown>[]>(() => [
    { id: 'farmer', header: terms.farmer, accessorFn: (a) => sl.farmerName(a.farmerId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'type', header: t('col.type'), accessorKey: 'type' },
    { id: 'quantity', header: t('col.quantity'), accessorFn: (a) => `${f.number(a.quantity)} ${a.unit}` },
    { id: 'amount', header: t('col.amount'), accessorFn: (a) => a.amount.amountMinor, cell: (c) => f.money(c.row.original.amount) },
    { id: 'mode', header: t('sup.repaymentMode'), accessorKey: 'repaymentMode', cell: (c) => t(`sup.legacyMode.${c.getValue() as string}`) },
    { id: 'repaid', header: t('sup.repaid'), accessorFn: paid, cell: (c) => f.money({ amountMinor: c.getValue() as number, currency: c.row.original.amount.currency }) },
    { id: 'farmerTotal', header: t('sup.farmerOwes'), accessorFn: (a) => perFarmer.get(a.farmerId) ?? 0, cell: (c) => f.money({ amountMinor: c.getValue() as number, currency: c.row.original.amount.currency }) },
    { id: 'date', header: t('col.date'), accessorKey: 'date', cell: (c) => f.date(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <span className="flex items-center gap-1.5"><StatusBadge status={c.getValue() as string} />{c.row.original.migratedLoanId && <StatusBadge status="MIGRATED" />}</span> },
  ], [t, f, sl, terms, perFarmer]);
  const current = rows.find((a) => a.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.support')} title={t('nav.allocations')} description={t('pages.allocations')} />
      <p className="mb-4 flex items-center gap-2 rounded-ctl border border-line bg-canvas px-4 py-2.5 text-[14px] text-body"><Lock className="h-4 w-4 text-muted" />{t('sup.archiveHint')}</p>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('sup.searchArchive')}
        filters={[
          { key: 'status', label: t('col.status'), value: status, onChange: setStatus, options: (['FULLY_PAID', 'PARTIALLY_PAID', 'NOT_PAID'] as const).map((s) => ({ value: s, label: t(`status.${s}`) })) },
          { key: 'mode', label: t('sup.repaymentMode'), value: mode, onChange: setMode, options: (['MONEY', 'FARM_PRODUCE'] as const).map((s) => ({ value: s, label: t(`sup.legacyMode.${s}`) })) },
        ]}
        onClear={() => { setQ(''); setStatus(''); setMode(''); }}
      />
      <DataTable columns={columns} data={shown} onRowClick={(a) => open(a.id)} activeId={openId} getRowId={(a) => a.id} columnPicker initialHidden={['farmerTotal']}
        exportCsv={{ fileName: 'allocations-archive.csv', columns: [{ header: terms.farmer, value: (a) => sl.farmerName(a.farmerId) }, { header: t('col.type'), value: (a) => a.type }, { header: t('col.amount'), value: (a) => a.amount.amountMinor }, { header: t('sup.repaid'), value: paid }, { header: t('col.status'), value: (a) => a.status }] }}
        empty={t('sup.emptyArchive')} />
      {current && <AllocationDrawer key={current.id} allocation={current} onClose={close} />}
    </>
  );
}

function AllocationDrawer({ allocation: a, onClose }: { allocation: LegacyAllocation; onClose: () => void }) {
  const { userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const owed = a.amount.amountMinor - a.repayments.reduce((s, r) => s + r.amount.amountMinor, 0);
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={`${a.type} · ${sl.farmerName(a.farmerId)}`}
      subtitle={f.date(a.date)}
      badges={<><StatusBadge status={a.status} />{a.migratedLoanId && <StatusBadge status="MIGRATED" />}</>}
      actions={!a.migratedLoanId && owed > 0 ? <PermissionGate permission="support.edit"><Button size="sm" onClick={() => { const l = migrateLegacy(a.id, userId ?? 'system'); if (l) toast.success(t('sup.toast.migrated', { amount: f.money(l.principal) })); }}><ArrowRightLeft /> {t('sup.migrate')}</Button></PermissionGate> : null}
      tabs={[
        {
          key: 'details', label: t('agg.tabDetails'), content: (
            <div className="space-y-4">
              <Facts items={[[terms.farmer, <Link key="f" to={`/app/farmers?open=${a.farmerId}`} className="text-brand hover:underline">{sl.farmerName(a.farmerId)}</Link>], [t('col.quantity'), `${f.number(a.quantity)} ${a.unit}`], [t('col.amount'), f.money(a.amount)], [t('sup.repaymentMode'), t(`sup.legacyMode.${a.repaymentMode}`)], [t('sup.owed'), f.money({ amountMinor: Math.max(0, owed), currency: a.amount.currency })], [t('sup.migratedTo'), a.migratedLoanId ? <Link key="l" to={`/app/recovery/loans?open=${a.migratedLoanId}`} className="text-brand hover:underline">{t('sup.openLoan')}</Link> : '—']]} />
              {a.voiceNote && <div><div className="eyebrow mb-1.5">{t('mobile.m5.voiceNote')}</div><VoicePlayer id={a.id} seconds={a.voiceNote} /></div>}
            </div>
          ),
        },
        {
          key: 'repayments', label: t('sup.repayments'), count: a.repayments.length, content: a.repayments.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line">{a.repayments.map((r, i) => <li key={i} className="flex items-center justify-between px-4 py-3 text-[14px]"><span className="text-ink">{f.date(r.date)}{r.purchaseNumber ? ` · ${r.purchaseNumber}` : ''}</span><span className="tnum font-medium text-ink">{f.money(r.amount)}</span></li>)}</ul>
          ) : <TabEmpty>{t('sup.noRepayments')}</TabEmpty>,
        },
      ]}
    />
  );
}
