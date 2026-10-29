import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, PackageCheck, Plus, Scale, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentRepayment, Discrepancy, Inbound } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import {
  receiveInbound, receiveTopUp, repaymentExpected, resolveDiscrepancy, reviewAgentRepayment, submitAgentRepayment, tolerancePct, type ReceiveBag,
} from '@/services/inventoryService';
import { nextBagCode } from '@/services/buyingService';
import { cn } from '@/lib/utils';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { AmountDialog, Panel, ProofPicker, mono } from '@/web/features/buying/common';
import { useInventory, variancePct } from './shared';

type View = 'expected' | 'received' | 'issues' | 'discrepancies' | 'repayments';

/** Inbound (PRD H2): expected deliveries, receipts, discrepancies and agent repayments. */
export function InboundPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const inv = useInventory();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'expected';
  const setView = (v: View) => { const n = new URLSearchParams(params); n.set('view', v); n.delete('open'); setParams(n); };
  const inbounds = useOrgRows(useWarehouseStore((s) => s.inbounds));
  const discrepancies = useOrgRows(useWarehouseStore((s) => s.discrepancies));
  const repayments = useOrgRows(useWarehouseStore((s) => s.agentRepayments));
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [warehouse, setWarehouse] = useState(params.get('warehouse') ?? '');
  const query = q.trim().toLowerCase();
  const match = (x: { warehouseId: string }) => !warehouse || x.warehouseId === warehouse;
  const ISSUE = ['DISCREPANCY', 'NEEDS_RESOLUTION', 'REFUND_SUBMITTED'];
  const inView = (x: Inbound, v: View) => (v === 'expected' ? x.status === 'PENDING' : v === 'issues' ? ISSUE.includes(x.status) : x.status !== 'PENDING');
  const listRows = inbounds.filter((x) => match(x) && inView(x, view) && (!query || x.number.toLowerCase().includes(query) || x.bags.some((b) => b.code.toLowerCase().includes(query)) || lk.agent(x.agentId).toLowerCase().includes(query)))
    .sort((a, b) => (b.received?.at ?? b.createdAt).localeCompare(a.received?.at ?? a.createdAt));
  const source = (x: Inbound) => (x.source.kind === 'TRANSFER' ? t('inv.fromWarehouse', { name: inv.warehouseName(x.source.fromWarehouseId) }) : x.source.kind === 'PRE' ? t('inv.fromAgent', { name: lk.agent(x.agentId) }) : t('inv.manual'));
  const columns = useMemo<ColumnDef<Inbound, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'warehouse', header: t('inv.warehouse'), accessorFn: (x) => inv.warehouseName(x.warehouseId) },
    { id: 'source', header: t('inv.source'), accessorFn: source },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (x) => lk.commodity(x.commodityId) },
    { id: 'bags', header: t('inv.bags'), accessorFn: (x) => x.bags.filter((b) => b.status !== 'TOP_UP').length },
    { id: 'expected', header: t('inv.expectedKg'), accessorKey: 'expectedKg', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'received', header: t('inv.receivedKg'), accessorFn: (x) => x.receivedKg ?? null, cell: (c) => (c.getValue() == null ? '—' : f.kg(c.getValue() as number)) },
    { id: 'variance', header: t('inv.variance'), accessorFn: (x) => (x.receivedKg == null ? null : variancePct(x.expectedKg, x.receivedKg)), cell: (c) => (c.getValue() == null ? '—' : <span className={cn('tnum', (c.getValue() as number) > 0.5 && 'text-danger')}>{`${f.number(c.getValue() as number, { maximumFractionDigits: 2 })}%`}</span>) },
    { id: 'date', header: t('col.date'), accessorFn: (x) => x.received?.at ?? x.createdAt, cell: (c) => f.date(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={`IN_${c.getValue() as string}`} /> },
  ], [t, f, lk, inv]); // eslint-disable-line react-hooks/exhaustive-deps
  const discRows = discrepancies.filter((d) => match(d) && (!query || d.bagCode.toLowerCase().includes(query))).sort((a, b) => Number(b.status === 'OPEN') - Number(a.status === 'OPEN') || b.createdAt.localeCompare(a.createdAt));
  const discColumns = useMemo<ColumnDef<Discrepancy, unknown>[]>(() => [
    { id: 'inbound', header: t('inv.inbound'), accessorFn: (d) => inbounds.find((x) => x.id === d.inboundId)?.number ?? '', cell: (c) => mono(c.getValue() as string) },
    { id: 'bag', header: t('inv.bag'), accessorKey: 'bagCode', cell: (c) => mono(c.getValue() as string) },
    { id: 'type', header: t('col.type'), accessorKey: 'type', cell: (c) => t(`inv.dType.${c.getValue() as string}`) },
    { id: 'agent', header: t('inv.agent'), accessorFn: (d) => lk.agent(d.agentId) },
    { id: 'expected', header: t('inv.expectedKg'), accessorKey: 'expectedKg', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'received', header: t('inv.receivedKg'), accessorKey: 'receivedKg', cell: (c) => f.kg(c.getValue() as number) },
    { id: 'variance', header: t('inv.varianceKg'), accessorKey: 'varianceKg', cell: (c) => <span className="tnum">{`${f.kg(c.getValue() as number)} · ${f.number(c.row.original.variancePct, { maximumFractionDigits: 2 })}%`}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <span className="flex items-center gap-1.5"><StatusBadge status={`D_${c.getValue() as string}`} />{c.row.original.resolution && c.row.original.status === 'RESOLVED' && <span className="text-[12px] text-muted">{t(`inv.resolution.${c.row.original.resolution.type}`)}</span>}</span> },
  ], [t, f, lk, inbounds]);
  const repColumns = useMemo<ColumnDef<AgentRepayment, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'inbound', header: t('inv.inbound'), accessorFn: (r) => inbounds.find((x) => x.id === r.inboundId)?.number ?? '', cell: (c) => mono(c.getValue() as string) },
    { id: 'agent', header: t('inv.agent'), accessorFn: (r) => lk.agent(r.agentId) },
    { id: 'expected', header: t('inv.owed'), accessorFn: (r) => r.expected.total.amountMinor, cell: (c) => f.money(c.row.original.expected.total) },
    { id: 'submitted', header: t('inv.submitted'), accessorFn: (r) => r.submitted.amount.amountMinor, cell: (c) => f.money(c.row.original.submitted.amount) },
    { id: 'method', header: t('sup.method'), accessorFn: (r) => t(`sup.refundMethod.${r.submitted.method}`) },
    { id: 'date', header: t('col.date'), accessorFn: (r) => r.submitted.at, cell: (c) => f.date(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={`RP_${c.getValue() as string}`} /> },
  ], [t, f, lk, inbounds]);
  const repRows = repayments.filter((r) => !warehouse || inbounds.find((x) => x.id === r.inboundId)?.warehouseId === warehouse).sort((a, b) => Number(b.status === 'SUBMITTED') - Number(a.status === 'SUBMITTED') || b.createdAt.localeCompare(a.createdAt));
  const current = inbounds.find((x) => x.id === openId);
  const counts: Record<View, number> = {
    expected: inbounds.filter((x) => match(x) && x.status === 'PENDING').length, received: inbounds.filter((x) => match(x) && x.status !== 'PENDING').length,
    issues: inbounds.filter((x) => match(x) && ISSUE.includes(x.status)).length, discrepancies: discrepancies.filter((d) => match(d) && d.status === 'OPEN').length,
    repayments: repayments.filter((r) => r.status === 'SUBMITTED').length,
  };
  return (
    <>
      <PageHeader eyebrow={t('nav.section.inventory')} title={t('nav.inbound')} description={t('pages.inbound')} />
      <FilterBar search={q} onSearch={setQ} placeholder={t('inv.searchInbound')}
        views={(['expected', 'received', 'issues', 'discrepancies', 'repayments'] as const).map((v) => ({ key: v, label: t(`inv.view.${v}`), active: view === v, onSelect: () => setView(v), count: counts[v] }))}
        filters={[{ key: 'warehouse', label: t('inv.warehouse'), value: warehouse, onChange: setWarehouse, options: inv.warehouses.map((w) => ({ value: w.id, label: w.name })) }]}
        onClear={() => { setQ(''); setWarehouse(''); }} />
      {view === 'discrepancies' ? (
        <DataTable columns={discColumns} data={discRows} onRowClick={(d) => open(d.inboundId)} getRowId={(d) => d.id} empty={t('inv.noDiscrepancies')}
          exportCsv={{ fileName: 'discrepancies.csv', columns: [{ header: t('inv.bag'), value: (d) => d.bagCode }, { header: t('col.type'), value: (d) => d.type }, { header: t('inv.expectedKg'), value: (d) => d.expectedKg }, { header: t('inv.receivedKg'), value: (d) => d.receivedKg }, { header: t('inv.varianceKg'), value: (d) => d.varianceKg }, { header: t('col.status'), value: (d) => d.status }] }} />
      ) : view === 'repayments' ? (
        <DataTable columns={repColumns} data={repRows} onRowClick={(r) => { const n = new URLSearchParams(params); n.set('open', r.inboundId); n.set('tab', 'repayment'); setParams(n); }} getRowId={(r) => r.id} empty={t('inv.noRepayments')} />
      ) : (
        <DataTable columns={columns} data={listRows} onRowClick={(x) => open(x.id)} activeId={openId} getRowId={(x) => x.id} empty={t(view === 'expected' ? 'inv.noExpected' : 'inv.emptyInbound')}
          exportCsv={{ fileName: 'inbound.csv', columns: [{ header: t('col.number'), value: (x) => x.number }, { header: t('inv.warehouse'), value: (x) => inv.warehouseName(x.warehouseId) }, { header: t('inv.expectedKg'), value: (x) => x.expectedKg }, { header: t('inv.receivedKg'), value: (x) => x.receivedKg ?? '' }, { header: t('col.status'), value: (x) => x.status }] }} />
      )}
      {current && <InboundDrawer key={current.id} inbound={current} onClose={close} />}
    </>
  );
}

type DialogKind = 'receive' | 'topUp' | 'record' | { resolve: string } | { review: string; decision: 'PARTIAL' | 'REJECT' } | null;

function InboundDrawer({ inbound: x, onClose }: { inbound: Inbound; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const inv = useInventory();
  const discrepancies = useOrgRows(useWarehouseStore((s) => s.discrepancies)).filter((d) => d.inboundId === x.id);
  const repayments = useOrgRows(useWarehouseStore((s) => s.agentRepayments)).filter((r) => r.inboundId === x.id);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const open = discrepancies.filter((d) => d.status === 'OPEN');
  const exp = open.length ? repaymentExpected(x.id) : null;
  const pendingRep = repayments.find((r) => r.status === 'SUBMITTED');
  const approve = (r: AgentRepayment) => { reviewAgentRepayment(r.id, { decision: 'APPROVE' }, userId ?? 'system'); toast.success(t('inv.toast.repaymentApproved', { number: x.number })); };
  const review = dialog && typeof dialog === 'object' && 'review' in dialog ? repayments.find((r) => r.id === dialog.review) : undefined;
  const resolving = dialog && typeof dialog === 'object' && 'resolve' in dialog ? discrepancies.find((d) => d.id === dialog.resolve) : undefined;
  return (
    <>
    <DetailDrawer open onClose={onClose} title={x.number} subtitle={`${inv.warehouseName(x.warehouseId)} · ${lk.commodity(x.commodityId)}`} badges={<StatusBadge status={`IN_${x.status}`} />}
      actions={<>
        {x.status === 'PENDING' && <PermissionGate permission="inbound.receive"><Button size="sm" onClick={() => setDialog('receive')}><PackageCheck /> {t('inv.receive')}</Button></PermissionGate>}
        {open.some((d) => d.type === 'WEIGHT') && <PermissionGate permission="inbound.resolve"><Button size="sm" variant="secondary" onClick={() => setDialog('topUp')}><Scale /> {t('inv.topUp')}</Button></PermissionGate>}
        {open.length > 0 && !pendingRep && x.source.kind === 'PRE' && <PermissionGate permission="inbound.resolve"><Button size="sm" variant="secondary" onClick={() => setDialog('record')}><Plus /> {t('inv.recordAgentPayment')}</Button></PermissionGate>}
      </>}
      tabs={[
        {
          key: 'summary', label: t('inv.tab.summary'), content: (
            <div className="space-y-5">
              <Facts items={[
                [t('inv.source'), x.source.kind === 'TRANSFER' ? t('inv.fromWarehouse', { name: inv.warehouseName(x.source.fromWarehouseId) }) : x.source.kind === 'PRE' ? <span key="s">{t('inv.fromAgent', { name: lk.agent(x.agentId) })}{x.source.preId && <Link to={`/app/expenses?open=${x.source.preId}`} className="ml-2 text-brand hover:underline">{t('inv.openPre')}</Link>}</span> : t('inv.manual')],
                [t('inv.bags'), f.number(x.bags.filter((b) => b.status !== 'TOP_UP').length)], [t('inv.expectedKg'), f.kg(x.expectedKg)],
                [t('inv.receivedKg'), x.receivedKg != null ? f.kg(x.receivedKg) : '—'],
                [t('inv.variance'), x.receivedKg != null ? `${f.kg(Math.round((x.expectedKg - x.receivedKg) * 10) / 10)} · ${f.number(variancePct(x.expectedKg, x.receivedKg), { maximumFractionDigits: 2 })}%` : '—'],
                [t('inv.tolerance'), `${f.number(tolerancePct(x.orgId, x.commodityId, x.source.kind === 'TRANSFER' ? 'TRANSFER' : 'INBOUND'))}%`],
                [t('inv.receivedBy'), x.received ? `${lk.user(x.received.by)} · ${f.dateTime(x.received.at)}${x.received.device === 'mobile' ? ` · ${t('sup.fromPhone')}` : ''}` : '—'],
              ]} />
              {exp && (
                <Panel title={t('inv.owedTitle')}>
                  <dl className="space-y-1.5 text-[14px]">
                    <div className="flex justify-between"><dt className="text-body">{t('inv.lostKg', { kg: f.kg(exp.lostKg), price: f.money(exp.pricePerKg) })}</dt><dd className="tnum text-ink">{f.money(exp.produce)}</dd></div>
                    <div className="flex justify-between"><dt className="text-body">{t('inv.logisticsShare')}</dt><dd className="tnum text-ink">{f.money(exp.logistics)}</dd></div>
                    <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>{t('col.total')}</dt><dd className="tnum">{f.money(exp.total)}</dd></div>
                  </dl>
                </Panel>
              )}
            </div>
          ),
        },
        {
          key: 'bags', label: t('inv.bags'), count: x.bags.length, content: (
            <div className="overflow-x-auto rounded-ctl border border-line">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-3 py-2 font-semibold">{t('inv.bag')}</th><th className="px-3 py-2 font-semibold">{t('col.status')}</th><th className="px-3 py-2 text-right font-semibold">{t('inv.expectedKg')}</th><th className="px-3 py-2 text-right font-semibold">{t('inv.receivedKg')}</th></tr></thead>
                <tbody>{x.bags.map((b) => <tr key={b.code} className="border-b border-line last:border-0"><td className="px-3 py-2">{mono(b.code)}{b.newCode && <span className="ml-1 text-muted">{`→ ${b.newCode}`}</span>}</td><td className="px-3 py-2">{b.status ? <StatusBadge status={`BAG_${b.status}`} /> : <span className="text-muted">{t('inv.notReceived')}</span>}</td><td className="tnum px-3 py-2 text-right">{b.expectedKg ? f.kg(b.expectedKg) : '—'}</td><td className={cn('tnum px-3 py-2 text-right', b.receivedKg != null && b.expectedKg - b.receivedKg > 0.05 && 'text-danger')}>{b.receivedKg != null ? f.kg(b.receivedKg) : '—'}</td></tr>)}</tbody>
              </table>
            </div>
          ),
        },
        {
          key: 'discrepancies', label: t('inv.tab.discrepancies'), count: discrepancies.length, content: discrepancies.length ? (
            <ul className="space-y-2">
              {discrepancies.map((d) => (
                <li key={d.id} className="rounded-ctl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">{mono(d.bagCode)}<Badge tone={d.type === 'MISSING' ? 'danger' : 'warning'}>{t(`inv.dType.${d.type}`)}</Badge><StatusBadge status={`D_${d.status}`} /></span>
                    <span className="tnum text-[13px] text-body">{`${f.kg(d.expectedKg)} → ${f.kg(d.receivedKg)} · −${f.kg(d.varianceKg)} (${f.number(d.variancePct, { maximumFractionDigits: 2 })}%)`}</span>
                  </div>
                  {d.status === 'OPEN' && d.openKg !== d.varianceKg && <p className="mt-1 text-[12px] text-muted">{t('inv.stillOpen', { kg: f.kg(d.openKg) })}</p>}
                  {d.resolution && <p className="mt-1 text-[12px] text-muted">{t(`inv.resolution.${d.resolution.type}`)}{d.resolution.note ? ` · ${d.resolution.note}` : ''}{d.resolution.by !== 'system' ? ` · ${lk.user(d.resolution.by)}` : ''}</p>}
                  {!!d.allocations?.length && <p className="mt-1 text-[12px] text-muted">{t('inv.allocated', { list: d.allocations.map((a) => `${a.bagCode} ${f.kg(a.kg)}`).join(', ') })}</p>}
                  {d.status === 'OPEN' && <PermissionGate permission="inbound.resolve"><div className="mt-2"><Button size="sm" variant="secondary" onClick={() => setDialog({ resolve: d.id })}><Undo2 /> {t('inv.resolve')}</Button></div></PermissionGate>}
                </li>
              ))}
            </ul>
          ) : <TabEmpty>{t('inv.noDiscrepancies')}</TabEmpty>,
        },
        {
          key: 'repayment', label: t('inv.tab.repayment'), count: repayments.length, content: repayments.length ? (
            <ul className="space-y-3">
              {repayments.map((r) => (
                <li key={r.id} className="rounded-card border border-line p-4">
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2">{mono(r.number)}<StatusBadge status={`RP_${r.status}`} /></span><span className="text-[13px] text-muted">{lk.agent(r.agentId)} · {f.dateTime(r.submitted.at)}</span></div>
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[14px] sm:grid-cols-2">
                    <div className="flex justify-between"><dt className="text-body">{t('inv.lostKg', { kg: f.kg(r.expected.lostKg), price: f.money(r.expected.pricePerKg) })}</dt><dd className="tnum">{f.money(r.expected.produce)}</dd></div>
                    <div className="flex justify-between"><dt className="text-body">{t('inv.logisticsShare')}</dt><dd className="tnum">{f.money(r.expected.logistics)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>{t('inv.owed')}</dt><dd className="tnum">{f.money(r.expected.total)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>{t('inv.submitted')}</dt><dd className="tnum">{f.money(r.submitted.amount)}</dd></div>
                  </dl>
                  <p className="mt-2 text-[13px] text-muted">{t(`sup.refundMethod.${r.submitted.method}`)}{r.submitted.reference ? ` · ${r.submitted.reference}` : ''}{r.submitted.proof ? ` · ${r.submitted.proof}` : ''}</p>
                  {r.review && <p className="mt-2 text-[13px] text-ink">{t('inv.reviewLine', { name: lk.user(r.review.by), approved: f.money(r.review.approved), balance: f.money(r.review.balance) })}{r.review.reason ? ` · ${r.review.reason}` : ''}</p>}
                  {r.status === 'SUBMITTED' && (
                    <PermissionGate permission="inbound.reviewRepayment">
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => approve(r)}><Check /> {t('inv.approveFull')}</Button>
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ review: r.id, decision: 'PARTIAL' })}>{t('inv.approvePartial')}</Button>
                        <Button size="sm" variant="dangerOutline" onClick={() => setDialog({ review: r.id, decision: 'REJECT' })}><X /> {t('buy.action.REJECT')}</Button>
                      </div>
                    </PermissionGate>
                  )}
                </li>
              ))}
            </ul>
          ) : <TabEmpty>{open.length ? t('inv.waitingAgent') : t('inv.noRepayments')}</TabEmpty>,
        },
        { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="inbound" entityId={x.id} /> },
      ]}
    />
    {dialog === 'receive' && <ReceiveDialog inbound={x} onClose={() => setDialog(null)} />}
    {dialog === 'topUp' && <TopUpDialog inbound={x} onClose={() => setDialog(null)} />}
    {resolving && <ResolveDialog discrepancy={resolving} onClose={() => setDialog(null)} />}
    {dialog === 'record' && exp && (
      <AmountDialog open onClose={() => setDialog(null)} title={t('inv.recordAgentPaymentFor', { name: lk.agent(x.agentId) })} description={t('inv.recordHint')} initialMinor={exp.total.amountMinor} currency={exp.total.currency} proof confirm={t('inv.submitRepayment')}
        onConfirm={(v) => { submitAgentRepayment(x.id, { amountMinor: v.amountMinor, method: 'CASH', proof: v.proof }, userId ?? 'system', 'web'); toast.success(t('inv.toast.repaymentSubmitted', { number: x.number })); setDialog(null); }} />
    )}
    {review && dialog && typeof dialog === 'object' && 'decision' in dialog && (
      <AmountDialog open onClose={() => setDialog(null)} title={t(dialog.decision === 'PARTIAL' ? 'inv.partialTitle' : 'inv.rejectTitle', { number: review.number })} description={dialog.decision === 'PARTIAL' ? t('inv.partialHint') : t('inv.rejectHint')}
        initialMinor={dialog.decision === 'PARTIAL' ? Math.round(review.submitted.amount.amountMinor / 2) : review.submitted.amount.amountMinor} maxMinor={review.submitted.amount.amountMinor} currency={review.submitted.amount.currency} reasonLabel={t('dashboard.reason')} reasonRequired
        confirm={dialog.decision === 'PARTIAL' ? t('inv.approvePartial') : t('buy.action.REJECT')}
        onConfirm={(v) => { const decision = dialog.decision; reviewAgentRepayment(review.id, { decision, amountMinor: v.amountMinor, reason: v.reason }, userId ?? 'system'); toast.success(t(decision === 'PARTIAL' ? 'inv.toast.repaymentPartial' : 'inv.toast.repaymentRejected', { number: x.number })); setDialog(null); }} />
    )}
    </>
  );
}

/** Web receipt: each bag Original / Missing / Replaced tag with its weight, plus top-up bags. */
function ReceiveDialog({ inbound: x, onClose }: { inbound: Inbound; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const [rows, setRows] = useState<(ReceiveBag & { kg: string })[]>(() => x.bags.map((b) => ({ code: b.code, status: 'ORIGINAL', kg: String(b.expectedKg) })));
  const [topUps, setTopUps] = useState<{ code: string; kg: string }[]>([]);
  const tol = tolerancePct(x.orgId, x.commodityId, x.source.kind === 'TRANSFER' ? 'TRANSFER' : 'INBOUND');
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const preview = rows.map((r, i) => {
    const exp = x.bags[i]!.expectedKg;
    const kg = r.status === 'MISSING' ? 0 : Number(r.kg || 0);
    const pct = exp ? ((exp - kg) / exp) * 100 : 0;
    return { missing: r.status === 'MISSING', light: r.status !== 'MISSING' && exp - kg > 0.05, auto: r.status !== 'MISSING' && exp - kg > 0.05 && pct <= tol };
  });
  const missing = preview.filter((p) => p.missing).length;
  const light = preview.filter((p) => p.light && !p.auto).length;
  const auto = preview.filter((p) => p.auto).length;
  const invalid = rows.some((r) => r.status !== 'MISSING' && !(Number(r.kg) > 0)) || rows.some((r) => r.status === 'REPLACED' && !r.newCode?.trim()) || topUps.some((u) => !u.code || !(Number(u.kg) > 0));
  const save = () => {
    const res = receiveInbound(x.id, { bags: rows.map((r) => ({ code: r.code, status: r.status, receivedKg: Number(r.kg), newCode: r.newCode?.trim() || undefined })), topUps: topUps.map((u) => ({ code: u.code, kg: Number(u.kg) })), actorId: userId ?? 'system', device: 'web' });
    const open = res.discrepancies.filter((d) => d.status === 'OPEN').length;
    toast[open ? 'warning' : 'success'](t(open ? 'inv.toast.receivedIssues' : 'inv.toast.received', { number: x.number, count: open }), { description: res.autoWrittenOff.length ? t('inv.toast.autoWrittenOff', { count: res.autoWrittenOff.length }) : undefined });
    onClose();
  };
  const select = 'h-9 rounded-ctl border border-line bg-surface px-2 text-[13px] text-ink';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t('inv.receiveTitle', { number: x.number })}</DialogTitle><DialogDescription>{t('inv.receiveHint', { pct: f.number(tol) })}</DialogDescription></DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-ctl border border-line">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-canvas"><tr className="text-left text-[12px] text-label"><th className="px-3 py-2 font-semibold">{t('inv.bag')}</th><th className="px-3 py-2 font-semibold">{t('col.status')}</th><th className="px-3 py-2 text-right font-semibold">{t('inv.expectedKg')}</th><th className="px-3 py-2 font-semibold">{t('inv.receivedKg')}</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.code} className="border-t border-line">
                  <td className="px-3 py-1.5">{mono(r.code)}{r.status === 'REPLACED' && <Input compact value={r.newCode ?? ''} onChange={(e) => set(i, { newCode: e.target.value.toUpperCase() })} placeholder={t('inv.newTag')} aria-label={t('inv.newTag')} className="mt-1 w-36" />}</td>
                  <td className="px-3 py-1.5"><select value={r.status} onChange={(e) => set(i, { status: e.target.value as ReceiveBag['status'] })} aria-label={`${t('col.status')} ${r.code}`} className={select}>{(['ORIGINAL', 'MISSING', 'REPLACED'] as const).map((s) => <option key={s} value={s}>{t(`status.BAG_${s}`)}</option>)}</select></td>
                  <td className="tnum px-3 py-1.5 text-right text-muted">{f.kg(x.bags[i]!.expectedKg)}</td>
                  <td className="px-3 py-1.5"><Input compact type="number" value={r.status === 'MISSING' ? '' : r.kg} disabled={r.status === 'MISSING'} onChange={(e) => set(i, { kg: e.target.value })} aria-label={`${t('inv.receivedKg')} ${r.code}`} className={cn('w-24', preview[i]!.light && !preview[i]!.auto && 'border-warning')} /></td>
                </tr>
              ))}
              {topUps.map((u, i) => (
                <tr key={`t${i}`} className="border-t border-line bg-brand-soft/40">
                  <td className="px-3 py-1.5">{mono(u.code)}</td><td className="px-3 py-1.5"><StatusBadge status="BAG_TOP_UP" /></td><td className="px-3 py-1.5 text-right text-muted">{'—'}</td>
                  <td className="flex items-center gap-1 px-3 py-1.5"><Input compact type="number" value={u.kg} onChange={(e) => setTopUps(topUps.map((x2, j) => (j === i ? { ...x2, kg: e.target.value } : x2)))} aria-label={`${t('inv.receivedKg')} ${u.code}`} className="w-24" /><Button variant="ghost" size="iconSm" onClick={() => setTopUps(topUps.filter((_, j) => j !== i))} aria-label={t('set.remove')}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setTopUps([...topUps, { code: nextBagCode(x.orgId, topUps.length), kg: '' }])}><Plus /> {t('inv.addTopUp')}</Button>
          <p className="text-[13px] text-body">{t('inv.receiveSummary', { missing, light, auto })}</p>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}><PackageCheck /> {t('inv.confirmReceipt')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A top-up bag: its weight goes to the oldest open weight discrepancies of the agent first. */
function TopUpDialog({ inbound: x, onClose }: { inbound: Inbound; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const [code, setCode] = useState(() => nextBagCode(x.orgId));
  const [kg, setKg] = useState('');
  const open = useOrgRows(useWarehouseStore((s) => s.discrepancies)).filter((d) => d.warehouseId === x.warehouseId && d.type === 'WEIGHT' && d.status === 'OPEN' && (!x.agentId || d.agentId === x.agentId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let left = Number(kg || 0);
  const plan = open.map((d) => { const take = Math.max(0, Math.min(left, d.openKg)); left -= take; return { d, take: Math.round(take * 10) / 10 }; }).filter((p) => p.take > 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('inv.topUpTitle')}</DialogTitle><DialogDescription>{t('inv.topUpHint')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inv.bag')}><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label={t('inv.bag')} /></Field>
          <Field label={t('inv.weightKg')}><Input type="number" value={kg} onChange={(e) => setKg(e.target.value)} aria-label={t('inv.weightKg')} autoFocus /></Field>
        </div>
        <div>
          <div className="eyebrow mb-1.5">{t('inv.allocation')}</div>
          {plan.length ? <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{plan.map(({ d, take }) => <li key={d.id} className="flex justify-between px-3 py-2">{mono(d.bagCode)}<span className="text-muted">{f.date(d.createdAt)}</span><span className="tnum font-medium">{`${f.kg(take)} / ${f.kg(d.openKg)}`}</span></li>)}</ul> : <p className="text-[13px] text-muted">{t('inv.allocationEmpty')}</p>}
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!(Number(kg) > 0) || !code.trim()} onClick={() => {
            const res = receiveTopUp(x.id, code.trim(), Number(kg), userId ?? 'system');
            toast.success(t('inv.toast.topUp', { count: res.length })); onClose();
          }}><Scale /> {t('inv.saveTopUp')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ discrepancy: d, onClose }: { discrepancy: Discrepancy; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const [type, setType] = useState<'BAG_RETURNED' | 'TAG_REPLACED' | 'WRITTEN_OFF'>(d.type === 'MISSING' ? 'BAG_RETURNED' : 'WRITTEN_OFF');
  const [newCode, setNewCode] = useState('');
  const [kg, setKg] = useState(String(d.expectedKg));
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<string | undefined>();
  const options = d.type === 'MISSING' ? (['BAG_RETURNED', 'TAG_REPLACED', 'WRITTEN_OFF'] as const) : (['WRITTEN_OFF'] as const);
  const invalid = (type === 'TAG_REPLACED' && !newCode.trim()) || (type !== 'WRITTEN_OFF' && !(Number(kg) > 0)) || (type === 'WRITTEN_OFF' && !note.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('inv.resolveTitle', { code: d.bagCode })}</DialogTitle><DialogDescription>{t('inv.resolveHint')}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('inv.resolution.label')}>
          {options.map((o) => <button key={o} type="button" role="radio" aria-checked={type === o} onClick={() => setType(o)} className={cn('rounded-full border px-3 py-1.5 text-[13px] font-medium', type === o ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body')}>{t(`inv.resolution.${o}`)}</button>)}
        </div>
        {type === 'TAG_REPLACED' && <Field label={t('inv.newTag')}><Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} aria-label={t('inv.newTag')} /></Field>}
        {type !== 'WRITTEN_OFF' && <Field label={t('inv.weightKg')}><Input type="number" value={kg} onChange={(e) => setKg(e.target.value)} aria-label={t('inv.weightKg')} /></Field>}
        <Field label={type === 'WRITTEN_OFF' ? t('dashboard.reason') : t('agg.note')}><Input value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('agg.note')} /></Field>
        {type === 'WRITTEN_OFF' && <div><div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('inv.writeOffProof')}</div><ProofPicker value={proof} onChange={setProof} /></div>}
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={() => { resolveDiscrepancy(d.id, { type, newCode: newCode.trim() || undefined, kg: Number(kg), note: note.trim() || proof }, userId ?? 'system'); toast.success(t('inv.toast.resolved', { code: d.bagCode })); onClose(); }}><Check /> {t('inv.resolve')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
