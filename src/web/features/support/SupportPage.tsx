import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, ClipboardCheck, Columns3, List, MapPin, Pencil, Plus, Smartphone, Star, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceApproval, SupportRequest } from '@/types';
import { canAct, type WorkflowRecord } from '@/engines/workflow';
import { ancestorAtLevel } from '@/engines/locations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoActions, useDemoNotes } from '@/components/shared/useDemoNotes';
import { AudioCapture } from '@/components/forms/media';
import { Donut, HBars, StackedColumns } from '@/components/charts/charts';
import { approveSupport, confirmRecipients, createSupportRequest, disburseSupportManual, editLineAmount, payableAmount, recordFulfilment, refundDeclined, supportPayees, type ServiceInput } from '@/services/supportService';
import { inFlight } from '@/services/paymentService';
import { ledgerOf } from '@/services/recoveryService';
import { workflowUser } from '@/services/workflowService';
import { cn } from '@/lib/utils';
import { useGroupStore } from '@/stores/groupStore';
import { useLoanStore } from '@/stores/loanStore';
import { useLocationStore } from '@/stores/locationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useSupportStore } from '@/stores/supportStore';
import { useAccessStore } from '@/stores/accessStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, DocumentsPanel, useLookups } from '@/web/features/people/shared';
import { AmountDialog, ApprovalTimeline, Panel, PaymentState, VoicePlayer, WorkflowButtons, mono, useWorkflowDef } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { BOARD, approvalStatus, disbursementStatus, fulfilmentKey, useSupportLookups } from './shared';

type View = 'all' | 'mine' | 'scoring' | 'confirm' | 'toPay' | 'toFulfil';
const inView = (r: SupportRequest, v: View, mine: Set<string>) =>
  v === 'all' || (v === 'mine' ? mine.has(r.id) : v === 'scoring' ? r.status === 'PENDING_SCORING' : v === 'confirm' ? r.status === 'AGENT_CONFIRMATION' : v === 'toPay' ? r.status === 'PENDING_DISBURSEMENT' : r.status === 'DISBURSED');

/** Support requests (PRD F2): board and list, scoring gate, approval per service, payout, fulfilment, dashboards. */
export function SupportPage() {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSupportLookups();
  const def = useWorkflowDef('supportRequest');
  const rows = useOrgRows(useSupportStore((s) => s.requests));
  const memberships = useAccessStore((s) => s.memberships);
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [layout, setLayout] = useState<'list' | 'board'>('board');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [agent, setAgent] = useState('');
  const [creating, setCreating] = useState(false);
  useDemoNotes([{ id: 'support', key: 'demo.note.support' }]);
  const mine = useMemo(() => {
    if (!def || !userId) return new Set<string>();
    const u = workflowUser(userId, orgId);
    return new Set(rows.filter((r) => r.wf && canAct(r as unknown as WorkflowRecord, def, u)).map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, def, userId, orgId, memberships]);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => inView(r, view, mine) && (!type || r.primaryTypeId === type || r.secondaryTypeId === type) && (!agent || r.agentId === agent) &&
    (!query || r.number.toLowerCase().includes(query) || sl.groupName(r.groupId).toLowerCase().includes(query) || lk.community(r.communityId).toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const perFarmer = (r: SupportRequest) => (r.lines.length ? Math.round(r.total.amountMinor / r.lines.length) : 0);
  const columns = useMemo<ColumnDef<SupportRequest, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'group', header: terms.farmerGroup, accessorFn: (r) => sl.groupName(r.groupId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'community', header: terms.community, accessorFn: (r) => lk.community(r.communityId) },
    { id: 'agent', header: terms.agent, accessorFn: (r) => lk.agent(r.agentId) },
    { id: 'primary', header: t('sup.col.primary'), accessorFn: (r) => sl.typeName(r.primaryTypeId) },
    { id: 'secondary', header: t('sup.col.secondary'), accessorFn: (r) => (r.secondaryTypeId ? sl.typeName(r.secondaryTypeId) : '—') },
    { id: 'farmers', header: terms.farmers, accessorFn: (r) => r.lines.length },
    { id: 'perFarmer', header: t('sup.col.perFarmer'), accessorFn: perFarmer, cell: (c) => f.money({ amountMinor: c.getValue() as number, currency: c.row.original.total.currency }) },
    { id: 'total', header: t('col.total'), accessorFn: (r) => r.total.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.total)}</span> },
    { id: 'ability', header: t('sup.col.ability'), accessorFn: (r) => topAbility(r) },
    { id: 'approval', header: t('sup.col.approval'), accessorFn: approvalStatus, cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'disbursement', header: t('sup.col.disbursement'), accessorFn: disbursementStatus, cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'fulfilment', header: t('sup.col.fulfilment'), accessorFn: fulfilmentKey, cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  ], [t, f, lk, sl, terms]);

  const current = rows.find((r) => r.id === openId);
  // Phone steps (agent confirmation and fulfilment) as page actions, on the request last opened.
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => { if (openId) setLastId(openId); }, [openId]);
  const demo = useMemo(() => {
    const target = current ?? rows.find((r) => r.id === lastId);
    if (!target) return [];
    const agentUser = lk.agentUserId(target.agentId) ?? 'system';
    const list = [];
    if (target.status === 'AGENT_CONFIRMATION') list.push({ id: 'confirm', key: 'demo.action.supportConfirm', params: { number: target.number }, run: () => {
      const approved = target.lines.filter((l) => l.status === 'APPROVED');
      confirmRecipients(target.id, { present: approved.slice(0, -1).map((l) => l.farmerId), declined: approved.slice(-1).map((l) => l.farmerId) }, agentUser, 'mobile');
      toast.success(t('sup.toast.confirmed', { number: target.number })); open(target.id);
    } });
    if (target.status === 'DISBURSED') list.push({ id: 'fulfil', key: 'demo.action.supportFulfil', params: { number: target.number }, run: () => {
      for (const l of target.lines.filter((x) => x.status === 'PAID')) recordFulfilment(target.id, l.id, { audioSeconds: 12 + (l.id.length % 8), gps: target.gps }, agentUser, 'mobile');
      toast.success(t('sup.toast.fulfilled', { number: target.number })); open(target.id);
    } });
    return list;
  }, [current, rows, lastId, lk, t, open]);
  useDemoActions(demo);

  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.support')}
        title={t('nav.support')}
        description={t('pages.support')}
        actions={
          <div className="inline-flex rounded-ctl border border-line bg-surface p-0.5" role="group" aria-label={t('buy.layout')}>
            <Button size="xs" variant={layout === 'board' ? 'primary' : 'ghost'} onClick={() => setLayout('board')} aria-pressed={layout === 'board'}><Columns3 /> {t('sup.board')}</Button>
            <Button size="xs" variant={layout === 'list' ? 'primary' : 'ghost'} onClick={() => setLayout('list')} aria-pressed={layout === 'list'}><List /> {t('buy.list')}</Button>
          </div>
        }
        primary={<PermissionGate permission="support.create"><Button onClick={() => setCreating(true)}><Plus /> {t('sup.new')}</Button></PermissionGate>}
      />
      <Tabs defaultValue="requests">
        <TabsList className="mb-5">
          <TabsTrigger value="requests">{t('sup.requests')}</TabsTrigger>
          <TabsTrigger value="dashboard">{t('buy.dashboard')}</TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <FilterBar
            search={q}
            onSearch={setQ}
            placeholder={t('sup.search')}
            views={(['all', 'mine', 'scoring', 'confirm', 'toPay', 'toFulfil'] as const).map((v) => ({ key: v, label: t(`sup.view.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((r) => inView(r, v, mine)).length }))}
            filters={[
              { key: 'type', label: t('sup.col.service'), value: type, onChange: setType, options: sl.types.map((x) => ({ value: x.id, label: sl.typeName(x.id) })) },
              { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => rows.some((r) => r.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })).sort((a, b) => a.label.localeCompare(b.label)) },
            ]}
            onClear={() => { setQ(''); setType(''); setAgent(''); setView('all'); }}
          />
          {layout === 'list' ? (
            <DataTable
              columns={columns}
              data={shown}
              onRowClick={(r) => open(r.id)}
              activeId={openId}
              getRowId={(r) => r.id}
              columnPicker
              initialHidden={['secondary', 'ability', 'status']}
              exportCsv={{ fileName: 'support-requests.csv', columns: [
                { header: t('col.number'), value: (r) => r.number }, { header: terms.farmerGroup, value: (r) => sl.groupName(r.groupId) }, { header: terms.community, value: (r) => lk.community(r.communityId) },
                { header: t('sup.col.primary'), value: (r) => sl.typeName(r.primaryTypeId) }, { header: terms.farmers, value: (r) => r.lines.length }, { header: t('col.total'), value: (r) => r.total.amountMinor },
                { header: t('col.status'), value: (r) => r.status }, { header: t('sup.col.fulfilment'), value: (r) => r.fulfilmentStatus },
              ] }}
              empty={t('sup.empty')}
            />
          ) : <Board rows={shown} onOpen={open} />}
        </TabsContent>
        <TabsContent value="dashboard"><SupportDashboard rows={rows} /></TabsContent>
      </Tabs>
      {current && def && <SupportDrawer key={current.id} request={current} onClose={close} />}
      {creating && <NewSupportSheet onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

const topAbility = (r: SupportRequest) => {
  const m = new Map<string, number>();
  for (const l of r.lines) m.set(l.abilityToPay, (m.get(l.abilityToPay) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', ');
};

function Board({ rows, onOpen }: { rows: SupportRequest[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const lk = useLookups();
  const cols = BOARD.filter((s) => s !== 'ON_HOLD' || rows.some((r) => r.status === s));
  if (!rows.length) return <TabEmpty>{t('sup.empty')}</TabEmpty>;
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
      {cols.map((s) => {
        const items = rows.filter((r) => r.status === s);
        return (
          <section key={s} className="w-[270px] shrink-0 rounded-card border border-line bg-canvas/60 p-3" aria-label={t(`status.${s}`, { defaultValue: s })}>
            <div className="mb-3 flex items-center justify-between px-1"><StatusBadge status={s} /><span className="tnum text-[13px] text-muted">{items.length}</span></div>
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpen(r.id)} className="w-full rounded-ctl border border-line bg-surface p-3 text-left shadow-soft transition-colors hover:border-brand/40">
                    <div className="flex items-center justify-between gap-2">{mono(r.number)}<span className="text-[12px] text-muted">{sl.typeName(r.primaryTypeId)}</span></div>
                    <div className="mt-1.5 truncate text-[14px] font-medium text-ink">{sl.groupName(r.groupId)}</div>
                    <div className="truncate text-[12px] text-muted">{lk.community(r.communityId)} · {t('sup.farmersN', { count: r.lines.length })}</div>
                    <div className="tnum mt-2 text-[14px] font-semibold text-ink">{f.money(r.total)}</div>
                  </button>
                </li>
              ))}
              {!items.length && <li className="px-1 py-2 text-[12px] text-muted">{t('sup.columnEmpty')}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

type DialogKind = 'approve' | 'momo' | 'manual' | 'refund' | { edit: string } | null;

function SupportDrawer({ request: r, onClose }: { request: SupportRequest; onClose: () => void }) {
  const { userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSupportLookups();
  const navigate = useNavigate();
  const def = useWorkflowDef('supportRequest')!;
  const payments = usePaymentStore((s) => s.payments);
  const allLoans = useLoanStore((s) => s.loans);
  const attempts = useMemo(() => payments.filter((p) => p.payableId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [payments, r.id]);
  const loans = useMemo(() => allLoans.filter((l) => l.supportRequestId === r.id), [allLoans, r.id]);
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<DialogKind>(() => (params.get('approve') ? 'approve' : null));
  useEffect(() => { if (params.get('approve')) { const next = new URLSearchParams(params); next.delete('approve'); setParams(next, { replace: true }); } }, [params, setParams]);
  const group = sl.group(r.groupId);
  const busy = inFlight(r.id) && attempts.some((p) => ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(p.status));
  const due = payableAmount(r);
  const money = (v: number) => f.money({ amountMinor: v, currency: r.total.currency });
  const wallet = (farmerId: string) => { const fa = sl.farmer(farmerId); return fa ? { name: `${fa.firstName} ${fa.lastName}`.toUpperCase(), number: fa.phone } : undefined; };
  const declinedPaid = r.lines.filter((l) => l.status === 'DECLINED' && !r.refunds.some((x) => x.farmerId === l.farmerId));
  const editable = ['PENDING_SCORING', 'PENDING_APPROVAL', 'ON_HOLD'].includes(r.status);
  const counts = { confirmed: r.lines.filter((l) => ['CONFIRMED', 'PAID', 'FULFILLED'].includes(l.status)).length, rejected: r.lines.filter((l) => l.status === 'REJECTED').length, declined: r.lines.filter((l) => l.status === 'DECLINED').length };
  const actions = (
    <>
      <PaymentState payableId={r.id} />
      {r.status === 'PENDING_SCORING' && <PermissionGate permission="groups.reviewScore"><Button size="sm" onClick={() => navigate(`/app/groups?open=${r.groupId}&tab=score`)}><Star /> {t('sup.scoreGroup')}</Button></PermissionGate>}
      {r.wf && <WorkflowButtons docType="supportRequest" record={r as unknown as WorkflowRecord & { number: string }} def={def} onApprove={() => setDialog('approve')} />}
      {r.status === 'PENDING_DISBURSEMENT' && due > 0 && r.payout.method !== 'MANUAL' && <PermissionGate permission="support.disburse"><Button size="sm" disabled={busy} onClick={() => setDialog('momo')}><Smartphone /> {t(`sup.pay.${r.payout.method}`)}</Button></PermissionGate>}
      {r.status === 'PENDING_DISBURSEMENT' && due > 0 && <PermissionGate permission="support.disburse"><Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog('manual')}><Banknote /> {t('buy.manualDisbursement')}</Button></PermissionGate>}
      {declinedPaid.length > 0 && r.disbursements.length > 0 && <PermissionGate permission="support.disburse"><Button size="sm" variant="secondary" onClick={() => setDialog('refund')}><Undo2 /> {t('sup.refundDeclined')}</Button></PermissionGate>}
    </>
  );
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{r.number}</span>}
        subtitle={`${sl.groupName(r.groupId)} · ${lk.community(r.communityId)} · ${sl.typeName(r.primaryTypeId)}${r.secondaryTypeId ? ` + ${sl.typeName(r.secondaryTypeId)}` : ''}`}
        badges={<><StatusBadge status={r.status} />{r.disbursements.length > 0 && <StatusBadge status={disbursementStatus(r)} />}{r.fulfilmentStatus !== 'PENDING' && <StatusBadge status={fulfilmentKey(r)} />}{r.device === 'mobile' && <Badge tone="neutral">{t('sup.fromPhone')}</Badge>}</>}
        actions={actions}
        tabs={[
          {
            key: 'summary', label: t('buy.tab.summary'), content: (
              <div className="space-y-5">
                {r.status === 'PENDING_SCORING' && <p className="rounded-ctl border border-warning/30 bg-warning/5 px-3 py-2 text-[14px] text-ink">{t('sup.scoringGate', { group: sl.groupName(r.groupId) })}</p>}
                {r.status === 'AGENT_CONFIRMATION' && <p className="rounded-ctl border border-info/30 bg-info/5 px-3 py-2 text-[14px] text-ink">{t('sup.awaitingAgent', { name: lk.agent(r.agentId) })}</p>}
                <Facts items={[
                  [terms.farmerGroup, group ? <Link key="g" to={`/app/groups?open=${group.id}`} className="text-brand hover:underline">{group.name}</Link> : '—'], [terms.agent, lk.agent(r.agentId)],
                  [t('sup.col.primary'), sl.typeName(r.primaryTypeId)], [t('sup.col.secondary'), r.secondaryTypeId ? sl.typeName(r.secondaryTypeId) : '—'],
                  [terms.farmers, `${f.number(r.lines.length)}${r.confirmedAt ? ` · ${t('sup.confirmedCounts', counts)}` : ''}`], [t('col.total'), f.money(r.total)],
                  [t('sup.payout'), `${t(`sup.payoutMethod.${r.payout.method}`)}${r.payout.wallet ? ` · ${r.payout.wallet.name} · ${r.payout.wallet.number}` : ''}`],
                  [t('sup.agroforestry'), r.agroforestry?.interested ? t('sup.agroYes', { type: r.agroforestry.type ?? '—' }) : t('common.no')],
                  [t('sup.gps'), r.gps ? `${r.gps.lat.toFixed(4)}, ${r.gps.lng.toFixed(4)} (±${r.gps.accuracy} m)` : '—'], [t('buy.created'), `${lk.user(r.createdBy)} · ${f.dateTime(r.createdAt)}`],
                ]} />
                {r.services.length > 0 && (
                  <Panel title={t('sup.servicesApproved')}>
                    <ul className="space-y-2 text-[14px]">
                      {r.services.map((s) => (
                        <li key={s.typeId} className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-ink">{sl.typeName(s.typeId)}</span>
                          <span className="text-body">{[t('sup.perFarmerLine', { amount: f.money(s.amountPerFarmer) }), s.providerId && sl.providerName(s.providerId), s.arrangement && t(`sup.arrangement.${s.arrangement}`), s.expectedKgPerFarmer && t('sup.expectedKg', { kg: f.kg(s.expectedKgPerFarmer) })].filter(Boolean).join(' · ')}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {r.voice.leaderSeconds && <div><div className="eyebrow mb-1.5">{t('sup.leaderVoice')}</div><VoicePlayer id={`${r.id}l`} seconds={r.voice.leaderSeconds} /></div>}
                  {r.voice.witnessSeconds && <div><div className="eyebrow mb-1.5">{t('sup.witnessVoice')}</div><VoicePlayer id={`${r.id}w`} seconds={r.voice.witnessSeconds} /></div>}
                </div>
              </div>
            ),
          },
          {
            key: 'farmers', label: terms.farmers, count: r.lines.length, content: (
              <div className="overflow-x-auto rounded-ctl border border-line">
                <table className="w-full min-w-[620px] text-[14px]">
                  <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-3 py-2 font-semibold">{terms.farmer}</th><th className="px-3 py-2 font-semibold">{t('sup.col.service')}</th><th className="px-3 py-2 font-semibold">{t('sup.col.ability')}</th><th className="px-3 py-2 text-right font-semibold">{t('col.amount')}</th><th className="px-3 py-2 font-semibold">{t('col.status')}</th><th /></tr></thead>
                  <tbody>
                    {r.lines.map((l) => (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2"><Link to={`/app/farmers?open=${l.farmerId}`} className="text-ink hover:text-brand">{sl.farmerName(l.farmerId)}</Link></td>
                        <td className="px-3 py-2 text-body">{sl.typeName(l.typeId)}{l.subType ? ` · ${l.subType}` : ''}{l.landSize ? ` · ${t('sup.acres', { n: l.landSize })}` : ''}{l.quantity ? ` · ×${l.quantity}` : ''}</td>
                        <td className="px-3 py-2 text-body">{l.abilityToPay}</td>
                        <td className="tnum px-3 py-2 text-right text-ink">{f.money(l.amount)}{!!l.edits?.length && <span className="block text-[11px] text-muted">{t('sup.wasAmount', { amount: f.money(l.edits[0]!.from) })}</span>}</td>
                        <td className="px-3 py-2"><StatusBadge status={`LINE_${l.status}`} /></td>
                        <td className="px-3 py-2 text-right">{editable && <PermissionGate permission="support.approve"><Button size="iconSm" variant="ghost" aria-label={t('sup.editAmount')} onClick={() => setDialog({ edit: l.id })}><Pencil /></Button></PermissionGate>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          },
          { key: 'approvals', label: t('buy.tab.approvals'), content: r.wf ? <ApprovalTimeline record={r as unknown as WorkflowRecord} def={def} /> : <TabEmpty>{t('sup.notInApproval')}</TabEmpty> },
          {
            key: 'payments', label: t('sup.tabPayments'), count: r.disbursements.length + r.refunds.length, content: (
              <div className="space-y-4">
                <Facts cols={3} items={[[t('sup.toPay'), money(due)], [t('buy.amountGiven'), money(r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0))], [t('sup.refunds'), money(r.refunds.reduce((s, x) => s + x.amount.amountMinor, 0))]]} />
                {r.disbursements.length ? (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {r.disbursements.map((d) => <li key={d.id} className="px-4 py-3"><div className="text-[14px] font-medium text-ink">{f.money(d.amount)} · {d.to}</div><div className="text-[12px] text-muted">{t(`buy.method.${d.method}`)} · {lk.user(d.by)} · {f.dateTime(d.at)}{d.proof ? ` · ${d.proof}` : ''}</div></li>)}
                  </ul>
                ) : <TabEmpty>{t('buy.noDisbursements')}</TabEmpty>}
                {r.refunds.length > 0 && (
                  <div><h4 className="mb-2 text-[13px] font-semibold text-ink">{t('sup.refundsDeclined')}</h4>
                    <ul className="divide-y divide-line rounded-ctl border border-line">{r.refunds.map((x) => <li key={x.id} className="px-4 py-3 text-[14px]"><span className="font-medium text-ink">{sl.farmerName(x.farmerId)} · {f.money(x.amount)}</span><span className="block text-[12px] text-muted">{x.method} · {x.reference} · {f.dateTime(x.at)}</span></li>)}</ul>
                  </div>
                )}
                {attempts.length > 0 && (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {attempts.map((p) => <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"><span className="font-mono text-ink">{p.reference}</span><StatusBadge status={p.status} /><span className="min-w-0 flex-1 truncate text-muted">{p.payee.name}{p.failureReason ? ` · ${p.failureReason}` : ''}</span><span className="tnum text-ink">{f.money(p.amount)}</span></li>)}
                  </ul>
                )}
              </div>
            ),
          },
          {
            key: 'fulfilment', label: t('sup.tabFulfilment'), count: r.lines.filter((l) => l.fulfilment).length, content: r.lines.some((l) => l.fulfilment) ? (
              <ul className="space-y-3">
                {r.lines.filter((l) => l.fulfilment).map((l) => (
                  <li key={l.id} className="rounded-ctl border border-line p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[14px]"><span className="font-medium text-ink">{sl.farmerName(l.farmerId)}</span><span className="text-[12px] text-muted">{lk.user(l.fulfilment!.by)} · {f.dateTime(l.fulfilment!.at)}</span></div>
                    <VoicePlayer id={l.id} seconds={l.fulfilment!.audioSeconds} />
                    <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted">
                      {l.fulfilment!.witness && <span>{t('sup.witness', { name: l.fulfilment!.witness })}</span>}
                      {l.fulfilment!.gps && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{`${l.fulfilment!.gps.lat.toFixed(4)}, ${l.fulfilment!.gps.lng.toFixed(4)}`}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <TabEmpty>{t('sup.noFulfilment')}</TabEmpty>,
          },
          {
            key: 'assets', label: t('sup.tabAssets'), content: (
              <div className="space-y-4">
                <Facts items={[[t('sup.agreement'), r.assets.agreement ?? '—'], [t('sup.thumbprints'), r.assets.thumbprints != null ? t('sup.thumbprintsN', { count: r.assets.thumbprints }) : '—']]} />
                <DocumentsPanel entity="farmerGroup" entityId={r.groupId} types={['partnershipAgreement', 'other']} permission="support.edit" />
              </div>
            ),
          },
          {
            key: 'recovery', label: t('sup.tabRecovery'), count: loans.length, content: loans.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line">
                {loans.map((l) => { const lg = ledgerOf(l); return (
                  <li key={l.id}><Link to={`/app/recovery/loans?open=${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft/40"><span className="min-w-0 flex-1 truncate text-[14px] text-ink">{sl.farmerName(l.farmerId)}</span><span className="text-[12px] text-muted">{t('sup.due', { date: f.date(l.window.end) })}</span><StatusBadge status={l.status} /><span className="tnum w-28 text-right text-[14px] font-medium text-ink">{f.money({ amountMinor: lg.balance, currency: l.principal.currency })}</span></Link></li>
                ); })}
              </ul>
            ) : <TabEmpty>{sl.type(r.primaryTypeId)?.recoverable ? t('sup.loansAfterPayout') : t('sup.notRecoverable')}</TabEmpty>,
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="supportRequest" entityId={r.id} /> },
        ]}
      />
      {dialog === 'approve' && <ApproveDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === 'momo' && <PayDialog request={{ type: 'FARMER_SUPPORT', payableId: r.id, title: t('sup.payTitle', { number: r.number }), payees: supportPayees(r, wallet).map((p) => ({ ...p, label: r.payout.method === 'GROUP_WALLET' ? t('sup.groupWallet') : r.payout.method === 'PROVIDER' ? t('sup.providerLabel') : terms.farmer })) }} onClose={() => setDialog(null)} />}
      {dialog === 'manual' && (
        <AmountDialog open onClose={() => setDialog(null)} title={t('buy.manualTitle', { number: r.number })} description={t('sup.manualHint')} initialMinor={due} maxMinor={due} currency={r.total.currency} proof confirm={t('buy.markDisbursed')}
          onConfirm={(v) => { disburseSupportManual(r.id, v.amountMinor, v.proof ?? '', userId ?? 'system'); setDialog(null); toast.success(t('sup.toast.paid', { number: r.number })); }} />
      )}
      {dialog === 'refund' && <RefundDialog request={r} farmers={declinedPaid.map((l) => ({ id: l.farmerId, amount: l.amount.amountMinor }))} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && (() => { const line = r.lines.find((l) => l.id === dialog.edit)!; return (
        <AmountDialog open onClose={() => setDialog(null)} title={t('sup.editAmountFor', { name: sl.farmerName(line.farmerId) })} description={t('sup.editAmountHint')} initialMinor={line.amount.amountMinor} maxMinor={sl.type(line.typeId)?.maxAmountMinor || undefined} currency={r.total.currency} reasonLabel={t('dashboard.reason')} confirm={t('common.save')}
          onConfirm={(v) => { editLineAmount(r.id, line.id, v.amountMinor, userId ?? 'system', v.reason || undefined); setDialog(null); toast.success(t('sup.toast.amountEdited')); }} />
      ); })()}
    </>
  );
}

/** Approval per service (PRD F2): amount per farmer, provider and arrangement, expected volume. */
function ApproveDialog({ request: r, onClose }: { request: SupportRequest; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const dec = r.total.currency === 'XOF' ? 0 : 2;
  const typeIds = [...new Set([r.primaryTypeId, ...(r.secondaryTypeId ? [r.secondaryTypeId] : []), ...r.lines.map((l) => l.typeId)])].filter((id) => r.lines.some((l) => l.typeId === id));
  const [rows, setRows] = useState(() => typeIds.map((id) => {
    const lines = r.lines.filter((l) => l.typeId === id);
    const avg = Math.round(lines.reduce((s, l) => s + l.amount.amountMinor, 0) / Math.max(1, lines.length));
    const type = sl.type(id);
    return { typeId: id, on: true, amount: String(avg / 10 ** dec), providerId: type?.needsProvider ? sl.providers.find((p) => p.typeIds.includes(id) && p.status === 'ACTIVE')?.id ?? '' : '', arrangement: (type?.needsProvider ? 'PROVIDER_PAID' : '') as ServiceApproval['arrangement'] | '', kg: '' };
  }));
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const on = rows.filter((x) => x.on);
  const invalid = !on.length || on.some((x) => !(Number(x.amount) > 0) || (sl.type(x.typeId)?.needsProvider && !x.providerId));
  const total = on.reduce((s, x) => s + Math.round(Number(x.amount || 0) * 10 ** dec) * r.lines.filter((l) => l.typeId === x.typeId).length, 0);
  const save = () => {
    const services: ServiceInput[] = on.map((x) => ({
      typeId: x.typeId, amountPerFarmer: { amountMinor: Math.round(Number(x.amount) * 10 ** dec), currency: r.total.currency }, providerId: x.providerId || undefined,
      arrangement: x.arrangement || undefined, expectedKgPerFarmer: x.kg ? Number(x.kg) : undefined,
      inputs: sl.type(x.typeId)?.kind === 'INPUT' ? Object.entries(r.lines.filter((l) => l.typeId === x.typeId).reduce<Record<string, number>>((m, l) => ({ ...m, [l.subType ?? '—']: (m[l.subType ?? '—'] ?? 0) + (l.quantity ?? 1) }), {})).map(([subType, quantity]) => ({ subType, quantity, amount: { amountMinor: Math.round(Number(x.amount) * 10 ** dec), currency: r.total.currency } })) : undefined,
    }));
    const res = approveSupport(r.id, services, userId ?? 'system');
    if (res.ok) { toast.success(t('buy.acted.APPROVE', { number: r.number }), { description: t('dashboard.actedStatus', { status: t(`status.${res.status}`) }) }); onClose(); }
    else toast.error(t(`dashboard.blocked.${res.reason}`, { defaultValue: t('dashboard.blocked.notAllowed') }));
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('sup.approveTitle', { number: r.number })}</DialogTitle><DialogDescription>{t('sup.approveHint')}</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {rows.map((x, i) => {
            const type = sl.type(x.typeId);
            const n = r.lines.filter((l) => l.typeId === x.typeId).length;
            return (
              <section key={x.typeId} className={cn('space-y-3 rounded-card border p-4', x.on ? 'border-line' : 'border-dashed border-line opacity-60')}>
                <Checkbox label={<span className="font-semibold text-ink">{`${sl.typeName(x.typeId)} · ${t('sup.farmersN', { count: n })}`}</span>} checked={x.on} onChange={(e) => set(i, { on: e.target.checked })} />
                {x.on && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('sup.amountPerFarmer', { currency: r.total.currency })} helper={type?.maxAmountMinor ? t('sup.maxHint', { amount: f.money({ amountMinor: type.maxAmountMinor, currency: r.total.currency }) }) : undefined}><Input type="number" value={x.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label={t('sup.amountPerFarmer', { currency: r.total.currency })} /></Field>
                    {type?.recoverable && <Field label={t('sup.expectedKgLabel')}><Input type="number" value={x.kg} onChange={(e) => set(i, { kg: e.target.value })} aria-label={t('sup.expectedKgLabel')} /></Field>}
                    {type?.needsProvider && (
                      <>
                        <Field label={t('sup.provider')}><select value={x.providerId} onChange={(e) => set(i, { providerId: e.target.value })} aria-label={t('sup.provider')} className={select}><option value="">{t('sup.pickProvider')}</option>{sl.providers.filter((p) => p.typeIds.includes(x.typeId) && p.status === 'ACTIVE').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                        <Field label={t('sup.arrangementLabel')}><select value={x.arrangement} onChange={(e) => set(i, { arrangement: e.target.value as ServiceApproval['arrangement'] })} aria-label={t('sup.arrangementLabel')} className={select}>{(['PROVIDER_PAID', 'GROUP_PAID', 'IN_KIND'] as const).map((a) => <option key={a} value={a}>{t(`sup.arrangement.${a}`)}</option>)}</select></Field>
                      </>
                    )}
                    {type?.kind === 'INPUT' && <p className="text-[12px] text-muted sm:col-span-2">{t('sup.inputsLine', { list: Object.entries(r.lines.filter((l) => l.typeId === x.typeId).reduce<Record<string, number>>((m, l) => ({ ...m, [l.subType ?? '—']: (m[l.subType ?? '—'] ?? 0) + (l.quantity ?? 1) }), {})).map(([k, v]) => `${k} ×${v}`).join(', ') })}</p>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div className="flex items-center justify-between rounded-ctl bg-canvas px-4 py-3 text-[14px]"><span className="text-muted">{t('sup.approvedTotal')}</span><span className="tnum text-[16px] font-semibold text-ink">{f.money({ amountMinor: total, currency: r.total.currency })}</span></div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={save}><ClipboardCheck /> {t('sup.approve')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ request: r, farmers, onClose }: { request: SupportRequest; farmers: { id: string; amount: number }[]; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const sl = useSupportLookups();
  const dec = r.total.currency === 'XOF' ? 0 : 2;
  const [farmerId, setFarmerId] = useState(farmers[0]?.id ?? '');
  const [amount, setAmount] = useState(String((farmers[0]?.amount ?? 0) / 10 ** dec));
  const [method, setMethod] = useState('MOMO');
  const [reference, setReference] = useState('');
  const [doc, setDoc] = useState<string | undefined>();
  const minor = Math.round(Number(amount || 0) * 10 ** dec);
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('sup.refundTitle', { number: r.number })}</DialogTitle><DialogDescription>{t('sup.refundHint')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('sup.farmer')} className="sm:col-span-2"><select value={farmerId} onChange={(e) => { setFarmerId(e.target.value); setAmount(String((farmers.find((x) => x.id === e.target.value)?.amount ?? 0) / 10 ** dec)); }} aria-label={t('sup.farmer')} className={select}>{farmers.map((x) => <option key={x.id} value={x.id}>{sl.farmerName(x.id)}</option>)}</select></Field>
          <Field label={t('buy.amountIn', { currency: r.total.currency })}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('buy.amountIn', { currency: r.total.currency })} /></Field>
          <Field label={t('sup.method')}><select value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t('sup.method')} className={select}>{['MOMO', 'CASH', 'BANK'].map((m) => <option key={m} value={m}>{t(`sup.refundMethod.${m}`)}</option>)}</select></Field>
          <Field label={t('sup.reference')} className="sm:col-span-2"><Input value={reference} onChange={(e) => setReference(e.target.value)} aria-label={t('sup.reference')} /></Field>
          <div className="sm:col-span-2 flex items-center gap-2 text-[13px]"><Button size="sm" variant="secondary" onClick={() => setDoc('refund-receipt.pdf')}>{t('buy.useSampleProof')}</Button><span className="text-muted">{doc ?? t('agg.noFile')}</span></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!farmerId || !(minor > 0) || !reference.trim()} onClick={() => { refundDeclined(r.id, farmerId, minor, method, reference.trim(), doc, userId ?? 'system'); toast.success(t('sup.toast.refunded')); onClose(); }}><Undo2 /> {t('sup.saveRefund')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Staff can key a request on the web for a group (the agent remains the requester). */
function NewSupportSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSupportLookups();
  const settings = useOrgSettings();
  const groups = useOrgRows(useGroupStore((s) => s.groups)).slice().sort((a, b) => a.name.localeCompare(b.name));
  const memberships = useGroupStore((s) => s.groupMemberships);
  const types = sl.types.filter((x) => x.enabled);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [primary, setPrimary] = useState(types[0]?.id ?? '');
  const [secondary, setSecondary] = useState('');
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const [amount, setAmount] = useState('');
  const [ability, setAbility] = useState(settings.support.abilityToPay[0] ?? '');
  const [agro, setAgro] = useState(false);
  const [leader, setLeader] = useState<{ seconds: number } | undefined>();
  const [witness, setWitness] = useState<{ seconds: number } | undefined>();
  const members = memberships.filter((m) => m.groupId === groupId && !m.leftAt).map((m) => m.farmerId);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { setPicked(members); }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  const type = sl.type(primary);
  const minor = Math.round(Number(amount || 0) * 10 ** dec);
  const over = !!type?.maxAmountMinor && minor > type.maxAmountMinor;
  const g = groups.find((x) => x.id === groupId);
  const agentId = lk.communities.find((c) => c.id === g?.communityId)?.agentIds[0];
  const invalid = !g || !agentId || !picked.length || !(minor > 0) || over || (type?.evidence?.leaderVoice && !leader);
  const save = () => {
    if (invalid || !agentId) return;
    const r = createSupportRequest({
      orgId, groupId, agentId, primaryTypeId: primary, secondaryTypeId: secondary || undefined, agroforestry: agro ? { interested: true, type: sl.type('st_agro')?.subTypes[0] } : undefined,
      voice: { leaderSeconds: leader?.seconds, witnessSeconds: witness?.seconds }, actorId: userId ?? 'system', device: 'web',
      lines: picked.map((farmerId, i) => ({ farmerId, typeId: primary, subType: type?.subTypes[i % Math.max(1, type.subTypes.length)], amountMinor: minor, abilityToPay: ability })),
    });
    toast.success(t('sup.toast.created', { number: r.number }), { description: t('dashboard.actedStatus', { status: t(`status.${r.status}`) }) });
    onClose(r.id);
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('sup.new')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label={terms.farmerGroup}><select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={terms.farmerGroup} className={select}>{groups.map((x) => <option key={x.id} value={x.id}>{`${x.name} · ${lk.community(x.communityId)}`}</option>)}</select></Field>
          {g?.scoreStatus === 'PENDING_REVIEW' && type?.groupScoring && <p className="rounded-ctl border border-warning/30 bg-warning/5 px-3 py-2 text-[13px] text-ink">{t('sup.gateWarning')}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('sup.col.primary')}><select value={primary} onChange={(e) => setPrimary(e.target.value)} aria-label={t('sup.col.primary')} className={select}>{types.map((x) => <option key={x.id} value={x.id}>{sl.typeName(x.id)}</option>)}</select></Field>
            <Field label={t('sup.col.secondary')}><select value={secondary} onChange={(e) => setSecondary(e.target.value)} aria-label={t('sup.col.secondary')} className={select}><option value="">{'—'}</option>{types.filter((x) => x.id !== primary).map((x) => <option key={x.id} value={x.id}>{sl.typeName(x.id)}</option>)}</select></Field>
            <Field label={t('sup.amountPerFarmer', { currency: f.org.currency })} error={over ? t('sup.overMax', { amount: f.money({ amountMinor: type!.maxAmountMinor, currency: f.org.currency }) }) : undefined}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('sup.amountPerFarmer', { currency: f.org.currency })} /></Field>
            <Field label={t('sup.col.ability')}><select value={ability} onChange={(e) => setAbility(e.target.value)} aria-label={t('sup.col.ability')} className={select}>{settings.support.abilityToPay.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
          </div>
          <Checkbox label={t('sup.agroInterest')} checked={agro} onChange={(e) => setAgro(e.target.checked)} />
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[14px] font-semibold text-ink">{terms.farmers}</h3><span className="text-[13px] text-muted">{t('sup.pickedN', { count: picked.length, total: members.length })}</span></div>
            <div className="max-h-56 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
              {members.map((id) => <div key={id} className="px-3 py-2"><Checkbox label={sl.farmerName(id)} checked={picked.includes(id)} onChange={(e) => setPicked(e.target.checked ? [...picked, id] : picked.filter((x) => x !== id))} /></div>)}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-1.5 text-[12px] font-medium text-muted">{t('sup.leaderVoice')}</div><AudioCapture value={leader} onChange={setLeader} /></div>
            <div><div className="mb-1.5 text-[12px] font-medium text-muted">{t('sup.witnessVoice')}</div><AudioCapture value={witness} onChange={setWitness} /></div>
          </div>
          <div className="flex items-center justify-between rounded-ctl bg-canvas px-4 py-3 text-[14px]"><span className="text-muted">{t('col.total')}</span><span className="tnum text-[20px] font-semibold text-ink">{f.money({ amountMinor: minor * picked.length, currency: f.org.currency })}</span></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={save}>{t('buy.submit')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Support dashboards (PRD F2): all support and one per type. */
function SupportDashboard({ rows }: { rows: SupportRequest[] }) {
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const settings = useOrgSettings();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const lk = useLookups();
  const [type, setType] = useState('');
  const [top, setTop] = useState(5);
  const paid = rows.filter((r) => r.disbursements.length && (!type || r.primaryTypeId === type || r.secondaryTypeId === type));
  const lines = paid.flatMap((r) => r.lines.filter((l) => (l.status === 'PAID' || l.status === 'FULFILLED') && (!type || l.typeId === type)).map((l) => ({ ...l, r })));
  const farmers = new Set(lines.map((l) => l.farmerId)).size;
  const amount = lines.reduce((s, l) => s + l.amount.amountMinor, 0);
  const districtLevel = settings.locationLevels[1]?.id ?? settings.locationLevels[0]?.id ?? '';
  const districtOf = (communityId: string) => { const c = lk.communities.find((x) => x.id === communityId); return c ? ancestorAtLevel(nodes, c.locationNodeId, districtLevel)?.name ?? '—' : '—'; };
  const by = <K,>(key: (l: (typeof lines)[number]) => K) => { const m = new Map<K, number>(); for (const l of lines) m.set(key(l), (m.get(key(l)) ?? 0) + l.amount.amountMinor); return m; };
  const districts = [...by((l) => districtOf(l.r.communityId))].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, value]) => ({ label: String(label), value }));
  const years = [...by((l) => l.r.createdAt.slice(0, 4))].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const ability = [...lines.reduce((m, l) => m.set(l.abilityToPay, (m.get(l.abilityToPay) ?? 0) + 1), new Map<string, number>())].map(([label, value], index) => ({ label, value, index }));
  const inputs = [...lines.filter((l) => sl.type(l.typeId)?.kind !== 'CASH').reduce((m, l) => m.set(`${sl.typeName(l.typeId)} · ${l.subType ?? '—'}`, (m.get(`${sl.typeName(l.typeId)} · ${l.subType ?? '—'}`) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  const agro = rows.filter((r) => r.agroforestry?.interested).length;
  const money = (v: number) => f.money({ amountMinor: v, currency: f.org.currency }, { compact: true });
  const kpi = (label: string, value: string) => <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><div className="eyebrow">{label}</div><div className="tnum mt-2 text-[24px] font-semibold leading-none text-ink">{value}</div></div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t('sup.col.service')}>
        {[{ id: '', label: t('sup.dashAll') }, ...sl.types.map((x) => ({ id: x.id, label: sl.typeName(x.id) }))].map((x) => <button key={x.id || 'all'} type="button" role="tab" aria-selected={type === x.id} onClick={() => setType(x.id)} className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${type === x.id ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-brand/40'}`}>{x.label}</button>)}
      </div>
      <div className="stat-strip grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpi(t('sup.kpi.farmers'), f.number(farmers))}
        {kpi(t('sup.kpi.disbursed'), money(amount))}
        {kpi(t('sup.kpi.requests'), f.number(rows.filter((r) => !type || r.primaryTypeId === type).length))}
        {kpi(t('sup.kpi.agro'), f.number(agro))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('sup.chart.district')} actions={<select value={top} onChange={(e) => setTop(Number(e.target.value))} aria-label={t('sup.topN')} className="h-8 rounded-ctl border border-line bg-surface px-2 text-[13px]">{[3, 5, 10].map((n) => <option key={n} value={n}>{t('sup.topNOption', { n })}</option>)}</select>}>
          {districts.length ? <HBars data={districts} format={money} /> : <TabEmpty>{t('sup.noData')}</TabEmpty>}
        </Panel>
        <Panel title={t('sup.chart.year')}>
          {years.length ? <StackedColumns data={years.map(([y, v]) => ({ label: String(y), amount: v }))} series={[{ key: 'amount', label: t('sup.kpi.disbursed'), index: 0 }]} format={money} axisFormat={money} /> : <TabEmpty>{t('sup.noData')}</TabEmpty>}
        </Panel>
        <Panel title={t('sup.chart.ability')}>{ability.length ? <Donut data={ability} format={(v) => f.number(v)} center={<span className="tnum text-[20px] font-semibold text-ink">{f.number(lines.length)}</span>} /> : <TabEmpty>{t('sup.noData')}</TabEmpty>}</Panel>
        <Panel title={t('sup.chart.inputs')}>{inputs.length ? <HBars data={inputs} format={(v) => f.number(v)} /> : <TabEmpty>{t('sup.noData')}</TabEmpty>}</Panel>
      </div>
    </div>
  );
}
