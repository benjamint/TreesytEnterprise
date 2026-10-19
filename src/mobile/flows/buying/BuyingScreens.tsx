import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Check, Mic, Pause, Plus, ShoppingBasket, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Purchase, PurchaseRequest, SourcingModel } from '@/types';
import { canAct, getAllowedActions, type WorkflowAction, type WorkflowRecord } from '@/engines/workflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SignaturePad } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSelect, MobileWizard, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { confirmRate, listPriceFor } from '@/services/buyingService';
import { saveOrQueue } from '@/services/mobileSync';
import { pay } from '@/services/paymentService';
import { act, workflowUser } from '@/services/workflowService';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useActor, useCan, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ApprovalTimeline } from '@/web/features/buying/common';

type Tab = 'requests' | 'purchases' | 'pre';
const ACTIVE = ['FUNDS_RECEIVED', 'TICKET_ACTIVATED'];

/** Pays direct-payment purchases by mobile money: one payment, or a bulk payment for several (PRD M5). */
export function payPurchases(orgId: string, actorId: string, requestId: string, list: Purchase[]) {
  const farmers = useFarmerStore.getState().farmers;
  return pay({
    orgId, type: list.length > 1 ? 'BULK_FARMER_PURCHASE' : 'FARMER_PURCHASE', payableId: list.length > 1 ? requestId : list[0]!.id, actorId,
    payees: list.map((p) => { const fa = farmers.find((x) => x.id === p.farmerId); return { name: p.wallet?.name ?? `${fa?.firstName ?? ''} ${fa?.lastName ?? ''}`.toUpperCase(), number: p.wallet?.number ?? fa?.phone ?? '', providerId: p.wallet?.providerId, amount: p.paidToFarmer, payableId: p.id }; }),
  });
}

export function useMyRequests() {
  const { agent } = useMobileAgent();
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  return useMemo(() => requests.filter((r) => r.agentId === agent?.id && !r.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [requests, agent?.id]);
}

/** M5 Buying: requests, purchases and PREs for this agent, with the actions to start each flow. */
export function BuyingScreen() {
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const { agent } = useMobileAgent();
  const [tab, setTab] = useState<Tab>('requests');
  const requests = useMyRequests();
  const allPurchases = useBuyingStore((s) => s.purchases);
  const allExpenses = useBuyingStore((s) => s.expenses);
  const farmers = useFarmerStore((s) => s.farmers);
  const communities = useCommunityStore((s) => s.communities);
  const purchases = useMemo(() => allPurchases.filter((p) => p.agentId === agent?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [allPurchases, agent?.id]);
  const expenses = useMemo(() => allExpenses.filter((e) => e.agentId === agent?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [allExpenses, agent?.id]);
  const name = (id: string) => { const x = farmers.find((y) => y.id === id); return x ? `${x.firstName} ${x.lastName}` : '—'; };
  const [paying, setPaying] = useState<string | null>(null);
  // Related unpaid direct-payment purchases, per request (PRD M5 prompt for bulk payment).
  const unpaid = useMemo(() => {
    const m = new Map<string, typeof purchases>();
    for (const p of purchases.filter((x) => x.paymentStatus === 'NOT_PAID' || x.paymentStatus === 'FAILED')) {
      const r = requests.find((x) => x.id === p.requestId);
      if (r?.sourcingModel !== 'DIRECT_PAYMENT') continue;
      m.set(p.requestId, [...(m.get(p.requestId) ?? []), p]);
    }
    return [...m];
  }, [purchases, requests]);

  const payAll = async (requestId: string, list: typeof purchases) => {
    setPaying(requestId);
    const out = await payPurchases(orgId, userId ?? 'system', requestId, list);
    setPaying(null);
    const ok = out.filter((p) => p.status === 'SUCCESSFUL').length;
    toast[ok === out.length ? 'success' : 'warning'](t('mobile.m5.paidAll', { ok, total: out.length }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.tile.buying')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => navigate('/m/buying/purchase')}><ShoppingBasket /> {t('mobile.m5.record')}</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/buying/voice')}><Mic /> {t('mobile.m5.voice')}</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/buying/requests/new')}><Plus /> {t('mobile.m5.newRequest')}</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/buying/pre/new')}><Truck /> {t('mobile.m5.newPre', { pre: terms.pre })}</Button>
        </div>
        {unpaid.map(([rid, list]) => (
          <div key={rid} className="rounded-card border border-warning/40 bg-warning/5 p-4">
            <p className="text-[14px] text-ink">{t('mobile.m5.unpaidPrompt', { count: list.length, number: requests.find((r) => r.id === rid)?.number ?? '', amount: f.money({ amountMinor: list.reduce((s, p) => s + p.paidToFarmer.amountMinor, 0), currency: f.org.currency }) })}</p>
            <Button size="lg" className="mt-3 w-full" disabled={!online || paying === rid} onClick={() => void payAll(rid, list)}><Banknote /> {paying === rid ? t('status.PROCESSING') : online ? t('mobile.m5.payAll', { count: list.length }) : t('mobile.m5.payOnline')}</Button>
          </div>
        ))}
        <Segmented value={tab} onChange={setTab} label={t('mobile.tile.buying')} options={[{ value: 'requests', label: terms.purchaseRequests }, { value: 'purchases', label: t('mobile.m5.purchases') }, { value: 'pre', label: terms.pres }]} />
        {tab === 'requests' && (requests.length ? (
          <MList>
            {requests.map((r) => <li key={r.id}><ListRow title={r.number} subtitle={`${communities.find((c) => c.id === r.communityId)?.name ?? ''} · ${f.kg(r.volume)} · ${f.money(r.total)}`} right={<StatusBadge status={r.status} />} badge={r.disbursements.length > 0 && !r.fundsReceived && r.sourcingModel === 'CASH_ADVANCE' ? <Badge tone="warning">{t('mobile.m5.confirmFundsBadge')}</Badge> : undefined} onClick={() => navigate(`/m/buying/requests/${r.id}`)} /></li>)}
          </MList>
        ) : <p className="py-6 text-center text-[14px] text-muted">{t('buy.emptyRequests')}</p>)}
        {tab === 'purchases' && (purchases.length ? (
          <MList>
            {purchases.slice(0, 40).map((p) => <li key={p.id}><ListRow title={`${name(p.farmerId)} · ${f.kg(p.quantity)}`} subtitle={`${p.number} · ${f.money(p.amount)} · ${f.relative(p.createdAt)}`} right={<StatusBadge status={p.paymentStatus} />} badge={p.consolidationRef ? <Badge tone="info">{t('buy.consolidated')}</Badge> : undefined} /></li>)}
          </MList>
        ) : <p className="py-6 text-center text-[14px] text-muted">{t('buy.noPurchases')}</p>)}
        {tab === 'pre' && (expenses.length ? (
          <MList>
            {expenses.map((e) => <li key={e.id}><ListRow title={e.number} subtitle={`${t('buy.bagsN', { count: e.bags })} · ${f.money(e.total)}`} right={<StatusBadge status={e.status} />} badge={<StatusBadge status={e.paymentStatus} />} /></li>)}
          </MList>
        ) : <p className="py-6 text-center text-[14px] text-muted">{t('buy.emptyPre')}</p>)}
      </div>
    </div>
  );
}

/** M5 Create purchase request: community, commodity, unit, volume, date, price from the list with tolerance warning. */
export function NewRequestScreen() {
  const { t, terms } = useT();
  const f = useFormat();
  const lang = useLang();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const { agent } = useMobileAgent();
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const mine = useMemo(() => communities.filter((c) => agent && c.agentIds.includes(agent.id)).sort((a, b) => a.name.localeCompare(b.name)), [communities, agent]);
  const [communityId, setCommunityId] = useState(mine[0]?.id ?? '');
  const [commodityId, setCommodityId] = useState(settings.commodities[0]?.id ?? '');
  const commodity = settings.commodities.find((c) => c.id === commodityId);
  const [grade, setGrade] = useState(commodity?.grades[0] ?? '');
  const [volume, setVolume] = useState('');
  const [planned, setPlanned] = useState(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  const sourcingOptions: SourcingModel[] = settings.buyingRules.sourcingModels[commodityId] ?? ['CASH_ADVANCE'];
  const [sourcing, setSourcing] = useState<SourcingModel>(sourcingOptions[0]!);
  const list = communityId && commodityId ? listPriceFor(orgId, commodityId, communityId, grade) : undefined;
  const dec = (list?.price.currency ?? f.org.currency) === 'XOF' ? 0 : 2;
  const [price, setPrice] = useState<string | null>(null);
  const priceStr = price ?? (list ? String(list.price.amountMinor / 10 ** dec) : '');
  const priceMinor = Math.round(Number(priceStr || 0) * 10 ** dec);
  const variance = list ? ((priceMinor - list.price.amountMinor) / list.price.amountMinor) * 100 : 0;
  const beyond = !!list && Math.abs(variance) > list.tolerancePct;
  const [reason, setReason] = useState('');
  const vol = Number(volume || 0);
  const save = async () => {
    const payload = { orgId, agentId: agent!.id, communityId, commodityId, grade, unitId: 'kg', volume: vol, plannedDate: planned, unitPriceMinor: priceMinor, sourcingModel: sourcing, overrideReason: beyond ? reason : undefined, actorId: userId ?? '' };
    const { queued, result } = await saveOrQueue<PurchaseRequest>({ orgId, userId: userId ?? '', type: 'purchaseRequest', label: t('mobile.m5.requestLabel', { kg: f.kg(vol), community: mine.find((c) => c.id === communityId)?.name ?? '' }), payload });
    toast.success(t(savedKey(queued)), { description: result ? t('buy.toast.created', { number: result.number }) : undefined });
    navigate(result ? `/m/buying/requests/${result.id}` : '/m/buying');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m5.newRequest')} back />
      <MobileWizard
        finishLabel={online ? t('buy.submit') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'what', title: t('mobile.m5.what'), valid: !!communityId && vol > 0, content: (
              <div className="space-y-4">
                <MField label={terms.community} required><MSelect value={communityId} onChange={(v) => { setCommunityId(v); setPrice(null); }} label={terms.community} options={mine.map((c) => ({ value: c.id, label: c.name }))} /></MField>
                <MField label={t('col.commodity')}><MSelect value={commodityId} onChange={(v) => { setCommodityId(v); setGrade(settings.commodities.find((c) => c.id === v)?.grades[0] ?? ''); setSourcing((settings.buyingRules.sourcingModels[v] ?? ['CASH_ADVANCE'])[0]!); setPrice(null); }} label={t('col.commodity')} options={settings.commodities.map((c) => ({ value: c.id, label: c.name[lang] ?? c.name.en ?? c.code }))} /></MField>
                {!!commodity?.grades.length && <MField label={t('buy.grade')} group><Segmented value={grade} onChange={(v) => { setGrade(v); setPrice(null); }} label={t('buy.grade')} options={commodity.grades.map((g) => ({ value: g, label: g }))} /></MField>}
                <MField label={t('mobile.m5.volumeKg')} required><input type="number" inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} className={mInput} aria-label={t('mobile.m5.volumeKg')} /></MField>
                <MField label={t('buy.plannedDate')}><input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} className={mInput} aria-label={t('buy.plannedDate')} /></MField>
              </div>
            ),
          },
          {
            key: 'price', title: t('mobile.m5.price'), valid: priceMinor > 0 && (!beyond || !!reason.trim()), content: (
              <div className="space-y-4">
                <MField label={t('buy.unitPriceIn', { currency: f.org.currency, unit: 'kg' })}><input type="number" inputMode="decimal" value={priceStr} onChange={(e) => setPrice(e.target.value)} className={mInput} aria-label={t('col.unitPrice')} /></MField>
                <p className={cn('rounded-ctl px-4 py-3 text-[14px]', beyond ? 'bg-warning/10 text-ink' : 'bg-canvas text-body')}>
                  {list ? t('buy.listHint', { price: f.money(list.price), unit: 'kg', zone: settings.zones.find((z) => z.id === list.zoneId)?.name ?? '', pct: list.tolerancePct }) : t('buy.noListPrice')}
                  {beyond && <span className="mt-1 flex items-start gap-1.5 text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t('buy.beyondTolerance', { pct: f.number(variance, { maximumFractionDigits: 1 }) })}</span>}
                </p>
                {beyond && <MField label={t('buy.overrideReason')} required><input value={reason} onChange={(e) => setReason(e.target.value)} className={mInput} aria-label={t('buy.overrideReason')} /></MField>}
                {sourcingOptions.length > 1 && <MField label={t('buy.sourcing')} group><Segmented value={sourcing} onChange={setSourcing} label={t('buy.sourcing')} options={sourcingOptions.map((s) => ({ value: s, label: t(`buy.sourcingName.${s}`) }))} /></MField>}
                <div className="flex items-baseline justify-between rounded-ctl bg-brand-soft px-4 py-3"><span className="text-[14px] text-body">{t('col.total')}</span><span className="tnum text-[22px] font-semibold text-ink">{f.money({ amountMinor: priceMinor * vol, currency: f.org.currency })}</span></div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** M5 Request detail: status, approvals, confirm funds received, sign receipt, approve when permitted. */
export function RequestDetailScreen() {
  const { id } = useParams();
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const r = useBuyingStore((s) => s.requests.find((x) => x.id === id));
  const community = useCommunityStore((s) => s.communities.find((c) => c.id === r?.communityId));
  const [signature, setSignature] = useState<string | undefined>();
  const [signing, setSigning] = useState(false);
  const [reason, setReason] = useState<WorkflowAction | null>(null);
  const [note, setNote] = useState('');
  const can = useCan();
  const def = settings.workflows.find((w) => w.docType === 'purchaseRequest');
  if (!r || !def) return null;
  const given = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
  const canConfirm = r.sourcingModel === 'CASH_ADVANCE' && r.disbursements.length > 0 && !r.fundsReceived;
  const me = userId ? workflowUser(userId, orgId) : null;
  const allowed = me && canAct(r as unknown as WorkflowRecord, def, me) ? getAllowedActions(r as unknown as WorkflowRecord, def, me).filter((a) => a.allowed) : [];
  const confirm = async () => {
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'fundsReceived', label: t('mobile.m5.fundsLabel', { number: r.number }), payload: { requestId: r.id } });
    toast.success(t(savedKey(queued)), { description: t('mobile.m5.fundsConfirmed', { amount: f.money({ amountMinor: given, currency: r.total.currency }) }) });
  };
  const sign = async () => {
    if (!signature) return;
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'receipt', label: t('mobile.m5.receiptLabel', { number: r.number }), payload: { requestId: r.id, signature } });
    setSigning(false);
    toast.success(t(savedKey(queued)), { description: t('mobile.m5.receiptSigned') });
  };
  const decide = (a: WorkflowAction, comment?: string) => {
    const res = act(orgId, 'purchaseRequest', r.id, a, userId ?? '', comment);
    if (res.ok) toast.success(t(`buy.acted.${a}`, { number: r.number }));
    else if (res.reason === 'reasonRequired') setReason(a);
    else toast.error(t(`dashboard.blocked.${res.reason}`, { defaultValue: t('dashboard.blocked.notAllowed') }));
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={r.number} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-brand-soft p-4">
          <div className="flex items-center justify-between gap-2"><StatusBadge status={r.status} /><span className="text-[13px] text-muted">{t(`buy.sourcingName.${r.sourcingModel}`)}</span></div>
          <div className="mt-2 text-[15px] text-ink">{community?.name} · {f.kg(r.volume)} · {f.money(r.unitPrice)}{'/kg'}</div>
          <div className="tnum text-[24px] font-semibold text-ink">{f.money(r.total)}</div>
          {r.sourcingModel === 'CASH_ADVANCE' && <div className="text-[13px] text-body">{t('mobile.m5.given', { amount: f.money({ amountMinor: given, currency: r.total.currency }) })}</div>}
        </div>
        {canConfirm && (
          <div className="rounded-card border border-warning/40 bg-warning/5 p-4">
            <p className="text-[15px] text-ink">{t('mobile.m5.confirmPrompt', { amount: f.money({ amountMinor: given, currency: r.total.currency }) })}</p>
            <Button size="lg" className="mt-3 w-full" onClick={() => void confirm()}><Check /> {t('mobile.m5.confirmFunds')}</Button>
          </div>
        )}
        {r.status === 'FINANCE_APPROVED' && can('purchaseRequests.confirmRate') && <Button size="lg" className="w-full" disabled={!online} onClick={() => { confirmRate(r.id, userId ?? 'system'); toast.success(t('buy.toast.rateConfirmed', { number: r.number })); }}><Check /> {t('buy.confirmRate')}</Button>}
        {ACTIVE.includes(r.status) && r.reconciliationStatus !== 'RECONCILED' && <Button size="lg" className="w-full" onClick={() => navigate(`/m/buying/purchase?request=${r.id}`)}><ShoppingBasket /> {t('mobile.m5.record')}</Button>}
        {allowed.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {allowed.map((a) => <Button key={a.action} size="lg" variant={a.action === 'APPROVE' || a.action === 'RESUME' ? 'primary' : a.action === 'REJECT' ? 'dangerOutline' : 'secondary'} disabled={!online} onClick={() => (a.action === 'REJECT' || a.action === 'HOLD' ? setReason(a.action) : decide(a.action))}>{a.action === 'APPROVE' ? <Check /> : a.action === 'REJECT' ? <X /> : <Pause />} {t(`buy.action.${a.action}`)}</Button>)}
          </div>
        )}
        {reason && (
          <div className="space-y-2 rounded-card border border-line p-3">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('dashboard.reasonPlaceholder')} aria-label={t('dashboard.reason')} className={mInput} autoFocus />
            <Button size="lg" className="w-full" disabled={!note.trim()} onClick={() => { decide(reason, note.trim()); setReason(null); setNote(''); }}>{t(`buy.action.${reason}`)}</Button>
          </div>
        )}
        {r.fundsReceived && (
          <section className="rounded-card border border-line p-4">
            <h2 className="mb-2 text-[16px]">{t('buy.tab.receipt')}</h2>
            {r.receipt ? <p className="text-[14px] text-success">{t('buy.signedAt', { date: f.dateTime(r.receipt.signedAt) })}</p> : signing ? (
              <div className="space-y-3"><SignaturePad value={signature} onChange={setSignature} big /><Button size="lg" className="w-full" disabled={!signature} onClick={() => void sign()}>{t('mobile.m5.signReceipt')}</Button></div>
            ) : <Button size="lg" variant="secondary" className="w-full" onClick={() => setSigning(true)}>{t('mobile.m5.signReceipt')}</Button>}
          </section>
        )}
        <section>
          <h2 className="eyebrow mb-2">{t('buy.tab.approvals')}</h2>
          <ApprovalTimeline record={r as unknown as WorkflowRecord} def={def} />
        </section>
        <p className="text-[12px] text-muted">{terms.purchaseRequest} · {f.dateTime(r.createdAt)}</p>
      </div>
    </div>
  );
}
