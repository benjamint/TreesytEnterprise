import { useMemo, type ChangeEvent } from 'react';
import { AlertTriangle, ArrowUpRight, ImageUp, Lock, Mail, Receipt, Radar } from 'lucide-react';
import type { Lang, ModuleKey, TermKey } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/shared/Field';
import { CompanyLogo } from '@/components/shared/Logo';
import { comingSoon } from '@/components/shared/coming-soon';
import { APP_ROUTES } from '@/app/routes';
import { MODULES, missingDependencies } from '@/engines/permissions';
import { DEFAULT_TERMS } from '@/engines/terminology';
import { formatMoney, toMinor } from '@/engines/money';
import { previewNumber } from '@/engines/numbering';
import { planModules } from '@/data/templates/companyTemplates';
import { SUB_FEATURES } from '@/data/seed/settingsExtras';
import { TILES } from '@/mobile/flows/catalog';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCurrentOrg, useLang, useOrgSettings, useT } from '@/stores/hooks';
import { bind, useOrgDraft, useSettingsDraft } from '../draft';
import { Grid, Mini, Rows, Section, Segmented, Select, SettingsFrame, TextInput } from '../kit';

const TIMEZONES = ['Africa/Accra', 'Africa/Abidjan', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Dakar', 'Africa/Ouagadougou', 'Africa/Lome', 'Africa/Kampala', 'Africa/Addis_Ababa', 'Europe/Stockholm', 'Europe/Paris', 'Europe/London', 'UTC'];
const LANGS: Lang[] = ['en', 'fr'];

// ---------------------------------------------------------------- Company profile

const PROFILE_KEYS = [
  'name', 'legalName', 'tradingName', 'registrationNo', 'taxId', 'address', 'phone', 'email', 'website', 'countries', 'currency',
  'language', 'languages', 'timezone', 'weekStart', 'fiscalYearStart', 'code', 'locale',
] as const;

export function ProfilePage() {
  const d = useOrgDraft('profile', PROFILE_KEYS);
  const v = d.value;
  const { t } = useT();
  const lang = useLang();
  const org = useCurrentOrg();
  const orgs = usePlatformStore((s) => s.orgs);
  const countries = usePlatformStore((s) => s.countries);
  const currencies = usePlatformStore((s) => s.currencies);
  const settings = useOrgSettings();
  const sequences = useSettingsStore((s) => s.sequences[org.id]);

  const errors: string[] = [];
  if (!v.legalName.trim()) errors.push(t('set.profile.errLegal'));
  if (!/^[A-Z0-9]{2,6}$/.test(v.code)) errors.push(t('set.profile.errCode'));
  else if (orgs.some((o) => o.id !== org.id && o.code === v.code)) errors.push(t('set.profile.errCodeTaken', { code: v.code }));
  if (!v.countries.length) errors.push(t('set.profile.errCountry'));

  const setLanguage = (l: Lang) => {
    d.set('language', l);
    d.set('languages', (ls) => [...new Set([l, ...ls])]);
    d.set('locale', `${l}-${v.countries[0] ?? 'GH'}`);
  };
  const toggleCountry = (code: string, on: boolean) => {
    const next = on ? [...v.countries, code] : v.countries.filter((c) => c !== code);
    d.set('countries', next);
    d.set('locale', `${v.language}-${next[0] ?? 'GH'}`);
  };
  const pr = settings.numbering.find((p) => p.docType === 'purchaseRequest');
  const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: formatDate(new Date(2026, i, 1), 'UTC', lang, 'MMMM') }));

  return (
    <SettingsFrame page="profile" {...bind(d)} errors={errors}>
      <Section title={t('set.profile.legal')}>
        <Grid>
          <Mini label={t('set.profile.legalName')}><TextInput value={v.legalName} onChange={(x) => d.set('legalName', x)} /></Mini>
          <Mini label={t('set.profile.displayName')}><TextInput value={v.name} onChange={(x) => d.set('name', x)} /></Mini>
          <Mini label={t('set.profile.tradingName')}><TextInput value={v.tradingName ?? ''} onChange={(x) => d.set('tradingName', x)} /></Mini>
          <Mini label={t('set.profile.code')}>
            <TextInput value={v.code} onChange={(x) => d.set('code', x.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} className="font-mono uppercase" />
          </Mini>
          <Mini label={t('set.profile.registrationNo')}><TextInput value={v.registrationNo ?? ''} onChange={(x) => d.set('registrationNo', x)} /></Mini>
          <Mini label={t('set.profile.taxId')}><TextInput value={v.taxId ?? ''} onChange={(x) => d.set('taxId', x)} /></Mini>
        </Grid>
      </Section>

      <Section title={t('set.profile.contact')}>
        <Grid>
          <Mini label={t('set.profile.address')} className="md:col-span-2"><TextInput value={v.address ?? ''} onChange={(x) => d.set('address', x)} /></Mini>
          <Mini label={t('set.profile.phone')}><TextInput type="tel" value={v.phone ?? ''} onChange={(x) => d.set('phone', x)} /></Mini>
          <Mini label={t('set.profile.email')}><TextInput type="email" value={v.email ?? ''} onChange={(x) => d.set('email', x)} /></Mini>
          <Mini label={t('set.profile.website')}><TextInput type="url" value={v.website ?? ''} onChange={(x) => d.set('website', x)} /></Mini>
        </Grid>
      </Section>

      <Section title={t('set.profile.regional')} description={t('set.profile.regionalHint')}>
        <div className="mb-5">
          <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.profile.countries')}</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {countries.map((c) => (
              <Checkbox key={c.code} label={c.name[lang]} checked={v.countries.includes(c.code)} onChange={(e) => toggleCountry(c.code, e.target.checked)} />
            ))}
          </div>
        </div>
        <Grid cols={3}>
          <Mini label={t('set.profile.currency')}>
            <Select value={v.currency} onChange={(x) => d.set('currency', x)} options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
          </Mini>
          <Mini label={t('set.profile.timezone')}>
            <Select value={v.timezone} onChange={(x) => d.set('timezone', x)} options={TIMEZONES.map((z) => ({ value: z, label: z.replace('_', ' ') }))} />
          </Mini>
          <Mini label={t('set.profile.fiscalYear')}>
            <Select value={String(v.fiscalYearStart ?? 1)} onChange={(x) => d.set('fiscalYearStart', Number(x))} options={months} />
          </Mini>
          <Mini label={t('set.profile.language')}>
            <Select value={v.language} onChange={(x) => setLanguage(x as Lang)} options={LANGS.map((l) => ({ value: l, label: t(`set.lang.${l}`) }))} />
          </Mini>
          <Mini label={t('set.profile.languages')}>
            <div className="flex h-11 items-center gap-5">
              {LANGS.map((l) => (
                <Checkbox key={l} label={t(`set.lang.${l}`)} checked={v.languages.includes(l)} disabled={l === v.language} onChange={(e) => d.set('languages', e.target.checked ? [...v.languages, l] : v.languages.filter((x) => x !== l))} />
              ))}
            </div>
          </Mini>
          <Mini label={t('set.profile.weekStart')}>
            <Segmented
              label={t('set.profile.weekStart')}
              value={String(v.weekStart) as '0' | '1' | '6'}
              onChange={(x) => d.set('weekStart', Number(x) as 0 | 1 | 6)}
              options={[{ value: '1', label: t('set.day.1') }, { value: '0', label: t('set.day.0') }, { value: '6', label: t('set.day.6') }]}
            />
          </Mini>
        </Grid>
      </Section>

      <Section title={t('set.preview')}>
        <dl className="grid gap-4 rounded-ctl border border-line bg-canvas p-5 text-[14px] sm:grid-cols-3">
          <div><dt className="eyebrow mb-1">{t('set.profile.moneyLooks')}</dt><dd className="tnum font-medium text-ink">{formatMoney(toMinor(1_234_567.5, v.currency), v.currency, v.locale)}</dd></div>
          <div><dt className="eyebrow mb-1">{t('set.profile.dateLooks')}</dt><dd className="font-medium text-ink">{formatDate(new Date(), v.timezone, v.language, 'EEEE d MMMM yyyy, HH:mm')}</dd></div>
          <div><dt className="eyebrow mb-1">{t('set.profile.numberLooks')}</dt><dd className="font-mono font-medium text-ink">{pr ? previewNumber(pr, sequences ?? {}, { orgCode: v.code }) : '—'}</dd></div>
        </dl>
      </Section>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Branding

const BRAND_KEYS = ['branding'] as const;
const SWATCHES = ['#14583F', '#0F766E', '#1D4ED8', '#7A3E12', '#6D28D9', '#B45309', '#334155'];

export function BrandingPage() {
  const d = useOrgDraft('branding', BRAND_KEYS);
  const b = d.value.branding;
  const org = useCurrentOrg();
  const { t } = useT();
  const set = (patch: Partial<typeof b>) => d.set('branding', { ...b, ...patch });
  const errors: string[] = [];
  if (!/^#[0-9a-f]{6}$/i.test(b.primaryColor)) errors.push(t('set.branding.errColor'));
  if (b.replyTo && !/^\S+@\S+\.\S+$/.test(b.replyTo)) errors.push(t('set.branding.errReplyTo'));

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) {
      comingSoon(t('set.branding.logoTooBig'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ logoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const logo = b.logoDataUrl ? <img src={b.logoDataUrl} alt="" className="h-8 w-8 rounded-[8px] object-contain" /> : <CompanyLogo text={b.logoText} color={b.primaryColor} size={32} />;

  return (
    <SettingsFrame page="branding" {...bind(d)} errors={errors}>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-10">
          <Section title={t('set.branding.identity')}>
            <div className="mb-5 flex flex-wrap items-center gap-4">
              {b.logoDataUrl ? <img src={b.logoDataUrl} alt={t('set.branding.logo')} className="h-16 w-16 rounded-card border border-line object-contain p-1" /> : <CompanyLogo text={b.logoText} color={b.primaryColor} size={64} />}
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-ctl border border-line px-4 text-[14px] font-medium text-ink hover:border-brand/40">
                <ImageUp className="h-4 w-4" /> {t('set.branding.upload')}
                <input type="file" accept="image/png,image/svg+xml,image/jpeg" className="sr-only" onChange={onLogo} />
              </label>
              {b.logoDataUrl && <Button variant="ghost" size="sm" onClick={() => set({ logoDataUrl: undefined })}>{t('set.branding.removeLogo')}</Button>}
            </div>
            <Grid>
              <Mini label={t('set.branding.logoText')}><TextInput value={b.logoText} maxLength={3} onChange={(x) => set({ logoText: x.toUpperCase() })} /></Mini>
              <Mini label={t('set.branding.color')}>
                <div className="flex items-center gap-2">
                  <input type="color" value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} aria-label={t('set.branding.color')} className="h-11 w-12 cursor-pointer rounded-ctl border border-line bg-surface p-1" />
                  <TextInput value={b.primaryColor} onChange={(x) => set({ primaryColor: x })} className="font-mono" />
                </div>
                <div className="mt-2 flex gap-1.5">
                  {SWATCHES.map((c) => (
                    <button key={c} type="button" onClick={() => set({ primaryColor: c })} aria-label={c} className={cn('h-6 w-6 rounded-full border-2', b.primaryColor.toLowerCase() === c.toLowerCase() ? 'border-ink' : 'border-transparent')} style={{ background: c }} />
                  ))}
                </div>
              </Mini>
            </Grid>
          </Section>
          <Section title={t('set.branding.email')}>
            <Grid>
              <Mini label={t('set.branding.senderName')}><TextInput value={b.senderName} onChange={(x) => set({ senderName: x })} /></Mini>
              <Mini label={t('set.branding.replyTo')}><TextInput type="email" value={b.replyTo ?? ''} onChange={(x) => set({ replyTo: x })} /></Mini>
              <Mini label={t('set.branding.signature')}><TextInput value={b.signatureName} onChange={(x) => set({ signatureName: x })} /></Mini>
              <Mini label={t('set.branding.header')}><TextInput value={b.emailHeader ?? ''} onChange={(x) => set({ emailHeader: x })} /></Mini>
              <Mini label={t('set.branding.footer')} className="md:col-span-2"><TextInput value={b.emailFooter ?? ''} onChange={(x) => set({ emailFooter: x })} /></Mini>
              <Mini label={t('set.branding.receiptFooter')} className="md:col-span-2"><TextInput value={b.receiptFooter ?? ''} onChange={(x) => set({ receiptFooter: x })} /></Mini>
            </Grid>
          </Section>
          <Section title={t('set.branding.social')}>
            <Grid>
              {(['website', 'facebook', 'linkedin', 'x'] as const).map((k) => (
                <Mini key={k} label={t(`set.branding.socialKey.${k}`)}>
                  <TextInput type="url" value={b.social?.[k] ?? ''} onChange={(x) => set({ social: { ...b.social, [k]: x } })} />
                </Mini>
              ))}
            </Grid>
          </Section>
        </div>

        <aside className="space-y-5" aria-label={t('set.preview')}>
          <div className="eyebrow">{t('set.preview')}</div>
          <PreviewCard icon={Mail} title={t('set.branding.previewEmail')}>
            <div className="overflow-hidden rounded-ctl border border-line bg-white text-[13px] text-[#1f2a24]">
              <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: b.primaryColor }}>
                {logo}
                <span className="font-semibold">{b.emailHeader || org.name}</span>
              </div>
              <div className="space-y-2 px-4 py-4">
                <p className="text-[12px] text-[#5d6b63]">{t('set.branding.from', { name: b.senderName, email: b.replyTo || '—' })}</p>
                <p className="font-semibold">{t('set.branding.sampleSubject')}</p>
                <p>{t('set.branding.sampleBody')}</p>
                <span className="inline-block rounded-[8px] px-3 py-1.5 font-semibold text-white" style={{ background: b.primaryColor }}>{t('set.branding.sampleButton')}</span>
                <p className="pt-2">{b.signatureName}</p>
              </div>
              <div className="border-t border-[#e6ebe7] bg-[#f6f8f6] px-4 py-2.5 text-[11px] text-[#5d6b63]">{b.emailFooter || org.legalName}</div>
            </div>
          </PreviewCard>
          <PreviewCard icon={Receipt} title={t('set.branding.previewReceipt')}>
            <div className="mx-auto w-56 rounded-[6px] border border-dashed border-line bg-white px-4 py-4 font-mono text-[11px] leading-5 text-[#1f2a24]">
              <div className="text-center font-bold">{org.name.toUpperCase()}</div>
              <div className="text-center">{t('set.branding.sampleReceiptNo')}</div>
              <div className="my-2 border-t border-dashed border-[#c9d1cc]" />
              <div className="flex justify-between"><span>{t('set.branding.sampleLine')}</span><span>{formatMoney(toMinor(468, org.currency), org.currency, org.locale)}</span></div>
              <div className="my-2 border-t border-dashed border-[#c9d1cc]" />
              <div className="text-center">{b.receiptFooter || t('set.branding.receiptThanks')}</div>
            </div>
          </PreviewCard>
          <PreviewCard icon={Radar} title={t('set.branding.previewPortal')}>
            <div className="overflow-hidden rounded-ctl border border-line">
              <div className="flex items-center justify-between px-3 py-2.5 text-white" style={{ background: b.primaryColor }}>
                <span className="flex items-center gap-2 text-[13px] font-semibold">{logo} {t('set.branding.portalTitle', { company: org.name })}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 bg-canvas p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-[8px] bg-surface" style={{ borderTop: `3px solid ${b.primaryColor}` }} />
                ))}
              </div>
            </div>
          </PreviewCard>
        </aside>
      </div>
    </SettingsFrame>
  );
}

function PreviewCard({ icon: Icon, title, children }: { icon: typeof Mail; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Icon className="h-4 w-4 text-muted" /> {title}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Plan & modules

const MODULE_KEYS = ['modules', 'features'] as const;

export function ModulesPage() {
  const d = useSettingsDraft('modules', MODULE_KEYS);
  const { modules, features } = d.value;
  const org = useCurrentOrg();
  const plans = usePlatformStore((s) => s.plans);
  const plan = plans.find((p) => p.id === org.planId);
  const inPlan = useMemo(() => new Set(planModules(plan?.modules ?? ['*'])), [plan]);
  const { t } = useT();
  const missing = missingDependencies(modules);
  const errors = missing.map((m) => t('set.modules.needs', { module: t(`module.${m.module}`), needs: m.needs.map((n) => t(`module.${n}`)).join(', ') }));
  const toggle = (k: ModuleKey, on: boolean) => d.set('modules', { ...modules, [k]: on });

  return (
    <SettingsFrame page="modules" {...bind(d)} errors={errors}>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-canvas px-5 py-4">
        <div>
          <div className="eyebrow mb-1">{t('set.modules.plan')}</div>
          <div className="text-[17px] font-semibold text-ink">{plan?.name}</div>
          <p className="text-[13px] text-muted">{t('set.modules.planHint', { count: inPlan.size })}</p>
        </div>
        <Button variant="secondary" onClick={() => comingSoon()}>
          {t('set.modules.upgrade')} <ArrowUpRight />
        </Button>
      </div>

      {missing.length > 0 && (
        <div className="space-y-2">
          {missing.map((m) => (
            <div key={m.module} className="flex flex-wrap items-center justify-between gap-3 rounded-ctl border border-warning/40 bg-warning/5 px-4 py-3 text-[14px]">
              <span className="flex items-center gap-2 text-ink"><AlertTriangle className="h-4 w-4 text-warning" /> {t('set.modules.needs', { module: t(`module.${m.module}`), needs: m.needs.map((n) => t(`module.${n}`)).join(', ') })}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => d.set('modules', { ...modules, ...Object.fromEntries(m.needs.map((n) => [n, true])) })}>{t('set.modules.turnOnNeeds')}</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(m.module, false)}>{t('set.modules.turnOff', { module: t(`module.${m.module}`) })}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {MODULES.map((m) => {
          const allowed = inPlan.has(m.key);
          const on = modules[m.key];
          const pages = APP_ROUTES.filter((r) => r.module === m.key && r.nav);
          const tiles = TILES.filter((x) => x.module === m.key);
          const subs = SUB_FEATURES.filter((f) => f.module === m.key);
          return (
            <div key={m.key} className={cn('flex flex-col rounded-card border p-5 transition-colors', on ? 'border-brand/30 bg-surface' : 'border-line bg-canvas')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-ink">{t(`module.${m.key}`)}</div>
                  <p className="mt-0.5 text-[13px] text-muted">{t(`set.modules.desc.${m.key}`)}</p>
                </div>
                <Switch checked={on} disabled={m.core || !allowed} onCheckedChange={(x) => toggle(m.key, x)} aria-label={t(`module.${m.key}`)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {m.core && <Badge tone="neutral"><Lock className="h-3 w-3" /> {t('set.modules.core')}</Badge>}
                {!allowed && <Badge tone="warningOutline">{t('set.modules.notInPlan', { plan: plan?.name })}</Badge>}
                {m.dependsOn?.map((dep) => <Badge key={dep} tone="neutral">{t('set.modules.dependsOn', { module: t(`module.${dep}`) })}</Badge>)}
              </div>
              {(pages.length > 0 || tiles.length > 0) && (
                <p className="mt-3 text-[12px] text-muted">
                  {t(on ? 'set.modules.shows' : 'set.modules.hides', { pages: pages.length, tiles: tiles.length })}
                </p>
              )}
              {on && subs.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  {subs.map((f) => (
                    <label key={f.key} className="flex items-center justify-between gap-3 text-[13px] text-body">
                      {t(`set.features.${f.key}`)}
                      <Switch checked={features[f.key] ?? false} onCheckedChange={(x) => d.set('features', { ...features, [f.key]: x })} aria-label={t(`set.features.${f.key}`)} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Terminology

const TERM_KEYS: TermKey[] = ['agent', 'agents', 'supervisor', 'community', 'communities', 'farmer', 'farmers', 'farmerGroup', 'farmerGroups', 'purchaseRequest', 'purchaseRequests', 'pre', 'pres', 'ticket', 'warehouseOfficer'];
const TERMINOLOGY = ['terminology'] as const;

export function TerminologyPage() {
  const d = useSettingsDraft('terminology', TERMINOLOGY);
  const org = useCurrentOrg();
  const terms = d.value.terminology;
  const { t } = useT();
  const langs = org.languages.length ? org.languages : [org.language];
  const set = (l: Lang, k: TermKey, v: string) => {
    const forLang = { ...(terms[l] ?? {}) };
    if (v.trim()) forLang[k] = v;
    else delete forLang[k];
    d.set('terminology', { ...terms, [l]: forLang });
  };
  const word = (l: Lang, k: TermKey) => terms[l]?.[k] ?? DEFAULT_TERMS[l][k];

  return (
    <SettingsFrame page="terminology" {...bind(d)}>
      <Section title={t('set.terms.title')} description={t('set.terms.hint')}>
        <div className="overflow-x-auto rounded-ctl border border-line">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="bg-canvas text-left">
                <th className="px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.terms.term')}</th>
                {langs.map((l) => (
                  <th key={l} className="px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t(`set.lang.${l}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TERM_KEYS.map((k) => (
                <tr key={k} className="border-t border-line">
                  <td className="px-3 py-2 font-medium text-ink">{t(`set.terms.key.${k}`)}</td>
                  {langs.map((l) => (
                    <td key={l} className="px-3 py-2">
                      <TextInput value={terms[l]?.[k] ?? ''} placeholder={DEFAULT_TERMS[l][k]} onChange={(v) => set(l, k, v)} aria-label={`${t(`set.terms.key.${k}`)} (${l.toUpperCase()})`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={t('set.preview')}>
        <Rows>
          {langs.map((l) => (
            <div key={l} className="py-3 text-[14px] text-body">
              <span className="mr-2 font-mono text-[11px] font-semibold uppercase text-muted">{l}</span>
              {t('set.terms.sample', { lng: l, agent: word(l, 'agent'), community: word(l, 'community').toLocaleLowerCase(l), farmers: word(l, 'farmers').toLocaleLowerCase(l), request: word(l, 'purchaseRequest').toLocaleLowerCase(l) })}
            </div>
          ))}
        </Rows>
        <SwitchRowNote />
      </Section>
    </SettingsFrame>
  );
}

/** Terms appear everywhere: sidebar, buttons, mobile app, emails. */
function SwitchRowNote() {
  const { t } = useT();
  return <p className="mt-3 text-[13px] text-muted">{t('set.terms.everywhere')}</p>;
}

