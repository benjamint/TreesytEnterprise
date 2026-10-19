import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Plus } from 'lucide-react';
import type { FeeTier, PaymentProvider } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PROVIDER_CATALOG } from '@/data/catalogs/providers';
import { calculateFees, toMinor } from '@/engines/money';
import { latency, uid } from '@/lib/utils';
import { usePlatformStore } from '@/stores/platformStore';
import { useCurrentOrg, useFormat, useLang, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { AddRow, EditTable, Grid, Mini, MoneyInput, NumberInput, RowDelete, Rows, Section, Select, SettingsFrame, SwitchRow, TextInput } from '../kit';

const NO_LIMIT = 1e12;
const PAY_KEYS = ['paymentProviders', 'feeTiers', 'taxPct', 'extraCharges', 'makerChecker', 'makerCheckerMinMinor', 'bulkBatchSize'] as const;

/** Settings → Payments (PRD A4, E1): providers, credentials, limits, fee tiers, taxes, extra charges, maker/checker. */
export function PaymentsPage() {
  const d = useSettingsDraft('payments', PAY_KEYS);
  const { paymentProviders: providers, feeTiers, taxPct, extraCharges, makerChecker, makerCheckerMinMinor, bulkBatchSize } = d.value;
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const [reveal, setReveal] = useState<string | null>(null);
  const setP = (id: string, patch: Partial<PaymentProvider>) => d.set('paymentProviders', providers.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const setTier = (id: string, patch: Partial<FeeTier>) => d.set('feeTiers', feeTiers.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const available = PROVIDER_CATALOG.filter((p) => (org.countries.includes(p.country) || p.country === '*') && !providers.some((x) => x.id === p.id));
  const mobile = providers.filter((p) => p.kind === 'MOBILE_MONEY');
  const [calc, setCalc] = useState({ provider: mobile[0]?.id ?? '', amount: toMinor(org.currency === 'XOF' ? 150_000 : 1_500, org.currency) });
  const fee = calculateFees({ amountMinor: calc.amount, currency: org.currency }, feeTiers, calc.provider, { taxPct, extras: extraCharges.filter((x) => x.enabled && x.payer === 'company').map((x) => ({ amountMinor: x.amountMinor, currency: org.currency })) });
  const name = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  const errors: string[] = [];
  if (!providers.some((p) => p.enabled)) errors.push(t('set.pay.errNone'));
  if (feeTiers.some((x) => x.minAmount > x.maxAmount)) errors.push(t('set.pay.errTier'));

  return (
    <SettingsFrame page="payments" {...bind(d)} errors={errors}>
      <Section
        title={t('set.pay.providers')}
        description={t('set.pay.providersHint')}
        actions={
          available.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="secondary" size="sm"><Plus /> {t('set.pay.addProvider')}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {available.map((p) => <DropdownMenuItem key={p.id} onSelect={() => d.set('paymentProviders', [...providers, { ...p, share: 0 }])}>{p.name}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      >
        <div className="space-y-3">
          {providers.map((p) => {
            const cred = p.credentials ?? { merchantId: '', apiKey: '' };
            const limits = p.limits ?? { perPaymentMinor: 0, dailyMinor: 0 };
            return (
              <div key={p.id} className="rounded-card border border-line p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Switch checked={p.enabled} onCheckedChange={(enabled) => setP(p.id, { enabled })} aria-label={p.name} />
                  <span className="font-medium text-ink">{p.name}</span>
                  <Badge tone="neutral">{t(`set.pay.kind.${p.kind}`)}</Badge>
                  {p.prefixes.length > 0 && <span className="font-mono text-[12px] text-muted">{p.prefixes.join(' ')}</span>}
                  <div className="ml-auto"><RowDelete label={t('set.remove')} onClick={() => d.set('paymentProviders', providers.filter((x) => x.id !== p.id))} /></div>
                </div>
                {p.enabled && (
                  <Grid cols={4} className="mt-4">
                    <Mini label={t('set.pay.wallet')}><TextInput value={p.walletName} onChange={(walletName) => setP(p.id, { walletName })} /></Mini>
                    {p.kind !== 'CASH' && (
                      <>
                        <Mini label={t('set.pay.merchant')}><TextInput value={cred.merchantId} onChange={(merchantId) => setP(p.id, { credentials: { ...cred, merchantId } })} className="font-mono" /></Mini>
                        <Mini label={t('set.pay.apiKey')}>
                          <div className="relative">
                            <TextInput type={reveal === p.id ? 'text' : 'password'} value={cred.apiKey} onChange={(apiKey) => setP(p.id, { credentials: { ...cred, apiKey } })} className="pr-10 font-mono" autoComplete="off" />
                            <button type="button" onClick={() => setReveal(reveal === p.id ? null : p.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink" aria-label={reveal === p.id ? t('auth.hidePassword') : t('auth.showPassword')}>
                              {reveal === p.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </Mini>
                      </>
                    )}
                    <Mini label={t('set.pay.perPayment')}><MoneyInput minor={limits.perPaymentMinor} currency={org.currency} onChange={(perPaymentMinor) => setP(p.id, { limits: { ...limits, perPaymentMinor } })} /></Mini>
                    <Mini label={t('set.pay.daily')}><MoneyInput minor={limits.dailyMinor} currency={org.currency} onChange={(dailyMinor) => setP(p.id, { limits: { ...limits, dailyMinor } })} /></Mini>
                    {p.kind === 'MOBILE_MONEY' && (
                      <Mini label={t('set.pay.withdrawal')}>
                        <div className="flex gap-2">
                          <Select value={p.withdrawal?.type ?? 'percent'} onChange={(type) => setP(p.id, { withdrawal: { type, value: p.withdrawal?.value ?? 0 } })} options={(['percent', 'flat'] as const).map((v) => ({ value: v, label: t(`set.pay.typeName.${v}`) }))} aria-label={t('set.pay.withdrawalType')} className="w-32" />
                          {(p.withdrawal?.type ?? 'percent') === 'percent'
                            ? <NumberInput value={p.withdrawal?.value ?? 0} step={0.05} min={0} max={20} suffix="%" onChange={(value) => setP(p.id, { withdrawal: { type: 'percent', value } })} aria-label={t('set.pay.withdrawal')} />
                            : <MoneyInput minor={p.withdrawal?.value ?? 0} currency={org.currency} onChange={(value) => setP(p.id, { withdrawal: { type: 'flat', value } })} aria-label={t('set.pay.withdrawal')} />}
                        </div>
                      </Mini>
                    )}
                  </Grid>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] text-muted">{t('set.pay.credentialsNote')}</p>
      </Section>

      <Section title={t('set.pay.fees')} description={t('set.pay.feesHint')}>
        <EditTable head={[t('set.pay.provider'), t('set.pay.from'), t('set.pay.to'), t('set.pay.type'), t('set.pay.value'), t('set.pay.cap'), t('set.pay.payer'), '']}>
          {feeTiers.map((x) => (
            <tr key={x.id}>
              <td className="w-44"><Select value={x.providerId} onChange={(providerId) => setTier(x.id, { providerId })} options={mobile.map((p) => ({ value: p.id, label: p.name }))} aria-label={t('set.pay.provider')} /></td>
              <td className="w-36"><MoneyInput minor={x.minAmount} currency={org.currency} onChange={(minAmount) => setTier(x.id, { minAmount })} aria-label={t('set.pay.from')} /></td>
              <td className="w-36">
                {x.maxAmount >= NO_LIMIT ? (
                  <Button variant="ghost" size="sm" onClick={() => setTier(x.id, { maxAmount: x.minAmount + toMinor(10_000, org.currency) })}>{t('set.pay.noLimit')}</Button>
                ) : (
                  <MoneyInput minor={x.maxAmount} currency={org.currency} onChange={(maxAmount) => setTier(x.id, { maxAmount })} aria-label={t('set.pay.to')} />
                )}
              </td>
              <td className="w-32"><Select value={x.type} onChange={(type) => setTier(x.id, { type })} options={(['percent', 'flat'] as const).map((v) => ({ value: v, label: t(`set.pay.typeName.${v}`) }))} aria-label={t('set.pay.type')} /></td>
              <td className="w-32">{x.type === 'percent' ? <NumberInput value={x.value} step={0.05} suffix="%" onChange={(value) => setTier(x.id, { value })} aria-label={t('set.pay.value')} /> : <MoneyInput minor={x.value} currency={org.currency} onChange={(value) => setTier(x.id, { value })} aria-label={t('set.pay.value')} />}</td>
              <td className="w-36">{x.type === 'percent' ? <MoneyInput minor={x.cap ?? 0} currency={org.currency} onChange={(cap) => setTier(x.id, { cap: cap || undefined })} aria-label={t('set.pay.cap')} /> : <span className="text-muted">—</span>}</td>
              <td className="w-36"><Select value={x.payer} onChange={(payer) => setTier(x.id, { payer })} options={(['company', 'payee'] as const).map((v) => ({ value: v, label: t(`set.pay.payerName.${v}`) }))} aria-label={t('set.pay.payer')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => d.set('feeTiers', feeTiers.filter((y) => y.id !== x.id))} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <AddRow onClick={() => d.set('feeTiers', [...feeTiers, { id: uid('tier'), providerId: mobile[0]?.id ?? '', minAmount: 0, maxAmount: NO_LIMIT, type: 'percent', value: 1, payer: 'company' }])}>{t('set.pay.addTier')}</AddRow>
          <Mini label={t('set.pay.tax')} className="w-40"><NumberInput value={taxPct} min={0} step={0.5} suffix="%" onChange={(v) => d.set('taxPct', v)} /></Mini>
        </div>

        <div className="mt-5 rounded-ctl border border-line bg-canvas p-4">
          <div className="eyebrow mb-3">{t('set.pay.calculator')}</div>
          <div className="flex flex-wrap items-end gap-3">
            <Mini label={t('set.pay.provider')} className="w-48"><Select value={calc.provider} onChange={(provider) => setCalc({ ...calc, provider })} options={mobile.map((p) => ({ value: p.id, label: p.name }))} /></Mini>
            <Mini label={t('set.pay.amount')} className="w-48"><MoneyInput minor={calc.amount} currency={org.currency} onChange={(amount) => setCalc({ ...calc, amount })} /></Mini>
            <dl className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4" aria-live="polite">
              <div><dt className="text-muted">{t('set.pay.fee')}</dt><dd className="tnum font-medium text-ink">{f.money(fee.fee)}</dd></div>
              <div><dt className="text-muted">{t('set.pay.taxAmt')}</dt><dd className="tnum font-medium text-ink">{f.money(fee.tax)}</dd></div>
              <div><dt className="text-muted">{t('set.pay.companyPays')}</dt><dd className="tnum font-semibold text-ink">{f.money(fee.total)}</dd></div>
              <div><dt className="text-muted">{t('set.pay.payeeGets', { provider: name(calc.provider) })}</dt><dd className="tnum font-semibold text-ink">{f.money(fee.received)}</dd></div>
            </dl>
          </div>
        </div>
      </Section>

      <Section title={t('set.pay.extras')} description={t('set.pay.extrasHint')}>
        <EditTable head={[t('set.pay.charge'), t('set.pay.amount'), t('set.pay.payer'), t('set.enabled'), '']} className="[&_table]:min-w-0">
          {extraCharges.map((x) => (
            <tr key={x.id}>
              <td><TextInput value={x.name} onChange={(name) => d.set('extraCharges', extraCharges.map((y) => (y.id === x.id ? { ...y, name } : y)))} aria-label={t('set.pay.charge')} /></td>
              <td className="w-44"><MoneyInput minor={x.amountMinor} currency={org.currency} onChange={(amountMinor) => d.set('extraCharges', extraCharges.map((y) => (y.id === x.id ? { ...y, amountMinor } : y)))} aria-label={t('set.pay.amount')} /></td>
              <td className="w-36"><Select value={x.payer} onChange={(payer) => d.set('extraCharges', extraCharges.map((y) => (y.id === x.id ? { ...y, payer } : y)))} options={(['company', 'payee'] as const).map((v) => ({ value: v, label: t(`set.pay.payerName.${v}`) }))} aria-label={t('set.pay.payer')} /></td>
              <td className="w-20"><Switch checked={x.enabled} onCheckedChange={(enabled) => d.set('extraCharges', extraCharges.map((y) => (y.id === x.id ? { ...y, enabled } : y)))} aria-label={t('set.enabled')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => d.set('extraCharges', extraCharges.filter((y) => y.id !== x.id))} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => d.set('extraCharges', [...extraCharges, { id: uid('xc'), name: '', amountMinor: 0, payer: 'company', enabled: true }])}>{t('set.pay.addCharge')}</AddRow></div>
      </Section>

      <Section title={t('set.pay.controls')}>
        <Rows>
          <SwitchRow label={t('set.pay.makerChecker')} description={t('set.pay.makerCheckerHint')} checked={makerChecker} onChange={(v) => d.set('makerChecker', v)} />
        </Rows>
        {makerChecker && <Mini label={t('set.pay.checkerFrom')} className="mt-5 w-56"><MoneyInput minor={makerCheckerMinMinor ?? 0} currency={org.currency} onChange={(v) => d.set('makerCheckerMinMinor', v)} /></Mini>}
        <Mini label={t('set.pay.batch')} className="mt-5 w-56"><NumberInput value={bulkBatchSize} min={1} max={500} onChange={(v) => d.set('bulkBatchSize', Math.round(v))} /></Mini>
      </Section>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- SMS & email

const MSG_KEYS = ['messaging', 'mobile'] as const;

export function SmsEmailPage() {
  const d = useSettingsDraft('smsEmail', MSG_KEYS);
  const { messaging: m, mobile } = d.value;
  const countries = usePlatformStore((s) => s.countries);
  const org = useCurrentOrg();
  const lang = useLang();
  const { t } = useT();
  const [verifying, setVerifying] = useState(false);
  const set = (patch: Partial<typeof m>) => d.set('messaging', { ...m, ...patch });
  const errors: string[] = [];
  if (m.sms.some((s) => !/^[A-Za-z0-9 ]{3,11}$/.test(s.senderId))) errors.push(t('set.msg.errSender'));
  if (m.emailSender && !m.emailSender.endsWith(`@${m.emailDomain}`)) errors.push(t('set.msg.errSenderDomain', { domain: m.emailDomain }));

  const verify = async () => {
    setVerifying(true);
    await latency(900, 1400);
    set({ domainVerified: true });
    setVerifying(false);
  };

  return (
    <SettingsFrame page="smsEmail" {...bind(d)} errors={errors}>
      <Section title={t('set.msg.sms')} description={t('set.msg.smsHint')}>
        <EditTable head={[t('set.msg.country'), t('set.msg.provider'), t('set.msg.sender'), t('set.enabled'), '']} className="[&_table]:min-w-0">
          {m.sms.map((s, i) => {
            const c = countries.find((x) => x.code === s.country);
            const setRow = (patch: Partial<typeof s>) => set({ sms: m.sms.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <tr key={i}>
                <td className="w-48"><Select value={s.country} onChange={(country) => setRow({ country, provider: countries.find((x) => x.code === country)?.smsProviders[0] ?? '' })} options={countries.filter((x) => org.countries.includes(x.code)).map((x) => ({ value: x.code, label: x.name[lang] }))} aria-label={t('set.msg.country')} /></td>
                <td className="w-48"><Select value={s.provider} onChange={(provider) => setRow({ provider })} options={(c?.smsProviders ?? [s.provider]).map((p) => ({ value: p, label: p }))} aria-label={t('set.msg.provider')} /></td>
                <td><TextInput value={s.senderId} maxLength={11} onChange={(senderId) => setRow({ senderId })} className="font-mono" aria-label={t('set.msg.sender')} /></td>
                <td className="w-20"><Switch checked={s.enabled} onCheckedChange={(enabled) => setRow({ enabled })} aria-label={t('set.enabled')} /></td>
                <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => set({ sms: m.sms.filter((_, j) => j !== i) })} /></td>
              </tr>
            );
          })}
        </EditTable>
        <div className="mt-3">
          <AddRow onClick={() => { const c = countries.find((x) => x.code === org.countries[0]); set({ sms: [...m.sms, { country: c?.code ?? 'GH', provider: c?.smsProviders[0] ?? '', senderId: org.code, enabled: true }] }); }}>{t('set.msg.addSms')}</AddRow>
        </div>
      </Section>

      <Section title={t('set.msg.otp')}>
        <Grid cols={3}>
          <Mini label={t('set.msg.otpLength')}><Select value={String(mobile.otpLength)} onChange={(v) => d.set('mobile', { ...mobile, otpLength: Number(v) })} options={['4', '5', '6', '8'].map((x) => ({ value: x, label: t('set.msg.digits', { count: Number(x) }) }))} /></Mini>
          <Mini label={t('set.msg.otpExpiry')}><NumberInput value={m.otpExpiryMinutes} min={1} max={60} suffix={t('set.min')} onChange={(v) => set({ otpExpiryMinutes: Math.round(v) })} /></Mini>
        </Grid>
        <p className="mt-3 text-[13px] text-muted">{t('set.msg.otpPreview', { code: '4827193'.slice(0, mobile.otpLength).padEnd(mobile.otpLength, '0'), company: org.name, minutes: m.otpExpiryMinutes })}</p>
      </Section>

      <Section title={t('set.msg.email')}>
        <Grid>
          <Mini label={t('set.msg.domain')}><TextInput value={m.emailDomain} onChange={(emailDomain) => set({ emailDomain, domainVerified: false })} placeholder="example.com" className="font-mono" /></Mini>
          <Mini label={t('set.msg.from')}><TextInput type="email" value={m.emailSender} onChange={(emailSender) => set({ emailSender })} className="font-mono" /></Mini>
        </Grid>
        {m.emailDomain && (
          <div className="mt-5 rounded-card border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {m.domainVerified ? (
                <span className="flex items-center gap-2 text-[14px] font-medium text-success"><CheckCircle2 className="h-4 w-4" /> {t('set.msg.verified', { domain: m.emailDomain })}</span>
              ) : (
                <span className="text-[14px] text-warning">{t('set.msg.notVerified', { domain: m.emailDomain })}</span>
              )}
              {!m.domainVerified && (
                <Button variant="secondary" size="sm" onClick={verify} disabled={verifying}>{verifying ? <Loader2 className="animate-spin" /> : null} {t('set.msg.verify')}</Button>
              )}
            </div>
            {!m.domainVerified && (
              <table className="mt-3 w-full text-[12px]">
                <tbody className="font-mono">
                  <tr><td className="py-1 pr-3 text-muted">TXT</td><td className="pr-3">{m.emailDomain}</td><td className="break-all">{'v=spf1 include:mail.treesyt.example ~all'}</td></tr>
                  <tr><td className="py-1 pr-3 text-muted">CNAME</td><td className="pr-3">{`ts1._domainkey.${m.emailDomain}`}</td><td>{'dkim1.mail.treesyt.example'}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </Section>
    </SettingsFrame>
  );
}
