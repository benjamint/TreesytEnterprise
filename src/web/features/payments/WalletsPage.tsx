import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Plus, Wallet as WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Money, Wallet } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { requestTopUp } from '@/services/paymentService';
import { cn } from '@/lib/utils';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { AmountDialog } from '@/web/features/buying/common';

interface Txn { id: string; at: string; kind: 'payout' | 'reversal' | 'topUp' | 'collection'; label: string; reference: string; amount: Money; status: string }

/** Wallets & balances (PRD E1): one card per provider wallet, low-balance alerts, transactions, top-up. */
export function WalletsPage() {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const wallets = useOrgRows(usePaymentStore((s) => s.wallets));
  const payments = useOrgRows(usePaymentStore((s) => s.payments));
  const topUps = useOrgRows(usePaymentStore((s) => s.topUps));
  const collections = useOrgRows(usePaymentStore((s) => s.collections));
  const [selected, setSelected] = useState<string>(wallets[0]?.id ?? '');
  const [topUp, setTopUp] = useState<Wallet | null>(null);
  useDemoNotes([{ id: 'wal', key: 'demo.note.wallets' }]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const wallet = wallets.find((w) => w.id === selected) ?? wallets[0];

  const txns = useMemo<Txn[]>(() => {
    if (!wallet) return [];
    const out: Txn[] = [];
    for (const p of payments.filter((x) => x.providerId === wallet.providerId && ['SUCCESSFUL', 'REVERSED'].includes(x.status))) {
      out.push({ id: p.id, at: p.createdAt, kind: 'payout', label: p.payee.name, reference: p.reference, amount: { ...p.total, amountMinor: -p.total.amountMinor }, status: p.status });
      if (p.status === 'REVERSED') out.push({ id: `${p.id}_rev`, at: p.events?.find((e) => e.key === 'reversed')?.at ?? p.createdAt, kind: 'reversal', label: p.payee.name, reference: p.reference, amount: p.total, status: 'REVERSED' });
    }
    for (const x of topUps.filter((x) => x.walletId === wallet.id)) out.push({ id: x.id, at: x.createdAt, kind: 'topUp', label: lk.user(x.requestedBy), reference: x.note ?? '—', amount: x.amount, status: x.status });
    for (const c of collections.filter((x) => x.providerId === wallet.providerId && x.status === 'SUCCESSFUL')) out.push({ id: c.id, at: c.settledAt ?? c.createdAt, kind: 'collection', label: c.payer.name, reference: c.reference, amount: c.amount, status: c.status });
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [wallet, payments, topUps, collections, lk]);

  const columns = useMemo<ColumnDef<Txn, unknown>[]>(() => [
    { id: 'date', header: t('col.date'), accessorKey: 'at', cell: (c) => f.dateTime(c.getValue() as string) },
    { id: 'kind', header: t('col.type'), accessorKey: 'kind', cell: (c) => <span className="inline-flex items-center gap-1.5">{(c.getValue() as string) === 'payout' ? <ArrowUpRight className="h-3.5 w-3.5 text-danger" /> : <ArrowDownLeft className="h-3.5 w-3.5 text-success" />}{t(`wal.kind.${c.getValue() as string}`)}</span> },
    { id: 'label', header: t('wal.party'), accessorKey: 'label' },
    { id: 'reference', header: t('col.reference'), accessorKey: 'reference', cell: (c) => <span className="font-mono text-[13px]">{c.getValue() as string}</span> },
    { id: 'amount', header: t('col.amount'), accessorFn: (x) => x.amount.amountMinor, cell: (c) => <span className={cn('font-medium', c.row.original.amount.amountMinor < 0 ? 'text-ink' : 'text-success')}>{`${c.row.original.amount.amountMinor > 0 ? '+' : ''}${f.money(c.row.original.amount)}`}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <Badge tone={c.getValue() === 'REQUESTED' ? 'warning' : c.getValue() === 'REVERSED' ? 'warningOutline' : 'success'}>{t(`wal.status.${c.getValue() as string}`, { defaultValue: c.getValue() as string })}</Badge> },
  ], [t, f]);

  return (
    <>
      <PageHeader eyebrow={t('nav.section.money')} title={t('nav.wallets')} description={t('pages.wallets')} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {wallets.map((w) => {
          const low = w.balance.amountMinor < w.lowBalanceThreshold.amountMinor;
          const outToday = payments.filter((p) => p.providerId === w.providerId && p.status === 'SUCCESSFUL' && new Date(p.createdAt) >= today).reduce((s, p) => s + p.total.amountMinor, 0);
          const pendingTop = topUps.filter((x) => x.walletId === w.id && x.status === 'REQUESTED').reduce((s, x) => s + x.amount.amountMinor, 0);
          return (
            <section key={w.id} className={cn('rounded-card border bg-surface p-5 shadow-soft transition-colors', w.id === wallet?.id ? 'border-brand' : 'border-line', low && 'ring-1 ring-warning/40')} aria-label={w.name}>
              <button type="button" onClick={() => setSelected(w.id)} className="w-full text-left" aria-pressed={w.id === wallet?.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[15px] font-semibold text-ink"><WalletIcon className="h-4 w-4 text-brand" aria-hidden="true" />{w.name}</span>
                  {low && <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> {t('wal.low')}</Badge>}
                </div>
                <div className="tnum mt-3 text-[30px] font-semibold leading-none text-ink">{f.money(w.balance)}</div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <div><dt className="text-muted">{t('wal.threshold')}</dt><dd className="tnum text-body">{f.money(w.lowBalanceThreshold)}</dd></div>
                  <div><dt className="text-muted">{t('wal.lastTopUp')}</dt><dd className="text-body">{f.date(w.lastTopUpAt)}</dd></div>
                  <div><dt className="text-muted">{t('wal.outToday')}</dt><dd className="tnum text-body">{f.money({ amountMinor: outToday, currency: w.balance.currency })}</dd></div>
                  {pendingTop > 0 && <div><dt className="text-muted">{t('wal.pendingTopUp')}</dt><dd className="tnum text-warning">{f.money({ amountMinor: pendingTop, currency: w.balance.currency })}</dd></div>}
                </dl>
              </button>
              <PermissionGate permission="wallets.topUp"><Button size="sm" variant={low ? 'primary' : 'secondary'} className="mt-4 w-full" onClick={() => setTopUp(w)}><Plus /> {t('pay.requestTopUp')}</Button></PermissionGate>
            </section>
          );
        })}
      </div>
      {wallet && (
        <>
          <h2 className="mb-3 text-[18px] font-semibold text-ink">{t('wal.transactions', { wallet: wallet.name })}</h2>
          <DataTable columns={columns} data={txns} pageSize={15} exportCsv={{ fileName: 'wallet-transactions.csv', columns: [
            { header: t('col.date'), value: (x) => x.at }, { header: t('col.type'), value: (x) => x.kind }, { header: t('wal.party'), value: (x) => x.label }, { header: t('col.reference'), value: (x) => x.reference }, { header: t('col.amount'), value: (x) => x.amount.amountMinor / 100 },
          ] }} empty={t('wal.noTxns')} />
        </>
      )}
      {topUp && (
        <AmountDialog
          open
          onClose={() => setTopUp(null)}
          title={t('wal.topUpTitle', { wallet: topUp.name })}
          description={t('wal.topUpHint')}
          initialMinor={Math.max(topUp.lowBalanceThreshold.amountMinor * 2 - topUp.balance.amountMinor, topUp.lowBalanceThreshold.amountMinor)}
          currency={topUp.balance.currency}
          reasonLabel={t('wal.topUpNote')}
          confirm={t('pay.requestTopUp')}
          onConfirm={(v) => { requestTopUp(orgId, topUp.id, { amountMinor: v.amountMinor, currency: topUp.balance.currency }, userId ?? 'system', v.reason || undefined); setTopUp(null); toast.success(t('wal.topUpSent', { amount: f.money({ amountMinor: v.amountMinor, currency: topUp.balance.currency }) })); }}
        />
      )}
    </>
  );
}
