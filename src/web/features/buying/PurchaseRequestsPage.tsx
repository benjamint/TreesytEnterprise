import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, BadgeCheck, Banknote, Columns3, List, Pencil, Plus, Printer, ShoppingBasket, Smartphone, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseRequest } from '@/types';
import { canAct, pendingSteps, type WorkflowRecord } from '@/engines/workflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoActions, useDemoNotes } from '@/components/shared/useDemoNotes';
import { activateTicket, archiveRequest, confirmFundsReceived, confirmRate, disburseManual, reconSummary, simulateAgentRequest, simulateAgentSync } from '@/services/buyingService';
import { inFlight } from '@/services/paymentService';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { workflowUser } from '@/services/workflowService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useCan, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, DocumentsPanel, useLookups } from '@/web/features/people/shared';
import { AmountDialog, ApprovalTimeline, Panel, PaymentState, PriceCompare, RiskBadge, RiskList, SignatureImage, WorkflowButtons, mono, useFarmerNames, usePrintReceipt, useWorkflowDef } from './common';
import { NewRequestSheet, RecordPurchaseSheet, UpdatePriceDialog } from './RequestForms';
import { ReconDetail } from './ReconciliationPage';

type View = 'all' | 'mine' | 'upcoming' | 'past' | 'archived';
const DAY = 86_400_000;

/** Purchase requests (PRD D1): list / Kanban, tabs, filters, risk flags, detail drawer with every action. */
export function PurchaseRequestsPage() {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const def = useWorkflowDef('purchaseRequest');
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [layout, setLayout] = useState<'list' | 'kanban'>('list');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [agent, setAgent] = useState('');
  const [commodity, setCommodity] = useState('');
  const [sourcing, setSourcing] = useState('');
  const [risk, setRisk] = useState('');
  const [creating, setCreating] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const mine = useMemo(() => {
    if (!def || !userId) return new Set<string>();
    const u = workflowUser(userId, orgId);
    return new Set(requests.filter((r) => canAct(r as unknown as WorkflowRecord, def, u)).map((r) => r.id));
    // memberships/roles: re-evaluate when someone's role changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, def, userId, orgId, memberships, roles]);

  const inView = (r: PurchaseRequest, v: View) =>
    v === 'all' ? !r.archived : v === 'mine' ? mine.has(r.id) : v === 'archived' ? r.archived : v === 'upcoming' ? !r.archived && r.plannedDate >= today : !r.archived && r.plannedDate < today;
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => requests
    .filter((r) => inView(r, view) && (!status || r.status === status) && (!agent || r.agentId === agent) && (!commodity || r.commodityId === commodity) && (!sourcing || r.sourcingModel === sourcing) &&
      (!risk || r.riskFlags.some((x) => x.severity === risk)) && (!query || r.number.toLowerCase().includes(query) || lk.agent(r.agentId).toLowerCase().includes(query) || lk.community(r.communityId).toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [requests, view, status, agent, commodity, sourcing, risk, query, lk, mine, today]);

  const stepName = (r: PurchaseRequest) => (def ? pendingSteps(def, r as unknown as WorkflowRecord)[0]?.name : undefined) ?? '—';
  const columns = useMemo<ColumnDef<PurchaseRequest, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'agent', header: terms.agent, accessorFn: (r) => lk.agent(r.agentId) },
    { id: 'community', header: terms.community, accessorFn: (r) => lk.community(r.communityId) },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (r) => lk.commodity(r.commodityId) },
    { id: 'grade', header: t('buy.grade'), accessorFn: (r) => r.grade ?? '—' },
    { id: 'volume', header: t('col.volume'), accessorKey: 'volume', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'unitPrice', header: t('col.unitPrice'), accessorFn: (r) => r.unitPrice.amountMinor, cell: (c) => f.money(c.row.original.unitPrice) },
    { id: 'listPrice', header: t('buy.listPrice'), accessorFn: (r) => r.listPrice.amountMinor, cell: (c) => f.money(c.row.original.listPrice) },
    { id: 'variance', header: t('buy.variance'), accessorKey: 'variancePct', cell: (c) => <span className={cn((c.getValue() as number) > 5 && 'font-medium text-warning')}>{`${(c.getValue() as number) > 0 ? '+' : ''}${f.number(c.getValue() as number, { maximumFractionDigits: 1 })}%`}</span> },
    { id: 'total', header: t('col.total'), accessorFn: (r) => r.total.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.total)}</span> },
    { id: 'sourcing', header: t('buy.sourcing'), accessorKey: 'sourcingModel', cell: (c) => t(`buy.sourcingName.${c.getValue() as string}`) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'step', header: t('buy.currentStep'), accessorFn: stepName },
    { id: 'disbursement', header: t('buy.disbursement'), accessorKey: 'disbursementStatus', cell: (c) => t(`buy.disb.${c.getValue() as string}`) },
    { id: 'recon', header: t('nav.reconciliation'), accessorKey: 'reconciliationStatus', cell: (c) => t(`buy.recon.${c.getValue() as string}`) },
    { id: 'age', header: t('buy.age'), accessorFn: (r) => Date.now() - new Date(r.createdAt).getTime(), cell: (c) => t('buy.days', { count: Math.floor((c.getValue() as number) / DAY) }) },
    { id: 'risk', header: t('col.risk'), accessorFn: (r) => r.riskFlags.reduce((s, x) => s + (x.severity === 'HIGH' ? 3 : x.severity === 'MEDIUM' ? 2 : 1), 0), cell: (c) => <RiskBadge flags={c.row.original.riskFlags} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, lk, terms, def]);

  const current = requests.find((r) => r.id === openId);
  // Demo actions act on the request last opened (opening the Demo panel closes the drawer).
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => { if (openId) setLastId(openId); }, [openId]);
  const yaw = settings.workflows.length ? lk.agents.find((a) => a.userId === 'u_yaw') ?? lk.agents.find((a) => !['at_wh', 'at_mag'].includes(a.agentTypeId)) : undefined;
  useDemoNotes([{ id: 'pr', key: 'demo.note.purchaseRequests' }]);
  const demo = useMemo(() => {
    const target = current ?? requests.find((r) => r.id === lastId);
    const list = [];
    if (yaw) list.push({ id: 'agentRequest', key: 'demo.action.agentRequest', params: { name: lk.agent(yaw.id) }, run: () => { const r = simulateAgentRequest(orgId, yaw.userId); if (r) { toast.success(t('buy.toast.agentRequest', { number: r.number, name: lk.agent(yaw.id) })); open(r.id); } } });
    if (target && target.sourcingModel === 'CASH_ADVANCE' && target.disbursements.length && !target.fundsReceived)
      list.push({ id: 'funds', key: 'demo.action.fundsReceived', params: { number: target.number }, run: () => { confirmFundsReceived(target.id, lk.agentUserId(target.agentId) ?? 'system'); toast.success(t('buy.toast.fundsReceived', { number: target.number })); open(target.id); } });
    if (target && (target.fundsReceived || target.status === 'TICKET_ACTIVATED') && target.reconciliationStatus !== 'RECONCILED')
      list.push({ id: 'sync', key: 'demo.action.syncPurchases', params: { number: target.number }, run: () => { const res = simulateAgentSync(target.id); toast.success(t('buy.toast.synced', { count: res.purchases.length, number: target.number }), { description: res.blocked.length ? t('buy.toast.blocked', { count: res.blocked.length }) : undefined }); open(target.id); } });
    return list;
  }, [current, requests, lastId, yaw, orgId, lk, t, open]);
  useDemoActions(demo);

  const counts = useMemo(() => Object.fromEntries((['all', 'mine', 'upcoming', 'past', 'archived'] as const).map((v) => [v, requests.filter((r) => inView(r, v)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requests, mine, today]);
  const open3 = requests.filter((r) => !r.archived && r.reconciliationStatus !== 'RECONCILED');
  const statuses = def?.statuses ?? [];

  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.buying')}
        title={terms.purchaseRequests}
        description={t('pages.purchaseRequests')}
        actions={
          <div className="inline-flex rounded-ctl border border-line bg-surface p-0.5" role="group" aria-label={t('buy.layout')}>
            <Button size="xs" variant={layout === 'list' ? 'primary' : 'ghost'} onClick={() => setLayout('list')} aria-pressed={layout === 'list'}><List /> {t('buy.list')}</Button>
            <Button size="xs" variant={layout === 'kanban' ? 'primary' : 'ghost'} onClick={() => setLayout('kanban')} aria-pressed={layout === 'kanban'}><Columns3 /> {t('buy.kanban')}</Button>
          </div>
        }
        primary={<PermissionGate permission="purchaseRequests.create"><Button onClick={() => setCreating(true)}><Plus /> {t('buy.newRequest')}</Button></PermissionGate>}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('buy.stat.open')} value={f.number(open3.length)} hint={f.money({ amountMinor: open3.reduce((s, r) => s + r.total.amountMinor, 0), currency: f.org.currency }, { compact: true })} onClick={() => setView('all')} />
        <Stat label={t('buy.stat.mine')} value={f.number(mine.size)} onClick={() => setView('mine')} active={view === 'mine'} />
        <Stat label={t('buy.stat.toDisburse')} value={f.number(requests.filter((r) => ['RATE_CONFIRMED', 'FINANCE_APPROVED', 'PARTIAL_DISBURSEMENT'].includes(r.status) && r.sourcingModel === 'CASH_ADVANCE').length)} onClick={() => { setView('all'); setStatus('RATE_CONFIRMED'); }} />
        <Stat label={t('buy.stat.highRisk')} value={f.number(open3.filter((r) => r.riskFlags.some((x) => x.severity === 'HIGH')).length)} onClick={() => { setView('all'); setRisk('HIGH'); }} />
      </div>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('buy.searchRequests')}
        views={(['all', 'mine', 'upcoming', 'past', 'archived'] as const).map((v) => ({ key: v, label: t(`buy.view.${v}`), active: view === v, onSelect: () => setView(v), count: counts[v] }))}
        filters={[
          { key: 'status', label: t('col.status'), value: status, onChange: setStatus, options: statuses.filter((s) => requests.some((r) => r.status === s)).map((s) => ({ value: s, label: t(`status.${s}`, { defaultValue: s }) })) },
          { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => requests.some((r) => r.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })).sort((a, b) => a.label.localeCompare(b.label)) },
          { key: 'commodity', label: t('col.commodity'), value: commodity, onChange: setCommodity, options: settings.commodities.map((c) => ({ value: c.id, label: lk.commodity(c.id) })) },
          { key: 'sourcing', label: t('buy.sourcing'), value: sourcing, onChange: setSourcing, options: (['CASH_ADVANCE', 'DIRECT_PAYMENT'] as const).map((s) => ({ value: s, label: t(`buy.sourcingName.${s}`) })) },
          { key: 'risk', label: t('col.risk'), value: risk, onChange: setRisk, options: (['HIGH', 'MEDIUM', 'LOW'] as const).map((s) => ({ value: s, label: t(`risk.${s}`) })) },
        ]}
        onClear={() => { setQ(''); setStatus(''); setAgent(''); setCommodity(''); setSourcing(''); setRisk(''); setView('all'); }}
      />
      {layout === 'list' ? (
        <DataTable
          columns={columns}
          data={shown}
          onRowClick={(r) => open(r.id)}
          activeId={openId}
          getRowId={(r) => r.id}
          columnPicker
          initialHidden={['grade', 'listPrice', 'step', 'disbursement', 'recon']}
          exportCsv={{ fileName: 'purchase-requests.csv', columns: [
            { header: t('col.number'), value: (r) => r.number }, { header: terms.agent, value: (r) => lk.agent(r.agentId) }, { header: terms.community, value: (r) => lk.community(r.communityId) },
            { header: t('col.commodity'), value: (r) => lk.commodity(r.commodityId) }, { header: t('col.volume'), value: (r) => r.volume }, { header: t('col.unitPrice'), value: (r) => r.unitPrice.amountMinor / 100 },
            { header: t('buy.variance'), value: (r) => r.variancePct }, { header: t('col.total'), value: (r) => r.total.amountMinor / 100 }, { header: t('col.status'), value: (r) => r.status }, { header: t('buy.plannedDate'), value: (r) => r.plannedDate },
          ] }}
          empty={view === 'mine' ? t('buy.emptyMine') : t('buy.emptyRequests')}
        />
      ) : (
        <Kanban rows={shown} statuses={statuses} onOpen={open} />
      )}
      {current && def && <RequestDrawer key={current.id} request={current} onClose={close} />}
      {creating && <NewRequestSheet onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function Stat({ label, value, hint, onClick, active }: { label: string; value: string; hint?: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex flex-col items-start justify-start rounded-card border bg-surface p-5 text-left shadow-soft transition-colors', active ? 'border-brand' : 'border-line hover:border-brand/40')}>
      <div className="eyebrow">{label}</div>
      <div className="tnum mt-2 text-[24px] font-semibold leading-none text-ink">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
    </button>
  );
}

function Kanban({ rows, statuses, onOpen }: { rows: PurchaseRequest[]; statuses: string[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const cols = statuses.filter((s) => !['ARCHIVED'].includes(s) && rows.some((r) => r.status === s));
  if (!rows.length) return <TabEmpty>{t('buy.emptyRequests')}</TabEmpty>;
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
      {cols.map((s) => {
        const items = rows.filter((r) => r.status === s);
        return (
          <section key={s} className="w-[280px] shrink-0 rounded-card border border-line bg-canvas/60 p-3" aria-label={t(`status.${s}`, { defaultValue: s })}>
            <div className="mb-3 flex items-center justify-between px-1"><StatusBadge status={s} /><span className="tnum text-[13px] text-muted">{items.length}</span></div>
            <ul className="space-y-2">
              {items.slice(0, 30).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpen(r.id)} className="w-full rounded-ctl border border-line bg-surface p-3 text-left shadow-soft transition-colors hover:border-brand/40">
                    <div className="flex items-center justify-between gap-2">{mono(r.number)}<RiskBadge flags={r.riskFlags} /></div>
                    <div className="mt-1.5 truncate text-[14px] font-medium text-ink">{lk.community(r.communityId)}</div>
                    <div className="truncate text-[12px] text-muted">{lk.agent(r.agentId)} · {lk.commodity(r.commodityId)} · {f.kg(r.volume)}</div>
                    <div className="tnum mt-2 text-[14px] font-semibold text-ink">{f.money(r.total)}</div>
                  </button>
                </li>
              ))}
              {items.length > 30 && <li className="px-1 text-[12px] text-muted">{t('buy.more', { count: items.length - 30 })}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Request detail drawer (PRD D1): summary, approvals, disbursements, purchases, expenses, reconciliation, receipt, files, activity. */
function RequestDrawer({ request: r, onClose }: { request: PurchaseRequest; onClose: () => void }) {
  const { userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const can = useCan();
  const lk = useLookups();
  const fn = useFarmerNames();
  const navigate = useNavigate();
  const settings = useOrgSettings();
  const def = useWorkflowDef('purchaseRequest')!;
  const allPurchases = useBuyingStore((s) => s.purchases);
  const allExpenses = useBuyingStore((s) => s.expenses);
  const payments = usePaymentStore((s) => s.payments);
  const purchases = useMemo(() => allPurchases.filter((p) => p.requestId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [allPurchases, r.id]);
  const expenses = useMemo(() => allExpenses.filter((e) => e.requestId === r.id), [allExpenses, r.id]);
  const attempts = useMemo(() => payments.filter((p) => p.payableId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [payments, r.id]);
  const [dialog, setDialog] = useState<'momo' | 'manual' | 'price' | 'purchase' | null>(null);
  const print = usePrintReceipt();
  const agentRec = lk.agents.find((a) => a.id === r.agentId);
  const given = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
  const remaining = Math.max(0, r.total.amountMinor - given);
  const recon = reconSummary(r, allPurchases, settings);
  const avgPaid = purchases.length ? Math.round(purchases.reduce((s, p) => s + p.amount.amountMinor, 0) / Math.max(1, purchases.reduce((s, p) => s + p.quantity, 0))) : 0;
  const cash = r.sourcingModel === 'CASH_ADVANCE';
  const canDisburse = cash && ['RATE_CONFIRMED', 'PARTIAL_DISBURSEMENT'].includes(r.status) && remaining > 0 && (r.status !== 'PARTIAL_DISBURSEMENT' || r.disbursements.length < (settings.buyingRules.maxPartialCount ?? 3) + 1);
  const priceEditable = ['PENDING', 'MANAGEMENT_APPROVED', 'ZONE_APPROVED', 'OPS_APPROVED', 'FINANCE_APPROVED', 'ON_HOLD', 'PRICE_UPDATE', 'RATE_CONFIRMED'].includes(r.status);
  const buying = (r.fundsReceived || r.status === 'TICKET_ACTIVATED') && r.reconciliationStatus !== 'RECONCILED';
  const busy = inFlight(r.id) && attempts.some((p) => ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(p.status));

  const actions = (
    <>
      <PaymentState payableId={r.id} />
      <WorkflowButtons docType="purchaseRequest" record={r as unknown as WorkflowRecord & { number: string }} def={def} />
      {r.status === 'FINANCE_APPROVED' && <PermissionGate permission="purchaseRequests.confirmRate"><Button size="sm" onClick={() => { confirmRate(r.id, userId ?? 'system'); toast.success(t('buy.toast.rateConfirmed', { number: r.number })); }}><BadgeCheck /> {t('buy.confirmRate')}</Button></PermissionGate>}
      {canDisburse && <PermissionGate permission="purchaseRequests.disburse"><Button size="sm" disabled={busy} onClick={() => setDialog('momo')}><Smartphone /> {t('buy.payMomo')}</Button></PermissionGate>}
      {canDisburse && <PermissionGate permission="purchaseRequests.disburse"><Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog('manual')}><Banknote /> {t('buy.manualDisbursement')}</Button></PermissionGate>}
      {!cash && r.status === 'RATE_CONFIRMED' && <PermissionGate permission="purchaseRequests.activateTicket"><Button size="sm" onClick={() => { activateTicket(r.id, userId ?? 'system'); toast.success(t('buy.toast.ticket', { number: r.number })); }}><Ticket /> {t('buy.activateTicket')}</Button></PermissionGate>}
      {priceEditable && <PermissionGate permission="purchaseRequests.updatePrice"><Button size="sm" variant="secondary" onClick={() => setDialog('price')}><Pencil /> {t('buy.updatePrice')}</Button></PermissionGate>}
      {buying && <PermissionGate permission="purchases.create"><Button size="sm" variant="secondary" onClick={() => setDialog('purchase')}><ShoppingBasket /> {t('buy.recordPurchase')}</Button></PermissionGate>}
      {!r.archived && ['RECONCILED', 'NOT_APPROVED'].includes(r.status) && <PermissionGate permission="purchaseRequests.archive"><Button size="sm" variant="ghost" onClick={() => { archiveRequest(r.id, userId ?? 'system'); toast.success(t('buy.toast.archived', { number: r.number })); }}><Archive /> {t('buy.archive')}</Button></PermissionGate>}
    </>
  );

  const receiptRows: [string, string][] = [
    [terms.agent, lk.agent(r.agentId)], [terms.community, lk.community(r.communityId)], [t('col.commodity'), `${lk.commodity(r.commodityId)}${r.grade ? ` · ${r.grade}` : ''}`],
    [t('col.volume'), f.kg(r.volume)], [t('col.unitPrice'), f.money(r.unitPrice)], [t('buy.amountGiven'), f.money({ amountMinor: given, currency: r.total.currency })],
    ...r.disbursements.map((d, i) => [t('buy.tranche', { n: i + 1 }), `${f.money(d.amount)} · ${t(`buy.method.${d.method}`)} · ${f.date(d.at)}`] as [string, string]),
  ];

  return (
    <>
    <DetailDrawer
      open
      onClose={onClose}
      title={<span className="font-mono">{r.number}</span>}
      subtitle={`${lk.agent(r.agentId)} · ${lk.community(r.communityId)} · ${lk.commodity(r.commodityId)}`}
      badges={<><StatusBadge status={r.status} /><Badge tone="neutral">{t(`buy.sourcingName.${r.sourcingModel}`)}</Badge><RiskBadge flags={r.riskFlags} />{r.autoMatched && <Badge tone="brand">{t('buy.autoMatched')}</Badge>}</>}
      actions={can('purchaseRequests.view') ? actions : null}
      tabs={[
        {
          key: 'summary', label: t('buy.tab.summary'), content: (
            <div className="space-y-5">
              <RiskList flags={r.riskFlags} />
              <Facts items={[
                [t('col.volume'), f.kg(r.volume)], [t('buy.plannedDate'), f.date(r.plannedDate)], [t('col.unitPrice'), f.money(r.unitPrice)], [t('buy.listPrice'), f.money(r.listPrice)],
                [t('buy.variance'), `${r.variancePct > 0 ? '+' : ''}${f.number(r.variancePct, { maximumFractionDigits: 1 })}%`], [t('col.total'), f.money(r.total)],
                [t('buy.disbursement'), t(`buy.disb.${r.disbursementStatus}`)], [t('nav.reconciliation'), t(`buy.recon.${r.reconciliationStatus}`)],
                [t('buy.createdBy'), `${lk.user(r.createdBy)}${r.enteredBy ? ` · ${t('buy.enteredBy', { name: lk.user(r.enteredBy) })}` : ''}`], [t('buy.created'), f.dateTime(r.createdAt)],
              ]} />
              {r.overrideReason && <p className="rounded-ctl bg-canvas px-3 py-2 text-[14px] text-body"><span className="font-medium text-ink">{t('buy.overrideReason')}</span>{`: ${r.overrideReason}`}</p>}
              {r.notes && <p className="rounded-ctl bg-canvas px-3 py-2 text-[14px] text-body">{r.notes}</p>}
              <Panel title={t('buy.priceVsList')}>
                <PriceCompare items={[
                  { label: t('buy.listPrice'), value: r.listPrice.amountMinor, tone: 'muted' },
                  { label: t('buy.requestedPrice'), value: r.unitPrice.amountMinor, tone: r.variancePct > 5 ? 'warning' : 'brand' },
                  ...(avgPaid ? [{ label: t('buy.avgPaid'), value: avgPaid }] : []),
                ]} />
                {!!r.priceHistory?.length && (
                  <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[13px] text-muted">
                    {r.priceHistory.map((h, i) => <li key={i}>{t('buy.priceChanged', { from: f.money({ amountMinor: h.fromMinor, currency: r.unitPrice.currency }), to: f.money({ amountMinor: h.toMinor, currency: r.unitPrice.currency }), name: lk.user(h.by), date: f.date(h.at) })}{h.reason ? ` — ${h.reason}` : ''}</li>)}
                  </ul>
                )}
              </Panel>
            </div>
          ),
        },
        { key: 'approvals', label: t('buy.tab.approvals'), content: <ApprovalTimeline record={r as unknown as WorkflowRecord} def={def} /> },
        {
          key: 'disbursements', label: t('buy.tab.disbursements'), count: r.disbursements.length, content: (
            <div className="space-y-4">
              {!cash && <TabEmpty>{t('buy.directNoAdvance')}</TabEmpty>}
              {cash && (
                <>
                  <Facts cols={3} items={[[t('col.total'), f.money(r.total)], [t('buy.amountGiven'), f.money({ amountMinor: given, currency: r.total.currency })], [t('buy.remaining'), f.money({ amountMinor: remaining, currency: r.total.currency })]]} />
                  {agentRec && <p className="text-[13px] text-muted">{t('buy.payeeWallet', { name: agentRec.wallet.verifiedName, number: agentRec.wallet.number, provider: settings.paymentProviders.find((p) => p.id === agentRec.wallet.providerId)?.name ?? '' })}</p>}
                  {r.disbursements.length ? (
                    <ul className="divide-y divide-line rounded-ctl border border-line">
                      {r.disbursements.map((d, i) => (
                        <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1"><div className="text-[14px] font-medium text-ink">{t('buy.tranche', { n: i + 1 })} · {f.money(d.amount)}</div><div className="text-[12px] text-muted">{t(`buy.method.${d.method}`)} · {lk.user(d.by)} · {f.dateTime(d.at)}{d.weightKg ? ` · ${f.kg(d.weightKg)}` : ''}</div></div>
                        </li>
                      ))}
                    </ul>
                  ) : <TabEmpty>{t('buy.noDisbursements')}</TabEmpty>}
                  {attempts.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-[13px] font-semibold text-ink">{t('buy.paymentAttempts')}</h4>
                      <ul className="divide-y divide-line rounded-ctl border border-line">
                        {attempts.map((p) => (
                          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                            <span className="font-mono text-ink">{p.reference}</span>
                            <StatusBadge status={p.status} />
                            <span className="min-w-0 flex-1 truncate text-muted">{p.failureReason ?? ''}</span>
                            <span className="tnum text-ink">{f.money(p.amount)}</span>
                            <span className="text-muted">{f.dateTime(p.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.fundsReceived && <p className="text-[13px] text-success">{t('buy.fundsReceivedAt', { date: r.fundsReceivedAt ? f.dateTime(r.fundsReceivedAt) : '—' })}</p>}
                </>
              )}
            </div>
          ),
        },
        {
          key: 'purchases', label: t('buy.tab.purchases'), count: purchases.length, content: purchases.length ? (
            <div className="space-y-3">
              <Facts cols={3} items={[[t('buy.bought'), f.kg(recon.boughtKg)], [t('buy.value'), f.money({ amountMinor: recon.bought, currency: r.total.currency })], [terms.farmers, f.number(new Set(purchases.map((p) => p.farmerId)).size)]]} />
              <ul className="divide-y divide-line rounded-ctl border border-line">
                {purchases.map((p) => (
                  <li key={p.id}>
                    <Link to={`/app/purchases?open=${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft/40">
                      <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium text-ink">{fn.name(p.farmerId)}</div><div className="text-[12px] text-muted"><span className="font-mono">{p.number}</span> · {f.dateTime(p.createdAt)}{p.consolidationRef ? ` · ${t('buy.consolidated')}` : ''}</div></div>
                      <span className="tnum text-[13px] text-body">{f.kg(p.quantity)}</span>
                      <span className="tnum w-28 text-right text-[14px] font-medium text-ink">{f.money(p.amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : <TabEmpty>{t('buy.noPurchases')}</TabEmpty>,
        },
        {
          key: 'expenses', label: t('buy.tab.expenses'), count: expenses.length, content: expenses.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line">
              {expenses.map((e) => (
                <li key={e.id}><Link to={`/app/expenses?open=${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft/40"><span className="font-mono text-[13px] text-ink">{e.number}</span><StatusBadge status={e.status} /><span className="flex-1 text-[13px] text-muted">{t('buy.bagsN', { count: e.bags })}</span><span className="tnum font-medium text-ink">{f.money(e.total)}</span></Link></li>
              ))}
            </ul>
          ) : <TabEmpty>{t('buy.noExpenses')}</TabEmpty>,
        },
        { key: 'recon', label: t('nav.reconciliation'), content: <ReconDetail request={r} compact onOpenPage={() => navigate(`/app/reconciliation?open=${r.id}`)} /> },
        {
          key: 'receipt', label: t('buy.tab.receipt'), content: (
            <div className="space-y-4">
              <div className="rounded-ctl border border-line p-4">
                <Facts items={receiptRows} />
                <div className="mt-4 border-t border-line pt-3">
                  <div className="eyebrow mb-2">{t('buy.agentSignature')}</div>
                  {r.receipt ? <><SignatureImage value={r.receipt.signature} /><p className="mt-1 text-[12px] text-muted">{t('buy.signedAt', { date: f.dateTime(r.receipt.signedAt) })}</p></> : <p className="text-[13px] text-muted">{t('buy.notSigned')}</p>}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => print(terms.purchaseRequest, r.number, receiptRows, r.receipt?.signature)}><Printer /> {t('buy.printReceipt')}</Button>
            </div>
          ),
        },
        { key: 'files', label: t('buy.tab.files'), content: <DocumentsPanel entity="purchaseRequest" entityId={r.id} types={['proof', 'receipt', 'other']} permission="purchaseRequests.edit" /> },
        { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="purchaseRequest" entityId={r.id} /> },
      ]}
    />
      {dialog === 'momo' && agentRec && (
        <PayDialog
          request={{
            type: 'AGENT_CASH_ADVANCE', payableId: r.id, title: t('buy.payMomoTitle', { number: r.number }), editableMaxMinor: remaining, withWeight: settings.buyingRules.partialDisbursements,
            payees: [{ name: agentRec.wallet.verifiedName, number: agentRec.wallet.number, providerId: agentRec.wallet.providerId, amount: { amountMinor: remaining, currency: r.total.currency }, label: `${lk.agent(r.agentId)} · ${terms.agent}` }],
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'manual' && (
        <AmountDialog
          open
          onClose={() => setDialog(null)}
          title={t('buy.manualTitle', { number: r.number })}
          description={t('buy.manualHint')}
          initialMinor={remaining}
          maxMinor={remaining}
          currency={r.total.currency}
          withWeight
          proof
          confirm={t('buy.markDisbursed')}
          onConfirm={(v) => { disburseManual(r.id, v.amountMinor, v.weightKg, v.proof ?? '', userId ?? 'system'); setDialog(null); toast.success(t('buy.toast.manual', { number: r.number })); }}
        />
      )}
      {dialog === 'price' && <UpdatePriceDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === 'purchase' && <RecordPurchaseSheet request={r} onClose={() => setDialog(null)} />}
    </>
  );
}
