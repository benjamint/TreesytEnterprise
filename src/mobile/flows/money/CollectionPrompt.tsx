import { useMemo, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { answerCollection } from '@/services/paymentService';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActor, useFormat, useOrgSettings, useT } from '@/stores/hooks';

/**
 * The mobile-money approval prompt (PRD E2): when the office requests a collection from this user's
 * wallet, the phone shows the provider's prompt; entering the PIN approves it.
 */
export function CollectionPrompt() {
  const { userId, orgId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const all = usePaymentStore((s) => s.collections);
  const pending = useMemo(() => all.find((c) => c.orgId === orgId && c.payer.userId === userId && c.status === 'PENDING'), [all, orgId, userId]);
  const [pin, setPin] = useState('');
  if (!pending) return null;
  const provider = settings.paymentProviders.find((p) => p.id === pending.providerId)?.name ?? '';
  const answer = (ok: boolean) => { answerCollection(pending.id, ok, userId ?? 'system'); setPin(''); };
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-ink/40" role="dialog" aria-modal="true" aria-labelledby="col-title">
      <div className="w-full rounded-t-[28px] bg-surface p-6 pb-8 shadow-soft">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-label"><Smartphone className="h-4 w-4" aria-hidden="true" />{provider}</div>
        <h2 id="col-title" className="text-[20px] font-semibold text-ink">{t('mobile.collection.title', { amount: f.money(pending.amount) })}</h2>
        <p className="mt-1 text-[15px] text-body">{t('mobile.collection.body', { company: f.org.name, reason: pending.reason, reference: pending.reference })}</p>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-label">{t('mobile.collection.pin')}</span>
          <input inputMode="numeric" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="h-14 w-full rounded-ctl border border-line bg-surface px-4 text-center font-mono text-[24px] tracking-[0.5em] text-ink" aria-label={t('mobile.collection.pin')} autoFocus />
        </label>
        <p className="mt-1.5 text-[12px] text-muted">{t('mobile.collection.pinHint')}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button size="lg" variant="secondary" onClick={() => answer(false)}>{t('mobile.collection.decline')}</Button>
          <Button size="lg" disabled={pin.length < 4} onClick={() => answer(true)}>{t('mobile.collection.approve')}</Button>
        </div>
      </div>
    </div>
  );
}
