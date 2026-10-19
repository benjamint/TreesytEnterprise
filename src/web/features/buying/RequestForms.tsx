import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseRequest, SourcingModel } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createRequest, debtCheck, listPriceFor, recordPurchases, updatePrice } from '@/services/buyingService';
import { cn } from '@/lib/utils';
import { useFarmerStore } from '@/stores/farmerStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { Field } from '@/components/shared/Field';

const selectCls = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft';
const decimalsOf = (currency: string) => (currency === 'XOF' ? 0 : 2);

/** New purchase request on the web, entered for an agent (PRD D1 Create). */
export function NewRequestSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const settings = useOrgSettings();
  const buyers = lk.agents.filter((a) => a.status === 'ACTIVE' && !['at_wh', 'at_mag'].includes(a.agentTypeId)).sort((a, b) => lk.agent(a.id).localeCompare(lk.agent(b.id)));
  const [agentId, setAgentId] = useState(buyers[0]?.id ?? '');
  const communities = lk.communities.filter((c) => c.agentIds.includes(agentId)).sort((a, b) => a.name.localeCompare(b.name));
  const [communityId, setCommunityId] = useState(communities[0]?.id ?? '');
  const commodities = settings.commodities;
  const [commodityId, setCommodityId] = useState(commodities[0]?.id ?? '');
  const commodity = commodities.find((c) => c.id === commodityId);
  const [grade, setGrade] = useState(commodity?.grades[0] ?? '');
  const units = settings.units.filter((u) => commodity?.allowedUnitIds.includes(u.id));
  const [unitId, setUnitId] = useState(commodity?.defaultUnitId ?? 'kg');
  const [volume, setVolume] = useState('');
  const [planned, setPlanned] = useState(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  const sourcingOptions: SourcingModel[] = settings.buyingRules.sourcingModels[commodityId] ?? ['CASH_ADVANCE', 'DIRECT_PAYMENT'];
  const [sourcing, setSourcing] = useState<SourcingModel>(sourcingOptions[0] ?? 'CASH_ADVANCE');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const list = communityId && commodityId ? listPriceFor(orgId, commodityId, communityId, grade) : undefined;
  const currency = list?.price.currency ?? f.org.currency;
  const dec = decimalsOf(currency);
  const unit = settings.units.find((u) => u.id === unitId);
  const pack = settings.packaging.find((p) => p.commodityId === commodityId);
  // Prices are per kg; other units convert through their factor (bags through the packaging profile).
  const factor = unit?.kind === 'mass' ? unit.toBase : unit?.kind === 'count' && pack ? Math.round((pack.minKg + pack.maxKg) / 2) : 1;
  const listPerUnit = list ? list.price.amountMinor * factor : 0;
  const [price, setPrice] = useState<string | null>(null);
  const priceStr = price ?? (listPerUnit ? String(listPerUnit / 10 ** dec) : '');
  const priceMinor = Math.round(Number(priceStr || 0) * 10 ** dec);
  const tolerance = list?.tolerancePct ?? 10;
  const variance = listPerUnit ? ((priceMinor - listPerUnit) / listPerUnit) * 100 : 0;
  const beyond = Math.abs(variance) > tolerance;
  const needReason = beyond && settings.buyingRules.priceOverrideReasonRequired;
  const vol = Number(volume || 0);
  const kg = vol * factor;
  const errors = { volume: !(vol > 0), price: !(priceMinor > 0), reason: needReason && !reason.trim(), community: !communityId, date: !planned };
  const invalid = Object.values(errors).some(Boolean);

  const save = () => {
    setTried(true);
    if (invalid) return;
    const r = createRequest({
      orgId, agentId, communityId, commodityId, grade: grade || undefined, unitId: 'kg', volume: Math.round(kg * 10) / 10, plannedDate: planned,
      unitPriceMinor: Math.round(priceMinor / factor), sourcingModel: sourcing, notes: notes.trim() || undefined, overrideReason: beyond ? reason.trim() : undefined, actorId: userId ?? 'system',
    });
    toast.success(t('buy.toast.created', { number: r.number }), { description: t('buy.toast.createdHint') });
    onClose(r.id);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('buy.newRequest')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={terms.agent}>
              <select className={selectCls} value={agentId} aria-label={terms.agent} onChange={(e) => { setAgentId(e.target.value); setCommunityId(lk.communities.find((c) => c.agentIds.includes(e.target.value))?.id ?? ''); setPrice(null); }}>
                {buyers.map((a) => <option key={a.id} value={a.id}>{lk.agent(a.id)}</option>)}
              </select>
            </Field>
            <Field label={terms.community} error={tried && errors.community ? t('buy.err.community') : undefined}>
              <select className={selectCls} value={communityId} aria-label={terms.community} onChange={(e) => { setCommunityId(e.target.value); setPrice(null); }}>
                {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={t('col.commodity')}>
              <select className={selectCls} value={commodityId} aria-label={t('col.commodity')} onChange={(e) => { const c = commodities.find((x) => x.id === e.target.value); setCommodityId(e.target.value); setGrade(c?.grades[0] ?? ''); setUnitId(c?.defaultUnitId ?? 'kg'); setSourcing((settings.buyingRules.sourcingModels[e.target.value] ?? ['CASH_ADVANCE'])[0]!); setPrice(null); }}>
                {commodities.map((c) => <option key={c.id} value={c.id}>{lk.commodity(c.id)}</option>)}
              </select>
            </Field>
            <Field label={t('buy.grade')}>
              <select className={selectCls} value={grade} aria-label={t('buy.grade')} onChange={(e) => { setGrade(e.target.value); setPrice(null); }} disabled={!commodity?.grades.length}>
                {(commodity?.grades ?? []).map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label={t('buy.unit')}>
              <select className={selectCls} value={unitId} aria-label={t('buy.unit')} onChange={(e) => { setUnitId(e.target.value); setPrice(null); }}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </select>
            </Field>
            <Field label={t('col.volume')} error={tried && errors.volume ? t('buy.err.volume') : undefined}>
              <Input compact type="number" min={0} value={volume} onChange={(e) => setVolume(e.target.value)} aria-label={t('col.volume')} />
            </Field>
            <Field label={t('buy.plannedDate')}>
              <Input compact type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} aria-label={t('buy.plannedDate')} />
            </Field>
            <Field label={t('buy.unitPriceIn', { currency, unit: unit?.code ?? 'kg' })} error={tried && errors.price ? t('buy.err.price') : undefined}>
              <Input compact type="number" min={0} step={dec ? '0.01' : '5'} value={priceStr} onChange={(e) => setPrice(e.target.value)} aria-label={t('buy.unitPriceIn', { currency, unit: unit?.code ?? 'kg' })} />
            </Field>
          </div>
          <div className={cn('rounded-ctl border px-4 py-3 text-[14px]', beyond ? 'border-warning/40 bg-warning/5' : 'border-line bg-canvas/60')}>
            {list ? (
              <>
                <div className="text-ink">{t('buy.listHint', { price: f.money({ amountMinor: listPerUnit, currency }), unit: unit?.code ?? 'kg', zone: settings.zones.find((z) => z.id === list.zoneId)?.name ?? '', pct: tolerance })}</div>
                {priceMinor > 0 && <div className={cn('mt-1 text-[13px]', beyond ? 'text-warning' : 'text-muted')}>{beyond && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}{t(beyond ? 'buy.beyondTolerance' : 'buy.withinTolerance', { pct: f.number(variance, { maximumFractionDigits: 1 }) })}</div>}
              </>
            ) : <span className="text-muted">{t('buy.noListPrice')}</span>}
          </div>
          {beyond && (
            <Field label={t('buy.overrideReason')} error={tried && errors.reason ? t('buy.err.reason') : undefined}>
              <Input compact value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('buy.overrideReason')} placeholder={t('buy.overridePlaceholder')} />
            </Field>
          )}
          <Field label={t('buy.sourcing')}>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('buy.sourcing')}>
              {sourcingOptions.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={sourcing === s} onClick={() => setSourcing(s)} className={cn('rounded-ctl border p-3 text-left transition-colors', sourcing === s ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-brand/40')}>
                  <div className="text-[14px] font-medium text-ink">{t(`buy.sourcingName.${s}`)}</div>
                  <div className="text-[12px] text-muted">{t(`buy.sourcingHint.${s}`)}</div>
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('buy.notes')}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-ctl border border-line bg-surface p-3 text-[14px] text-ink" aria-label={t('buy.notes')} />
          </Field>
          <div className="rounded-ctl bg-canvas px-4 py-3">
            <div className="flex items-center justify-between text-[14px]"><span className="text-muted">{t('col.total')}</span><span className="tnum text-[20px] font-semibold text-ink">{f.money({ amountMinor: Math.round(priceMinor * vol), currency })}</span></div>
            {factor !== 1 && vol > 0 && <div className="mt-1 text-[12px] text-muted">{t('buy.savedAsKg', { kg: f.kg(kg) })}</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button onClick={save}>{t('buy.submit')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Update price (PRD D1): above the list price the request goes back for approval. */
export function UpdatePriceDialog({ request: r, onClose }: { request: PurchaseRequest; onClose: () => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const dec = decimalsOf(r.unitPrice.currency);
  const [price, setPrice] = useState(String(r.unitPrice.amountMinor / 10 ** dec));
  const [reason, setReason] = useState('');
  const minor = Math.round(Number(price || 0) * 10 ** dec);
  const above = minor > r.listPrice.amountMinor && minor > r.unitPrice.amountMinor;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('buy.updatePriceTitle', { number: r.number })}</DialogTitle>
          <DialogDescription>{t('buy.updatePriceHint', { list: f.money(r.listPrice) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t('buy.unitPriceIn', { currency: r.unitPrice.currency, unit: 'kg' })}><Input compact type="number" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={t('col.unitPrice')} autoFocus /></Field>
          <Field label={t('dashboard.reason')}><Input compact value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('dashboard.reason')} /></Field>
          <p className={cn('text-[13px]', above ? 'text-warning' : 'text-muted')}>{t(above ? 'buy.reapprovalNeeded' : 'buy.noReapproval', { total: f.money({ amountMinor: minor * r.volume, currency: r.total.currency }) })}</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!minor || !reason.trim() || minor === r.unitPrice.amountMinor} onClick={() => {
            const res = updatePrice(r.id, minor, reason.trim(), userId ?? 'system');
            toast.success(t(res === 'reapproval' ? 'buy.toast.priceReapproval' : 'buy.toast.priceUpdated', { number: r.number }));
            onClose();
          }}>{t('buy.updatePrice')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Back-office purchase entry under a request (PRD D2), with the debt check per farmer. */
export function RecordPurchaseSheet({ request: r, onClose }: { request: PurchaseRequest; onClose: () => void }) {
  const { userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const pool = useMemo(() => farmers.filter((x) => x.communityId === r.communityId).sort((a, b) => a.firstName.localeCompare(b.firstName)), [farmers, r.communityId]);
  const [lines, setLines] = useState<{ farmerId: string; kg: string }[]>([{ farmerId: '', kg: '' }]);
  const pack = settings.packaging.find((p) => p.commodityId === r.commodityId);
  const total = lines.reduce((s, l) => s + Number(l.kg || 0), 0);
  const value = Math.round(total * r.unitPrice.amountMinor);
  const debts = lines.map((l) => (l.farmerId ? debtCheck(r.orgId, l.farmerId) : null));
  const ok = lines.every((l, i) => l.farmerId && Number(l.kg) > 0 && !debts[i]?.blocked);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5">
          <SheetTitle className="text-xl font-semibold text-ink">{t('buy.recordPurchase')}</SheetTitle>
          <p className="mt-1 text-[14px] text-muted">{t('buy.recordPurchaseHint', { number: r.number, price: f.money(r.unitPrice) })}</p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {lines.map((l, i) => {
            const d = debts[i];
            return (
              <div key={i} className="rounded-ctl border border-line p-3">
                <div className="flex gap-2">
                  <select className={cn(selectCls, 'flex-1')} value={l.farmerId} aria-label={terms.farmer} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, farmerId: e.target.value } : x)))}>
                    <option value="">{t('buy.pickFarmer', { farmer: terms.farmer.toLocaleLowerCase() })}</option>
                    {pool.map((x) => <option key={x.id} value={x.id}>{`${x.firstName} ${x.lastName} · ${x.farmerCode}`}</option>)}
                  </select>
                  <Input compact type="number" min={0} className="w-28" value={l.kg} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)))} placeholder={t('buy.kgShort')} aria-label={t('buy.weightKg')} />
                  <Button variant="ghost" size="icon" aria-label={t('set.remove')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
                {d && d.balance > 0 && (
                  <p className={cn('mt-2 flex items-start gap-1.5 text-[13px]', d.blocked ? 'text-danger' : 'text-warning')} role="status">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t(`buy.debt.${d.policy}`, { amount: f.money({ amountMinor: d.balance, currency: r.total.currency }), deduct: f.money({ amountMinor: Math.min(d.balance, Math.round(Number(l.kg || 0) * r.unitPrice.amountMinor)), currency: r.total.currency }) })}
                  </p>
                )}
              </div>
            );
          })}
          <Button variant="secondary" size="sm" onClick={() => setLines([...lines, { farmerId: '', kg: '' }])}><Plus /> {t('buy.addFarmer', { farmer: terms.farmer.toLocaleLowerCase() })}</Button>
          <div className="rounded-ctl bg-canvas px-4 py-3 text-[14px]">
            <div className="flex justify-between"><span className="text-muted">{t('buy.bought')}</span><span className="tnum text-ink">{f.kg(total)}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t('buy.value')}</span><span className="tnum font-semibold text-ink">{f.money({ amountMinor: value, currency: r.total.currency })}</span></div>
            {pack && <div className="mt-1 text-[12px] text-muted">{t('buy.bagHint', { min: pack.minKg, max: pack.maxKg, count: Math.ceil(total / Math.round((pack.minKg + pack.maxKg) / 2)) })}</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!ok} onClick={() => {
            const res = recordPurchases(r.id, lines.map((l) => ({ farmerId: l.farmerId, quantity: Number(l.kg) })), userId ?? 'system', 'WEB');
            toast.success(t('buy.toast.recorded', { count: res.purchases.length, number: r.number }));
            onClose();
          }}>{t('buy.save')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
