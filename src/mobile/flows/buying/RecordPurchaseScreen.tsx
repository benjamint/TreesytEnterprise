import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Check, CheckCircle2, CreditCard, MessageSquare, Nfc, Plus, QrCode, Scale, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Farmer, Purchase } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AudioCapture, GpsCapture, PhotoPicker, SignaturePad, SimCapture, type Gps } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { ListRow, MField, MList, MSearch, MSelect, MobileWizard, Segmented, mInput } from '@/mobile/components/kit';
import { debtCheck, nextBagCode, type NewPurchase } from '@/services/buyingService';
import { saveOrQueue } from '@/services/mobileSync';
import { detectProvider, lookupPayee } from '@/services/paymentService';
import { formatPhone } from '@/lib/format';
import { cn, latency } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { useActor, useFormat, useLang, useOrgSettings, useT } from '@/stores/hooks';
import { useMyFarmers } from '@/mobile/flows/farmers/FarmerScreens';
import { payPurchases, useMyRequests } from './BuyingScreens';

/** Prefill handed over by the voice purchase screen. */
export interface PurchasePrefill { requestId?: string; farmerId?: string; kg?: number; voice?: { seconds: number; transcript: string } }

interface Line { farmerId: string; kg: string; wallet: { providerId: string; number: string; name: string }; verified?: 'match' | 'mismatch' }
type Mode = 'separate' | 'consolidated';

const ACTIVE = ['FUNDS_RECEIVED', 'TICKET_ACTIVATED'];
const fullName = (f?: Farmer) => (f ? `${f.firstName} ${f.lastName}` : '');

/** Bag codes already used on this phone but not yet synced, so offline purchases never share a new code. */
function useQueuedBagCodes(orgId: string) {
  const items = useOutboxStore((s) => s.items);
  return useMemo(() => new Set(items.filter((i) => i.orgId === orgId && i.type === 'purchase').flatMap((i) => (i.payload as { items: NewPurchase[] }).items.flatMap((x) => x.bagCodes ?? []))), [items, orgId]);
}

/**
 * M5 Record purchase (PRD 10): request → farmer(s) with debt check → weight → bag(s) → evidence → payment → receipt.
 * Works offline: the purchase waits in the outbox and is written (with its SMS receipt) on Sync.
 */
export function RecordPurchaseScreen() {
  const { t, terms } = useT();
  const f = useFormat();
  const lang = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const prefill = (location.state ?? {}) as PurchasePrefill;
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const requests = useMyRequests();
  const active = requests.filter((r) => ACTIVE.includes(r.status) && r.reconciliationStatus !== 'RECONCILED');
  const [requestId, setRequestId] = useState(params.get('request') ?? prefill.requestId ?? active[0]?.id ?? '');
  const r = active.find((x) => x.id === requestId);
  const community = useCommunityStore((s) => s.communities.find((c) => c.id === r?.communityId));
  const pack = settings.packaging.find((p) => p.commodityId === r?.commodityId);
  const nominal = pack ? Math.round((pack.minKg + pack.maxKg) / 2) : 85;
  const commodity = settings.commodities.find((c) => c.id === r?.commodityId);
  const direct = r?.sourcingModel === 'DIRECT_PAYMENT';
  const farmers = useMyFarmers();
  const byId = (id: string) => farmers.find((x) => x.id === id);
  const queuedCodes = useQueuedBagCodes(orgId);
  const allPurchases = useBuyingStore((s) => s.purchases);

  const walletFor = (farmerId: string) => {
    const fa = byId(farmerId);
    return { providerId: fa ? detectProvider(orgId, fa.phone)?.id ?? '' : '', number: fa?.phone ?? '', name: fullName(fa).toUpperCase() };
  };
  const [mode, setMode] = useState<Mode>('separate');
  const [lines, setLines] = useState<Line[]>(() => (prefill.farmerId ? [{ farmerId: prefill.farmerId, kg: prefill.kg ? String(prefill.kg) : '', wallet: walletFor(prefill.farmerId) }] : []));
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(lines.length === 0);
  const [reading, setReading] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [scalePhoto, setScalePhoto] = useState<string[]>([]);
  const [voice, setVoice] = useState<{ seconds: number } | undefined>(prefill.voice ? { seconds: prefill.voice.seconds } : undefined);
  const [gps, setGps] = useState<Gps | undefined>();
  const [signature, setSignature] = useState<string | undefined>();
  const [payNow, setPayNow] = useState(true);
  const [verifying, setVerifying] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ queued: boolean; purchases: Purchase[]; paid?: number; failed?: number } | null>(null);
  const [step, setStep] = useState(prefill.farmerId ? 1 : 0);

  const kgOf = (l: Line) => Number(l.kg || 0);
  const totalKg = lines.reduce((s, l) => s + kgOf(l), 0);
  const unit = r?.unitPrice.amountMinor ?? 0;
  const currency = r?.unitPrice.currency ?? f.org.currency;
  const bagsNeeded = mode === 'consolidated' ? 1 : Math.max(1, Math.ceil(totalKg / nominal));
  const outOfRange = mode === 'consolidated' && !!pack && totalKg > 0 && (totalKg < pack.minKg || totalKg > pack.maxKg);
  const used = new Set(lines.map((l) => l.farmerId));
  const query = q.trim().toLowerCase();
  const pool = farmers.filter((x) => (!r || x.communityId === r.communityId || x.agentId === r.agentId) && !used.has(x.id));
  const shown = pool.filter((x) => !query || fullName(x).toLowerCase().includes(query) || x.farmerCode.toLowerCase().includes(query)).slice(0, 30);

  const addFarmer = (fa: Farmer) => {
    const debt = debtCheck(orgId, fa.id);
    if (debt.blocked) { toast.error(fullName(fa), { description: t('buy.debt.block', { amount: f.money({ amountMinor: debt.balance, currency }) }) }); return; }
    setLines((ls) => [...(mode === 'separate' ? [] : ls), { farmerId: fa.id, kg: '', wallet: walletFor(fa.id) }]);
    setPicking(false);
    setQ('');
  };
  const identify = async (how: 'nfc' | 'card') => {
    await latency(900, 900);
    const withCard = pool.filter((x) => (how === 'nfc' ? !!x.identity.nfcCard : true));
    const fa = withCard[Math.floor(Math.random() * withCard.length)] ?? pool[0];
    if (fa) { toast.success(t(how === 'nfc' ? 'mobile.m5.cardRead' : 'mobile.m5.codeRead', { name: fullName(fa) })); addFarmer(fa); }
  };
  const readScale = async (i: number) => {
    setReading(i);
    await latency(1200, 1200);
    const kg = Math.round((pack ? pack.minKg * 0.6 + Math.random() * (pack.maxKg - pack.minKg) * 0.5 : 40 + Math.random() * 40) * 10) / 10;
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, kg: String(kg) } : l)));
    setReading(null);
  };
  const verify = async (i: number) => {
    const l = lines[i]!;
    setVerifying(i);
    const res = await lookupPayee(l.wallet.number, l.wallet.name);
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, verified: res.match ? 'match' : 'mismatch', wallet: { ...x.wallet, name: res.name || x.wallet.name } } : x)));
    setVerifying(null);
  };
  const nextCode = () => {
    const taken = new Set([...queuedCodes, ...codes]);
    let off = 0;
    let c = nextBagCode(orgId, off);
    while (taken.has(c)) c = nextBagCode(orgId, ++off);
    return c;
  };
  const deduct = (l: Line) => { const d = debtCheck(orgId, l.farmerId); return d.policy === 'deduct' && d.balance > 0 ? Math.min(d.balance, Math.round(kgOf(l) * unit)) : 0; };

  const save = async () => {
    if (!r) return;
    setBusy(true);
    const at = new Date().toISOString();
    const evidence = { scalePhoto: scalePhoto[0] ? 'scale-1' : undefined, voiceNote: voice ? 'voice-1' : undefined, gps, signature: direct ? undefined : signature ? 'sig-1' : undefined };
    const items: NewPurchase[] = lines.map((l) => ({
      farmerId: l.farmerId, quantity: kgOf(l), voiceNote: !!voice, createdAt: at, evidence,
      bagCodes: mode === 'consolidated' ? codes.slice(0, 1) : codes,
      wallet: direct && l.wallet.number ? l.wallet : undefined,
    }));
    const label = t('mobile.m5.purchaseLabel', { names: lines.map((l) => fullName(byId(l.farmerId))).join(', '), kg: f.kg(totalKg) });
    const { queued, result } = await saveOrQueue<{ purchases: Purchase[] }>({ orgId, userId: userId ?? '', type: 'purchase', label, payload: { requestId: r.id, items } });
    let paid: number | undefined;
    let failed: number | undefined;
    if (!queued && result && direct && payNow && online) {
      const out = await payPurchases(orgId, userId ?? 'system', r.id, result.purchases);
      paid = out.filter((p) => p.status === 'SUCCESSFUL').length;
      failed = out.length - paid;
    }
    setBusy(false);
    setDone({ queued, purchases: result?.purchases ?? [], paid, failed });
  };

  if (done) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('mobile.m5.receiptTitle')} />
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
          <div className="flex flex-col items-center gap-2 rounded-card bg-brand-soft p-5 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <div className="text-[18px] font-semibold text-ink">{t(done.queued ? 'mobile.savedOffline' : 'mobile.savedOnline')}</div>
            <div className="tnum text-[26px] font-semibold text-ink">{f.money({ amountMinor: lines.reduce((s, l) => s + Math.round(kgOf(l) * unit), 0), currency })}</div>
            <div className="text-[14px] text-body">{f.kg(totalKg)} · {commodity?.name[lang] ?? commodity?.name.en} · {f.money({ amountMinor: unit, currency })}{'/kg'}</div>
          </div>
          <MList>
            {lines.map((l, i) => {
              const saved = done.purchases.find((x) => x.farmerId === l.farmerId);
              const p = saved && (allPurchases.find((x) => x.id === saved.id) ?? saved);
              return <li key={l.farmerId}><ListRow title={`${fullName(byId(l.farmerId))} · ${f.kg(kgOf(l))}`} subtitle={p ? `${p.number} · ${p.bagCodes.join(', ')}` : t('mobile.m5.numberOnSync')} right={p ? <Badge tone={p.paymentStatus === 'PAID' ? 'success' : p.paymentStatus === 'FAILED' ? 'danger' : 'neutral'}>{t(`status.${p.paymentStatus}`, { defaultValue: p.paymentStatus })}</Badge> : <Badge tone="warning">{t('mobile.m5.waiting')}</Badge>} badge={mode === 'consolidated' && i === 0 ? <Badge tone="info">{t('buy.consolidated')}</Badge> : undefined} /></li>;
            })}
          </MList>
          {done.paid != null && <p className={cn('rounded-ctl px-4 py-3 text-[14px]', done.failed ? 'bg-warning/10 text-ink' : 'bg-success/10 text-ink')}>{t('mobile.m5.paidAll', { ok: done.paid, total: done.paid + (done.failed ?? 0) })}</p>}
          <p className="flex items-start gap-2 rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{t(done.queued ? 'mobile.m5.smsOnSync' : 'mobile.m5.smsSent', { count: lines.length })}</p>
          {(() => {
            const rel = done.purchases.length ? allPurchases.filter((p) => p.requestId === r?.id && (p.paymentStatus === 'NOT_PAID' || p.paymentStatus === 'FAILED')) : [];
            return direct && rel.length > 1 ? <p className="rounded-ctl border border-warning/40 bg-warning/5 px-4 py-3 text-[14px] text-ink">{t('mobile.m5.unpaidHint', { count: rel.length })}</p> : null;
          })()}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-line p-4">
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/buying')}>{t('mobile.m5.done')}</Button>
          <Button size="lg" onClick={() => { setDone(null); setLines([]); setCodes([]); setScalePhoto([]); setVoice(undefined); setSignature(undefined); setGps(undefined); setPicking(true); setStep(1); setMode('separate'); }}><Plus /> {t('mobile.m5.another')}</Button>
        </div>
      </div>
    );
  }

  if (!active.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('mobile.m5.record')} back />
        <div className="space-y-3 px-5 py-8 text-center">
          <p className="text-[15px] text-body">{t('mobile.m5.noActive', { request: terms.purchaseRequest.toLocaleLowerCase() })}</p>
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/buying')}>{t('mobile.tile.buying')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m5.record')} back />
      <MobileWizard
        step={step}
        onStep={setStep}
        busy={busy}
        finishLabel={busy ? t('status.PROCESSING') : online ? (direct && payNow ? t('mobile.m5.saveAndPay') : t('mobile.save')) : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'request', title: terms.purchaseRequest, valid: !!r, content: (
              <div className="space-y-3">
                <MList>
                  {active.map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => setRequestId(x.id)} className={cn('flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left', x.id === requestId && 'bg-brand-soft')}>
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', x.id === requestId ? 'border-brand bg-brand text-on-brand' : 'border-line')}>{x.id === requestId && <Check className="h-3 w-3" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[14px] text-ink">{x.number}</span>
                          <span className="block text-[13px] text-muted">{t(`buy.sourcingName.${x.sourcingModel}`)} · {f.money(x.unitPrice)}{'/kg · '}{f.kg(x.volume)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </MList>
              </div>
            ),
          },
          {
            key: 'farmer', title: terms.farmer, valid: lines.length > 0 && lines.every((l) => kgOf(l) > 0), hint: mode === 'consolidated' && pack ? t('mobile.m5.packHint', { min: pack.minKg, max: pack.maxKg }) : undefined, content: (
              <div className="space-y-4">
                <Segmented value={mode} onChange={(m) => { setMode(m); if (m === 'separate') setLines((ls) => ls.slice(0, 1)); setCodes([]); }} label={t('mobile.m5.bagMode')} options={[{ value: 'separate', label: t('mobile.m5.ownBags') }, { value: 'consolidated', label: t('buy.consolidated') }]} />
                {lines.map((l, i) => {
                  const fa = byId(l.farmerId);
                  const debt = debtCheck(orgId, l.farmerId);
                  const d = deduct(l);
                  return (
                    <div key={l.farmerId} className="space-y-3 rounded-card border border-line p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div><div className="text-[16px] font-semibold text-ink">{fullName(fa)}</div><div className="font-mono text-[12px] text-muted">{fa?.farmerCode}</div></div>
                        <Button variant="ghost" size="icon" aria-label={t('set.remove')} onClick={() => { setLines(lines.filter((_, j) => j !== i)); if (lines.length === 1) setPicking(true); }}><Trash2 /></Button>
                      </div>
                      {debt.balance > 0 && <p className="flex items-start gap-1.5 rounded-ctl bg-warning/10 px-3 py-2 text-[13px] text-ink"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{t(`buy.debt.${debt.policy}`, { amount: f.money({ amountMinor: debt.balance, currency }), deduct: f.money({ amountMinor: d, currency }) })}</p>}
                      <div className="flex gap-2">
                        <input type="number" inputMode="decimal" value={l.kg} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)))} placeholder={t('mobile.m5.kg')} aria-label={t('mobile.m5.weightOf', { name: fullName(fa) })} className={mInput} />
                        <Button size="lg" variant="secondary" disabled={reading === i} onClick={() => void readScale(i)}><Scale className={cn(reading === i && 'animate-pulse')} /> {reading === i ? t('mobile.m5.reading') : t('mobile.m5.readScale')}</Button>
                      </div>
                      {kgOf(l) > 0 && <div className="flex items-baseline justify-between text-[14px]"><span className="text-body">{f.kg(kgOf(l))} × {f.money({ amountMinor: unit, currency })}</span><span className="tnum font-semibold text-ink">{f.money({ amountMinor: Math.round(kgOf(l) * unit) - d, currency })}</span></div>}
                    </div>
                  );
                })}
                {mode === 'consolidated' && lines.length > 0 && (
                  <div className={cn('flex items-baseline justify-between rounded-ctl px-4 py-3', outOfRange ? 'bg-warning/10' : 'bg-brand-soft')}>
                    <span className="text-[14px] text-body">{t('mobile.m5.bagTotal')}</span>
                    <span className={cn('tnum text-[20px] font-semibold', outOfRange ? 'text-warning' : 'text-ink')}>{f.kg(totalKg)}</span>
                  </div>
                )}
                {picking ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="lg" variant="secondary" onClick={() => void identify('nfc')}><Nfc /> {t('mobile.m5.tapCard')}</Button>
                      <Button size="lg" variant="secondary" onClick={() => void identify('card')}><QrCode /> {t('mobile.m5.scanCard')}</Button>
                    </div>
                    <MSearch value={q} onChange={setQ} placeholder={t('mobile.m4.search')} />
                    <MList>
                      {shown.map((x) => { const d = debtCheck(orgId, x.id); return <li key={x.id}><ListRow title={fullName(x)} subtitle={x.farmerCode} badge={d.blocked ? <Badge tone="danger">{t('mobile.m5.blocked')}</Badge> : d.balance > 0 ? <Badge tone="warning">{t('mobile.m5.owes')}</Badge> : undefined} onClick={() => addFarmer(x)} /></li>; })}
                    </MList>
                  </div>
                ) : mode === 'consolidated' ? (
                  <Button size="lg" variant="secondary" className="w-full" onClick={() => setPicking(true)}><Plus /> {t('mobile.m5.addFarmer')}</Button>
                ) : null}
              </div>
            ),
          },
          {
            key: 'bags', title: t('mobile.m5.bags'), valid: codes.length >= bagsNeeded, hint: outOfRange && pack ? t('mobile.m5.outOfRange', { min: pack.minKg, max: pack.maxKg }) : undefined, content: (
              <div className="space-y-4">
                <p className="text-[15px] text-body">{mode === 'consolidated' ? t('mobile.m5.scanOneBag', { count: lines.length }) : t('mobile.m5.scanBagsHint', { count: bagsNeeded, kg: nominal })}</p>
                <MList>
                  {Array.from({ length: bagsNeeded }, (_, i) => (
                    <li key={i} className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-3">
                      <span className="text-[15px] text-ink">{t('mobile.m5.bagN', { n: i + 1 })}</span>
                      {codes[i] ? <span className="flex items-center gap-1.5 font-mono text-[14px] text-ink"><Check className="h-4 w-4 text-success" />{codes[i]}</span>
                        : i === codes.length ? <SimCapture kind="scanCode" value={undefined} onChange={(v) => v && setCodes([...codes, v])} make={nextCode} label={t('mobile.m5.scanBag')} /> : <span className="text-[13px] text-muted">—</span>}
                    </li>
                  ))}
                </MList>
                {codes.length > 0 && <Button variant="link" size="sm" onClick={() => setCodes([])}>{t('mobile.m5.rescan')}</Button>}
              </div>
            ),
          },
          {
            key: 'evidence', title: t('mobile.m5.evidence'), valid: scalePhoto.length > 0 && !!gps, content: (
              <div className="space-y-5">
                <MField label={t('mobile.m5.scalePhoto')} required group><PhotoPicker value={scalePhoto} onChange={setScalePhoto} max={1} big /></MField>
                <MField label={t('mobile.m5.voiceNote')} group help={prefill.voice ? `“${prefill.voice.transcript}”` : undefined}><AudioCapture value={voice} onChange={setVoice} big /></MField>
                <MField label={t('mobile.m3.gps')} required group><GpsCapture value={gps} onChange={setGps} base={community?.gps ?? { lat: 10.06, lng: -2.5 }} big /></MField>
              </div>
            ),
          },
          direct ? {
            key: 'pay', title: t('mobile.m5.payment'), valid: lines.every((l) => !!l.wallet.number.trim() && !!l.wallet.name.trim()), content: (
              <div className="space-y-4">
                <p className="text-[14px] text-body">{t('mobile.m5.directHint')}</p>
                {lines.map((l, i) => (
                  <div key={l.farmerId} className="space-y-3 rounded-card border border-line p-4">
                    <div className="flex items-baseline justify-between"><span className="text-[15px] font-semibold text-ink">{fullName(byId(l.farmerId))}</span><span className="tnum text-[15px] text-ink">{f.money({ amountMinor: Math.round(kgOf(l) * unit) - deduct(l), currency })}</span></div>
                    <MField label={t('buy.walletNumber')}><input type="tel" value={l.wallet.number} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, verified: undefined, wallet: { ...x.wallet, number: e.target.value, providerId: detectProvider(orgId, e.target.value)?.id ?? x.wallet.providerId } } : x)))} className={mInput} aria-label={t('buy.walletNumber')} /></MField>
                    <MField label={t('mobile.m5.network')}><MSelect value={l.wallet.providerId} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, wallet: { ...x.wallet, providerId: v } } : x)))} label={t('mobile.m5.network')} options={settings.paymentProviders.filter((p) => p.enabled && p.kind === 'MOBILE_MONEY').map((p) => ({ value: p.id, label: p.name }))} /></MField>
                    <MField label={t('buy.walletName')}><input value={l.wallet.name} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, verified: undefined, wallet: { ...x.wallet, name: e.target.value.toUpperCase() } } : x)))} className={mInput} aria-label={t('buy.walletName')} /></MField>
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="secondary" disabled={!online || verifying === i} onClick={() => void verify(i)}>{verifying === i ? t('status.PROCESSING') : t('mobile.m5.checkName')}</Button>
                      {l.verified === 'match' && <span className="flex items-center gap-1 text-[13px] text-success"><Check className="h-4 w-4" />{t('mobile.m5.nameMatch')}</span>}
                      {l.verified === 'mismatch' && <span className="flex items-center gap-1 text-[13px] text-warning"><AlertTriangle className="h-4 w-4" />{t('mobile.m5.nameMismatch', { name: l.wallet.name })}</span>}
                    </div>
                  </div>
                ))}
                {online ? (
                  <Segmented value={payNow ? 'now' : 'later'} onChange={(v) => setPayNow(v === 'now')} label={t('mobile.m5.payment')} options={[{ value: 'now', label: t('mobile.m5.payNow') }, { value: 'later', label: t('mobile.m5.payLater') }]} />
                ) : <p className="rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body">{t('mobile.m5.payAfterSync')}</p>}
              </div>
            ),
          } : {
            key: 'pay', title: t('mobile.m5.payment'), valid: !!signature, content: (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-ctl bg-brand-soft px-4 py-3"><Banknote className="h-5 w-5 text-brand" /><span className="text-[15px] text-ink">{t('mobile.m5.cashHint', { amount: f.money({ amountMinor: lines.reduce((s, l) => s + Math.round(kgOf(l) * unit) - deduct(l), 0), currency }) })}</span></div>
                <MField label={t('mobile.m5.farmerSigns')} required group><SignaturePad value={signature} onChange={setSignature} big /></MField>
              </div>
            ),
          },
          {
            key: 'review', title: t('mobile.reg.review'), valid: true, content: (
              <div className="space-y-4">
                <div className="rounded-card bg-brand-soft p-4">
                  <div className="font-mono text-[13px] text-brand">{r?.number}</div>
                  <div className="tnum text-[26px] font-semibold text-ink">{f.money({ amountMinor: lines.reduce((s, l) => s + Math.round(kgOf(l) * unit), 0), currency })}</div>
                  <div className="text-[14px] text-body">{f.kg(totalKg)} · {t('buy.bagsN', { count: codes.length })}{mode === 'consolidated' ? ` · ${t('buy.consolidated')}` : ''}</div>
                </div>
                <MList>
                  {lines.map((l) => <li key={l.farmerId}><ListRow title={fullName(byId(l.farmerId))} subtitle={direct ? `${formatPhone(l.wallet.number)} · ${l.wallet.name}` : t('mobile.m5.cash')} right={<span className="tnum text-[14px] text-ink">{f.kg(kgOf(l))}</span>} /></li>)}
                </MList>
                <div className="flex flex-wrap gap-1.5">
                  {codes.map((c) => <Badge key={c} tone="neutral" className="font-mono">{c}</Badge>)}
                  {voice && <Badge tone="info">{t('mobile.m5.voiceNote')}</Badge>}
                  {direct ? <Badge tone="info"><CreditCard className="mr-1 h-3 w-3" />{t('buy.sourcingName.DIRECT_PAYMENT')}</Badge> : signature && <Badge tone="success">{t('form.media.signed')}</Badge>}
                </div>
                <p className="flex items-start gap-2 text-[13px] text-muted"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />{t('mobile.m5.smsNote')}</p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
