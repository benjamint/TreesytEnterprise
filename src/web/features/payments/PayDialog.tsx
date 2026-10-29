import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleCheck, Loader2, RefreshCw, RotateCcw, Send, ShieldCheck, X } from 'lucide-react';
import type { Money, PayableType, Payment } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/shared/Field';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { checkLimits, checkStatus, detectProvider, lookupPayee, needsChecker, pay, quote, retry, type PayeeLine } from '@/services/paymentService';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useFormat, useOrgSettings, useT } from '@/stores/hooks';

/** What the caller wants paid. Amount can be edited for a single payee (partial disbursement). */
export interface PayRequest {
  type: PayableType;
  payableId: string;
  title: string;
  payees: (PayeeLine & { label?: string })[];
  meta?: Record<string, unknown>;
  /** Single payee only: let the user pay part of the amount, up to this maximum. */
  editableMaxMinor?: number;
  /** Ask for the weight this tranche covers (purchase request disbursements). */
  withWeight?: boolean;
}

type Step = 'payees' | 'charges' | 'confirm' | 'send';
interface Row { name: string; label?: string; number: string; providerId: string; amountMinor: number; payableId?: string; meta?: Record<string, unknown>; lookup: 'idle' | 'checking' | 'match' | 'mismatch'; walletName?: string }

/** Pay modal (PRD E1): 1 Payees with name lookup → 2 Charges → 3 Confirm (maker–checker) → progress → results. */
export function PayDialog({ request, onClose }: { request: PayRequest; onClose: (payments?: Payment[]) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const payments = usePaymentStore((s) => s.payments);
  const wallets = usePaymentStore((s) => s.wallets);
  const currency = request.payees[0]?.amount.currency ?? f.org.currency;
  const dec = currency === 'XOF' ? 0 : 2;
  const mobile = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY' && p.enabled);
  const [step, setStep] = useState<Step>('payees');
  const [rows, setRows] = useState<Row[]>(() => request.payees.map((p) => ({
    name: p.name, label: p.label, number: p.number, providerId: p.providerId ?? detectProvider(orgId, p.number)?.id ?? mobile[0]?.id ?? '',
    amountMinor: p.amount.amountMinor, payableId: p.payableId, meta: p.meta, lookup: 'idle',
  })));
  const [weight, setWeight] = useState('');
  const [includeWithdrawal, setIncludeWithdrawal] = useState(false);
  const [extraIds, setExtraIds] = useState<string[]>(() => settings.extraCharges.filter((x) => x.enabled && x.payer === 'company').map((x) => x.id));
  const [confirmedMismatch, setConfirmedMismatch] = useState(false);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Name lookup for every payee whose number changed (PRD E1 step 1).
  const lookupKey = rows.map((r) => r.number).join('|');
  useEffect(() => {
    let live = true;
    setRows((rs) => rs.map((r) => ({ ...r, lookup: 'checking' })));
    void Promise.all(rows.map((r) => lookupPayee(r.number, r.name))).then((res) => {
      if (live) setRows((rs) => rs.map((r, i) => ({ ...r, lookup: res[i]!.match ? 'match' : 'mismatch', walletName: res[i]!.name })));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey]);

  const quotes = useMemo(() => rows.map((r) => quote(orgId, { amountMinor: r.amountMinor, currency }, r.providerId, { extraIds, includeWithdrawal })), [rows, orgId, currency, extraIds, includeWithdrawal]);
  const sum = (k: 'amount' | 'fee' | 'tax' | 'extras' | 'withdrawal' | 'total' | 'received') => quotes.reduce((s, q) => s + q[k].amountMinor, 0);
  const money = (minor: number) => f.money({ amountMinor: minor, currency });
  const limit = useMemo(() => (userId ? checkLimits(orgId, userId, rows.map((r, i) => ({ providerId: r.providerId, total: quotes[i]!.total }))) : { ok: false as const }), [orgId, userId, rows, quotes]);
  const checker = needsChecker(orgId, sum('total'));
  const mismatches = rows.filter((r) => r.lookup === 'mismatch').length;
  const checking = rows.some((r) => r.lookup === 'checking');
  const editable = rows.length === 1 && request.editableMaxMinor != null;
  const overMax = editable && rows[0]!.amountMinor > request.editableMaxMinor!;
  const payeesOk = !checking && rows.every((r) => r.amountMinor > 0 && r.number.trim()) && !overMax && (!mismatches || confirmedMismatch);
  const sent = payments.filter((p) => sentIds.includes(p.id));
  const finished = sent.length > 0 && sent.every((p) => !['PENDING', 'PROCESSING'].includes(p.status));
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const send = async () => {
    setStep('send');
    setBusy(true);
    const payees: PayeeLine[] = rows.map((r) => ({ name: r.walletName && r.lookup === 'match' ? r.walletName : r.name, number: r.number, providerId: r.providerId, amount: { amountMinor: r.amountMinor, currency }, payableId: r.payableId, meta: r.meta }));
    const meta = { ...request.meta, ...(request.withWeight && weight ? { weightKg: Number(weight) } : {}) };
    // Show each attempt as soon as it exists so progress is visible.
    const before = new Set(usePaymentStore.getState().payments.map((p) => p.id));
    const track = window.setInterval(() => setSentIds(usePaymentStore.getState().payments.filter((p) => !before.has(p.id)).map((p) => p.id)), 150);
    const out = await pay({ orgId, type: request.type, payableId: request.payableId, payees, actorId: userId ?? 'system', extraIds, includeWithdrawal, meta });
    window.clearInterval(track);
    setSentIds(out.map((p) => p.id));
    setBusy(false);
  };
  const close = () => onClose(sent.length ? sent : undefined);
  const stepIndex = ['payees', 'charges', 'confirm', 'send'].indexOf(step);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>{t('pay.subtitle', { count: rows.length, total: money(sum('total')) })}</DialogDescription>
        </DialogHeader>
        <ol className="flex gap-2 text-[12px] font-semibold" aria-label={t('pay.steps')}>
          {(['payees', 'charges', 'confirm'] as const).map((s, i) => (
            <li key={s} className={cn('flex flex-1 items-center gap-2 rounded-full border px-3 py-1.5', i < stepIndex ? 'border-success/40 bg-success/5 text-success' : i === stepIndex ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted')} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="tnum">{i + 1}</span> {t(`pay.step.${s}`)}
            </li>
          ))}
        </ol>

        {step === 'payees' && (
          <div className="space-y-3">
            <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <li key={i} className="rounded-ctl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><div className="truncate text-[14px] font-medium text-ink">{r.name}</div>{r.label && <div className="truncate text-[12px] text-muted">{r.label}</div>}</div>
                    {!editable && <span className="tnum text-[14px] font-semibold text-ink">{money(r.amountMinor)}</span>}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px]">
                    <Input compact type="tel" value={r.number} onChange={(e) => setRow(i, { number: e.target.value, providerId: detectProvider(orgId, e.target.value)?.id ?? r.providerId })} aria-label={t('pay.walletNumber', { name: r.name })} />
                    <select value={r.providerId} onChange={(e) => setRow(i, { providerId: e.target.value })} aria-label={t('pay.network', { name: r.name })} className="h-ctl rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
                      {mobile.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <p className={cn('mt-2 flex items-center gap-1.5 text-[13px]', r.lookup === 'match' ? 'text-success' : r.lookup === 'mismatch' ? 'text-warning' : 'text-muted')} role="status">
                    {r.lookup === 'checking' || r.lookup === 'idle' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('pay.lookingUp')}</>
                      : r.lookup === 'match' ? <><CircleCheck className="h-3.5 w-3.5" /> {t('pay.nameOnWallet', { name: r.walletName })}</>
                        : <><AlertTriangle className="h-3.5 w-3.5" /> {t('pay.nameMismatch', { name: r.walletName, expected: r.name.toUpperCase() })}</>}
                  </p>
                </li>
              ))}
            </ul>
            {editable && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">{t('buy.amountIn', { currency })}</span>
                  <Input compact type="number" min={0} step={dec ? '0.01' : '1'} value={String(rows[0]!.amountMinor / 10 ** dec)} onChange={(e) => setRow(0, { amountMinor: Math.round(Number(e.target.value || 0) * 10 ** dec) })} aria-label={t('buy.amountIn', { currency })} />
                  <span className={cn('mt-1 block text-[12px]', overMax ? 'text-danger' : 'text-muted')}>{t('buy.max', { amount: money(request.editableMaxMinor!) })}</span>
                </label>
                {request.withWeight && (
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-ink">{t('buy.weightKg')}</span>
                    <Input compact type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} aria-label={t('buy.weightKg')} />
                  </label>
                )}
              </div>
            )}
            {mismatches > 0 && <Checkbox label={t('pay.confirmMismatch', { count: mismatches })} checked={confirmedMismatch} onChange={(e) => setConfirmedMismatch(e.target.checked)} />}
          </div>
        )}

        {step === 'charges' && (
          <div className="space-y-4">
            <div className="max-h-[36vh] overflow-auto rounded-ctl border border-line">
              <table className="w-full whitespace-nowrap text-[13px]">
                <thead className="sticky top-0 bg-canvas text-left text-[12px] text-label"><tr><th className="px-3 py-2 font-semibold">{t('col.payee')}</th><th className="px-3 py-2 text-right font-semibold">{t('col.amount')}</th><th className="px-3 py-2 text-right font-semibold">{t('pay.fee')}</th><th className="px-3 py-2 text-right font-semibold">{t('pay.withdrawal')}</th><th className="px-3 py-2 text-right font-semibold">{t('pay.tax')}</th><th className="px-3 py-2 text-right font-semibold">{t('col.total')}</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const q = quotes[i]!;
                    return <tr key={i} className="border-t border-line"><td className="px-3 py-2 text-ink">{r.name}<span className="block text-[11px] text-muted">{q.provider?.name}</span></td><td className="tnum px-3 py-2 text-right">{money(q.amount.amountMinor)}</td><td className="tnum px-3 py-2 text-right">{money(q.fee.amountMinor)}</td><td className="tnum px-3 py-2 text-right">{money(q.withdrawal.amountMinor)}</td><td className="tnum px-3 py-2 text-right">{money(q.tax.amountMinor)}</td><td className="tnum px-3 py-2 text-right font-medium text-ink">{money(q.total.amountMinor)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-ctl border border-line px-3.5 py-2.5">
              <span><span className="block text-[14px] font-medium text-ink">{t('pay.includeWithdrawal')}</span><span className="block text-[12px] text-muted">{t('pay.includeWithdrawalHint')}</span></span>
              <Switch checked={includeWithdrawal} onCheckedChange={setIncludeWithdrawal} aria-label={t('pay.includeWithdrawal')} />
            </label>
            {settings.extraCharges.some((x) => x.enabled) && (
              <div>
                <div className="eyebrow mb-1.5">{t('pay.extraCharges')}</div>
                <div className="flex flex-wrap gap-2">
                  {settings.extraCharges.filter((x) => x.enabled).map((x) => {
                    const on = extraIds.includes(x.id);
                    return <button key={x.id} type="button" aria-pressed={on} onClick={() => setExtraIds(on ? extraIds.filter((y) => y !== x.id) : [...extraIds, x.id])} className={cn('rounded-full border px-3 py-1.5 text-[13px]', on ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body')}>{`${x.name} · ${money(x.amountMinor)} · ${t(`set.pay.payerName.${x.payer}`)}`}</button>;
                  })}
                </div>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-ctl bg-canvas px-4 py-3 text-[14px] sm:grid-cols-3">
              {([['col.amount', 'amount'], ['pay.fee', 'fee'], ['pay.withdrawal', 'withdrawal'], ['pay.tax', 'tax'], ['pay.extraCharges', 'extras'], ['pay.received', 'received']] as const).map(([k, key]) => (
                <div key={key}><dt className="text-[12px] text-muted">{t(k)}</dt><dd className="tnum text-ink">{money(sum(key))}</dd></div>
              ))}
              <div className="col-span-full mt-1 flex items-baseline justify-between border-t border-line pt-2"><dt className="font-medium text-ink">{t('pay.totalCompany')}</dt><dd className="tnum text-[20px] font-semibold text-ink">{money(sum('total'))}</dd></div>
              <p className="col-span-full text-[12px] text-muted">{t(`pay.whoPays.${quotes[0]?.payer ?? 'company'}`)}</p>
            </dl>
            {!limit.ok && <LimitBanner reason={limit.reason} limit={limit.limit} used={limit.used} />}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3">
            <dl className="grid gap-3 rounded-ctl border border-line p-4 text-[14px] sm:grid-cols-2">
              <div><dt className="text-[12px] text-muted">{t('pay.payees')}</dt><dd className="text-ink">{rows.length === 1 ? `${rows[0]!.name} · ${formatPhone(rows[0]!.number)}` : t('pay.payeesN', { count: rows.length })}</dd></div>
              <div><dt className="text-[12px] text-muted">{t('pay.totalCompany')}</dt><dd className="tnum text-[16px] font-semibold text-ink">{money(sum('total'))}</dd></div>
              {[...new Set(rows.map((r) => r.providerId))].map((pid) => {
                const w = wallets.find((x) => x.orgId === orgId && x.providerId === pid);
                const out = rows.reduce((s, r, i) => s + (r.providerId === pid ? quotes[i]!.total.amountMinor : 0), 0);
                return w ? <div key={pid} className="sm:col-span-2"><dt className="text-[12px] text-muted">{w.name}</dt><dd className="tnum text-ink">{t('pay.balanceAfter', { before: f.money(w.balance), after: money(w.balance.amountMinor - out) })}</dd></div> : null;
              })}
            </dl>
            {checker ? (
              <p className="flex items-start gap-2 rounded-ctl border border-info/30 bg-info/5 px-3 py-2.5 text-[14px] text-ink"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />{t('pay.checkerNeeded', { amount: money(settings.makerCheckerMinMinor ?? 0) })}</p>
            ) : <p className="text-[13px] text-muted">{t('pay.sendsNow')}</p>}
          </div>
        )}

        {step === 'send' && (
          <div className="space-y-3">
            <ul className="max-h-[46vh] divide-y divide-line overflow-y-auto rounded-ctl border border-line">
              {(sent.length ? sent : rows.map((r) => ({ id: r.number, payee: { name: r.name, number: r.number }, status: 'PENDING' as const, total: { amountMinor: 0, currency } }) as unknown as Payment)).map((p) => (
                <ResultRow key={p.id} payment={p} live={sent.includes(p)} />
              ))}
            </ul>
            {finished && <p className="text-[14px] text-ink" role="status">{t('pay.summary', { ok: sent.filter((p) => p.status === 'SUCCESSFUL').length, failed: sent.filter((p) => p.status === 'FAILED').length, unknown: sent.filter((p) => p.status === 'UNKNOWN').length, waiting: sent.filter((p) => p.status === 'AWAITING_CHECKER').length })}</p>}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          {step !== 'payees' && step !== 'send' ? <Button variant="ghost" onClick={() => setStep(step === 'confirm' ? 'charges' : 'payees')}><ArrowLeft /> {t('pay.back')}</Button> : <span />}
          <div className="flex gap-2">
            {step !== 'send' && <Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>}
            {step === 'payees' && <Button disabled={!payeesOk} onClick={() => setStep('charges')}>{t('pay.next')} <ArrowRight /></Button>}
            {step === 'charges' && <Button disabled={!limit.ok} onClick={() => setStep('confirm')}>{t('pay.next')} <ArrowRight /></Button>}
            {step === 'confirm' && <Button onClick={() => void send()}>{checker ? <><ShieldCheck /> {t('pay.submitForCheck')}</> : <><Send /> {t('pay.sendNow', { total: money(sum('total')) })}</>}</Button>}
            {step === 'send' && <Button disabled={busy} onClick={close}>{busy ? <Loader2 className="animate-spin" /> : <Check />} {t('pay.done')}</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({ payment: p, live }: { payment: Payment; live: boolean }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const [working, setWorking] = useState(false);
  const retried = usePaymentStore((s) => s.payments.some((x) => x.retryOf === p.id));
  const run = async (fn: () => Promise<unknown>) => { setWorking(true); await fn(); setWorking(false); };
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[14px]">
      <span className="min-w-0 flex-1"><span className="block truncate text-ink">{p.payee.name}</span><span className="block text-[12px] text-muted">{live ? p.reference : formatPhone(p.payee.number)}{p.failureReason ? ` · ${p.failureReason}` : ''}</span></span>
      {live && <span className="tnum text-ink">{f.money(p.total)}</span>}
      {!live || p.status === 'PENDING' || p.status === 'PROCESSING' ? <Badge tone="info"><Loader2 className="h-3 w-3 animate-spin" /> {t('status.PROCESSING')}</Badge> : <StatusBadge status={p.status} />}
      {live && p.status === 'FAILED' && !retried && <Button size="xs" variant="secondary" disabled={working} onClick={() => void run(() => retry(p.id, userId ?? 'system'))}><RotateCcw /> {t('buy.retry')}</Button>}
      {live && p.status === 'UNKNOWN' && <Button size="xs" variant="secondary" disabled={working} onClick={() => void run(() => checkStatus(p.id, userId ?? 'system'))}><RefreshCw /> {t('pay.checkStatus')}</Button>}
      <RetryChain id={p.id} />
    </li>
  );
}

/** Shows the outcome of a retry under the attempt it replaced. */
function RetryChain({ id }: { id: string }) {
  const next = usePaymentStore((s) => s.payments.find((p) => p.retryOf === id));
  const { t } = useT();
  if (!next) return null;
  return <span className="flex w-full items-center gap-2 pl-4 text-[12px] text-muted">{t('pay.retriedAs', { reference: next.reference })} <StatusBadge status={next.status} /></span>;
}

export function LimitBanner({ reason, limit, used }: { reason?: string; limit?: Money; used?: Money }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <p className="flex items-start gap-2 rounded-ctl border border-danger/30 bg-danger/5 px-3 py-2.5 text-[14px] text-ink" role="alert">
      <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <span>
        {t(`pay.limit.${reason ?? 'permission'}`, { limit: limit ? f.money(limit) : '', used: used ? f.money(used) : '' })}
        {reason === 'balance' && <>{' '}<Link to="/app/payments/wallets" className="text-link">{t('pay.requestTopUp')}</Link></>}
      </span>
    </p>
  );
}
