import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, CheckCheck, HandCoins, RefreshCcw, Smartphone, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseRequest } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoActions, useDemoNotes } from '@/components/shared/useDemoNotes';
import { Waterfall } from '@/components/charts/charts';
import { autoReconcile, collectRefund, markReconciled, reconSummary, recordRefund, writeOff, type ReconStatus } from '@/services/buyingService';
import { answerCollection, inFlight } from '@/services/paymentService';
import { usePaymentStore } from '@/stores/paymentStore';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { useBuyingStore } from '@/stores/buyingStore';
import { useActor, useCan, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { AmountDialog, Panel, PaymentState, mono, useFarmerNames } from './common';

const TONE: Record<ReconStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'done' | 'teal' | 'paid'> = {
  NOT_STARTED: 'neutral', FULFILLED: 'success', OVERPAID: 'danger', REFUND_AGENT: 'warning', RECEIVE_REFUND: 'warning', RECONCILED: 'done', TICKET_ACTIVATED: 'teal', PARTIALLY_PAID: 'info', FULLY_PAID: 'paid',
};
const DAY = 86_400_000;

export function ReconBadge({ status }: { status: ReconStatus }) {
  const { t } = useT();
  return <Badge tone={TONE[status]}>{t(`buy.reconStatus.${status}`)}</Badge>;
}

/** Reconciliation list (PRD D5): money given vs bought, refunds, write-offs, gap, volume, status, auto-matched chip. */
export function ReconciliationPage() {
  const { orgId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const orgMoney = f.money;
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const purchases = useBuyingStore((s) => s.purchases);
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'open' | 'all' | 'reconciled'>('open');
  const [status, setStatus] = useState('');
  const [agent, setAgent] = useState('');
  const [model, setModel] = useState('');
  useDemoNotes([{ id: 'rec', key: 'demo.note.reconciliation' }]);
  const collections = useOrgRows(usePaymentStore((x) => x.collections));
  const demo = useMemo(() => collections.filter((c) => c.status === 'PENDING' && c.payableType === 'AGENT_REFUND').slice(0, 3).flatMap((c) => [
    { id: `ok_${c.id}`, key: 'demo.action.approveCollection', params: { name: c.payer.name, amount: orgMoney(c.amount) }, run: () => answerCollection(c.id, true, c.payer.userId ?? 'system') },
    { id: `no_${c.id}`, key: 'demo.action.declineCollection', params: { name: c.payer.name }, run: () => answerCollection(c.id, false, c.payer.userId ?? 'system') },
  ]), [collections, orgMoney]);
  useDemoActions(demo);

  const rows = useMemo(() => requests
    .filter((r) => r.fundsReceived || r.disbursements.length || r.ticketActivatedAt || r.reconciliationStatus === 'RECONCILED')
    .map((r) => ({ r, s: reconSummary(r, purchases, settings) })), [requests, purchases, settings]);
  type Row = (typeof rows)[number];
  const inView = (x: Row, v: typeof view) => v === 'all' || (v === 'reconciled' ? x.s.status === 'RECONCILED' : x.s.status !== 'RECONCILED');
  const query = q.trim().toLowerCase();
  const shown = rows.filter((x) => inView(x, view) && (!status || x.s.status === status) && (!agent || x.r.agentId === agent) && (!model || x.r.sourcingModel === model) &&
    (!query || x.r.number.toLowerCase().includes(query) || lk.agent(x.r.agentId).toLowerCase().includes(query))).sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt));
  const cur = (minor: number) => f.money({ amountMinor: minor, currency: f.org.currency });
  const openRows = rows.filter((x) => x.s.status !== 'RECONCILED' && x.r.sourcingModel === 'CASH_ADVANCE');

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'number', header: terms.purchaseRequest, accessorFn: (x) => x.r.number, cell: (c) => mono(c.getValue() as string) },
    { id: 'agent', header: terms.agent, accessorFn: (x) => lk.agent(x.r.agentId) },
    { id: 'given', header: t('buy.moneyGiven'), accessorFn: (x) => x.s.given, cell: (c) => (c.row.original.r.sourcingModel === 'DIRECT_PAYMENT' ? '—' : cur(c.getValue() as number)) },
    { id: 'bought', header: t('buy.valueBought'), accessorFn: (x) => x.s.bought, cell: (c) => cur(c.getValue() as number) },
    { id: 'refunds', header: t('buy.refunds'), accessorFn: (x) => x.s.refunds, cell: (c) => ((c.getValue() as number) ? cur(c.getValue() as number) : '—') },
    { id: 'writeOffs', header: t('buy.writeOffs'), accessorFn: (x) => x.s.writeOffs, cell: (c) => ((c.getValue() as number) ? cur(c.getValue() as number) : '—') },
    { id: 'gap', header: t('buy.gap'), accessorFn: (x) => (x.r.sourcingModel === 'DIRECT_PAYMENT' ? 0 : x.s.gap), cell: (c) => (c.row.original.r.sourcingModel === 'DIRECT_PAYMENT' ? '—' : <span className={['RECEIVE_REFUND', 'REFUND_AGENT', 'OVERPAID'].includes(c.row.original.s.status) ? 'font-semibold text-warning' : 'text-ink'}>{cur(c.getValue() as number)}</span>) },
    { id: 'volume', header: t('col.volume'), accessorFn: (x) => x.s.boughtKg / (x.s.plannedKg || 1), cell: (c) => `${f.kg(c.row.original.s.plannedKg)} → ${f.kg(c.row.original.s.boughtKg)}` },
    { id: 'status', header: t('col.status'), accessorFn: (x) => x.s.status, cell: (c) => <span className="inline-flex gap-1"><ReconBadge status={c.row.original.s.status} />{c.row.original.r.autoMatched && <Badge tone="brand">{t('buy.autoMatched')}</Badge>}</span> },
    { id: 'age', header: t('buy.age'), accessorFn: (x) => Date.now() - new Date(x.r.createdAt).getTime(), cell: (c) => t('buy.days', { count: Math.floor((c.getValue() as number) / DAY) }) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, lk, terms]);

  const current = rows.find((x) => x.r.id === openId)?.r;
  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.buying')}
        title={t('nav.reconciliation')}
        description={t('pages.reconciliation')}
        primary={<PermissionGate permission="reconciliation.reconcile"><Button onClick={() => { const n = autoReconcile(orgId); toast.success(t('buy.toast.autoRun', { count: n })); }}><RefreshCcw /> {t('buy.runAutoMatch')}</Button></PermissionGate>}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t('buy.stat.openRecon')} value={f.number(openRows.length)} />
        <Kpi label={t('buy.stat.cashToRefund')} value={cur(openRows.filter((x) => x.s.status === 'RECEIVE_REFUND').reduce((s, x) => s + x.s.gap, 0))} hint={t('buy.stat.withPurchases')} />
        <Kpi label={t('buy.stat.owedToAgents', { agents: terms.agents.toLocaleLowerCase() })} value={cur(openRows.filter((x) => ['REFUND_AGENT', 'OVERPAID'].includes(x.s.status)).reduce((s, x) => s - x.s.gap, 0))} />
        <Kpi label={t('buy.stat.autoMatched')} value={`${f.number(rows.filter((x) => x.r.autoMatched).length)} / ${f.number(rows.length)}`} hint={t('buy.toleranceHint', { amount: cur(settings.buyingRules.reconToleranceMinor), pct: settings.buyingRules.reconTolerancePct })} />
      </div>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('buy.searchRequests')}
        views={(['open', 'reconciled', 'all'] as const).map((v) => ({ key: v, label: t(`buy.reconView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((x) => inView(x, v)).length }))}
        filters={[
          { key: 'status', label: t('col.status'), value: status, onChange: setStatus, options: (Object.keys(TONE) as ReconStatus[]).filter((s) => rows.some((x) => x.s.status === s)).map((s) => ({ value: s, label: t(`buy.reconStatus.${s}`) })) },
          { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => rows.some((x) => x.r.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })).sort((a, b) => a.label.localeCompare(b.label)) },
          { key: 'model', label: t('buy.sourcing'), value: model, onChange: setModel, options: (['CASH_ADVANCE', 'DIRECT_PAYMENT'] as const).map((s) => ({ value: s, label: t(`buy.sourcingName.${s}`) })) },
        ]}
        onClear={() => { setQ(''); setStatus(''); setAgent(''); setModel(''); setView('open'); }}
      />
      <DataTable
        columns={columns}
        data={shown}
        onRowClick={(x) => open(x.r.id)}
        activeId={openId}
        getRowId={(x) => x.r.id}
        columnPicker
        initialHidden={['writeOffs', 'age']}
        exportCsv={{ fileName: 'reconciliation.csv', columns: [
          { header: terms.purchaseRequest, value: (x) => x.r.number }, { header: terms.agent, value: (x) => lk.agent(x.r.agentId) }, { header: t('buy.moneyGiven'), value: (x) => x.s.given / 100 },
          { header: t('buy.valueBought'), value: (x) => x.s.bought / 100 }, { header: t('buy.refunds'), value: (x) => x.s.refunds / 100 }, { header: t('buy.gap'), value: (x) => x.s.gap / 100 }, { header: t('col.status'), value: (x) => x.s.status },
        ] }}
        empty={t('buy.emptyRecon')}
      />
      {current && (
        <DetailDrawer
          key={current.id}
          open
          onClose={close}
          title={<span className="font-mono">{current.number}</span>}
          subtitle={`${lk.agent(current.agentId)} · ${lk.community(current.communityId)} · ${lk.commodity(current.commodityId)}`}
          badges={<><ReconBadge status={reconSummary(current, purchases, settings).status} />{current.autoMatched && <Badge tone="brand">{t('buy.autoMatched')}</Badge>}</>}
          tabs={[
            { key: 'detail', label: t('buy.tab.reconciliation'), content: <ReconDetail request={current} /> },
            { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="purchaseRequest" entityId={current.id} /> },
          ]}
        />
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <div className="eyebrow">{label}</div>
      <div className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{value}</div>
      {hint && <div className="mt-1.5 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}

/** Reconciliation detail (PRD D5): waterfall, purchases, volume difference and settlement actions. */
export function ReconDetail({ request: r, compact, onOpenPage }: { request: PurchaseRequest; compact?: boolean; onOpenPage?: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const can = useCan();
  const lk = useLookups();
  const fn = useFarmerNames();
  const settings = useOrgSettings();
  const purchases = useBuyingStore((s) => s.purchases);
  const s = reconSummary(r, purchases, settings);
  const [dialog, setDialog] = useState<'refund' | 'writeOff' | null>(null);
  const [paying, setPaying] = useState(false);
  const collections = usePaymentStore((x) => x.collections);
  const pendingCollection = collections.find((c) => c.payableId === r.id && c.status === 'PENDING');
  const lastCollection = collections.filter((c) => c.payableId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const busy = inFlight(r.id) || !!pendingCollection;
  const agentRec = lk.agents.find((a) => a.id === r.agentId);
  const agentPayee = (req: PurchaseRequest, amountMinor: number) => ({ name: agentRec?.wallet.verifiedName ?? lk.agent(req.agentId), number: agentRec?.wallet.number ?? '', providerId: agentRec?.wallet.providerId, amount: { amountMinor, currency: req.total.currency }, label: lk.agent(req.agentId) });
  const cur = (minor: number) => f.money({ amountMinor: minor, currency: s.currency });
  const done = s.status === 'RECONCILED';
  const cash = r.sourcingModel === 'CASH_ADVANCE';
  const volDiff = Math.round((s.boughtKg - s.plannedKg) * 10) / 10;
  const pack = settings.packaging.find((p) => p.commodityId === r.commodityId);
  const bagsDiff = Math.round(Math.abs(volDiff) / (pack ? Math.round((pack.minKg + pack.maxKg) / 2) : 85));

  const collect = (amountMinor: number) => {
    setDialog(null);
    const c = collectRefund(r.id, amountMinor, userId ?? 'system');
    toast.success(t('buy.toast.collectionSent', { amount: cur(amountMinor), name: lk.agent(r.agentId), reference: c.reference }));
  };

  if (!cash) {
    const paid = s.purchases.filter((p) => p.paymentStatus === 'PAID').length;
    return (
      <div className="space-y-4">
        <Facts cols={3} items={[[t('col.status'), <ReconBadge key="s" status={s.status} />], [t('buy.purchasesPaid'), `${paid} / ${s.purchases.length}`], [t('buy.valueBought'), cur(s.bought)]]} />
        <p className="text-[14px] text-muted">{t('buy.directRecon')}</p>
        {!done && s.purchases.length > 0 && paid === s.purchases.length && <PermissionGate permission="reconciliation.reconcile"><Button size="sm" onClick={() => { markReconciled(r.id, userId ?? 'system'); toast.success(t('buy.toast.reconciled', { number: r.number })); }}><CheckCheck /> {t('buy.markReconciled')}</Button></PermissionGate>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {r.autoMatched && !done && <p className="rounded-ctl border border-brand/30 bg-brand-soft/40 px-4 py-3 text-[14px] text-ink">{t(s.gap > 0 ? 'buy.autoMatchedRefund' : s.gap < 0 ? 'buy.autoMatchedTopUp' : 'buy.autoMatchedEven', { amount: cur(Math.abs(s.gap)), tolerance: cur(s.tolerance) })}</p>}
      {done && <p className="rounded-ctl border border-success/30 bg-success/5 px-4 py-3 text-[14px] text-ink">{t(r.reconciledBy === 'system' ? 'buy.reconciledAuto' : 'buy.reconciledBy', { name: lk.user(r.reconciledBy ?? ''), date: r.reconciledAt ? f.dateTime(r.reconciledAt) : '—' })}</p>}
      <Facts cols={3} items={[
        [t('buy.moneyGiven'), cur(s.given + s.topUps)], [t('buy.valueBought'), cur(s.bought)], [t('buy.gap'), <span key="g" className={!s.withinTolerance ? 'font-semibold text-warning' : ''}>{cur(s.gap)}</span>],
        [t('buy.refunds'), cur(s.refunds)], [t('buy.writeOffs'), cur(s.writeOffs)], [t('buy.tolerance'), cur(s.tolerance)],
      ]} />
      <Panel title={t('buy.waterfall')}>
        <Waterfall
          format={(v) => f.money({ amountMinor: v, currency: s.currency }, { compact: true })}
          axisFormat={(v) => f.number(v / (s.currency === 'XOF' ? 1 : 100), { notation: 'compact' })}
          steps={[
            { label: t('buy.wf.given'), value: s.given, total: true },
            ...(s.topUps ? [{ label: t('buy.wf.topUps'), value: s.topUps }] : []),
            { label: t('buy.wf.bought'), value: -s.bought },
            ...(s.refunds ? [{ label: t('buy.wf.refunds'), value: -s.refunds }] : []),
            ...(s.writeOffs ? [{ label: t('buy.wf.writeOffs'), value: -s.writeOffs }] : []),
            { label: t('buy.wf.gap'), value: s.gap, total: true },
          ]}
        />
      </Panel>
      <p className="text-[14px] text-body">
        {volDiff === 0 ? t('buy.volumeExact', { kg: f.kg(s.plannedKg) }) : t(`${volDiff < 0 ? 'buy.volumeShort' : 'buy.volumeOver'}${bagsDiff ? '' : 'Small'}`, { diff: f.kg(Math.abs(volDiff)), planned: f.kg(s.plannedKg), bought: f.kg(s.boughtKg), count: bagsDiff })}
      </p>
      <PaymentState payableId={r.id} />
      {pendingCollection && <p className="rounded-ctl border border-info/30 bg-info/5 px-3 py-2 text-[14px] text-ink" role="status">{t('pay.collectionWaiting', { amount: f.money(pendingCollection.amount), name: pendingCollection.payer.name, reference: pendingCollection.reference })}</p>}
      {!pendingCollection && lastCollection?.status === 'DECLINED' && <p className="rounded-ctl border border-warning/30 bg-warning/5 px-3 py-2 text-[14px] text-ink" role="status">{t('pay.collectionDeclinedNote', { name: lastCollection.payer.name, reference: lastCollection.reference })}</p>}
      {!done && r.fundsReceived && (
        <div className="flex flex-wrap gap-2">
          {s.gap > 0 && <PermissionGate permission="reconciliation.refund"><Button size="sm" disabled={busy} onClick={() => setDialog('refund')}><Undo2 /> {t('buy.recordRefund')}</Button></PermissionGate>}
          {s.gap < 0 && <PermissionGate permission="reconciliation.refund"><Button size="sm" disabled={busy} onClick={() => setPaying(true)}><Wallet /> {t('buy.payDifference', { amount: cur(-s.gap) })}</Button></PermissionGate>}
          {s.gap > 0 && <PermissionGate permission="reconciliation.writeOff"><Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog('writeOff')}><HandCoins /> {t('buy.writeOff')}</Button></PermissionGate>}
          {s.purchases.length > 0 && <PermissionGate permission="reconciliation.reconcile"><Button size="sm" variant="secondary" disabled={!s.withinTolerance} onClick={() => { markReconciled(r.id, userId ?? 'system'); toast.success(t('buy.toast.reconciled', { number: r.number })); }}><CheckCheck /> {t('buy.markReconciled')}</Button></PermissionGate>}
        </div>
      )}
      {!compact && (
        <div>
          <h4 className="mb-2 text-[13px] font-semibold text-ink">{t('buy.tab.purchases')}</h4>
          {s.purchases.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line">
              {s.purchases.map((p) => (
                <li key={p.id}><Link to={`/app/purchases?open=${p.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-brand-soft/40"><span className="font-mono text-[13px] text-ink">{p.number}</span><span className="min-w-0 flex-1 truncate text-body">{fn.name(p.farmerId)}</span><span className="tnum text-muted">{f.kg(p.quantity)}</span><span className="tnum w-28 text-right font-medium text-ink">{f.money(p.amount)}</span></Link></li>
              ))}
            </ul>
          ) : <TabEmpty>{t('buy.noPurchases')}</TabEmpty>}
        </div>
      )}
      {!!(r.refunds?.length || r.writeOffs?.length || r.topUps?.length) && (
        <ul className="space-y-1 text-[13px] text-muted">
          {r.refunds?.map((x) => <li key={x.id}>{t('buy.refundLine', { amount: f.money(x.amount), method: t(`buy.refundMethod.${x.method}`), name: lk.user(x.by), date: f.date(x.at) })}</li>)}
          {r.topUps?.map((x) => <li key={x.id}>{t('buy.topUpLine', { amount: f.money(x.amount), name: lk.user(x.by), date: f.date(x.at) })}</li>)}
          {r.writeOffs?.map((x) => <li key={x.id}>{t('buy.writeOffLine', { amount: f.money(x.amount), reason: x.reason, name: lk.user(x.by), date: f.date(x.at) })}</li>)}
        </ul>
      )}
      {compact && onOpenPage && <Button variant="link" size="sm" onClick={onOpenPage}>{t('buy.openRecon')} <ArrowRight /></Button>}
      {dialog === 'refund' && <RefundDialog gap={s.gap} currency={s.currency} agent={lk.agent(r.agentId)} canCollect={can('reconciliation.refund')} onClose={() => setDialog(null)} onManual={(amount, proof) => { recordRefund(r.id, amount, 'MANUAL', userId ?? 'system', proof); setDialog(null); toast.success(t('buy.toast.refunded', { amount: cur(amount), number: r.number })); }} onCollect={(amount) => collect(amount)} />}
      {paying && <PayDialog request={{ type: 'AGENT_CASH_ADVANCE', payableId: r.id, title: t('pay.titleDifference', { number: r.number }), meta: { kind: 'difference' }, payees: [agentPayee(r, -s.gap)] }} onClose={() => setPaying(false)} />}
      {dialog === 'writeOff' && (
        <AmountDialog
          open
          onClose={() => setDialog(null)}
          title={t('buy.writeOffTitle', { number: r.number })}
          description={t('buy.writeOffHint', { limit: cur(settings.buyingRules.writeOffLimitMinor) })}
          initialMinor={Math.min(s.gap, settings.buyingRules.writeOffLimitMinor)}
          maxMinor={Math.min(s.gap, settings.buyingRules.writeOffLimitMinor)}
          currency={s.currency}
          reasonLabel={t('dashboard.reason')}
          reasonRequired
          confirm={t('buy.writeOff')}
          onConfirm={(v) => { const ok = writeOff(r.id, v.amountMinor, v.reason, userId ?? 'system'); setDialog(null); if (ok) toast.success(t('buy.toast.writtenOff', { amount: cur(v.amountMinor) })); else toast.error(t('buy.overLimit')); }}
        />
      )}
    </div>
  );
}

function RefundDialog({ gap, currency, agent, canCollect, onClose, onManual, onCollect }: { gap: number; currency: string; agent: string; canCollect: boolean; onClose: () => void; onManual: (amount: number, proof: string) => void; onCollect: (amount: number) => void }) {
  const { t } = useT();
  const [mode, setMode] = useState<'MANUAL' | 'MOMO_COLLECT'>('MANUAL');
  return (
    <AmountDialog
      open
      onClose={onClose}
      title={t('buy.refundTitle', { name: agent })}
      description={t('buy.refundHint')}
      initialMinor={gap}
      maxMinor={gap}
      currency={currency}
      proof={mode === 'MANUAL'}
      confirm={mode === 'MANUAL' ? t('buy.recordRefund') : t('buy.collect')}
      extra={canCollect && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('buy.refundMethodLabel')}>
          {(['MANUAL', 'MOMO_COLLECT'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`flex items-center gap-2 rounded-ctl border p-3 text-left text-[14px] ${mode === m ? 'border-brand bg-brand-soft/50 text-ink' : 'border-line text-body hover:border-brand/40'}`}>
              {m === 'MOMO_COLLECT' ? <Smartphone className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />} {t(`buy.refundMethod.${m}`)}
            </button>
          ))}
        </div>
      )}
      onConfirm={(v) => (mode === 'MANUAL' ? onManual(v.amountMinor, v.proof ?? '') : onCollect(v.amountMinor))}
    />
  );
}
