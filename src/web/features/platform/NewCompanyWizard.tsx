import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ModuleKey, OrgType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox, Field, SelectField, TextAreaField, TextField } from '@/components/shared/Field';
import { Flag } from '@/components/shared/Flag';
import { StepperHeader, StepTitle } from '@/components/shared/StepperWizard';
import { MODULES, missingDependencies } from '@/engines/permissions';
import { formatMoney, toMinor } from '@/engines/money';
import { COUNTRIES, CURRENCIES } from '@/data/catalogs/countries';
import { COMMODITY_LIBRARY, TEMPLATE_COMMODITIES, TEMPLATE_KEYS, countryDefaults, emptyDraft, planModules, type CompanyDraft, type TemplateKey } from '@/data/templates/companyTemplates';
import { draftCompany, type DraftNote } from '@/services/aiService';
import { createCompany } from '@/services/companyService';
import { cn } from '@/lib/utils';
import { usePlatformStore } from '@/stores/platformStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useLang, useT } from '@/stores/hooks';
import i18n from '@/i18n';

const STEPS = ['describe', 'basics', 'plan', 'template', 'commodities', 'approvals', 'admins', 'review'] as const;
const CORE: ModuleKey[] = ['dashboard', 'reports', 'notifications', 'system'];
const TYPES: OrgType[] = ['SUPPLIER', 'BUYER', 'BOTH', 'PARTNER'];

const basicsSchema = z.object({ name: z.string().trim().min(2), legalName: z.string().trim().min(2), countries: z.array(z.string()).min(1) });
const adminsSchema = z.array(z.object({ name: z.string().trim().min(2), email: z.string().trim().email() })).min(1);

/** Add company wizard (PRD A3): describe (AI draft) → basics → plan & modules → template → commodities → approvals → admins → review. */
export function NewCompanyWizard() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<CompanyDraft>(() => {
    const e = emptyDraft();
    return { ...e, modules: planModules(usePlatformStore.getState().plans.find((p) => p.id === e.planId)!.modules) };
  });
  const [notes, setNotes] = useState<DraftNote[] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ orgId: string; invites: number } | null>(null);
  const plans = usePlatformStore((s) => s.plans);
  const userId = useSessionStore((s) => s.userId);
  const switchOrg = useSessionStore((s) => s.switchOrg);
  const navigate = useNavigate();
  const lang = useLang();
  const { t } = useT();
  const plan = plans.find((p) => p.id === d.planId)!;
  const inPlan = useMemo(() => new Set(planModules(plan.modules)), [plan]);
  const set = (patch: Partial<CompanyDraft>) => setD((x) => ({ ...x, ...patch }));

  const runDraft = async () => {
    setDrafting(true);
    const res = await draftCompany(d.description);
    setDrafting(false);
    const nextPlan = plans.find((p) => p.id === (res.draft.planId ?? d.planId))!;
    const allowed = new Set(planModules(nextPlan.modules));
    setD((x) => ({
      ...x,
      ...res.draft,
      modules: (res.draft.modules ?? x.modules).filter((m) => allowed.has(m)),
      admins: res.draft.admins?.length ? res.draft.admins : x.admins,
    }));
    setNotes(res.notes);
  };

  const validate = (): string | null => {
    const k = STEPS[step];
    if (k === 'basics' && !basicsSchema.safeParse(d).success) return t('wizard.err.basics');
    if (k === 'admins' && !adminsSchema.safeParse(d.admins).success) return t('wizard.err.admins');
    if (k === 'approvals' && d.approvals === 'threeThreshold' && !(d.thresholdMajor > 0)) return t('wizard.err.threshold');
    return null;
  };
  const next = () => {
    const e = validate();
    setError(e);
    if (!e) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const create = () => {
    const { org, invites } = createCompany(d, userId!, 'WIZARD');
    setCreated({ orgId: org.id, invites: invites.length });
    toast.success(t('wizard.created', { company: org.name }));
  };

  if (created) {
    const org = usePlatformStore.getState().orgs.find((o) => o.id === created.orgId)!;
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircle2 className="h-8 w-8" aria-hidden="true" /></span>
        <h1 className="text-[26px] leading-tight tracking-[-0.02em]">{t('wizard.doneTitle', { company: org.name })}</h1>
        <p className="mt-3 text-[16px] text-muted">{t('wizard.doneBody', { count: created.invites })}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="secondary" size="lg" onClick={() => navigate(`/app/platform/companies/${org.id}`)}>{t('wizard.viewCompany')}</Button>
          <Button
            size="lg"
            onClick={() => {
              switchOrg(org.id, org.language);
              toast.success(i18n.t('shell.switchedCompany', { company: org.name, lng: org.language }));
              navigate('/app/dashboard');
            }}
          >
            {t('wizard.openCompany', { company: org.name })} <ArrowRight />
          </Button>
        </div>
      </div>
    );
  }

  const timezones = [...new Set([...COUNTRIES.map((c) => c.timezone), 'UTC'])];
  const deps = missingDependencies(Object.fromEntries(MODULES.map((m) => [m.key, d.modules.includes(m.key) || CORE.includes(m.key)])) as Record<ModuleKey, boolean>);
  const money = (n: number) => formatMoney(toMinor(n, d.currency), d.currency, `${d.language}-${d.countries[0] ?? 'GH'}`);

  const body = (() => {
    switch (STEPS[step]) {
      case 'describe':
        return (
          <>
            <StepTitle title={t('wizard.describe.title')} description={t('wizard.describe.body')} />
            <TextAreaField label={t('wizard.describe.label')} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder={t('wizard.describe.placeholder')} rows={5} />
            <div className="mt-4 rounded-ctl bg-ai p-[1.5px]">
              <div className="flex flex-col gap-3 rounded-[10.5px] bg-surface p-4 sm:flex-row sm:items-center">
                <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <p className="flex-1 text-[14px] text-body">{t('wizard.describe.aiHint')}</p>
                <Button onClick={runDraft} disabled={drafting || d.description.trim().length < 10}>
                  {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} {drafting ? t('wizard.describe.drafting') : t('wizard.describe.draft')}
                </Button>
              </div>
            </div>
            {notes && (
              <div className="mt-6 rounded-card border border-line p-5">
                <div className="eyebrow mb-3">{t('wizard.describe.filled')}</div>
                <ul className="space-y-2">
                  {notes.map((n, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[14px] text-body">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={3} aria-hidden="true" />
                      {t(`wizard.ai.${n.key}`, { ...n.params, type: n.params.type ? t(`orgType.${n.params.type as string}`) : '', plan: n.params.plan ? plans.find((p) => p.id === n.params.plan)?.name : '', template: n.params.template ? t(`wizard.template.${n.params.template as string}.title`) : '', approvals: n.params.approvals ? t(`wizard.approvals.${n.params.approvals as string}.title`) : '', country: n.params.country ? COUNTRIES.find((c) => c.code === n.params.country)?.name[lang] : '' })}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[13px] text-muted">{t('wizard.describe.review')}</p>
              </div>
            )}
          </>
        );
      case 'basics':
        return (
          <>
            <StepTitle title={t('wizard.basics.title')} description={t('wizard.basics.body')} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label={t('wizard.basics.name')} value={d.name} onChange={(e) => set({ name: e.target.value })} />
              <TextField label={t('wizard.basics.legalName')} value={d.legalName} onChange={(e) => set({ legalName: e.target.value })} />
              <SelectField label={t('col.type')} value={d.type} onChange={(e) => set({ type: e.target.value as OrgType })} options={TYPES.map((x) => ({ value: x, label: t(`orgType.${x}`) }))} />
              <SelectField label={t('wizard.basics.weekStart')} value={String(d.weekStart)} onChange={(e) => set({ weekStart: Number(e.target.value) as 0 | 1 | 6 })} options={[{ value: '1', label: t('wizard.day.1') }, { value: '0', label: t('wizard.day.0') }, { value: '6', label: t('wizard.day.6') }]} />
            </div>
            <Field label={t('wizard.basics.countries')} helper={t('wizard.basics.countriesHelper')} className="mt-5">
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map((c) => {
                  const on = d.countries.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const countries = on ? d.countries.filter((x) => x !== c.code) : [...d.countries, c.code];
                        const primary = countries[0];
                        set(primary && primary !== d.countries[0] ? { countries, ...countryDefaults(primary) } : { countries });
                      }}
                      className={cn('flex h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] transition-colors', on ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-line text-body hover:border-brand/40')}
                    >
                      <Flag code={c.code} /> {c.name[lang]}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <SelectField label={t('signup.currency')} helper={t('signup.currencyHelper')} value={d.currency} onChange={(e) => set({ currency: e.target.value })} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
              <SelectField label={t('signup.language')} value={d.language} onChange={(e) => set({ language: e.target.value as 'en' | 'fr' })} options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
              <SelectField label={t('wizard.basics.timezone')} value={d.timezone} onChange={(e) => set({ timezone: e.target.value })} options={timezones.map((z) => ({ value: z, label: z }))} />
            </div>
          </>
        );
      case 'plan':
        return (
          <>
            <StepTitle title={t('wizard.plan.title')} description={t('wizard.plan.body')} />
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={d.planId === p.id}
                  onClick={() => {
                    const allowed = new Set(planModules(p.modules));
                    set({ planId: p.id, modules: [...new Set([...d.modules.filter((m) => allowed.has(m)), ...(p.id !== d.planId ? planModules(p.modules) : [])])].filter((m) => allowed.has(m)) });
                  }}
                  className={cn('rounded-card border p-5 text-left transition-colors', d.planId === p.id ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40')}
                >
                  <div className="text-[15px] font-semibold text-ink">{p.name}</div>
                  <div className="mt-1 text-[13px] text-muted">{t('platform.planLimits', { agents: p.limits.agents, farmers: p.limits.farmers })}</div>
                </button>
              ))}
            </div>
            <div className="eyebrow mb-3 mt-8">{t('wizard.plan.modules')}</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {MODULES.map((m) => {
                const core = CORE.includes(m.key);
                const allowed = inPlan.has(m.key);
                const on = core || d.modules.includes(m.key);
                return (
                  <label key={m.key} className={cn('flex items-center justify-between gap-3 rounded-ctl px-3 py-2.5', allowed ? 'hover:bg-canvas' : 'opacity-50')}>
                    <span>
                      <span className="block text-[14px] text-ink">{t(`module.${m.key}`)}</span>
                      {!allowed && <span className="block text-[12px] text-muted">{t('wizard.plan.notInPlan', { plan: plan.name })}</span>}
                    </span>
                    <Switch checked={on && allowed} disabled={core || !allowed} onCheckedChange={(v) => set({ modules: v ? [...d.modules, m.key] : d.modules.filter((x) => x !== m.key) })} aria-label={t(`module.${m.key}`)} />
                  </label>
                );
              })}
            </div>
            {deps.length > 0 && (
              <div className="mt-4 rounded-ctl border border-warning/30 bg-warning/5 px-4 py-3 text-[14px] text-warning">
                {deps.map((x) => t('wizard.plan.needs', { module: t(`module.${x.module}`), needs: x.needs.map((n) => t(`module.${n}`)).join(', ') })).join(' · ')}
              </div>
            )}
          </>
        );
      case 'template':
        return (
          <>
            <StepTitle title={t('wizard.template.title')} description={t('wizard.template.body')} />
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
              {TEMPLATE_KEYS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={d.template === k} onClick={() => set({ template: k as TemplateKey, commodityIds: TEMPLATE_COMMODITIES[k as TemplateKey] })} className={cn('rounded-card border p-5 text-left transition-colors', d.template === k ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40')}>
                  <div className="flex items-center justify-between">
                    <span className="text-[16px] font-semibold text-ink">{t(`wizard.template.${k}.title`)}</span>
                    {k === 'vitara' && <Badge tone="dark">{t('wizard.template.reference')}</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{t(`wizard.template.${k}.body`)}</p>
                </button>
              ))}
            </div>
          </>
        );
      case 'commodities':
        return (
          <>
            <StepTitle title={t('wizard.commodities.title')} description={t('wizard.commodities.body')} />
            <div className="grid gap-2 sm:grid-cols-2">
              {COMMODITY_LIBRARY.map((c) => (
                <div key={c.id} className="rounded-ctl border border-line px-4 py-3">
                  <Checkbox
                    label={<span className="font-medium text-ink">{c.name[lang] ?? c.name.en}</span>}
                    description={`${c.code} · HS ${c.hsCode || '—'}${c.eudrRelevant ? ` · ${t('platform.eudrYes')}` : ''}`}
                    checked={d.commodityIds.includes(c.id)}
                    onChange={(e) => set({ commodityIds: e.target.checked ? [...d.commodityIds, c.id] : d.commodityIds.filter((x) => x !== c.id) })}
                  />
                </div>
              ))}
            </div>
          </>
        );
      case 'approvals':
        return (
          <>
            <StepTitle title={t('wizard.approvals.title')} description={t('wizard.approvals.body')} />
            <div className="grid gap-3" role="radiogroup">
              {(['one', 'two', 'threeThreshold'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={d.approvals === k} onClick={() => set({ approvals: k })} className={cn('rounded-card border p-5 text-left transition-colors', d.approvals === k ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40')}>
                  <div className="text-[16px] font-semibold text-ink">{t(`wizard.approvals.${k}.title`)}</div>
                  <p className="mt-1 text-[13px] text-muted">{t(`wizard.approvals.${k}.body`)}</p>
                </button>
              ))}
            </div>
            {d.approvals === 'threeThreshold' && (
              <TextField className="mt-5 max-w-xs" label={t('wizard.approvals.threshold', { currency: d.currency })} type="number" min={0} value={String(d.thresholdMajor)} onChange={(e) => set({ thresholdMajor: Number(e.target.value) })} helper={money(d.thresholdMajor)} />
            )}
            <div className="mt-6">
              <Checkbox label={t('wizard.approvals.sod')} description={t('wizard.approvals.sodHint')} checked={d.requesterCannotApprove} onChange={(e) => set({ requesterCannotApprove: e.target.checked })} />
            </div>
            <div className="mt-6 rounded-card bg-canvas p-5">
              <div className="eyebrow mb-3">{t('wizard.approvals.preview')}</div>
              <ol className="flex flex-wrap items-center gap-2 text-[13px]">
                {[t('wizard.flow.submitted'), t('wizard.flow.ops'), ...(d.approvals === 'threeThreshold' ? [t('wizard.flow.director', { amount: money(d.thresholdMajor) })] : []), ...(d.approvals !== 'one' ? [t('wizard.flow.finance')] : []), t('wizard.flow.approved')].map((s, i, arr) => (
                  <li key={s} className="flex items-center gap-2">
                    <span className={cn('rounded-full px-3 py-1.5 font-medium', i === 0 || i === arr.length - 1 ? 'bg-surface text-muted' : 'bg-brand text-on-brand')}>{s}</span>
                    {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />}
                  </li>
                ))}
              </ol>
            </div>
          </>
        );
      case 'admins':
        return (
          <>
            <StepTitle title={t('wizard.admins.title')} description={t('wizard.admins.body')} />
            <ul className="space-y-3">
              {d.admins.map((a, i) => (
                <li key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <TextField label={t('auth.fullName')} value={a.name} onChange={(e) => set({ admins: d.admins.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <TextField label={t('auth.workEmail')} type="email" value={a.email} onChange={(e) => set({ admins: d.admins.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} />
                  <Button variant="ghost" size="icon" className="mb-2" disabled={d.admins.length === 1} onClick={() => set({ admins: d.admins.filter((_, j) => j !== i) })} aria-label={t('wizard.admins.remove')}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => set({ admins: [...d.admins, { name: '', email: '' }] })}>
              <Plus /> {t('wizard.admins.add')}
            </Button>
            <p className="mt-4 text-[13px] text-muted">{t('wizard.admins.hint')}</p>
          </>
        );
      default: {
        const rows: [string, string, number][] = [
          ['wizard.review.company', `${d.name} · ${d.legalName} · ${t(`orgType.${d.type}`)}`, 1],
          ['wizard.review.where', `${d.countries.map((c) => COUNTRIES.find((x) => x.code === c)?.name[lang]).join(', ')} · ${d.currency} · ${d.language.toUpperCase()} · ${d.timezone}`, 1],
          ['wizard.review.plan', `${plan.name} · ${t('platform.modulesOn', { count: [...new Set([...d.modules, ...CORE])].length, total: MODULES.length })}`, 2],
          ['wizard.review.template', t(`wizard.template.${d.template}.title`), 3],
          ['wizard.review.commodities', COMMODITY_LIBRARY.filter((c) => d.commodityIds.includes(c.id)).map((c) => c.name[lang] ?? c.name.en).join(', ') || t('common.none'), 4],
          ['wizard.review.approvals', `${t(`wizard.approvals.${d.approvals}.title`)}${d.approvals === 'threeThreshold' ? ` (> ${money(d.thresholdMajor)})` : ''}`, 5],
          ['wizard.review.admins', d.admins.map((a) => `${a.name} <${a.email}>`).join(', '), 6],
        ];
        return (
          <>
            <StepTitle title={t('wizard.review.title')} description={t('wizard.review.body')} />
            <dl className="divide-y divide-line rounded-card border border-line">
              {rows.map(([k, v, s]) => (
                <div key={k} className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                  <dt className="eyebrow">{t(k)}</dt>
                  <dd className="text-[14px] text-ink">{v}</dd>
                  <button type="button" className="text-link justify-self-start text-[13px]" onClick={() => setStep(s)}>{t('wizard.edit')}</button>
                </div>
              ))}
            </dl>
          </>
        );
      }
    }
  })();

  return (
    <>
      <Link to="/app/platform/companies" className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('platform.page.companies')}
      </Link>
      <h1 className="mb-8 text-[26px] leading-tight tracking-[-0.02em]">{t('platform.addCompany')}</h1>
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <StepperHeader steps={STEPS.map((s) => t(`wizard.step.${s}`))} current={step} onStep={setStep} />
        </aside>
        <div className="lg:hidden"><StepperHeader steps={STEPS.map((s) => t(`wizard.step.${s}`))} current={step} compact /></div>
        <Card className="p-6 md:p-10">
          <div key={step} className="animate-rise">{body}</div>
          {error && <p role="alert" className="mt-6 rounded-ctl border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-danger">{error}</p>}
          <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
            <Button variant="secondary" onClick={() => { setError(null); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>
              <ArrowLeft /> {t('wizard.back')}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>{t('wizard.next')} <ArrowRight /></Button>
            ) : (
              <Button onClick={create}><Check /> {t('wizard.create')}</Button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
