import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Mic, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { PreExpense } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/shared/Field';
import { SimCapture } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { MField, MList, MSelect, MobileWizard, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { debtCheck, preLineCap, type NewPre } from '@/services/buyingService';
import { saveOrQueue } from '@/services/mobileSync';
import { SPEECH_LANGS, transcribe, type SpeechLang } from '@/services/speechService';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useActor, useFormat, useLang, useOrgSettings, useT } from '@/stores/hooks';
import { useMyFarmers } from '@/mobile/flows/farmers/FarmerScreens';
import { useMyRequests } from './BuyingScreens';
import type { PurchasePrefill } from './RecordPurchaseScreen';

/** M5 Voice purchase (PRD 4.4): pick a language, speak the farmer and the weight, check the transcript, continue. */
export function VoicePurchaseScreen() {
  const { t, terms } = useT();
  const f = useFormat();
  const uiLang = useLang();
  const navigate = useNavigate();
  const { orgId } = useActor();
  const farmers = useMyFarmers();
  const requests = useMyRequests();
  const active = requests.filter((r) => ['FUNDS_RECEIVED', 'TICKET_ACTIVATED'].includes(r.status) && r.reconciliationStatus !== 'RECONCILED');
  const [lang, setLang] = useState<SpeechLang>(uiLang === 'fr' ? 'fr' : 'tw');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<{ text: string; farmerId?: string; kg: number } | null>(null);
  const [tick, setTick] = useState(0);
  const request = active[0];
  // Who the agent "says": a farmer in the request's community who is allowed to sell.
  const candidates = useMemo(() => farmers.filter((x) => (!request || x.communityId === request.communityId) && !debtCheck(orgId, x.id).blocked), [farmers, request, orgId]);

  const listen = async () => {
    const who = candidates[Math.floor(Math.random() * candidates.length)];
    if (!who) return;
    setHeard(null);
    setListening(true);
    const id = window.setInterval(() => setTick((x) => x + 1), 120);
    const kg = 30 + Math.round(Math.random() * 20);
    const out = await transcribe(lang, { name: `${who.firstName} ${who.lastName}`, kg });
    window.clearInterval(id);
    setListening(false);
    const match = farmers.find((x) => `${x.firstName} ${x.lastName}`.toLowerCase() === out.name.toLowerCase());
    setHeard({ text: out.text, farmerId: match?.id, kg: out.quantityKg });
  };
  const farmer = farmers.find((x) => x.id === heard?.farmerId);
  const go = () => {
    if (!heard) return;
    const state: PurchasePrefill = { requestId: request?.id, farmerId: heard.farmerId, kg: heard.kg, voice: { seconds: 3, transcript: heard.text } };
    navigate('/m/buying/purchase', { state, replace: true });
  };
  const bars = Array.from({ length: 32 }, (_, i) => 8 + Math.abs(Math.sin((i + tick) * 0.9)) * 44);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m5.voice')} back />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-1">
        <MField label={t('mobile.m5.speakIn')} group>
          <Segmented value={lang} onChange={setLang} label={t('mobile.m5.speakIn')} options={SPEECH_LANGS.map((l) => ({ value: l, label: t(`mobile.m5.speech.${l}`) }))} />
        </MField>
        <p className="text-[15px] text-body">{t('mobile.m5.voiceHint')}</p>
        <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-4 py-8">
          <div className="flex h-14 items-center gap-[3px]" aria-hidden="true">
            {bars.map((h, i) => <span key={i} className={cn('w-[4px] rounded-full transition-all', listening ? 'bg-danger' : 'bg-line')} style={{ height: listening ? h : 8 }} />)}
          </div>
          <Button size="lg" variant={listening ? 'danger' : 'primary'} disabled={listening || !candidates.length} onClick={() => void listen()}><Mic className={cn(listening && 'animate-pulse')} /> {listening ? t('mobile.m5.listening') : heard ? t('mobile.m5.speakAgain') : t('mobile.m5.speak')}</Button>
        </div>
        {heard && (
          <div className="space-y-3 rounded-card bg-brand-soft p-4">
            <div className="eyebrow">{t('mobile.m5.transcript')}</div>
            <p className="text-[17px] italic text-ink">“{heard.text}”</p>
            <div className="flex flex-wrap gap-2">
              {farmer ? <Badge tone="success"><Check className="mr-1 h-3 w-3" />{farmer.firstName} {farmer.lastName} · {farmer.farmerCode}</Badge> : <Badge tone="warning">{t('mobile.m5.noMatch')}</Badge>}
              <Badge tone="info">{f.kg(heard.kg)}</Badge>
            </div>
          </div>
        )}
        {!active.length && <p className="rounded-ctl bg-warning/10 px-4 py-3 text-[14px] text-ink">{t('mobile.m5.noActive', { request: terms.purchaseRequest.toLocaleLowerCase() })}</p>}
      </div>
      <div className="shrink-0 border-t border-line p-4"><Button size="lg" className="w-full" disabled={!heard || !active.length} onClick={go}>{t('mobile.m5.useTranscript')}</Button></div>
    </div>
  );
}

/** M5 Create PRE (PRD D3): request → bags → expense lines from the catalogue (caps) → scan bags if required → payee → save. */
export function NewPreScreen() {
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const { agent } = useMobileAgent();
  const requests = useMyRequests();
  const eligible = requests.filter((r) => ['FULL_DISBURSEMENT', 'FUNDS_RECEIVED', 'TICKET_ACTIVATED', 'RECONCILED'].includes(r.status));
  const allBags = useBuyingStore((s) => s.bags);
  const purchases = useBuyingStore((s) => s.purchases);
  const [requestId, setRequestId] = useState(eligible[0]?.id ?? '');
  const reqBags = useMemo(() => {
    const ids = new Set(purchases.filter((p) => p.requestId === requestId).map((p) => p.id));
    return allBags.filter((b) => b.purchaseIds.some((id) => ids.has(id)) && b.status !== 'REPLACED');
  }, [allBags, purchases, requestId]);
  const [bags, setBags] = useState('');
  const n = Number(bags || reqBags.length || 0);
  const [discussed, setDiscussed] = useState(true);
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const [lines, setLines] = useState<{ expenseTypeId: string; quantity: string; rate: string }[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const qtyFor = (id: string) => { const x = settings.expenseTypes.find((e) => e.id === id); return x?.basis === 'PER_BAG' ? n : x?.basis === 'PER_KG' ? Math.round(n * 85) : 1; };
  const unused = settings.expenseTypes.filter((x) => !lines.some((l) => l.expenseTypeId === x.id));
  const add = (id: string) => { const x = settings.expenseTypes.find((e) => e.id === id)!; setLines([...lines, { expenseTypeId: id, quantity: String(qtyFor(id)), rate: String(x.defaultRate.amountMinor / 10 ** dec) }]); };
  const computed = lines.map((l) => {
    const rateMinor = Math.round(Number(l.rate || 0) * 10 ** dec);
    const raw = rateMinor * Number(l.quantity || 0);
    const cap = preLineCap(settings, l.expenseTypeId);
    return { ...l, rateMinor, amount: cap != null ? Math.min(cap, raw) : raw, capped: cap != null && raw > cap };
  });
  const total = computed.reduce((s, l) => s + l.amount, 0);
  const needScan = lines.some((l) => settings.expenseTypes.find((x) => x.id === l.expenseTypeId)?.requiresBagScan);
  const typeName = (id: string) => settings.expenseTypes.find((x) => x.id === id)?.name ?? id;
  const r = eligible.find((x) => x.id === requestId);
  const scanNext = () => reqBags.map((b) => b.code).find((c) => !codes.includes(c)) ?? `${reqBags[0]?.code.replace(/\d+$/, '') ?? 'BAG'}${String(900_000 + codes.length).padStart(6, '0')}`;

  const save = async () => {
    if (!r) return;
    const payload: NewPre = { orgId, requestId, bags: n, costDiscussed: discussed, lines: computed.map((l) => ({ expenseTypeId: l.expenseTypeId, quantity: Number(l.quantity), rateMinor: l.rateMinor })), bagCodes: needScan ? codes : undefined, actorId: userId ?? '' };
    const { queued, result } = await saveOrQueue<PreExpense>({ orgId, userId: userId ?? '', type: 'expense', label: t('mobile.m5.preLabel', { pre: terms.pre, number: r.number, amount: f.money({ amountMinor: total, currency: r.total.currency }) }), payload });
    toast.success(t(savedKey(queued)), { description: result ? t('buy.toast.preCreated', { number: result.number }) : undefined });
    navigate('/m/buying');
  };

  if (!eligible.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('mobile.m5.newPre', { pre: terms.pre })} back />
        <p className="px-5 py-8 text-center text-[15px] text-body">{t('mobile.m5.noPreRequest', { request: terms.purchaseRequest.toLocaleLowerCase() })}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m5.newPre', { pre: terms.pre })} back />
      <MobileWizard
        finishLabel={online ? t('buy.submit') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'request', title: terms.purchaseRequest, valid: !!r && n > 0, content: (
              <div className="space-y-4">
                <MField label={terms.purchaseRequest} required><MSelect value={requestId} onChange={(v) => { setRequestId(v); setCodes([]); setBags(''); }} label={terms.purchaseRequest} options={eligible.map((x) => ({ value: x.id, label: `${x.number} · ${f.kg(x.volume)}` }))} /></MField>
                <MField label={t('mobile.m5.bagCount')} required help={t('mobile.m5.bagsOnRequest', { count: reqBags.length })}><input type="number" inputMode="numeric" value={bags || String(reqBags.length || '')} onChange={(e) => setBags(e.target.value)} className={mInput} aria-label={t('mobile.m5.bagCount')} /></MField>
                <Checkbox label={t('buy.costDiscussed')} checked={discussed} onChange={(e) => setDiscussed(e.target.checked)} />
              </div>
            ),
          },
          {
            key: 'lines', title: t('mobile.m5.costs'), valid: lines.length > 0 && computed.every((l) => Number(l.quantity) > 0 && l.rateMinor > 0), content: (
              <div className="space-y-3">
                {computed.map((l, i) => (
                  <div key={l.expenseTypeId} className="space-y-2 rounded-card border border-line p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold text-ink">{typeName(l.expenseTypeId)}</span>
                      <Button variant="ghost" size="icon" aria-label={t('set.remove')} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <MField label={t('col.quantity')}><input type="number" inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, quantity: e.target.value } : y)))} className={mInput} aria-label={`${typeName(l.expenseTypeId)} ${t('col.quantity')}`} /></MField>
                      <MField label={t('buy.rate')}><input type="number" inputMode="decimal" value={l.rate} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, rate: e.target.value } : y)))} className={mInput} aria-label={`${typeName(l.expenseTypeId)} ${t('buy.rate')}`} /></MField>
                    </div>
                    <div className="flex items-center justify-between text-[14px]">
                      {l.capped ? <span className="flex items-center gap-1 text-warning"><AlertTriangle className="h-4 w-4" />{t('mobile.m5.cappedAt', { amount: f.money({ amountMinor: preLineCap(settings, l.expenseTypeId)!, currency: f.org.currency }) })}</span> : <span />}
                      <span className="tnum font-semibold text-ink">{f.money({ amountMinor: l.amount, currency: f.org.currency })}</span>
                    </div>
                  </div>
                ))}
                {unused.length > 0 && (
                  <div className="space-y-2">
                    <div className="eyebrow">{t('mobile.m5.addCost')}</div>
                    <div className="flex flex-wrap gap-2">{unused.map((x) => <Button key={x.id} size="sm" variant="secondary" onClick={() => add(x.id)}><Plus /> {x.name}</Button>)}</div>
                  </div>
                )}
                <div className="flex items-baseline justify-between rounded-ctl bg-brand-soft px-4 py-3"><span className="text-[14px] text-body">{t('col.total')}</span><span className="tnum text-[22px] font-semibold text-ink">{f.money({ amountMinor: total, currency: f.org.currency })}</span></div>
              </div>
            ),
          },
          ...(needScan ? [{
            key: 'scan', title: t('buy.scanBags'), valid: codes.length >= n, content: (
              <div className="space-y-3">
                <p className="text-[15px] text-body">{t('mobile.m5.preScanHint', { count: n })}</p>
                <div className="flex items-center gap-3">
                  {codes.length < n && <SimCapture kind="scanCode" value={undefined} onChange={(v) => v && setCodes([...codes, v])} make={scanNext} label={t('mobile.m5.scanBag')} big />}
                  <span className="tnum text-[14px] text-muted">{codes.length} / {n}</span>
                </div>
                {codes.length < n && reqBags.length > 0 && <Button variant="link" size="sm" onClick={() => setCodes(reqBags.slice(0, n).map((b) => b.code))}>{t('buy.scanAll')}</Button>}
                {codes.length > 0 && <MList>{codes.map((c) => <li key={c} className="flex items-center justify-between px-4 py-3 font-mono text-[14px] text-ink"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{c}</span><Button variant="ghost" size="icon" aria-label={t('set.remove')} onClick={() => setCodes(codes.filter((x) => x !== c))}><Trash2 /></Button></li>)}</MList>}
              </div>
            ),
          }] : []),
          {
            key: 'payee', title: t('mobile.m5.payee'), valid: !!agent, content: (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-card border border-line p-4">
                  <Wallet className="h-6 w-6 text-brand" />
                  <div>
                    <div className="text-[16px] font-semibold text-ink">{agent?.wallet.verifiedName}</div>
                    <div className="text-[14px] text-body">{formatPhone(agent?.wallet.number ?? '')} · {settings.paymentProviders.find((p) => p.id === agent?.wallet.providerId)?.name}</div>
                  </div>
                </div>
                <p className="text-[14px] text-muted">{t('mobile.m5.payeeHint')}</p>
                <div className="rounded-card bg-brand-soft p-4">
                  <div className="font-mono text-[13px] text-brand">{r?.number}</div>
                  <div className="tnum text-[24px] font-semibold text-ink">{f.money({ amountMinor: total, currency: f.org.currency })}</div>
                  <div className="text-[14px] text-body">{t('buy.bagsN', { count: n })} · {t('mobile.m5.perBag', { amount: f.money({ amountMinor: n ? Math.round(total / n) : 0, currency: f.org.currency }) })}</div>
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
