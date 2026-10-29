import { useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, CalendarRange, Check, CheckCheck, Columns3, Gauge, List, Pencil, Plus, Printer, ShoppingBasket, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import type { LoanAccount, RecoveryRequest, RecoveryWindow, Repayment } from '@/types';
import { ancestorAtLevel } from '@/engines/locations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { HBars, Lines, StackedColumns } from '@/components/charts/charts';
import { debtCheck } from '@/services/buyingService';
import {
  activateRecovery, confirmCash, daysLeft, ledgerOf, quoteOf, recordRepayment, refundDue, refundOverpaymentManual, rejectRecovery, reviewRecovery, saveWindow, windowOverlap, type WindowInput,
} from '@/services/recoveryService';
import { cn } from '@/lib/utils';
import { useLoanStore } from '@/stores/loanStore';
import { useLocationStore } from '@/stores/locationStore';
import { useSupportStore } from '@/stores/supportStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { AmountDialog, Panel, mono } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { useSupportLookups } from './shared';

export type RecoveryTab = 'requests' | 'windows' | 'loans' | 'repayments' | 'dashboard';
const PATHS: Record<RecoveryTab, string> = { requests: '/app/recovery', windows: '/app/recovery/windows', loans: '/app/recovery/loans', repayments: '/app/recovery/repayments', dashboard: '/app/recovery/dashboard' };
const BOARD: RecoveryRequest['status'][] = ['PENDING_REVIEW', 'FINANCE_REVIEW', 'ACTIVATED', 'PARTIALLY_RECOVERED', 'FULLY_RECOVERED', 'REJECTED'];

/** Recovery (PRD F4): requests, windows, farmer loans with the ledger, repayments, dashboard. */
export function RecoveryPage({ tab }: { tab: RecoveryTab }) {
  const { t } = useT();
  useDemoNotes([{ id: 'recovery', key: 'demo.note.recovery' }]);
  const repayments = useOrgRows(useSupportStore((s) => s.repayments));
  const pendingCash = repayments.filter((r) => r.receipt.status === 'PENDING').length;
  return (
    <>
      <PageHeader eyebrow={t('nav.section.support')} title={t('nav.recovery')} description={t('pages.recovery')} />
      <nav className="mb-5 inline-flex flex-wrap rounded-ctl border border-line bg-surface p-1" aria-label={t('rec.sections')}>
        {(Object.keys(PATHS) as RecoveryTab[]).map((k) => (
          <NavLink key={k} to={PATHS[k]} end className={({ isActive }) => cn('inline-flex h-9 items-center gap-2 rounded-[8px] px-4 text-[14px] font-medium transition-colors', isActive ? 'bg-brand text-on-brand' : 'text-body hover:bg-canvas')}>
            {t(`rec.tab.${k}`)}{k === 'repayments' && pendingCash > 0 && <span className="tnum rounded-full bg-warning/20 px-1.5 text-[12px]">{pendingCash}</span>}
          </NavLink>
        ))}
      </nav>
      {tab === 'requests' && <RequestsTab />}
      {tab === 'windows' && <WindowsTab />}
      {tab === 'loans' && <LoansTab />}
      {tab === 'repayments' && <RepaymentsTab />}
      {tab === 'dashboard' && <RecoveryDashboard />}
    </>
  );
}

// ---------------------------------------------------------------- Requests

function useRecoveryNumbers() {
  const loans = useOrgRows(useLoanStore((s) => s.loans));
  const repayments = useOrgRows(useSupportStore((s) => s.repayments));
  return useMemo(() => {
    const byId = new Map(loans.map((l) => [l.id, l]));
    return (r: RecoveryRequest) => {
      const ls = r.loanIds.map((id) => byId.get(id)).filter(Boolean) as LoanAccount[];
      const expected = ls.reduce((s, l) => s + ledgerOf(l).balance + ledgerOf(l).repaid, 0);
      const reps = repayments.filter((x) => x.recoveryRequestId === r.id);
      const recovered = reps.reduce((s, x) => s + (x.cash?.amountMinor ?? 0) + (x.produceValue?.amountMinor ?? 0), 0);
      const price = r.review?.unitPrice.amountMinor ?? 0;
      return { loans: ls, expected, recovered, expectedKg: price ? Math.ceil(expected / price) : 0, recoveredKg: reps.reduce((s, x) => s + (x.kg ?? 0), 0), repayments: reps, settled: ls.filter((l) => l.status === 'SETTLED').length };
    };
  }, [loans, repayments]);
}

function RequestsTab() {
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSupportLookups();
  const rows = useOrgRows(useSupportStore((s) => s.recoveries));
  const windows = useOrgRows(useSupportStore((s) => s.windows));
  const nums = useRecoveryNumbers();
  const [openId, open, close] = useDrawerParam();
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => !query || r.number.toLowerCase().includes(query) || sl.groupName(r.groupId).toLowerCase().includes(query)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const winName = (id: string) => windows.find((w) => w.id === id)?.name ?? '—';
  const columns = useMemo<ColumnDef<RecoveryRequest, unknown>[]>(() => [
    { id: 'number', header: t('rec.col.batch'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'group', header: terms.farmerGroup, accessorFn: (r) => sl.groupName(r.groupId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'window', header: t('rec.col.window'), accessorFn: (r) => winName(r.windowId) },
    { id: 'agent', header: terms.agent, accessorFn: (r) => lk.agent(r.agentId) },
    { id: 'farmers', header: terms.farmers, accessorFn: (r) => r.loanIds.length },
    { id: 'expected', header: t('rec.col.expected'), accessorFn: (r) => nums(r).expected, cell: (c) => f.money({ amountMinor: c.getValue() as number, currency: f.org.currency }) },
    { id: 'recovered', header: t('rec.col.recovered'), accessorFn: (r) => nums(r).recovered, cell: (c) => f.money({ amountMinor: c.getValue() as number, currency: f.org.currency }) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'created', header: t('buy.created'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, lk, sl, nums, terms, windows]);
  const current = rows.find((r) => r.id === openId);
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('rec.search')}
        extra={<div className="inline-flex rounded-ctl border border-line bg-surface p-0.5" role="group" aria-label={t('buy.layout')}>
          <Button size="xs" variant={layout === 'board' ? 'primary' : 'ghost'} onClick={() => setLayout('board')} aria-pressed={layout === 'board'}><Columns3 /> {t('sup.board')}</Button>
          <Button size="xs" variant={layout === 'list' ? 'primary' : 'ghost'} onClick={() => setLayout('list')} aria-pressed={layout === 'list'}><List /> {t('buy.list')}</Button>
        </div>} />
      {layout === 'list' ? (
        <DataTable columns={columns} data={shown} onRowClick={(r) => open(r.id)} activeId={openId} getRowId={(r) => r.id} columnPicker
          exportCsv={{ fileName: 'recoveries.csv', columns: [
            { header: t('rec.col.batch'), value: (r) => r.number }, { header: terms.farmerGroup, value: (r) => sl.groupName(r.groupId) },
            { header: t('rec.col.expectedIn', { currency: f.org.currency }), value: (r) => nums(r).expected }, { header: t('rec.col.recoveredIn', { currency: f.org.currency }), value: (r) => nums(r).recovered }, { header: t('col.status'), value: (r) => r.status },
          ] }}
          empty={t('rec.empty')} />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {BOARD.map((s) => {
            const items = shown.filter((r) => r.status === s);
            return (
              <section key={s} className="w-[270px] shrink-0 rounded-card border border-line bg-canvas/60 p-3" aria-label={t(`status.${s}`)}>
                <div className="mb-3 flex items-center justify-between px-1"><StatusBadge status={s} /><span className="tnum text-[13px] text-muted">{items.length}</span></div>
                <ul className="space-y-2">
                  {items.map((r) => { const n = nums(r); return (
                    <li key={r.id}><button type="button" onClick={() => open(r.id)} className="w-full rounded-ctl border border-line bg-surface p-3 text-left shadow-soft hover:border-brand/40">
                      <div className="flex items-center justify-between gap-2">{mono(r.number)}<span className="text-[12px] text-muted">{t('sup.farmersN', { count: r.loanIds.length })}</span></div>
                      <div className="mt-1.5 truncate text-[14px] font-medium text-ink">{sl.groupName(r.groupId)}</div>
                      <div className="truncate text-[12px] text-muted">{winName(r.windowId)}</div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${n.expected ? Math.min(100, (n.recovered / n.expected) * 100) : 0}%` }} /></div>
                      <div className="tnum mt-1 text-[12px] text-muted">{t('rec.recoveredOf', { recovered: f.money({ amountMinor: n.recovered, currency: f.org.currency }, { compact: true }), expected: f.money({ amountMinor: n.expected, currency: f.org.currency }, { compact: true }) })}</div>
                    </button></li>
                  ); })}
                  {!items.length && <li className="px-1 py-2 text-[12px] text-muted">{t('sup.columnEmpty')}</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {current && <RecoveryDrawer key={current.id} recovery={current} onClose={close} />}
    </>
  );
}

function RecoveryDrawer({ recovery: r, onClose }: { recovery: RecoveryRequest; onClose: () => void }) {
  const { userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSupportLookups();
  const lang = useLang();
  const settings = useOrgSettings();
  const windows = useOrgRows(useSupportStore((s) => s.windows));
  const nums = useRecoveryNumbers()(r);
  const [dialog, setDialog] = useState<'review' | 'activate' | 'reject' | { repay: string } | null>(null);
  const win = windows.find((w) => w.id === r.windowId);
  const lt = settings.loanTerms;
  const money = (v: number) => f.money({ amountMinor: v, currency: f.org.currency });
  const terms_ = t('rec.termsSnapshot', { rate: f.number(lt.rate * 100, { maximumFractionDigits: 2 }), period: t(`rec.period.${lt.period}`), type: t(`rec.interestType.${lt.interestType}`), after: win ? f.date(win.end) : '—', penalty: lt.penalty.type === 'none' ? t('rec.noPenalty') : t('rec.penaltyPct', { pct: f.number(lt.penalty.rate * 100) }) });
  const canReject = !nums.repayments.length && !['REJECTED', 'FULLY_RECOVERED'].includes(r.status);
  const active = ['ACTIVATED', 'PARTIALLY_RECOVERED'].includes(r.status);
  const commodity = settings.commodities.find((c) => c.id === r.review?.commodityId);
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{r.number}</span>}
        subtitle={`${sl.groupName(r.groupId)} · ${win?.name ?? ''} · ${lk.agent(r.agentId)}`}
        badges={<><StatusBadge status={r.status} />{r.device === 'mobile' && <Badge tone="neutral">{t('sup.fromPhone')}</Badge>}</>}
        actions={
          <>
            {r.status === 'PENDING_REVIEW' && <PermissionGate permission="recovery.reviewManager"><Button size="sm" onClick={() => setDialog('review')}><Check /> {t('rec.review')}</Button></PermissionGate>}
            {r.status === 'FINANCE_REVIEW' && <PermissionGate permission="recovery.activateFinance"><Button size="sm" onClick={() => setDialog('activate')}><CheckCheck /> {t('rec.activate')}</Button></PermissionGate>}
            {canReject && <PermissionGate permission="recovery.reviewManager"><Button size="sm" variant="dangerOutline" onClick={() => setDialog('reject')}><X /> {t('buy.action.REJECT')}</Button></PermissionGate>}
          </>
        }
        tabs={[
          {
            key: 'summary', label: t('buy.tab.summary'), content: (
              <div className="space-y-4">
                {r.rejection && <p className="rounded-ctl border border-danger/30 bg-danger/5 px-3 py-2 text-[14px] text-ink">{t('rec.rejectedLine', { reason: r.rejection.reason, name: lk.user(r.rejection.by) })}</p>}
                <Facts cols={3} items={[[t('rec.col.expected'), money(nums.expected)], [t('rec.col.recovered'), money(nums.recovered)], [t('rec.settledLoans'), `${nums.settled} / ${nums.loans.length}`]]} />
                <Facts items={[
                  [terms.farmerGroup, <Link key="g" to={`/app/groups?open=${r.groupId}`} className="text-brand hover:underline">{sl.groupName(r.groupId)}</Link>], [t('rec.col.window'), win ? `${win.name} · ${f.date(win.start)} → ${f.date(win.end)}` : '—'],
                  [t('rec.commodity'), commodity ? commodity.name[lang] ?? commodity.name.en ?? '' : '—'], [t('rec.unitPrice'), r.review ? `${f.money(r.review.unitPrice)}/kg` : '—'],
                  [t('rec.excessPrice'), r.activation?.excessPrice ? `${f.money(r.activation.excessPrice)}/kg` : r.review?.excessPrice ? `${f.money(r.review.excessPrice)}/kg` : '—'], [t('rec.volume'), r.review ? `${f.kg(nums.recoveredKg)} / ${f.kg(nums.expectedKg)}` : '—'],
                  [t('rec.reviewedBy'), r.review ? `${lk.user(r.review.by)} · ${f.dateTime(r.review.at)}` : '—'], [t('rec.activatedBy'), r.activation ? `${lk.user(r.activation.by)} · ${f.dateTime(r.activation.at)}${r.activation.reason ? ` · ${r.activation.reason}` : ''}` : '—'],
                  [t('rec.linkedRequest'), r.purchaseRequestId ? <Link key="p" to={`/app/purchase-requests?open=${r.purchaseRequestId}`} className="text-brand hover:underline">{t('rec.openRequest')}</Link> : '—'],
                ]} />
                <p className="rounded-ctl bg-canvas px-3 py-2 text-[13px] text-body">{terms_}</p>
                {r.feedback && <Panel title={t('rec.feedback')}><Facts items={[[t('rec.experience'), r.feedback.experience], [t('rec.lendAgain'), t(`rec.lend.${r.feedback.lendAgain}`)], [t('agg.note'), r.feedback.comment ?? '—']]} /></Panel>}
              </div>
            ),
          },
          {
            key: 'farmers', label: terms.farmers, count: nums.loans.length, content: (
              <div className="overflow-x-auto rounded-ctl border border-line">
                <table className="w-full min-w-[640px] text-[14px]">
                  <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-3 py-2 font-semibold">{terms.farmer}</th><th className="px-3 py-2 text-right font-semibold">{t('rec.balance')}</th><th className="px-3 py-2 text-right font-semibold">{t('rec.quoteCash')}</th><th className="px-3 py-2 text-right font-semibold">{t('rec.quoteProduce')}</th><th className="px-3 py-2 font-semibold">{t('col.status')}</th><th /></tr></thead>
                  <tbody>
                    {nums.loans.map((l) => {
                      const lg = ledgerOf(l);
                      const cash = quoteOf(l, 'cash');
                      const prod = quoteOf(l, 'produce', new Date(), r.review?.unitPrice);
                      return (
                        <tr key={l.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2"><Link to={`/app/recovery/loans?open=${l.id}`} className="text-ink hover:text-brand">{sl.farmerName(l.farmerId)}</Link></td>
                          <td className="tnum px-3 py-2 text-right text-ink">{f.money({ amountMinor: lg.balance, currency: l.principal.currency })}</td>
                          <td className="tnum px-3 py-2 text-right text-body">{f.money(cash.amount)}</td>
                          <td className="tnum px-3 py-2 text-right text-body">{prod.volumeKg != null ? f.kg(prod.volumeKg) : '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                          <td className="px-3 py-2 text-right">{active && l.status === 'ACTIVE' && <PermissionGate permission="recovery.recordRepayment"><Button size="xs" variant="secondary" onClick={() => setDialog({ repay: l.id })}><Banknote /> {t('rec.repay')}</Button></PermissionGate>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ),
          },
          {
            key: 'repayments', label: t('sup.repayments'), count: nums.repayments.length, content: nums.repayments.length ? <RepaymentList rows={nums.repayments} /> : <TabEmpty>{active ? t('rec.noRepaymentsYet') : t('rec.repayAfterActivation')}</TabEmpty>,
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="recoveryRequest" entityId={r.id} /> },
        ]}
      />
      {dialog === 'review' && <ReviewDialog recovery={r} terms={terms_} onClose={() => setDialog(null)} />}
      {dialog === 'activate' && <ActivateDialog recovery={r} onClose={() => setDialog(null)} />}
      {dialog === 'reject' && (
        <AmountDialog open onClose={() => setDialog(null)} title={t('rec.rejectTitle', { number: r.number })} description={t('rec.rejectHint')} initialMinor={0} currency={f.org.currency} reasonLabel={t('dashboard.reason')} reasonRequired confirm={t('buy.action.REJECT')}
          extra={<span className="sr-only">{'—'}</span>} onConfirm={(v) => { if (rejectRecovery(r.id, v.reason, userId ?? 'system')) toast.success(t('rec.toast.rejected', { number: r.number })); setDialog(null); }} />
      )}
      {dialog && typeof dialog === 'object' && <RepayDialog recovery={r} loanId={dialog.repay} onClose={() => setDialog(null)} />}
    </>
  );
}

function ReviewDialog({ recovery: r, terms, onClose }: { recovery: RecoveryRequest; terms: string; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lang = useLang();
  const settings = useOrgSettings();
  const win = useSupportStore((s) => s.windows.find((w) => w.id === r.windowId));
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const [commodityId, setCommodityId] = useState(win?.commodityId ?? settings.commodities[0]?.id ?? '');
  const list = settings.priceList.find((p) => p.commodityId === commodityId)?.price.amountMinor ?? 0;
  const [price, setPrice] = useState(String(list / 10 ** dec));
  const [excess, setExcess] = useState(String(Math.round(list * 1.05) / 10 ** dec));
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  const minor = (v: string) => Math.round(Number(v || 0) * 10 ** dec);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('rec.reviewTitle', { number: r.number })}</DialogTitle><DialogDescription>{terms}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('rec.commodity')} className="sm:col-span-2"><select value={commodityId} onChange={(e) => { setCommodityId(e.target.value); const p = settings.priceList.find((x) => x.commodityId === e.target.value)?.price.amountMinor ?? 0; setPrice(String(p / 10 ** dec)); setExcess(String(Math.round(p * 1.05) / 10 ** dec)); }} aria-label={t('rec.commodity')} className={select}>{settings.commodities.map((c) => <option key={c.id} value={c.id}>{c.name[lang] ?? c.name.en}</option>)}</select></Field>
          <Field label={t('rec.unitPriceIn', { currency: f.org.currency })} helper={list ? t('rec.listHint', { price: f.money({ amountMinor: list, currency: f.org.currency }) }) : undefined}><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={t('rec.unitPriceIn', { currency: f.org.currency })} /></Field>
          <Field label={t('rec.excessPriceIn', { currency: f.org.currency })} helper={t('rec.excessHint')}><Input type="number" value={excess} onChange={(e) => setExcess(e.target.value)} aria-label={t('rec.excessPriceIn', { currency: f.org.currency })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!(minor(price) > 0)} onClick={() => { reviewRecovery(r.id, { commodityId, unitPriceMinor: minor(price), excessPriceMinor: minor(excess) || undefined }, userId ?? 'system'); toast.success(t('rec.toast.reviewed', { number: r.number })); onClose(); }}><Check /> {t('rec.approveReview')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivateDialog({ recovery: r, onClose }: { recovery: RecoveryRequest; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const start = r.review?.excessPrice?.amountMinor ?? 0;
  const [excess, setExcess] = useState(String(start / 10 ** dec));
  const [reason, setReason] = useState('');
  const minor = Math.round(Number(excess || 0) * 10 ** dec);
  const changed = minor !== start;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('rec.activateTitle', { number: r.number })}</DialogTitle><DialogDescription>{settings.support.linkPurchaseRequest ? t('rec.activateHintLinked') : t('rec.activateHint')}</DialogDescription></DialogHeader>
        <Facts items={[[t('rec.unitPrice'), r.review ? `${f.money(r.review.unitPrice)}/kg` : '—']]} />
        <Field label={t('rec.excessPriceIn', { currency: f.org.currency })}><Input type="number" value={excess} onChange={(e) => setExcess(e.target.value)} aria-label={t('rec.excessPriceIn', { currency: f.org.currency })} /></Field>
        {changed && <Field label={t('rec.changeReason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('rec.changeReason')} autoFocus /></Field>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={changed && !reason.trim()} onClick={() => { const res = activateRecovery(r.id, { excessPriceMinor: minor || undefined, reason }, userId ?? 'system'); if (res.ok) { toast.success(t('rec.toast.activated', { number: r.number })); onClose(); } }}><CheckCheck /> {t('rec.activate')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Web entry of a repayment (the agent normally records it on the phone, M7). */
function RepayDialog({ recovery: r, loanId, onClose }: { recovery: RecoveryRequest; loanId: string; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const settings = useOrgSettings();
  const loan = useLoanStore((s) => s.loans.find((l) => l.id === loanId))!;
  const dec = loan.principal.currency === 'XOF' ? 0 : 2;
  const modes = settings.support.repaymentModes;
  const [mode, setMode] = useState<Repayment['mode']>(modes[0] ?? 'PRODUCE');
  const [kg, setKg] = useState('');
  const [cash, setCash] = useState('');
  const [excess, setExcess] = useState(true);
  const [bag, setBag] = useState('');
  const cashQ = quoteOf(loan, 'cash');
  const prodQ = quoteOf(loan, 'produce', new Date(), r.review?.unitPrice);
  const save = () => {
    const res = recordRepayment({ recoveryRequestId: r.id, loanId, mode, kg: Number(kg || 0) || undefined, cashMinor: Math.round(Number(cash || 0) * 10 ** dec) || undefined, excess, bagCode: bag || undefined, photo: Number(cash) ? 'cash-receipt.jpg' : undefined, actorId: userId ?? 'system', device: 'web' });
    toast.success(t(res.settled ? 'rec.toast.settled' : 'rec.toast.repaid', { name: sl.farmerName(loan.farmerId) }), { description: res.excessKg ? t('rec.excessBought', { kg: f.kg(res.excessKg) }) : undefined });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('rec.repayTitle', { name: sl.farmerName(loan.farmerId) })}</DialogTitle><DialogDescription>{t('rec.quoteLine', { cash: f.money(cashQ.amount), kg: prodQ.volumeKg != null ? f.kg(prodQ.volumeKg) : '—' })}</DialogDescription></DialogHeader>
        <div className="inline-flex h-10 rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={t('rec.mode')}>
          {modes.map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('rounded-[8px] px-4 text-[14px] font-medium', mode === m ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>{t(`rec.modeName.${m}`)}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode !== 'CASH' && <Field label={t('buy.weightKg')}><Input type="number" value={kg} onChange={(e) => setKg(e.target.value)} aria-label={t('buy.weightKg')} /></Field>}
          {mode !== 'CASH' && <Field label={t('rec.bagCode')}><Input value={bag} onChange={(e) => setBag(e.target.value.toUpperCase())} aria-label={t('rec.bagCode')} /></Field>}
          {mode !== 'PRODUCE' && <Field label={t('buy.amountIn', { currency: loan.principal.currency })}><Input type="number" value={cash} onChange={(e) => setCash(e.target.value)} aria-label={t('buy.amountIn', { currency: loan.principal.currency })} /></Field>}
        </div>
        {mode !== 'CASH' && r.purchaseRequestId && <Checkbox label={t('rec.excessToggle', { price: r.activation?.excessPrice ? f.money(r.activation.excessPrice) : '—' })} checked={excess} onChange={(e) => setExcess(e.target.checked)} />}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!(Number(kg) > 0 || Number(cash) > 0)} onClick={save}><Banknote /> {t('rec.saveRepayment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Windows

function WindowsTab() {
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const lang = useLang();
  const settings = useOrgSettings();
  const rows = useOrgRows(useSupportStore((s) => s.windows));
  const [editing, setEditing] = useState<RecoveryWindow | 'new' | null>(null);
  const sorted = [...rows].sort((a, b) => b.start.localeCompare(a.start));
  const min = Math.min(...rows.map((w) => new Date(w.start).getTime()), Date.now());
  const max = Math.max(...rows.map((w) => new Date(w.end).getTime()), Date.now());
  const pos = (d: string | number) => ((new Date(d).getTime() - min) / Math.max(1, max - min)) * 100;
  const columns = useMemo<ColumnDef<RecoveryWindow, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'programme', header: t('rec.programme'), accessorFn: (w) => sl.typeName(w.typeId) },
    { id: 'season', header: t('rec.season'), accessorKey: 'season' },
    { id: 'commodity', header: t('col.commodity'), accessorFn: (w) => { const c = settings.commodities.find((x) => x.id === w.commodityId); return c ? c.name[lang] ?? c.name.en ?? '' : '—'; } },
    { id: 'start', header: t('rec.start'), accessorKey: 'start', cell: (c) => f.date(c.getValue() as string) },
    { id: 'end', header: t('rec.end'), accessorKey: 'end', cell: (c) => f.date(c.getValue() as string) },
    { id: 'left', header: t('rec.daysLeft'), accessorFn: (w) => (w.status === 'ACTIVE' ? daysLeft(w) : null), cell: (c) => (c.getValue() == null ? '—' : t('buy.days', { count: Math.max(0, c.getValue() as number) })) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'reminded', header: t('rec.reminders'), accessorFn: (w) => w.remindedAt ?? '', cell: (c) => { const w = c.row.original; return !w.reminders.sms && !w.reminders.push ? '—' : <span className="text-[13px] text-muted">{w.remindedAt ? t('rec.remindedAt', { when: f.relative(w.remindedAt) }) : t('rec.notReminded')}</span>; } },
    { id: 'remark', header: t('rec.remark'), accessorFn: (w) => w.remark ?? '' },
  ], [t, f, sl, settings.commodities, lang]);
  return (
    <>
      <div className="mb-4 flex justify-end"><PermissionGate permission="recovery.edit"><Button size="sm" onClick={() => setEditing('new')}><Plus /> {t('rec.newWindow')}</Button></PermissionGate></div>
      <Panel title={<span className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-brand" />{t('rec.calendar')}</span>} className="mb-5">
        <div className="relative space-y-2 pt-6">
          <div className="absolute inset-y-0 w-px bg-danger/60" style={{ left: `${pos(Date.now())}%` }} aria-hidden="true"><span className="absolute -top-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-danger">{t('rec.today')}</span></div>
          {sorted.map((w) => (
            <button key={w.id} type="button" onClick={() => setEditing(w)} className="relative block h-8 w-full text-left" aria-label={w.name}>
              <span className={cn('absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap rounded-full px-3 text-[12px] font-medium', w.status === 'ACTIVE' ? 'bg-brand text-on-brand' : w.status === 'DRAFT' ? 'border border-dashed border-line bg-surface text-body' : 'bg-canvas text-muted')} style={{ left: `${pos(w.start)}%`, width: `${Math.max(6, pos(w.end) - pos(w.start))}%` }}>{w.name}</span>
            </button>
          ))}
        </div>
      </Panel>
      <DataTable columns={columns} data={sorted} onRowClick={(w) => setEditing(w)} getRowId={(w) => w.id} initialHidden={['remark']} empty={t('rec.emptyWindows')} />
      {editing && <WindowSheet window={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function WindowSheet({ window: w, onClose }: { window?: RecoveryWindow; onClose: () => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const sl = useSupportLookups();
  const lang = useLang();
  const settings = useOrgSettings();
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState<WindowInput>(() => w ? { name: w.name, typeId: w.typeId, season: w.season, commodityId: w.commodityId, start: w.start, end: w.end, status: w.status, remark: w.remark, reminders: w.reminders }
    : { name: '', typeId: sl.types.find((x) => x.recoverable)?.id ?? '', season: String(new Date().getFullYear()), commodityId: settings.commodities[0]?.id ?? '', start: today, end: new Date(Date.now() + settings.support.recoveryWindowDays * 86_400_000).toISOString().slice(0, 10), status: 'DRAFT', remark: '', reminders: { sms: true, push: true } });
  const overlap = windowOverlap(orgId, v, w?.id);
  const invalid = !v.name.trim() || v.end < v.start || !!overlap;
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{w ? t('rec.editWindow', { name: w.name }) : t('rec.newWindow')}</SheetTitle></div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label={t('col.name')}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label={t('col.name')} autoFocus /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('rec.programme')}><select value={v.typeId} onChange={(e) => setV({ ...v, typeId: e.target.value })} aria-label={t('rec.programme')} className={select}>{sl.types.filter((x) => x.recoverable).map((x) => <option key={x.id} value={x.id}>{sl.typeName(x.id)}</option>)}</select></Field>
            <Field label={t('rec.season')}><Input value={v.season} onChange={(e) => setV({ ...v, season: e.target.value })} aria-label={t('rec.season')} /></Field>
            <Field label={t('col.commodity')}><select value={v.commodityId} onChange={(e) => setV({ ...v, commodityId: e.target.value })} aria-label={t('col.commodity')} className={select}>{settings.commodities.map((c) => <option key={c.id} value={c.id}>{c.name[lang] ?? c.name.en}</option>)}</select></Field>
            <Field label={t('col.status')}><select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as RecoveryWindow['status'] })} aria-label={t('col.status')} className={select}>{(['DRAFT', 'ACTIVE', 'CLOSED'] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select></Field>
            <Field label={t('rec.start')}><Input type="date" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} aria-label={t('rec.start')} /></Field>
            <Field label={t('rec.end')} error={v.end < v.start ? t('rec.err.windowDates') : undefined}><Input type="date" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} aria-label={t('rec.end')} /></Field>
          </div>
          {overlap && <p className="rounded-ctl border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger" role="alert">{t('rec.err.windowOverlap', { name: overlap.name })}</p>}
          <Field label={t('rec.remark')}><Input value={v.remark ?? ''} onChange={(e) => setV({ ...v, remark: e.target.value })} aria-label={t('rec.remark')} /></Field>
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-muted">{t('rec.reminders')}</div>
            <Checkbox label={t('rec.reminderBanner')} checked disabled />
            <Checkbox label={t('rec.reminderSms')} checked={v.reminders.sms} onChange={(e) => setV({ ...v, reminders: { ...v.reminders, sms: e.target.checked } })} />
            <Checkbox label={t('rec.reminderPush')} checked={v.reminders.push} onChange={(e) => setV({ ...v, reminders: { ...v.reminders, push: e.target.checked } })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={() => { try { saveWindow(orgId, userId ?? 'system', { ...v, remark: v.remark?.trim() || undefined }, w?.id); toast.success(t('rec.toast.windowSaved', { name: v.name })); onClose(); } catch (e) { toast.error(t(`rec.err.${(e as Error).message}`, { name: '' })); } }}>{t('common.save')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Loans & ledger

type LoanView = 'all' | 'overdue' | 'blocked' | 'settled' | 'refund';

function LoansTab() {
  const { orgId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const settings = useOrgSettings();
  const loans = useOrgRows(useLoanStore((s) => s.loans));
  const refunds = useSupportStore((s) => s.refunds);
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<LoanView>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => loans.map((l) => ({ l, lg: ledgerOf(l), blocked: debtCheck(orgId, l.farmerId).blocked, refund: refundDue(l) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loans, orgId, refunds]);
  type Row = (typeof rows)[number];
  const inView = (r: Row, v: LoanView) => v === 'all' || (v === 'overdue' ? r.lg.overdue : v === 'blocked' ? r.blocked && r.lg.overdue : v === 'settled' ? r.l.status === 'SETTLED' : r.refund > 0);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => inView(r, view) && (!query || sl.farmerName(r.l.farmerId).toLowerCase().includes(query) || (r.l.groupId ? sl.groupName(r.l.groupId) : '').toLowerCase().includes(query))).sort((a, b) => b.lg.balance - a.lg.balance);
  const money = (v: number, c: string) => f.money({ amountMinor: v, currency: c });
  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'farmer', header: terms.farmer, accessorFn: (r) => sl.farmerName(r.l.farmerId), cell: (c) => <span className="flex items-center gap-2 font-medium text-ink">{c.getValue() as string}{c.row.original.blocked && c.row.original.lg.overdue && <Badge tone="danger">{t('rec.blocked')}</Badge>}</span> },
    { id: 'group', header: terms.farmerGroup, accessorFn: (r) => (r.l.groupId ? sl.groupName(r.l.groupId) : '—') },
    { id: 'source', header: t('rec.source'), accessorFn: (r) => (r.l.legacyAllocationId ? t('rec.legacy') : r.l.typeId ? sl.typeName(r.l.typeId) : t('rec.direct')) },
    { id: 'principal', header: t('rec.principal'), accessorFn: (r) => r.l.principal.amountMinor, cell: (c) => f.money(c.row.original.l.principal) },
    { id: 'interest', header: t('rec.interest'), accessorFn: (r) => r.lg.interestCharged, cell: (c) => money(c.getValue() as number, c.row.original.l.principal.currency) },
    { id: 'penalty', header: t('rec.penalty'), accessorFn: (r) => r.lg.penaltyCharged, cell: (c) => money(c.getValue() as number, c.row.original.l.principal.currency) },
    { id: 'repaid', header: t('sup.repaid'), accessorFn: (r) => r.lg.repaid, cell: (c) => money(c.getValue() as number, c.row.original.l.principal.currency) },
    { id: 'balance', header: t('rec.balance'), accessorFn: (r) => r.lg.balance, cell: (c) => <span className="font-medium text-ink">{money(c.getValue() as number, c.row.original.l.principal.currency)}</span> },
    { id: 'due', header: t('rec.due'), accessorFn: (r) => r.l.window.end, cell: (c) => <span className={cn(c.row.original.lg.overdue && 'font-medium text-danger')}>{f.date(c.getValue() as string)}</span> },
    { id: 'status', header: t('col.status'), accessorFn: (r) => (r.lg.overdue ? 'OVERDUE' : r.l.status), cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, sl, terms]);
  const current = rows.find((r) => r.l.id === openId);
  const debtPolicy = settings.buyingRules.debtPolicy;
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('rec.searchLoans')}
        views={(['all', 'overdue', 'blocked', 'settled', 'refund'] as const).map((v) => ({ key: v, label: t(`rec.loanView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((r) => inView(r, v)).length }))}
        onClear={() => { setQ(''); setView('all'); }} />
      {view === 'blocked' && <p className="mb-3 rounded-ctl border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-ink">{t(`rec.blockedHint.${debtPolicy}`)}</p>}
      <DataTable columns={columns} data={shown} onRowClick={(r) => open(r.l.id)} activeId={openId} getRowId={(r) => r.l.id} columnPicker initialHidden={['source', 'penalty']}
        exportCsv={{ fileName: 'loans.csv', columns: [
          { header: terms.farmer, value: (r) => sl.farmerName(r.l.farmerId) }, { header: t('rec.principal'), value: (r) => r.l.principal.amountMinor }, { header: t('rec.interest'), value: (r) => r.lg.interestCharged },
          { header: t('rec.penalty'), value: (r) => r.lg.penaltyCharged }, { header: t('sup.repaid'), value: (r) => r.lg.repaid }, { header: t('rec.balance'), value: (r) => r.lg.balance }, { header: t('rec.due'), value: (r) => r.l.window.end },
        ] }}
        empty={t('rec.emptyLoans')} />
      {current && <LoanDrawer key={current.l.id} loan={current.l} onClose={close} />}
    </>
  );
}

/** Farmer loan view (PRD F4): balance, settlement quote today and at a future date, ledger table and chart. */
function LoanDrawer({ loan: l, onClose }: { loan: LoanAccount; onClose: () => void }) {
  const { userId, orgId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  const settings = useOrgSettings();
  const recoveries = useOrgRows(useSupportStore((s) => s.recoveries));
  const repayments = useOrgRows(useSupportStore((s) => s.repayments));
  const [ahead, setAhead] = useState(0);
  const [refund, setRefund] = useState<'momo' | 'manual' | null>(null);
  const lg = ledgerOf(l);
  const c = l.principal.currency;
  const money = (v: number) => f.money({ amountMinor: v, currency: c });
  const rec = recoveries.find((r) => r.loanIds.includes(l.id) && r.review);
  const price = rec?.review?.unitPrice ?? (settings.priceList.find((p) => p.commodityId === (rec?.review?.commodityId ?? settings.commodities[0]?.id))?.price);
  const when = new Date(Date.now() + ahead * 86_400_000);
  const cashQ = quoteOf(l, 'cash', when);
  const prodQ = quoteOf(l, 'produce', when, price);
  const blocked = debtCheck(orgId, l.farmerId);
  const due = refundDue(l);
  const fa = sl.farmer(l.farmerId);
  const series = useMemo(() => {
    const pts = new Map<string, number>();
    for (const r of lg.rows) pts.set(r.date, r.balance);
    return [...pts].map(([d, v]) => ({ label: f.date(d, 'd MMM yy'), balance: v }));
  }, [lg.rows, f]);
  const print = () => {
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(sl.farmerName(l.farmerId))}</title><style>body{font-family:system-ui,sans-serif;margin:32px;color:#0F2A20}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px;border-bottom:1px solid #e5e7eb;text-align:right}td:first-child,th:first-child,td:nth-child(2),th:nth-child(2){text-align:left}</style></head><body><h2>${esc(t('rec.ledgerOf', { name: sl.farmerName(l.farmerId) }))}</h2><table><tr>${['date', 'event', 'principal', 'interest', 'penalty', 'payment', 'balance'].map((k) => `<th>${esc(t(`rec.ledger.${k}`))}</th>`).join('')}</tr>${lg.rows.map((r) => `<tr><td>${esc(f.date(r.date))}</td><td>${esc(t(`rec.event.${r.event}`))}</td><td>${esc(money(r.principal))}</td><td>${esc(money(r.interest))}</td><td>${esc(money(r.penalty))}</td><td>${r.payment ? esc(money(r.payment)) : ''}</td><td>${esc(money(r.balance))}</td></tr>`).join('')}</table><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={sl.farmerName(l.farmerId)}
        subtitle={`${l.groupId ? `${sl.groupName(l.groupId)} · ` : ''}${l.typeId ? sl.typeName(l.typeId) : t('rec.direct')} · ${t('rec.dueOn', { date: f.date(l.window.end) })}`}
        badges={<><StatusBadge status={lg.overdue ? 'OVERDUE' : l.status} />{blocked.blocked && <Badge tone="danger">{t('rec.blocked')}</Badge>}</>}
        actions={
          <>
            {due > 0 && <PermissionGate permission="recovery.refund"><Button size="sm" onClick={() => setRefund('momo')}><Smartphone /> {t('rec.refundMomo', { amount: money(due) })}</Button></PermissionGate>}
            {due > 0 && <PermissionGate permission="recovery.refund"><Button size="sm" variant="secondary" onClick={() => setRefund('manual')}><Banknote /> {t('rec.refundManual')}</Button></PermissionGate>}
            <Button size="sm" variant="ghost" onClick={print}><Printer /> {t('rec.printLedger')}</Button>
          </>
        }
        tabs={[
          {
            key: 'ledger', label: t('rec.tabLedger'), content: (
              <div className="space-y-5">
                {blocked.blocked && <p className="rounded-ctl border border-danger/30 bg-danger/5 px-3 py-2 text-[14px] text-ink">{t('rec.blockedLine', { amount: money(blocked.balance) })}</p>}
                <Facts cols={3} items={[[t('rec.principal'), f.money(l.principal)], [t('rec.interest'), money(lg.interestCharged)], [t('rec.penalty'), money(lg.penaltyCharged)], [t('sup.repaid'), money(lg.repaid)], [t('rec.balance'), <span key="b" className="font-semibold">{money(lg.balance)}</span>], [t('rec.overpaid'), money(lg.overpaid)]]} />
                <Panel title={<span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-brand" />{t('rec.quoteTitle')}</span>}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div><div className="eyebrow">{t('rec.quoteCash')}</div><div className="tnum mt-1 text-[22px] font-semibold text-ink">{f.money(cashQ.amount)}</div>{cashQ.penaltyIncluded > 0 && <div className="text-[12px] text-warning">{t('rec.inclPenalty', { amount: money(cashQ.penaltyIncluded) })}</div>}</div>
                    <div><div className="eyebrow">{t('rec.quoteProduce')}</div><div className="tnum mt-1 text-[22px] font-semibold text-ink">{f.money(prodQ.amount)}</div>{prodQ.volumeKg != null && <div className="text-[12px] text-muted">{t('rec.volumeNeeded', { kg: f.kg(prodQ.volumeKg), price: price ? f.money(price) : '—' })}</div>}</div>
                    <div><div className="eyebrow">{t('rec.quoteDate')}</div><div className="mt-1 text-[14px] font-medium text-ink">{f.date(when)}</div>
                      <input type="range" min={0} max={365} step={5} value={ahead} onChange={(e) => setAhead(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--brand))]" aria-label={t('rec.whatIf')} />
                      <div className="text-[12px] text-muted">{ahead ? t('rec.inDays', { count: ahead }) : t('rec.today')}</div>
                    </div>
                  </div>
                </Panel>
                <Panel title={t('rec.balanceOverTime')}><Lines data={series} series={[{ key: 'balance', label: t('rec.balance'), index: 0 }]} format={money} axisFormat={(v) => f.money({ amountMinor: v, currency: c }, { compact: true })} /></Panel>
                <div className="overflow-x-auto rounded-ctl border border-line">
                  <table className="w-full min-w-[680px] text-[13px]">
                    <thead><tr className="border-b border-line bg-canvas text-right text-[12px] text-label">{['date', 'event', 'principal', 'interest', 'penalty', 'payment', 'balance'].map((k, i) => <th key={k} className={cn('px-3 py-2 font-semibold', i < 2 && 'text-left')}>{t(`rec.ledger.${k}`)}</th>)}</tr></thead>
                    <tbody>
                      {lg.rows.map((r, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 text-left text-ink">{f.date(r.date)}</td>
                          <td className="px-3 py-2 text-left"><span className={cn('font-medium', r.event === 'PENALTY' ? 'text-warning' : r.event === 'INTEREST' ? 'text-info' : r.event === 'REPAYMENT' ? 'text-success' : 'text-ink')}>{t(`rec.event.${r.event}`)}</span>{r.note && <span className="ml-1 text-muted">{`· ${t(`rec.note.${r.note}`, { defaultValue: r.note })}`}</span>}</td>
                          <td className="tnum px-3 py-2 text-right">{money(r.principal)}</td>
                          <td className="tnum px-3 py-2 text-right">{money(r.interest)}</td>
                          <td className="tnum px-3 py-2 text-right">{money(r.penalty)}</td>
                          <td className="tnum px-3 py-2 text-right text-success">{r.payment ? money(r.payment) : ''}</td>
                          <td className="tnum px-3 py-2 text-right font-medium text-ink">{money(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ),
          },
          { key: 'repayments', label: t('sup.repayments'), count: repayments.filter((x) => x.loanId === l.id).length, content: repayments.some((x) => x.loanId === l.id) ? <RepaymentList rows={repayments.filter((x) => x.loanId === l.id)} /> : <TabEmpty>{t('sup.noRepayments')}</TabEmpty> },
          {
            key: 'source', label: t('rec.source'), content: (
              <Facts items={[
                [terms.farmer, <Link key="f" to={`/app/farmers?open=${l.farmerId}`} className="text-brand hover:underline">{sl.farmerName(l.farmerId)}</Link>],
                [t('rec.supportRequest'), l.supportRequestId ? <Link key="s" to={`/app/support?open=${l.supportRequestId}`} className="text-brand hover:underline">{t('rec.openSupport')}</Link> : '—'],
                [t('rec.legacy'), l.legacyAllocationId ? <Link key="a" to={`/app/support/allocations?open=${l.legacyAllocationId}`} className="text-brand hover:underline">{t('rec.openAllocation')}</Link> : '—'],
                [t('rec.window'), `${f.date(l.window.start)} → ${f.date(l.window.end)}`], [t('rec.disbursed'), f.date(l.disbursedAt)], [t('rec.settledAt'), l.settledAt ? f.dateTime(l.settledAt) : '—'],
              ]} />
            ),
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="loan" entityId={l.id} /> },
        ]}
      />
      {refund === 'momo' && fa && <PayDialog request={{ type: 'FARMER_REFUND', payableId: l.id, title: t('rec.refundTitle', { name: sl.farmerName(l.farmerId) }), payees: [{ name: `${fa.firstName} ${fa.lastName}`.toUpperCase(), number: fa.phone, amount: { amountMinor: due, currency: c }, label: terms.farmer }] }} onClose={() => setRefund(null)} />}
      {refund === 'manual' && <AmountDialog open onClose={() => setRefund(null)} title={t('rec.refundTitle', { name: sl.farmerName(l.farmerId) })} description={t('rec.refundHint')} initialMinor={due} maxMinor={due} currency={c} proof confirm={t('rec.markRefunded')}
        onConfirm={(v) => { refundOverpaymentManual(l.id, v.proof ?? '', userId ?? 'system'); setRefund(null); toast.success(t('rec.toast.refunded')); }} />}
    </>
  );
}

// ---------------------------------------------------------------- Repayments

function RepaymentList({ rows }: { rows: Repayment[] }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const sl = useSupportLookups();
  return (
    <ul className="divide-y divide-line rounded-ctl border border-line">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink">{sl.farmerName(r.farmerId)} · {t(`rec.modeName.${r.mode}`)}</div>
            <div className="text-[12px] text-muted">{[f.date(r.date), r.kg ? `${f.kg(r.kg)}${r.bagCode ? ` · ${r.bagCode}` : ''}` : '', r.cash ? t('rec.cashPart', { amount: f.money(r.cash) }) : '', r.excess ? t('rec.excessLine', { kg: f.kg(r.excess.kg), amount: f.money(r.excess.amount) }) : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <span className="tnum font-medium text-ink">{f.money({ amountMinor: (r.cash?.amountMinor ?? 0) + (r.produceValue?.amountMinor ?? 0), currency: (r.cash ?? r.produceValue)?.currency ?? f.org.currency })}</span>
          {r.receipt.status !== 'NA' && <StatusBadge status={`RECEIPT_${r.receipt.status}`} />}
          {r.receipt.status === 'PENDING' && <PermissionGate permission="recovery.confirmCash"><Button size="xs" onClick={() => { confirmCash(r.id, userId ?? 'system'); toast.success(t('rec.toast.cashConfirmed')); }}><Check /> {t('rec.confirmCash')}</Button></PermissionGate>}
          {r.excess?.purchaseId && <Link to={`/app/purchases?open=${r.excess.purchaseId}`} className="text-link inline-flex items-center gap-1 text-[13px]"><ShoppingBasket className="h-3.5 w-3.5" />{t('rec.openPurchase')}</Link>}
        </li>
      ))}
    </ul>
  );
}

function RepaymentsTab() {
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSupportLookups();
  const rows = useOrgRows(useSupportStore((s) => s.repayments));
  const [view, setView] = useState<'all' | 'toConfirm' | 'confirmed' | 'excess'>('all');
  const [q, setQ] = useState('');
  const inView = (r: Repayment, v: typeof view) => v === 'all' || (v === 'toConfirm' ? r.receipt.status === 'PENDING' : v === 'confirmed' ? r.receipt.status === 'CONFIRMED' : !!r.excess);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => inView(r, view) && (!query || sl.farmerName(r.farmerId).toLowerCase().includes(query) || (r.bagCode ?? '').toLowerCase().includes(query))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<Repayment, unknown>[]>(() => [
    { id: 'date', header: t('col.date'), accessorKey: 'date', cell: (c) => f.date(c.getValue() as string) },
    { id: 'farmer', header: terms.farmer, accessorFn: (r) => sl.farmerName(r.farmerId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'agent', header: terms.agent, accessorFn: (r) => lk.agent(r.agentId) },
    { id: 'mode', header: t('rec.mode'), accessorKey: 'mode', cell: (c) => t(`rec.modeName.${c.getValue() as string}`) },
    { id: 'kg', header: t('rec.weightBag'), accessorFn: (r) => r.kg ?? 0, cell: (c) => (c.row.original.kg ? `${f.kg(c.row.original.kg)}${c.row.original.bagCode ? ` · ${c.row.original.bagCode}` : ''}` : '—') },
    { id: 'cash', header: t('rec.cash'), accessorFn: (r) => r.cash?.amountMinor ?? 0, cell: (c) => (c.row.original.cash ? f.money(c.row.original.cash) : '—') },
    { id: 'value', header: t('rec.value'), accessorFn: (r) => (r.cash?.amountMinor ?? 0) + (r.produceValue?.amountMinor ?? 0), cell: (c) => f.money({ amountMinor: c.getValue() as number, currency: f.org.currency }) },
    { id: 'excess', header: t('rec.excess'), accessorFn: (r) => r.excess?.kg ?? 0, cell: (c) => (c.row.original.excess ? `${f.kg(c.row.original.excess.kg)} · ${f.money(c.row.original.excess.amount)}` : '—') },
    { id: 'receipt', header: t('rec.receipt'), accessorFn: (r) => r.receipt.status, cell: (c) => <StatusBadge status={`RECEIPT_${c.getValue() as string}`} /> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  ], [t, f, lk, sl, terms]);
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('rec.searchRepayments')}
        views={(['all', 'toConfirm', 'confirmed', 'excess'] as const).map((v) => ({ key: v, label: t(`rec.repView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((r) => inView(r, v)).length }))}
        onClear={() => { setQ(''); setView('all'); }} />
      {view === 'toConfirm' ? (shown.length ? <RepaymentList rows={shown} /> : <TabEmpty>{t('rec.nothingToConfirm')}</TabEmpty>) : (
        <DataTable columns={columns} data={shown} getRowId={(r) => r.id} columnPicker
          exportCsv={{ fileName: 'repayments.csv', columns: [
            { header: t('col.date'), value: (r) => r.date }, { header: terms.farmer, value: (r) => sl.farmerName(r.farmerId) }, { header: t('rec.mode'), value: (r) => r.mode }, { header: t('buy.weightKg'), value: (r) => r.kg ?? 0 },
            { header: t('rec.cashIn', { currency: f.org.currency }), value: (r) => r.cash?.amountMinor ?? 0 }, { header: t('rec.valueIn', { currency: f.org.currency }), value: (r) => (r.cash?.amountMinor ?? 0) + (r.produceValue?.amountMinor ?? 0) }, { header: t('rec.receipt'), value: (r) => r.receipt.status },
          ] }}
          empty={t('sup.noRepayments')} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Dashboard

function RecoveryDashboard() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const sl = useSupportLookups();
  const settings = useOrgSettings();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const loans = useOrgRows(useLoanStore((s) => s.loans));
  const repayments = useOrgRows(useSupportStore((s) => s.repayments));
  const [by, setBy] = useState<'district' | 'agent' | 'group'>('district');
  const data = useMemo(() => loans.map((l) => ({ l, lg: ledgerOf(l) })), [loans]);
  const expected = data.reduce((s, x) => s + x.lg.balance + x.lg.repaid, 0);
  const recovered = data.reduce((s, x) => s + x.lg.repaid, 0);
  const kg = repayments.reduce((s, r) => s + (r.kg ?? 0), 0);
  const price = settings.priceList[0]?.price.amountMinor ?? 1;
  const interest = data.reduce((s, x) => s + x.lg.interestCharged, 0);
  const penalty = data.reduce((s, x) => s + x.lg.penaltyCharged, 0);
  const level = settings.locationLevels[1]?.id ?? settings.locationLevels[0]?.id ?? '';
  const key = (l: LoanAccount) => {
    const g = l.groupId ? sl.group(l.groupId) : undefined;
    const farmer = sl.farmer(l.farmerId);
    const communityId = g?.communityId ?? farmer?.communityId;
    if (by === 'group') return g?.name ?? '—';
    const c = lk.communities.find((x) => x.id === communityId);
    if (by === 'agent') return lk.agent(c?.agentIds[0]);
    return c ? ancestorAtLevel(nodes, c.locationNodeId, level)?.name ?? '—' : '—';
  };
  const rate = [...data.reduce((m, x) => { const k = key(x.l); const cur = m.get(k) ?? { e: 0, r: 0 }; m.set(k, { e: cur.e + x.lg.balance + x.lg.repaid, r: cur.r + x.lg.repaid }); return m; }, new Map<string, { e: number; r: number }>())]
    .map(([label, v]) => ({ label, value: v.e ? Math.round((v.r / v.e) * 100) : 0 })).sort((a, b) => b.value - a.value).slice(0, 8);
  const now = Date.now();
  const ageing = [['0–30', 0, 30], ['31–60', 31, 60], ['61–90', 61, 90], ['90+', 91, 1e6]].map(([label, from, to]) => ({
    label: label as string, amount: data.filter((x) => x.lg.overdue).filter((x) => { const d = Math.floor((now - new Date(x.l.window.end).getTime()) / 86_400_000); return d >= (from as number) && d <= (to as number); }).reduce((s, x) => s + x.lg.balance, 0),
  }));
  const money = (v: number) => f.money({ amountMinor: v, currency: f.org.currency }, { compact: true });
  const kpi = (label: string, value: string, hint?: string) => <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><div className="eyebrow">{label}</div><div className="tnum mt-2 text-[24px] font-semibold leading-none text-ink">{value}</div>{hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpi(t('rec.kpi.expected'), money(expected), t('rec.kpi.expectedKg', { kg: f.kg(Math.round(expected / price)) }))}
        {kpi(t('rec.kpi.recovered'), money(recovered), t('rec.kpi.recoveredKg', { kg: f.kg(Math.round(kg)) }))}
        {kpi(t('rec.kpi.rate'), `${expected ? Math.round((recovered / expected) * 100) : 0}%`)}
        {kpi(t('rec.kpi.earned'), money(interest + penalty), t('rec.kpi.earnedSplit', { interest: money(interest), penalty: money(penalty) }))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('rec.chart.rate')} actions={<select value={by} onChange={(e) => setBy(e.target.value as typeof by)} aria-label={t('rec.chart.by')} className="h-8 rounded-ctl border border-line bg-surface px-2 text-[13px]">{(['district', 'agent', 'group'] as const).map((k) => <option key={k} value={k}>{t(`rec.by.${k}`)}</option>)}</select>}>
          {rate.length ? <HBars data={rate} format={(v) => `${v}%`} /> : <TabEmpty>{t('sup.noData')}</TabEmpty>}
        </Panel>
        <Panel title={t('rec.chart.ageing')}>
          <StackedColumns data={ageing} series={[{ key: 'amount', label: t('rec.balance'), index: 3 }]} format={money} axisFormat={money} />
        </Panel>
        <Panel title={t('rec.chart.expectedRecovered')} className="lg:col-span-2">
          <HBars data={[{ label: t('rec.kpi.expected'), value: expected }, { label: t('rec.kpi.recovered'), value: recovered }, { label: t('rec.interest'), value: interest }, { label: t('rec.penalty'), value: penalty }]} format={money} />
        </Panel>
      </div>
      <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => { const csv = [[t('rec.chart.by'), t('rec.kpi.rate')], ...rate.map((r) => [r.label, `${r.value}%`])].map((x) => x.join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'recovery-rates.csv'; a.click(); }}><Pencil className="hidden" />{t('rec.exportRates')}</Button></div>
    </div>
  );
}
