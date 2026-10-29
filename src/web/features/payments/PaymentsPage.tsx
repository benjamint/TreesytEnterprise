import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, RefreshCw, RotateCcw, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Collection, PayableType, Payment } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoActions, useDemoNotes } from '@/components/shared/useDemoNotes';
import { Donut, HBars } from '@/components/charts/charts';
import { answerCollection, approveAndSend, checkPayments, checkStatus, retry, reverse } from '@/services/paymentService';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useCan, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';

type View = 'all' | 'AWAITING_CHECKER' | 'inProgress' | 'FAILED' | 'UNKNOWN' | 'REVERSED' | 'collections';
const VIEWS: View[] = ['all', 'AWAITING_CHECKER', 'inProgress', 'FAILED', 'UNKNOWN', 'REVERSED', 'collections'];
const DAY = 86_400_000;

/** Where the record a payment pays for lives. */
export function payableLink(type: PayableType, id: string): string | undefined {
  switch (type) {
    case 'AGENT_CASH_ADVANCE': return `/app/purchase-requests?open=${id}`;
    case 'PRE_EXPENSE': return `/app/expenses?open=${id}`;
    case 'FARMER_PURCHASE': case 'BULK_FARMER_PURCHASE': return `/app/purchases?open=${id}`;
    case 'AGGREGATOR_PURCHASE': return `/app/aggregators?open=${id}`;
    case 'AGGREGATOR_EXPENSE': return `/app/aggregators/expenses?open=${id}`;
    case 'FARMER_SUPPORT': return `/app/support?open=${id}`;
    case 'FARMER_REFUND': return `/app/recovery/loans?open=${id}`;
    case 'WAREHOUSE_EXPENSE': return `/app/inventory/expenses?open=${id.split('#')[0]}`;
    default: return undefined;
  }
}

const inView = (p: Payment, v: View) => v === 'all' || (v === 'inProgress' ? p.status === 'PENDING' || p.status === 'PROCESSING' : p.status === v);

/** Payments (PRD E1): every payout with fees and status, stats, filters, checker queue, detail with timeline. */
export function PaymentsPage() {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const can = useCan();
  const settings = useOrgSettings();
  const payments = useOrgRows(usePaymentStore((s) => s.payments));
  const collections = useOrgRows(usePaymentStore((s) => s.collections));
  const [params] = useSearchParams();
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>(() => (VIEWS as string[]).includes(params.get('view') ?? '') ? (params.get('view') as View) : 'all');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [provider, setProvider] = useState('');
  const [by, setBy] = useState('');
  const [days, setDays] = useState('');
  const [rejecting, setRejecting] = useState<{ ids: string[]; clear: () => void } | null>(null);
  useDemoNotes([{ id: 'pay', key: 'demo.note.payments' }]);
  const pendingCols = useMemo(() => collections.filter((c) => c.status === 'PENDING'), [collections]);
  const demo = useMemo(() => pendingCols.slice(0, 2).map((c) => ({ id: `ok_${c.id}`, key: 'demo.action.approveCollection', params: { name: c.payer.name, amount: f.money(c.amount) }, run: () => answerCollection(c.id, true, c.payer.userId ?? 'system') })), [pendingCols, f]);
  useDemoActions(demo);

  const provName = (id: string) => settings.paymentProviders.find((p) => p.id === id)?.name ?? id;
  const query = q.trim().toLowerCase();
  const since = days ? Date.now() - Number(days) * DAY : 0;
  const filtered = useMemo(() => payments.filter((p) => (!type || p.payableType === type) && (!provider || p.providerId === provider) && (!by || p.initiatedBy === by) && (!since || new Date(p.createdAt).getTime() >= since) &&
    (!query || p.reference.toLowerCase().includes(query) || p.payee.name.toLowerCase().includes(query) || p.payee.number.includes(query))), [payments, type, provider, by, since, query]);
  const shown = useMemo(() => filtered.filter((p) => inView(p, view)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [filtered, view]);

  const columns = useMemo<ColumnDef<Payment, unknown>[]>(() => [
    { id: 'reference', header: t('col.reference'), accessorKey: 'reference', cell: (c) => <span className="font-mono text-[13px] text-ink">{c.getValue() as string}</span> },
    { id: 'type', header: t('col.type'), accessorKey: 'payableType', cell: (c) => t(`pay.type.${c.getValue() as string}`) },
    { id: 'payee', header: t('col.payee'), accessorFn: (p) => p.payee.name, cell: (c) => <div className="min-w-0"><div className="truncate text-ink">{c.row.original.payee.name}</div><div className="text-[12px] text-muted">{formatPhone(c.row.original.payee.number)}</div></div> },
    { id: 'provider', header: t('col.provider'), accessorFn: (p) => provName(p.providerId) },
    { id: 'amount', header: t('col.amount'), accessorFn: (p) => p.amount.amountMinor, cell: (c) => f.money(c.row.original.amount) },
    { id: 'fee', header: t('pay.fee'), accessorFn: (p) => p.fee.amountMinor, cell: (c) => f.money(c.row.original.fee) },
    { id: 'tax', header: t('pay.tax'), accessorFn: (p) => p.tax.amountMinor, cell: (c) => f.money(c.row.original.tax) },
    { id: 'total', header: t('col.total'), accessorFn: (p) => p.total.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.total)}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'by', header: t('pay.initiatedBy'), accessorFn: (p) => lk.user(p.initiatedBy) },
    { id: 'checker', header: t('pay.approvedBy'), accessorFn: (p) => (p.approvedBy ? lk.user(p.approvedBy) : '—') },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.dateTime(c.getValue() as string) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, lk, settings.paymentProviders]);

  const ok = filtered.filter((p) => p.status === 'SUCCESSFUL');
  const paidTotal = ok.reduce((s, p) => s + p.total.amountMinor, 0);
  const tally = (key: (p: Payment) => string, label: (k: string) => string) => {
    const m = new Map<string, number>();
    for (const p of ok) m.set(key(p), (m.get(key(p)) ?? 0) + p.total.amountMinor);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: label(k), value: v, key: k }));
  };
  const byProvider = tally((p) => p.providerId, provName);
  const money = (v: number) => f.money({ amountMinor: v, currency: f.org.currency }, { compact: true });

  const approve = async (ids: string[], clear?: () => void) => {
    const id = toast.loading(t('pay.toast.sending', { count: ids.length }));
    const { sent, blocked } = await approveAndSend(ids, userId ?? '');
    toast.success(t('pay.toast.checked', { count: sent.length, ok: sent.filter((p) => p.status === 'SUCCESSFUL').length }), { id, description: blocked.length ? t('pay.toast.ownBlocked', { count: blocked.length }) : undefined });
    clear?.();
  };
  const current = payments.find((p) => p.id === openId);

  return (
    <>
      <PageHeader eyebrow={t('nav.section.money')} title={t('nav.payments')} description={t('pages.payments')} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t('pay.kpi.paid')} value={money(paidTotal)} hint={f.money({ amountMinor: paidTotal, currency: f.org.currency })} />
        <Kpi label={t('pay.kpi.count')} value={f.number(filtered.length)} hint={t('pay.kpi.successRate', { pct: filtered.length ? Math.round((ok.length / filtered.length) * 100) : 0 })} />
        <Kpi label={t('pay.kpi.failed')} value={f.number(filtered.filter((p) => p.status === 'FAILED').length)} onClick={() => setView('FAILED')} tone="danger" />
        <Kpi label={t('pay.kpi.awaiting')} value={f.number(filtered.filter((p) => p.status === 'AWAITING_CHECKER').length)} onClick={() => setView('AWAITING_CHECKER')} />
      </div>
      <details className="mb-5 rounded-card border border-line bg-surface shadow-soft">
        <summary className="cursor-pointer px-5 py-3.5 text-[14px] font-semibold text-ink">{t('pay.breakdown')}</summary>
        <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-2">
          <div><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pay.byType')}</h3>{ok.length ? <HBars data={tally((p) => p.payableType, (k) => t(`pay.type.${k}`))} format={money} /> : <TabEmpty>{t('pay.empty')}</TabEmpty>}</div>
          <div><h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pay.byProvider')}</h3>{ok.length ? <Donut data={byProvider.map((d) => ({ ...d, index: settings.paymentProviders.findIndex((p) => p.id === d.key) }))} format={money} /> : <TabEmpty>{t('pay.empty')}</TabEmpty>}</div>
        </div>
      </details>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('pay.search')}
        views={VIEWS.map((v) => ({ key: v, label: t(`pay.view.${v}`), active: view === v, onSelect: () => setView(v), count: v === 'collections' ? collections.length : filtered.filter((p) => inView(p, v)).length }))}
        filters={view === 'collections' ? [] : [
          { key: 'type', label: t('col.type'), value: type, onChange: setType, options: [...new Set(payments.map((p) => p.payableType))].map((x) => ({ value: x, label: t(`pay.type.${x}`) })) },
          { key: 'provider', label: t('col.provider'), value: provider, onChange: setProvider, options: settings.paymentProviders.filter((p) => payments.some((x) => x.providerId === p.id)).map((p) => ({ value: p.id, label: p.name })) },
          { key: 'by', label: t('pay.initiatedBy'), value: by, onChange: setBy, options: [...new Set(payments.map((p) => p.initiatedBy))].map((u) => ({ value: u, label: lk.user(u) })) },
          { key: 'days', label: t('pay.period'), value: days, onChange: setDays, options: ['1', '7', '30', '90'].map((d) => ({ value: d, label: t('buy.lastDays', { count: Number(d) }) })) },
        ]}
        onClear={() => { setQ(''); setType(''); setProvider(''); setBy(''); setDays(''); setView('all'); }}
      />
      {view === 'collections' ? <CollectionsTable rows={collections} /> : (
        <DataTable
          columns={columns}
          data={shown}
          onRowClick={(p) => open(p.id)}
          activeId={openId}
          getRowId={(p) => p.id}
          columnPicker
          initialHidden={['fee', 'tax', 'checker']}
          bulkActions={(sel, clear) => {
            const waiting = sel.filter((p) => p.status === 'AWAITING_CHECKER').map((p) => p.id);
            const failed = sel.filter((p) => p.status === 'FAILED');
            return (
              <>
                {waiting.length > 0 && can('payments.check') && <Button size="sm" onClick={() => void approve(waiting, clear)}><Check /> {t('pay.approveSend', { count: waiting.length })}</Button>}
                {waiting.length > 0 && can('payments.check') && <Button size="sm" variant="dangerOutline" onClick={() => setRejecting({ ids: waiting, clear })}><X /> {t('pay.reject')}</Button>}
                {failed.length > 0 && can('payments.retry') && <Button size="sm" variant="secondary" onClick={async () => { for (const p of failed) await retry(p.id, userId ?? 'system'); toast.success(t('pay.toast.retried', { count: failed.length })); clear(); }}><RotateCcw /> {t('pay.retrySelected', { count: failed.length })}</Button>}
              </>
            );
          }}
          exportCsv={{ fileName: 'payments.csv', columns: [
            { header: t('col.reference'), value: (p) => p.reference }, { header: t('col.type'), value: (p) => p.payableType }, { header: t('col.payee'), value: (p) => p.payee.name }, { header: t('pay.walletNumberShort'), value: (p) => p.payee.number },
            { header: t('col.provider'), value: (p) => provName(p.providerId) }, { header: t('col.amount'), value: (p) => p.amount.amountMinor / 100 }, { header: t('pay.fee'), value: (p) => p.fee.amountMinor / 100 },
            { header: t('pay.tax'), value: (p) => p.tax.amountMinor / 100 }, { header: t('col.total'), value: (p) => p.total.amountMinor / 100 }, { header: t('pay.currency'), value: (p) => p.total.currency },
            { header: t('col.status'), value: (p) => p.status }, { header: t('pay.initiatedBy'), value: (p) => lk.user(p.initiatedBy) }, { header: t('pay.approvedBy'), value: (p) => (p.approvedBy ? lk.user(p.approvedBy) : '') }, { header: t('col.date'), value: (p) => p.createdAt },
          ] }}
          empty={t('pay.empty')}
        />
      )}
      {current && <PaymentDrawer key={current.id} payment={current} onClose={close} onApprove={() => void approve([current.id])} onReject={() => setRejecting({ ids: [current.id], clear: () => undefined })} />}
      {rejecting && (
        <ReasonDialog title={t('pay.rejectTitle', { count: rejecting.ids.length })} confirm={t('pay.reject')} danger onClose={() => setRejecting(null)} onConfirm={(note) => {
          const res = checkPayments(rejecting.ids, userId ?? '', 'reject', note);
          toast.success(t('pay.toast.rejected', { count: res.ok.length }), { description: res.blocked.length ? t('pay.toast.ownBlocked', { count: res.blocked.length }) : undefined });
          rejecting.clear();
          setRejecting(null);
        }} />
      )}
    </>
  );
}

function Kpi({ label, value, hint, onClick, tone }: { label: string; value: string; hint?: string; onClick?: () => void; tone?: 'danger' }) {
  const body = (<><div className="eyebrow">{label}</div><div className={cn('tnum mt-2 text-[26px] font-semibold leading-none', tone === 'danger' && value !== '0' ? 'text-danger' : 'text-ink')}>{value}</div>{hint && <div className="mt-1.5 text-[12px] text-muted">{hint}</div>}</>);
  const cls = 'flex flex-col items-start rounded-card border border-line bg-surface p-5 text-left shadow-soft';
  return onClick ? <button type="button" onClick={onClick} className={cn(cls, 'transition-colors hover:border-brand/40')}>{body}</button> : <div className={cls}>{body}</div>;
}

function CollectionsTable({ rows }: { rows: Collection[] }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sorted = useMemo(() => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rows]);
  const columns = useMemo<ColumnDef<Collection, unknown>[]>(() => [
    { id: 'reference', header: t('col.reference'), accessorKey: 'reference', cell: (c) => <span className="font-mono text-[13px] text-ink">{c.getValue() as string}</span> },
    { id: 'payer', header: t('pay.payer'), accessorFn: (c) => c.payer.name, cell: (c) => <div><div className="text-ink">{c.row.original.payer.name}</div><div className="text-[12px] text-muted">{formatPhone(c.row.original.payer.number)}</div></div> },
    { id: 'amount', header: t('col.amount'), accessorFn: (c) => c.amount.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.amount)}</span> },
    { id: 'reason', header: t('pay.collectionFor'), accessorKey: 'reason', cell: (c) => <span className="font-mono text-[13px]">{c.getValue() as string}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <Badge tone={c.getValue() === 'SUCCESSFUL' ? 'success' : c.getValue() === 'PENDING' ? 'warning' : 'dangerOutline'}>{t(`pay.collectionStatus.${c.getValue() as string}`)}</Badge> },
    { id: 'by', header: t('pay.requestedBy'), accessorFn: (c) => lk.user(c.requestedBy) },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.dateTime(c.getValue() as string) },
  ], [t, f, lk]);
  return <DataTable columns={columns} data={sorted} empty={t('pay.noCollections')} />;
}

/** Timeline from stored events, or rebuilt from the status for older (seeded) payments. */
function timelineOf(p: Payment): { at: string; key: string; by?: string; note?: string }[] {
  if (p.events?.length) return p.events;
  const at = p.createdAt;
  const later = new Date(new Date(at).getTime() + 90_000).toISOString();
  const ev: { at: string; key: string; by?: string; note?: string }[] = [{ at, key: 'initiated', by: p.initiatedBy }];
  if (p.approvedBy) ev.push({ at, key: 'checked', by: p.approvedBy });
  if (p.status === 'AWAITING_CHECKER') ev.push({ at, key: 'awaitingChecker' });
  else if (p.status !== 'PENDING') ev.push({ at, key: 'accepted' });
  if (['SUCCESSFUL', 'FAILED', 'UNKNOWN', 'REVERSED'].includes(p.status)) ev.push({ at: later, key: `callback.${p.status === 'REVERSED' ? 'successful' : p.status.toLowerCase()}`, note: p.failureReason });
  if (p.status === 'REVERSED') ev.push({ at: later, key: 'reversed', note: p.failureReason });
  return ev;
}

function PaymentDrawer({ payment: p, onClose, onApprove, onReject }: { payment: Payment; onClose: () => void; onApprove: () => void; onReject: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const can = useCan();
  const settings = useOrgSettings();
  const all = usePaymentStore((s) => s.payments);
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState(false);
  const link = payableLink(p.payableType, p.payableId);
  const chain = all.filter((x) => x.payableId === p.payableId && x.id !== p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false); };
  const ownPayment = p.initiatedBy === userId;
  const response = p.response ?? { transactionId: p.providerRef ?? `TX${p.reference.replace(/\D/g, '')}`, status: p.status === 'UNKNOWN' ? 'PENDING' : p.status, amount: p.amount.amountMinor / 100, currency: p.amount.currency, payer: { partyIdType: 'MSISDN', partyId: p.payee.number }, payeeNote: p.reference, reason: p.failureReason };
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{p.reference}</span>}
        subtitle={`${t(`pay.type.${p.payableType}`)} · ${p.payee.name} · ${f.dateTime(p.createdAt)}`}
        badges={<><StatusBadge status={p.status} />{p.batchId && <Badge tone="neutral">{t('pay.bulk')}</Badge>}{p.retryOf && <Badge tone="neutral">{t('pay.retryBadge')}</Badge>}</>}
        actions={
          <>
            {p.status === 'AWAITING_CHECKER' && can('payments.check') && (ownPayment ? <p className="text-[13px] text-muted">{t('pay.ownPayment')}</p> : <><Button size="sm" onClick={onApprove}><Check /> {t('pay.approveSendOne')}</Button><Button size="sm" variant="dangerOutline" onClick={onReject}><X /> {t('pay.reject')}</Button></>)}
            {p.status === 'FAILED' && !chain.some((x) => x.retryOf === p.id) && <PermissionGate permission="payments.retry"><Button size="sm" disabled={busy} onClick={() => void run(() => retry(p.id, userId ?? 'system'))}><RotateCcw /> {t('buy.retry')}</Button></PermissionGate>}
            {p.status === 'UNKNOWN' && <PermissionGate permission="payments.retry"><Button size="sm" disabled={busy} onClick={() => void run(() => checkStatus(p.id, userId ?? 'system'))}><RefreshCw /> {t('pay.checkStatus')}</Button></PermissionGate>}
            {p.status === 'SUCCESSFUL' && <PermissionGate permission="payments.reverse"><Button size="sm" variant="secondary" onClick={() => setReversing(true)}><Undo2 /> {t('pay.markReversed')}</Button></PermissionGate>}
            {link && <Button size="sm" variant="ghost" asChild><Link to={link}>{t('pay.openPayable')}</Link></Button>}
          </>
        }
        tabs={[
          {
            key: 'detail', label: t('buy.tab.summary'), content: (
              <div className="space-y-5">
                <Facts items={[
                  [t('col.payee'), p.payee.name], [t('pay.walletNumberShort'), formatPhone(p.payee.number)], [t('col.provider'), settings.paymentProviders.find((x) => x.id === p.providerId)?.name ?? '—'], [t('col.type'), t(`pay.type.${p.payableType}`)],
                  [t('col.amount'), f.money(p.amount)], [t('pay.fee'), f.money(p.fee)], [t('pay.tax'), f.money(p.tax)], [t('pay.withdrawal'), p.withdrawal ? f.money(p.withdrawal) : '—'],
                  [t('pay.extraCharges'), p.extras ? f.money(p.extras) : '—'], [t('col.total'), f.money(p.total)], [t('pay.received'), p.received ? f.money(p.received) : '—'],
                  [t('pay.initiatedBy'), lk.user(p.initiatedBy)], [t('pay.approvedBy'), p.approvedBy ? lk.user(p.approvedBy) : '—'],
                ]} />
                {p.failureReason && <p className="rounded-ctl border border-danger/30 bg-danger/5 px-3 py-2 text-[14px] text-ink">{p.failureReason}</p>}
                <div>
                  <h4 className="mb-3 text-[13px] font-semibold text-ink">{t('pay.timeline')}</h4>
                  <ol className="relative space-y-3 border-l border-line pl-5">
                    {timelineOf(p).map((e, i) => (
                      <li key={i} className="relative">
                        <span className={cn('absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface', e.key.includes('failed') || e.key.includes('rejected') ? 'bg-danger' : e.key.includes('successful') ? 'bg-success' : 'bg-brand')} aria-hidden="true" />
                        <div className="text-[14px] text-ink">{t(`pay.event.${e.key}`, { defaultValue: e.key })}{e.note ? ` · ${e.note}` : ''}</div>
                        <div className="text-[12px] text-muted">{e.by ? `${lk.user(e.by)} · ` : ''}{f.dateTime(e.at)}</div>
                      </li>
                    ))}
                  </ol>
                </div>
                {chain.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-semibold text-ink">{t('pay.otherAttempts')}</h4>
                    <ul className="divide-y divide-line rounded-ctl border border-line">
                      {chain.map((x) => <li key={x.id} className="flex items-center gap-3 px-4 py-2 text-[13px]"><span className="font-mono text-ink">{x.reference}</span><StatusBadge status={x.status} /><span className="flex-1 truncate text-muted">{x.failureReason ?? ''}</span><span className="text-muted">{f.dateTime(x.createdAt)}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            ),
          },
          { key: 'response', label: t('pay.response'), content: <pre className="overflow-x-auto rounded-ctl bg-canvas p-4 font-mono text-[12px] leading-relaxed text-ink">{JSON.stringify(response, null, 2)}</pre> },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="payment" entityId={p.id} /> },
        ]}
      />
      {reversing && <ReasonDialog title={t('pay.reverseTitle', { reference: p.reference })} description={t('pay.reverseHint')} confirm={t('pay.markReversed')} danger onClose={() => setReversing(false)} onConfirm={(note) => { reverse(p.id, userId ?? 'system', note); setReversing(false); toast.success(t('pay.toast.reversed', { reference: p.reference })); }} />}
    </>
  );
}

function ReasonDialog({ title, description, confirm, danger, onClose, onConfirm }: { title: string; description?: string; confirm: string; danger?: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <Input compact autoFocus value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('dashboard.reason')} placeholder={t('dashboard.reasonPlaceholder')} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!note.trim()} onClick={() => onConfirm(note.trim())}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
