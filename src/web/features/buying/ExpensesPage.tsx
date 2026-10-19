import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, Pencil, Plus, Printer, ScanLine, Smartphone, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import type { PreExpense } from '@/types';
import { pendingSteps, type WorkflowRecord } from '@/engines/workflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { Checkbox, Field } from '@/components/shared/Field';
import { canEditPre, createPre, payPreManual, preLineCap, updatePre } from '@/services/buyingService';
import { inFlight } from '@/services/paymentService';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { AmountDialog, ApprovalTimeline, PaymentState, WorkflowButtons, mono, usePrintReceipt, useWorkflowDef } from './common';

type View = 'all' | 'pending' | 'approved' | 'toPay' | 'rejected';

/** PRE expenses (PRD D3): logistics costs per bag, approved level by level, paid by mobile money or manually. */
export function ExpensesPage() {
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const def = useWorkflowDef('preExpense');
  const expenses = useOrgRows(useBuyingStore((s) => s.expenses));
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [agent, setAgent] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<PreExpense | 'new' | null>(null);
  useDemoNotes([{ id: 'pre', key: 'demo.note.expenses' }]);
  const reqNumber = useMemo(() => new Map(requests.map((r) => [r.id, r.number])), [requests]);
  const typeName = (id: string) => settings.expenseTypes.find((x) => x.id === id)?.name ?? id;
  const inView = (e: PreExpense, v: View) => v === 'all' || (v === 'pending' ? !['APPROVED', 'REJECTED'].includes(e.status) : v === 'approved' ? e.status === 'APPROVED' : v === 'toPay' ? e.status === 'APPROVED' && e.paymentStatus !== 'PAID' : v === 'rejected' ? e.status === 'REJECTED' : true);
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => expenses.filter((e) => inView(e, view) && (!agent || e.agentId === agent) && (!type || e.lines.some((l) => l.expenseTypeId === type)) && (!query || e.number.toLowerCase().includes(query) || (reqNumber.get(e.requestId) ?? '').toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
   
  [expenses, view, agent, type, query, reqNumber]);

  const columns = useMemo<ColumnDef<PreExpense, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'request', header: terms.purchaseRequest, accessorFn: (e) => reqNumber.get(e.requestId) ?? '—', cell: (c) => mono(c.getValue() as string) },
    { id: 'agent', header: terms.agent, accessorFn: (e) => lk.agent(e.agentId) },
    { id: 'type', header: t('buy.expenseType'), accessorFn: (e) => e.lines.map((l) => typeName(l.expenseTypeId)).join(', '), cell: (c) => <span className="block max-w-[220px] truncate">{c.getValue() as string}</span> },
    { id: 'perBag', header: t('buy.costPerBag'), accessorFn: (e) => (e.bags ? e.total.amountMinor / e.bags : 0), cell: (c) => f.money({ amountMinor: Math.round(c.getValue() as number), currency: c.row.original.total.currency }) },
    { id: 'bags', header: t('col.bags'), accessorKey: 'bags' },
    { id: 'total', header: t('col.total'), accessorFn: (e) => e.total.amountMinor, cell: (c) => <span className="font-medium text-ink">{f.money(c.row.original.total)}</span> },
    { id: 'payee', header: t('col.payee'), accessorFn: (e) => e.payee.name },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: 'level', header: t('buy.currentLevel'), accessorFn: (e) => (def ? pendingSteps(def, e as unknown as WorkflowRecord)[0]?.name : undefined) ?? '—' },
    { id: 'payment', header: t('buy.paymentStatus'), accessorKey: 'paymentStatus', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, lk, terms, reqNumber, def, settings.expenseTypes]);

  const current = expenses.find((e) => e.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.buying')} title={terms.pres} description={t('pages.expenses')} primary={<PermissionGate permission="expenses.create"><Button onClick={() => setEditing('new')}><Plus /> {t('buy.newPre', { pre: terms.pre })}</Button></PermissionGate>} />
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('buy.searchPre')}
        views={(['all', 'pending', 'approved', 'toPay', 'rejected'] as const).map((v) => ({ key: v, label: t(`buy.preView.${v}`), active: view === v, onSelect: () => setView(v), count: expenses.filter((e) => inView(e, v)).length }))}
        filters={[
          { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => expenses.some((e) => e.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })).sort((a, b) => a.label.localeCompare(b.label)) },
          { key: 'type', label: t('buy.expenseType'), value: type, onChange: setType, options: settings.expenseTypes.map((x) => ({ value: x.id, label: x.name })) },
        ]}
        onClear={() => { setQ(''); setAgent(''); setType(''); setView('all'); }}
      />
      <DataTable
        columns={columns}
        data={shown}
        onRowClick={(e) => open(e.id)}
        activeId={openId}
        getRowId={(e) => e.id}
        columnPicker
        initialHidden={['payee']}
        exportCsv={{ fileName: 'pre-expenses.csv', columns: [
          { header: t('col.number'), value: (e) => e.number }, { header: terms.purchaseRequest, value: (e) => reqNumber.get(e.requestId) ?? '' }, { header: terms.agent, value: (e) => lk.agent(e.agentId) },
          { header: t('col.bags'), value: (e) => e.bags }, { header: t('col.total'), value: (e) => e.total.amountMinor / 100 }, { header: t('col.status'), value: (e) => e.status }, { header: t('buy.paymentStatus'), value: (e) => e.paymentStatus },
        ] }}
        empty={t('buy.emptyPre')}
      />
      {current && def && <PreDrawer key={current.id} pre={current} onClose={close} onEdit={() => setEditing(current)} />}
      {editing && <PreSheet pre={editing === 'new' ? undefined : editing} onClose={(id) => { setEditing(null); if (id) open(id); }} />}
    </>
  );
}

function PreDrawer({ pre: e, onClose, onEdit }: { pre: PreExpense; onClose: () => void; onEdit: () => void }) {
  const { userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const def = useWorkflowDef('preExpense')!;
  const requests = useBuyingStore((s) => s.requests);
  const payments = usePaymentStore((s) => s.payments);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const req = requests.find((r) => r.id === e.requestId);
  const attempts = payments.filter((p) => p.payableId === e.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [manual, setManual] = useState(false);
  const [paying, setPaying] = useState(false);
  const busy = inFlight(e.id) && attempts.some((p) => ['AWAITING_CHECKER', 'PENDING', 'PROCESSING'].includes(p.status));
  const print = usePrintReceipt();
  const typeName = (id: string) => settings.expenseTypes.find((x) => x.id === id)?.name ?? id;
  const payable = e.status === 'APPROVED' && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'PENDING';
  const rows: [string, string][] = [
    [terms.purchaseRequest, req?.number ?? '—'], [terms.agent, lk.agent(e.agentId)], [t('col.bags'), f.number(e.bags)],
    ...e.lines.map((l) => [`${typeName(l.expenseTypeId)} (${f.number(l.quantity)} × ${f.money(l.rate)})`, f.money(l.amount)] as [string, string]),
    [t('col.total'), f.money(e.total)], [t('col.payee'), `${e.payee.name} · ${e.payee.number}`],
  ];
  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={<span className="font-mono">{e.number}</span>}
        subtitle={`${lk.agent(e.agentId)} · ${req?.number ?? ''} · ${t('buy.bagsN', { count: e.bags })}`}
        badges={<><StatusBadge status={e.status} /><StatusBadge status={e.paymentStatus} />{e.costDiscussed && <Badge tone="neutral">{t('buy.costDiscussed')}</Badge>}</>}
        actions={
          <>
            <PaymentState payableId={e.id} />
            <WorkflowButtons docType="preExpense" record={e as unknown as WorkflowRecord & { number: string }} def={def} />
            {canEditPre(e) && <PermissionGate permission="expenses.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('people.edit')}</Button></PermissionGate>}
            {payable && <PermissionGate permission="expenses.disburse"><Button size="sm" disabled={busy} onClick={() => setPaying(true)}><Smartphone /> {t('buy.payMomo')}</Button></PermissionGate>}
            {payable && <PermissionGate permission="expenses.disburse"><Button size="sm" variant="secondary" disabled={busy} onClick={() => setManual(true)}><Banknote /> {t('buy.manualDisbursement')}</Button></PermissionGate>}
            <Button size="sm" variant="ghost" onClick={() => print(terms.pre, e.number, rows)}><Printer /> {t('buy.printReceipt')}</Button>
          </>
        }
        tabs={[
          {
            key: 'summary', label: t('buy.tab.summary'), content: (
              <div className="space-y-4">
                <table className="w-full text-[14px]">
                  <thead><tr className="border-b border-line text-left text-[12px] text-label"><th className="py-2 font-semibold">{t('buy.expenseType')}</th><th className="py-2 text-right font-semibold">{t('col.quantity')}</th><th className="py-2 text-right font-semibold">{t('buy.rate')}</th><th className="py-2 text-right font-semibold">{t('col.amount')}</th></tr></thead>
                  <tbody>
                    {e.lines.map((l, i) => {
                      const cap = preLineCap(settings, l.expenseTypeId);
                      return <tr key={i} className="border-b border-line"><td className="py-2 text-ink">{typeName(l.expenseTypeId)}{cap != null && l.amount.amountMinor >= cap && <Badge tone="warning" className="ml-2">{t('buy.capped')}</Badge>}</td><td className="tnum py-2 text-right">{f.number(l.quantity)}</td><td className="tnum py-2 text-right">{f.money(l.rate)}</td><td className="tnum py-2 text-right font-medium text-ink">{f.money(l.amount)}</td></tr>;
                    })}
                    <tr><td className="py-2 font-semibold text-ink" colSpan={3}>{t('col.total')}</td><td className="tnum py-2 text-right font-semibold text-ink">{f.money(e.total)}</td></tr>
                  </tbody>
                </table>
                <Facts items={[[t('buy.costPerBag'), f.money({ amountMinor: Math.round(e.total.amountMinor / Math.max(1, e.bags)), currency: e.total.currency })], [t('col.payee'), `${e.payee.name} · ${e.payee.number}`], [terms.purchaseRequest, req ? <Link key="r" to={`/app/purchase-requests?open=${req.id}`} className="font-mono text-brand hover:underline">{req.number}</Link> : '—'], [t('buy.created'), f.dateTime(e.createdAt)]]} />
                {!!e.bagCodes?.length && <div><div className="eyebrow mb-1.5">{t('buy.scannedBags')}</div><div className="flex flex-wrap gap-1.5">{e.bagCodes.map((c) => <Badge key={c} tone="neutral" className="font-mono">{c}</Badge>)}</div></div>}
                {e.expectedDelivery && <p className="flex items-center gap-2 rounded-ctl border border-info/30 bg-info/5 px-3 py-2 text-[14px] text-ink"><Truck className="h-4 w-4 text-info" />{t('buy.expectedDelivery', { count: e.expectedDelivery.bags, warehouse: warehouses.find((w) => w.id === e.expectedDelivery!.warehouseId)?.name ?? '—' })}</p>}
                {!canEditPre(e) && e.status !== 'APPROVED' && <p className="text-[12px] text-muted">{t('buy.preLocked')}</p>}
              </div>
            ),
          },
          { key: 'approvals', label: t('buy.tab.approvals'), content: <ApprovalTimeline record={e as unknown as WorkflowRecord} def={def} /> },
          {
            key: 'payment', label: t('buy.tab.payment'), count: attempts.length, content: (
              <div className="space-y-3">
                {e.disbursement && <p className="text-[14px] text-ink">{t('buy.prePaidLine', { method: t(`buy.method.${e.disbursement.method}`), name: lk.user(e.disbursement.by), date: f.dateTime(e.disbursement.at) })}{e.disbursement.proof ? ` · ${e.disbursement.proof}` : ''}</p>}
                {attempts.length ? (
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {attempts.map((p) => <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"><span className="font-mono text-ink">{p.reference}</span><StatusBadge status={p.status} /><span className="min-w-0 flex-1 truncate text-muted">{p.failureReason ?? ''}</span><span className="tnum text-ink">{f.money(p.amount)}</span><span className="text-muted">{f.dateTime(p.createdAt)}</span></li>)}
                  </ul>
                ) : !e.disbursement && <TabEmpty>{t('buy.noAttempts')}</TabEmpty>}
              </div>
            ),
          },
          { key: 'activity', label: t('buy.tab.activity'), content: <ActivityFeed entity="preExpense" entityId={e.id} /> },
        ]}
      />
      {paying && <PayDialog request={{ type: 'PRE_EXPENSE', payableId: e.id, title: t('pay.titlePre', { number: e.number }), payees: [{ name: e.payee.name, number: e.payee.number, providerId: e.payee.providerId, amount: e.total, label: lk.agent(e.agentId) }] }} onClose={() => setPaying(false)} />}
      {manual && (
        <AmountDialog open onClose={() => setManual(false)} title={t('buy.manualTitle', { number: e.number })} description={t('buy.manualHint')} initialMinor={e.total.amountMinor} maxMinor={e.total.amountMinor} currency={e.total.currency} proof confirm={t('buy.markDisbursed')}
          onConfirm={(v) => { payPreManual(e.id, v.proof ?? '', userId ?? 'system'); setManual(false); toast.success(t('buy.toast.prePaidManual', { number: e.number })); }} />
      )}
    </>
  );
}

/** Create or edit a PRE (PRD D3): request, bags, lines from the company catalogue with caps, bag scan. */
function PreSheet({ pre, onClose }: { pre?: PreExpense; onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const allBags = useBuyingStore((s) => s.bags);
  const purchases = useBuyingStore((s) => s.purchases);
  const eligible = useMemo(() => requests.filter((r) => ['FULL_DISBURSEMENT', 'FUNDS_RECEIVED', 'TICKET_ACTIVATED', 'RECONCILED'].includes(r.status) && !r.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [requests]);
  const [requestId, setRequestId] = useState(pre?.requestId ?? eligible[0]?.id ?? '');
  const req = requests.find((r) => r.id === requestId);
  const reqBags = useMemo(() => {
    const ids = new Set(purchases.filter((p) => p.requestId === requestId).map((p) => p.id));
    return allBags.filter((b) => b.purchaseIds.some((id) => ids.has(id)) && b.status !== 'REPLACED');
  }, [allBags, purchases, requestId]);
  const [bags, setBags] = useState(String(pre?.bags ?? Math.max(1, reqBags.length)));
  const [discussed, setDiscussed] = useState(pre?.costDiscussed ?? true);
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const [lines, setLines] = useState<{ expenseTypeId: string; quantity: string; rate: string }[]>(() =>
    pre ? pre.lines.map((l) => ({ expenseTypeId: l.expenseTypeId, quantity: String(l.quantity), rate: String(l.rate.amountMinor / 10 ** dec) })) : [],
  );
  const [codes, setCodes] = useState<string[]>(pre?.bagCodes ?? []);
  const n = Number(bags || 0);
  const qtyFor = (id: string) => { const x = settings.expenseTypes.find((e) => e.id === id); return x?.basis === 'PER_BAG' ? n : x?.basis === 'PER_KG' ? Math.round(n * 85) : 1; };
  const add = (id: string) => { const x = settings.expenseTypes.find((e) => e.id === id)!; setLines([...lines, { expenseTypeId: id, quantity: String(qtyFor(id)), rate: String(x.defaultRate.amountMinor / 10 ** dec) }]); };
  const computed = lines.map((l) => {
    const rateMinor = Math.round(Number(l.rate || 0) * 10 ** dec);
    const raw = rateMinor * Number(l.quantity || 0);
    const cap = preLineCap(settings, l.expenseTypeId);
    return { ...l, rateMinor, amount: cap != null ? Math.min(cap, raw) : raw, capped: cap != null && raw > cap };
  });
  const total = computed.reduce((s, l) => s + l.amount, 0);
  const needScan = lines.some((l) => settings.expenseTypes.find((x) => x.id === l.expenseTypeId)?.requiresBagScan);
  const agent = lk.agents.find((a) => a.id === req?.agentId);
  const invalid = !req || !(n > 0) || !lines.length || computed.some((l) => !(Number(l.quantity) > 0) || !(l.rateMinor > 0)) || (needScan && codes.length === 0);
  const save = () => {
    if (invalid || !req) return;
    const payload = { bags: n, costDiscussed: discussed, lines: computed.map((l) => ({ expenseTypeId: l.expenseTypeId, quantity: Number(l.quantity), rateMinor: l.rateMinor })), bagCodes: needScan ? codes : undefined };
    if (pre) {
      if (updatePre(pre.id, payload, userId ?? 'system')) toast.success(t('buy.toast.preSaved', { number: pre.number }));
      else toast.error(t('buy.preLocked'));
      onClose(pre.id);
    } else {
      const e = createPre({ orgId, requestId, ...payload, actorId: userId ?? 'system' });
      toast.success(t('buy.toast.preCreated', { number: e.number }), { description: t('dashboard.actedStatus', { status: t(`status.${e.status}`, { defaultValue: e.status }) }) });
      onClose(e.id);
    }
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{pre ? t('buy.editPre', { number: pre.number }) : t('buy.newPre', { pre: terms.pre })}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={terms.purchaseRequest}>
              <select value={requestId} disabled={!!pre} onChange={(e) => { setRequestId(e.target.value); setCodes([]); }} aria-label={terms.purchaseRequest} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
                {eligible.map((r) => <option key={r.id} value={r.id}>{`${r.number} · ${lk.agent(r.agentId)} · ${lk.community(r.communityId)}`}</option>)}
              </select>
            </Field>
            <Field label={t('buy.numberOfBags')}><Input compact type="number" min={1} value={bags} onChange={(e) => { setBags(e.target.value); setLines(lines.map((l) => ({ ...l, quantity: String(((x) => (x?.basis === 'PER_BAG' ? Number(e.target.value || 0) : x?.basis === 'PER_KG' ? Math.round(Number(e.target.value || 0) * 85) : Number(l.quantity)))(settings.expenseTypes.find((x) => x.id === l.expenseTypeId))) }))); }} aria-label={t('buy.numberOfBags')} /></Field>
          </div>
          <Checkbox label={t('buy.costDiscussedLabel')} checked={discussed} onChange={(e) => setDiscussed(e.target.checked)} />
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-ink">{t('buy.expenseLines')}</h3>
              <select value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label={t('buy.addLine')} className="h-10 rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
                <option value="">{t('buy.addLine')}</option>
                {settings.expenseTypes.map((x) => <option key={x.id} value={x.id}>{`${x.name} · ${t(`buy.basis.${x.basis}`)}`}</option>)}
              </select>
            </div>
            {computed.length ? (
              <ul className="space-y-2">
                {computed.map((l, i) => {
                  const x = settings.expenseTypes.find((e) => e.id === l.expenseTypeId)!;
                  return (
                    <li key={i} className="rounded-ctl border border-line p-3">
                      <div className="flex items-center justify-between gap-2"><span className="text-[14px] font-medium text-ink">{x.name}</span><span className="flex items-center gap-2"><span className="text-[12px] text-muted">{t(`buy.basis.${x.basis}`)}</span><Button variant="ghost" size="iconSm" aria-label={t('set.remove')} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button></span></div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Input compact type="number" value={l.quantity} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, quantity: e.target.value } : y)))} aria-label={`${x.name} ${t('col.quantity')}`} />
                        <Input compact type="number" value={l.rate} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, rate: e.target.value } : y)))} aria-label={`${x.name} ${t('buy.rate')}`} />
                        <div className={cn('flex h-11 items-center justify-end rounded-ctl bg-canvas px-3 tnum text-[14px] font-medium', l.capped ? 'text-warning' : 'text-ink')}>{f.money({ amountMinor: l.amount, currency: f.org.currency })}</div>
                      </div>
                      {l.capped && x.cap && <p className="mt-1 text-[12px] text-warning">{t('buy.capHint', { cap: f.money(x.cap) })}</p>}
                      {x.requiresWallet && agent && <p className="mt-1 text-[12px] text-muted">{t('buy.payeeIs', { name: agent.wallet.verifiedName, number: agent.wallet.number })}</p>}
                    </li>
                  );
                })}
              </ul>
            ) : <TabEmpty>{t('buy.noLines')}</TabEmpty>}
          </div>
          {needScan && (
            <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-ink">{t('buy.scanBags')}</h3><Button size="xs" variant="secondary" onClick={() => setCodes(reqBags.slice(0, n).map((b) => b.code))}><ScanLine /> {t('buy.scanAll')}</Button></div>
              {reqBags.length ? (
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-ctl border border-line p-3">
                  {reqBags.map((b) => {
                    const on = codes.includes(b.code);
                    return <button key={b.id} type="button" aria-pressed={on} onClick={() => setCodes(on ? codes.filter((c) => c !== b.code) : [...codes, b.code])} className={cn('rounded-full border px-2.5 py-1 font-mono text-[12px]', on ? 'border-brand bg-brand text-white' : 'border-line text-body hover:border-brand/40')}>{b.code}</button>;
                  })}
                </div>
              ) : <p className="text-[13px] text-muted">{t('buy.noBagsToScan')}</p>}
              <p className="mt-1 text-[12px] text-muted">{t('buy.scanned', { count: codes.length, total: n })}</p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-ctl bg-canvas px-4 py-3 text-[14px]"><span className="text-muted">{t('col.total')}</span><span className="tnum text-[20px] font-semibold text-ink">{f.money({ amountMinor: total, currency: f.org.currency })}</span></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={invalid} onClick={save}>{pre ? t('common.save') : t('buy.submit')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
