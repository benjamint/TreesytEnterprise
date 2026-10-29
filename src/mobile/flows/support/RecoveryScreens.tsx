import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Check, CheckCircle2, Coins, MessageSquare, Plus, RotateCcw, Scale, Wheat } from 'lucide-react';
import { toast } from 'sonner';
import type { LoanAccount, RecoveryRequest, Repayment } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PhotoPicker, SimCapture } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSelect, MobileWizard, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { nextBagCode } from '@/services/buyingService';
import { daysLeft, eligibleLoans, ledgerOf, quoteOf, type RepaymentResult } from '@/services/recoveryService';
import { saveOrQueue } from '@/services/mobileSync';
import { cn, latency } from '@/lib/utils';
import { useLoanStore } from '@/stores/loanStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useSupportStore } from '@/stores/supportStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useSupportLookups } from '@/web/features/support/shared';
import { useMyGroups } from './SupportScreens';

const OPEN: RecoveryRequest['status'][] = ['ACTIVATED', 'PARTIALLY_RECOVERED'];

function useActiveWindows() {
  const windows = useOrgRows(useSupportStore((s) => s.windows));
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return windows.filter((w) => w.status === 'ACTIVE' && w.start <= today && w.end >= today).sort((a, b) => a.end.localeCompare(b.end));
  }, [windows]);
}

/** M7 Recovery: active window banner, the agent's recovery requests. */
export function RecoveryScreen() {
  const { t } = useT();
  const navigate = useNavigate();
  const { agent } = useMobileAgent();
  const sl = useSupportLookups();
  const windows = useActiveWindows();
  const all = useOrgRows(useSupportStore((s) => s.recoveries));
  const mine = useMemo(() => all.filter((r) => r.agentId === agent?.id).sort((a, b) => Number(OPEN.includes(b.status)) - Number(OPEN.includes(a.status)) || b.createdAt.localeCompare(a.createdAt)), [all, agent?.id]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.tile.recovery')} back right={<Button size="sm" disabled={!windows.length} onClick={() => navigate('/m/recovery/new')}><Plus /> {t('mobile.new')}</Button>} />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        {windows.length ? windows.map((w) => (
          <div key={w.id} className="flex items-start gap-3 rounded-card border border-brand/30 bg-brand-soft p-4">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0">
              <div className="font-semibold text-ink">{w.name}</div>
              <div className="text-[14px] text-body">{t('mobile.m7.windowOpen', { count: daysLeft(w), days: daysLeft(w), type: sl.typeName(w.typeId) })}</div>
            </div>
          </div>
        )) : <p className="rounded-card border border-line bg-canvas p-4 text-[14px] text-body">{t('mobile.m7.noWindow')}</p>}
        {mine.length ? (
          <MList>
            {mine.map((r) => <li key={r.id}><ListRow title={sl.groupName(r.groupId)} subtitle={`${r.number} · ${t('mobile.m7.loansN', { count: r.loanIds.length })}`} badge={OPEN.includes(r.status) ? <Badge tone="teal">{t('mobile.m7.collect')}</Badge> : undefined} right={<StatusBadge status={r.status} />} onClick={() => navigate(`/m/recovery/${r.id}`)} /></li>)}
          </MList>
        ) : (
          <div className="space-y-3 py-8 text-center">
            <RotateCcw className="mx-auto h-10 w-10 text-muted" />
            <p className="text-[15px] text-body">{t('mobile.m7.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** M7 New recovery request: window → group → the farmers with loans to recover. */
export function NewRecoveryScreen() {
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const { agent } = useMobileAgent();
  const sl = useSupportLookups();
  const windows = useActiveWindows();
  const groups = useMyGroups();
  useLoanStore((s) => s.loans);
  useSupportStore((s) => s.recoveries);
  const [windowId, setWindowId] = useState(windows[0]?.id ?? '');
  const withLoans = useMemo(() => groups.map((g) => ({ g, loans: eligibleLoans(orgId, g.id) })).filter((x) => x.loans.length), [groups, orgId]);
  const [groupId, setGroupId] = useState(withLoans[0]?.g.id ?? '');
  const loans = withLoans.find((x) => x.g.id === groupId)?.loans ?? [];
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = picked ?? loans.map((l) => l.id);
  const save = async () => {
    if (!agent) return;
    const payload = { orgId, groupId, windowId, agentId: agent.id, loanIds: chosen, actorId: userId ?? '' };
    const { queued, result } = await saveOrQueue<RecoveryRequest>({ orgId, userId: userId ?? '', type: 'recoveryRequest', label: t('mobile.m7.requestLabel', { group: sl.groupName(groupId) }), payload });
    toast.success(t(savedKey(queued)), { description: result ? t('rec.toast.created', { number: result.number }) : undefined });
    navigate(result ? `/m/recovery/${result.id}` : '/m/recovery');
  };
  if (!withLoans.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('rec.new')} back />
        <p className="px-5 py-10 text-center text-[15px] text-body">{t('mobile.m7.nothingDue')}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('rec.new')} back />
      <MobileWizard
        finishLabel={online ? t('buy.submit') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'where', title: t('mobile.m7.where'), valid: !!windowId && !!groupId, content: (
              <div className="space-y-4">
                <MField label={t('rec.window')} required><MSelect value={windowId} onChange={setWindowId} label={t('rec.window')} options={windows.map((w) => ({ value: w.id, label: `${w.name} · ${t('mobile.m7.daysLeft', { count: daysLeft(w) })}` }))} /></MField>
                <MField label={terms.farmerGroup} required><MSelect value={groupId} onChange={(v) => { setGroupId(v); setPicked(null); }} label={terms.farmerGroup} options={withLoans.map((x) => ({ value: x.g.id, label: `${x.g.name} · ${t('mobile.m7.loansN', { count: x.loans.length })}` }))} /></MField>
              </div>
            ),
          },
          {
            key: 'farmers', title: t('mobile.m7.eligible'), valid: chosen.length > 0, hint: t('sup.pickedN', { count: chosen.length, total: loans.length }), content: (
              <MList>
                {loans.map((l) => {
                  const on = chosen.includes(l.id);
                  return (
                    <li key={l.id}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => setPicked(on ? chosen.filter((x) => x !== l.id) : [...chosen, l.id])} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-brand-soft">
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border', on ? 'border-brand bg-brand text-on-brand' : 'border-line')}>{on && <Check className="h-4 w-4" />}</span>
                        <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{sl.farmerName(l.farmerId)}</span><span className="block text-[13px] text-muted">{sl.typeName(l.typeId)}</span></span>
                        <span className="tnum text-[15px] font-medium text-ink">{f.money({ amountMinor: ledgerOf(l).balance, currency: l.principal.currency })}</span>
                      </button>
                    </li>
                  );
                })}
              </MList>
            ),
          },
        ]}
      />
    </div>
  );
}

/** M7 Recovery detail: loans with balances and record repayment; the farmer feedback form. */
export function RecoveryDetailScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const settings = useOrgSettings();
  const lang = useLang();
  const sl = useSupportLookups();
  const r = useSupportStore((s) => s.recoveries.find((x) => x.id === id));
  const allLoans = useLoanStore((s) => s.loans);
  const loans = useMemo(() => (r ? r.loanIds.map((x) => allLoans.find((l) => l.id === x)).filter((l): l is LoanAccount => !!l) : []), [r, allLoans]);
  const experience = settings.support.feedback?.experience ?? [];
  const [exp, setExp] = useState(experience[0] ?? '');
  const [lend, setLend] = useState<'YES' | 'MAYBE' | 'NO'>('YES');
  const [comment, setComment] = useState('');
  if (!r) return null;
  const commodity = settings.commodities.find((c) => c.id === r.review?.commodityId);
  const open = OPEN.includes(r.status);
  const feedback = async () => {
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'recoveryFeedback', label: t('mobile.m7.feedbackLabel', { number: r.number }), payload: { id: r.id, experience: exp, lendAgain: lend, comment: comment.trim() || undefined } });
    toast.success(t(savedKey(queued)), { description: t('mobile.m7.feedbackSaved') });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={r.number} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-brand-soft p-4">
          <div className="flex items-center justify-between gap-2"><StatusBadge status={r.status} />{r.review && <span className="text-[13px] text-muted">{commodity?.name[lang] ?? commodity?.name.en} · {f.money(r.review.unitPrice)}{'/kg'}</span>}</div>
          <div className="mt-2 text-[15px] text-ink">{sl.groupName(r.groupId)}</div>
          <div className="tnum text-[24px] font-semibold text-ink">{f.money({ amountMinor: loans.reduce((s, l) => s + ledgerOf(l).balance, 0), currency: loans[0]?.principal.currency ?? f.org.currency })}</div>
          <div className="text-[13px] text-body">{t('mobile.m7.outstanding', { count: loans.filter((l) => l.status !== 'SETTLED').length })}</div>
        </div>
        {r.status === 'PENDING_REVIEW' && <p className="rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body">{t('mobile.m7.waitingReview')}</p>}
        {r.status === 'FINANCE_REVIEW' && <p className="rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body">{t('mobile.m7.waitingFinance')}</p>}
        {r.status === 'REJECTED' && <p className="rounded-ctl border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-ink">{r.rejection?.reason}</p>}
        <MList>
          {loans.map((l) => {
            const lg = ledgerOf(l);
            return (
              <li key={l.id}>
                <ListRow
                  title={sl.farmerName(l.farmerId)}
                  subtitle={l.status === 'SETTLED' ? t('status.SETTLED') : t('mobile.m7.balance', { amount: f.money({ amountMinor: lg.balance, currency: l.principal.currency }) })}
                  right={l.status === 'SETTLED' ? <CheckCircle2 className="h-5 w-5 text-success" /> : lg.overdue ? <Badge tone="danger">{t('status.OVERDUE')}</Badge> : undefined}
                  onClick={open && l.status !== 'SETTLED' ? () => navigate(`/m/recovery/${r.id}/repay?loan=${l.id}`) : undefined}
                />
              </li>
            );
          })}
        </MList>
        {open && <Button size="lg" className="w-full" onClick={() => navigate(`/m/recovery/${r.id}/repay`)}><Coins /> {t('mobile.m7.record')}</Button>}
        {['PARTIALLY_RECOVERED', 'FULLY_RECOVERED'].includes(r.status) && (
          <section className="space-y-3 rounded-card border border-line p-4">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink"><MessageSquare className="h-5 w-5 text-brand" />{t('mobile.m7.feedback')}</h2>
            {r.feedback ? (
              <p className="text-[14px] text-body">{t('mobile.m7.feedbackGiven', { experience: r.feedback.experience, lend: t(`mobile.m7.lend.${r.feedback.lendAgain}`) })}</p>
            ) : (
              <>
                {experience.length > 0 && <MField label={t('mobile.m7.experience')}><MSelect value={exp} onChange={setExp} label={t('mobile.m7.experience')} options={experience.map((x) => ({ value: x, label: x }))} /></MField>}
                {settings.support.feedback?.lendAgain !== false && <MField label={t('mobile.m7.lendAgain')} group><Segmented value={lend} onChange={setLend} label={t('mobile.m7.lendAgain')} options={(['YES', 'MAYBE', 'NO'] as const).map((k) => ({ value: k, label: t(`mobile.m7.lend.${k}`) }))} /></MField>}
                <MField label={t('mobile.m7.comment')}><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className={cn(mInput, 'h-auto py-2')} aria-label={t('mobile.m7.comment')} /></MField>
                <Button size="lg" variant="secondary" className="w-full" onClick={() => void feedback()}>{t('mobile.m7.saveFeedback')}</Button>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

type Mode = Repayment['mode'];

/** M7 Record repayment: farmer → quote → mode → weight + bag / cash + receipt photo → excess toggle → receipt. */
export function RepayScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const sl = useSupportLookups();
  const r = useSupportStore((s) => s.recoveries.find((x) => x.id === id));
  const allLoans = useLoanStore((s) => s.loans);
  const loans = useMemo(() => (r ? r.loanIds.map((x) => allLoans.find((l) => l.id === x)).filter((l): l is LoanAccount => !!l && l.status !== 'SETTLED') : []), [r, allLoans]);
  const [loanId, setLoanId] = useState(params.get('loan') ?? loans[0]?.id ?? '');
  const modes = settings.support.repaymentModes;
  const [mode, setMode] = useState<Mode>(modes.includes('PRODUCE') ? 'PRODUCE' : modes[0] ?? 'CASH');
  const [kg, setKg] = useState('');
  const [reading, setReading] = useState(false);
  const [bag, setBag] = useState<string | undefined>();
  const [cash, setCash] = useState('');
  const [photo, setPhoto] = useState<string[]>([]);
  const [excess, setExcess] = useState(!!r?.purchaseRequestId);
  const [done, setDone] = useState<{ queued: boolean; result?: RepaymentResult; name: string } | null>(null);
  const loan = loans.find((l) => l.id === loanId) ?? allLoans.find((l) => l.id === loanId);
  if (!r || !loan) return null;
  const c = loan.principal.currency;
  const dec = c === 'XOF' ? 0 : 2;
  const money = (v: number) => f.money({ amountMinor: v, currency: c });
  const price = r.review?.unitPrice;
  const lg = ledgerOf(loan);
  const qProduce = quoteOf(loan, 'produce', new Date(), price);
  const qCash = quoteOf(loan, 'cash', new Date());
  const kgN = mode !== 'CASH' ? Number(kg || 0) : 0;
  const cashMinor = mode !== 'PRODUCE' ? Math.round(Number(cash || 0) * 10 ** dec) : 0;
  const produceValue = Math.round(kgN * (price?.amountMinor ?? 0));
  const over = produceValue + cashMinor > lg.balance;
  const readScale = async () => { setReading(true); await latency(1200, 1200); setKg(String(Math.round((qProduce.volumeKg ?? 60) * (0.7 + Math.random() * 0.6) * 10) / 10)); setReading(false); };
  const valid = (mode === 'CASH' || (kgN > 0 && !!bag)) && (mode === 'PRODUCE' || (cashMinor > 0 && photo.length > 0));
  const save = async () => {
    const name = sl.farmerName(loan.farmerId);
    const payload = { recoveryRequestId: r.id, loanId: loan.id, mode, kg: kgN || undefined, bagCode: bag, cashMinor: cashMinor || undefined, excess: excess && !!r.purchaseRequestId, photo: photo[0], actorId: userId ?? '' };
    const { queued, result } = await saveOrQueue<RepaymentResult>({ orgId, userId: userId ?? '', type: 'repayment', label: t('mobile.m7.repayLabel', { name }), payload });
    setDone({ queued, result, name });
  };

  if (done) {
    const res = done.result;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('mobile.m7.receipt')} />
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-2">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <div className="text-[18px] font-semibold text-ink">{t(done.queued ? 'mobile.savedOffline' : 'mobile.m7.recorded')}</div>
            <div className="text-[15px] text-body">{done.name}</div>
          </div>
          {res ? (
            <dl className="divide-y divide-line rounded-card border border-line text-[15px]">
              {res.repayment.produceValue && <div className="flex justify-between px-4 py-3"><dt className="text-muted">{t('mobile.m7.produce', { kg: f.kg(res.repayment.kg ?? 0) })}</dt><dd className="tnum text-ink">{f.money(res.repayment.produceValue)}</dd></div>}
              {res.repayment.cash && <div className="flex justify-between px-4 py-3"><dt className="text-muted">{t('mobile.m7.cash')}</dt><dd className="tnum text-ink">{f.money(res.repayment.cash)}</dd></div>}
              {res.repayment.excess && <div className="flex justify-between px-4 py-3"><dt className="text-muted">{t('mobile.m7.excessBought', { kg: f.kg(res.repayment.excess.kg) })}</dt><dd className="tnum text-ink">{f.money(res.repayment.excess.amount)}</dd></div>}
              <div className="flex justify-between px-4 py-3"><dt className="text-muted">{t('rec.interest')}</dt><dd className="tnum text-ink">{money(res.ledger.interestCharged)}</dd></div>
              <div className="flex justify-between px-4 py-3"><dt className="text-muted">{t('rec.penalty')}</dt><dd className="tnum text-ink">{money(res.ledger.penaltyCharged)}</dd></div>
              <div className="flex justify-between px-4 py-3 font-semibold"><dt>{t('mobile.m7.balanceNow')}</dt><dd className="tnum">{money(res.ledger.balance)}</dd></div>
            </dl>
          ) : <p className="rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body">{t('mobile.m7.onSync')}</p>}
          {res?.settled && <p className="flex items-center gap-2 rounded-ctl bg-success/10 px-4 py-3 text-[14px] text-ink"><CheckCircle2 className="h-4 w-4 text-success" />{t('mobile.m7.settled')}</p>}
          {res && res.overpaid > 0 && <p className="rounded-ctl border border-warning/40 bg-warning/5 px-4 py-3 text-[14px] text-ink">{t('mobile.m7.overpaid', { amount: money(res.overpaid) })}</p>}
          {res?.repayment.cash && <p className="text-[13px] text-muted">{t('mobile.m7.cashPending')}</p>}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-line p-4">
          <Button size="lg" variant="secondary" onClick={() => navigate(`/m/recovery/${r.id}`)}>{t('mobile.m5.done')}</Button>
          <Button size="lg" disabled={!loans.some((l) => l.id !== loan.id)} onClick={() => { setDone(null); setKg(''); setBag(undefined); setCash(''); setPhoto([]); setLoanId(loans.find((l) => l.id !== loan.id)?.id ?? ''); }}><Plus /> {t('mobile.m7.next')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m7.record')} back />
      <MobileWizard
        finishLabel={online ? t('mobile.m7.save') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'farmer', title: t('mobile.m7.farmerQuote'), valid: !!loan, content: (
              <div className="space-y-4">
                <MField label={t('mobile.m7.farmer')}><MSelect value={loanId} onChange={setLoanId} label={t('mobile.m7.farmer')} options={loans.map((l) => ({ value: l.id, label: `${sl.farmerName(l.farmerId)} · ${l.typeId ? sl.typeName(l.typeId) : t('rec.direct')} · ${money(ledgerOf(l).balance)}` }))} /></MField>
                <div className="rounded-card border border-line p-4">
                  <div className="eyebrow mb-2">{t('mobile.m7.owes')}</div>
                  <div className="tnum text-[26px] font-semibold text-ink">{money(lg.balance)}</div>
                  <dl className="mt-2 space-y-1 text-[14px]">
                    <div className="flex justify-between"><dt className="text-muted">{t('rec.principal')}</dt><dd className="tnum text-ink">{money(lg.principal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">{t('rec.interest')}</dt><dd className="tnum text-ink">{money(lg.interest)}</dd></div>
                    {lg.penalty > 0 && <div className="flex justify-between"><dt className="text-muted">{t('rec.penalty')}</dt><dd className="tnum text-ink">{money(lg.penalty)}</dd></div>}
                  </dl>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-ctl bg-brand-soft p-3"><div className="flex items-center gap-1.5 text-[13px] text-body"><Wheat className="h-4 w-4" />{t('mobile.m7.quoteProduce')}</div><div className="tnum mt-1 text-[17px] font-semibold text-ink">{f.money(qProduce.amount)}</div>{qProduce.volumeKg != null && <div className="text-[13px] text-muted">{f.kg(qProduce.volumeKg)}</div>}</div>
                  <div className="rounded-ctl bg-canvas p-3"><div className="flex items-center gap-1.5 text-[13px] text-body"><Coins className="h-4 w-4" />{t('mobile.m7.quoteCash')}</div><div className="tnum mt-1 text-[17px] font-semibold text-ink">{f.money(qCash.amount)}</div>{qCash.penaltyIncluded > 0 && <div className="text-[13px] text-warning">{t('mobile.m7.penaltyIncl', { amount: money(qCash.penaltyIncluded) })}</div>}</div>
                </div>
              </div>
            ),
          },
          {
            key: 'pay', title: t('mobile.m7.howPaying'), valid, content: (
              <div className="space-y-4">
                <MField label={t('mobile.m7.mode')} group><Segmented value={mode} onChange={setMode} label={t('mobile.m7.mode')} options={modes.map((m) => ({ value: m, label: t(`set.support.mode.${m}`) }))} /></MField>
                {mode !== 'CASH' && (
                  <>
                    <MField label={t('mobile.m7.weightKg')} required>
                      <div className="flex gap-2">
                        <input type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} className={mInput} aria-label={t('mobile.m7.weightKg')} />
                        <Button size="lg" variant="secondary" disabled={reading} onClick={() => void readScale()}><Scale className={cn(reading && 'animate-pulse')} /> {reading ? t('mobile.m5.reading') : t('mobile.m5.readScale')}</Button>
                      </div>
                    </MField>
                    {kgN > 0 && price && <p className="text-[14px] text-body">{t('mobile.m7.produceWorth', { kg: f.kg(kgN), price: f.money(price), amount: money(produceValue) })}</p>}
                    <MField label={t('mobile.m5.scanBag')} required group>{bag ? <div className="flex items-center justify-between rounded-ctl border border-line px-4 py-3"><span className="font-mono text-[15px] text-ink">{bag}</span><Button variant="link" size="sm" onClick={() => setBag(undefined)}>{t('mobile.m5.rescan')}</Button></div> : <SimCapture kind="scanCode" value={undefined} onChange={setBag} make={() => nextBagCode(orgId)} label={t('mobile.m5.scanBag')} big />}</MField>
                  </>
                )}
                {mode !== 'PRODUCE' && (
                  <>
                    <MField label={t('mobile.m7.cashAmount', { currency: c })} required><input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className={mInput} aria-label={t('mobile.m7.cashAmount', { currency: c })} /></MField>
                    {qCash.penaltyIncluded > 0 && <p className="flex items-start gap-1.5 text-[13px] text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t('mobile.m7.cashPenalty')}</p>}
                    <MField label={t('mobile.m7.receiptPhoto')} required group><PhotoPicker value={photo} onChange={setPhoto} max={1} big /></MField>
                  </>
                )}
                {mode !== 'CASH' && r.purchaseRequestId && (
                  <div className="flex items-start justify-between gap-3 rounded-card border border-line p-4">
                    <div><div className="font-medium text-ink">{t('mobile.m7.excess')}</div><div className="text-[13px] text-muted">{t('mobile.m7.excessHint', { price: r.activation?.excessPrice ? f.money(r.activation.excessPrice) : r.review?.excessPrice ? f.money(r.review.excessPrice) : '—' })}</div></div>
                    <Switch checked={excess} onCheckedChange={setExcess} aria-label={t('mobile.m7.excess')} />
                  </div>
                )}
                {over && !excess && <p className="rounded-ctl border border-warning/40 bg-warning/5 px-4 py-3 text-[14px] text-ink">{t('mobile.m7.overWarn', { amount: money(produceValue + cashMinor - lg.balance) })}</p>}
                <div className="flex items-baseline justify-between rounded-ctl bg-brand-soft px-4 py-3"><span className="text-[14px] text-body">{t('mobile.m7.paying')}</span><span className="tnum text-[22px] font-semibold text-ink">{money(produceValue + cashMinor)}</span></div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
