import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, SelectField, TextAreaField, TextField } from '@/components/shared/Field';
import { Input } from '@/components/ui/input';
import { COUNTRIES } from '@/data/catalogs/countries';
import { isValidPhone } from '@/lib/format';
import { latency, uid } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { usePlatformStore } from '@/stores/platformStore';
import { useT } from '@/stores/hooks';
import { AuthHeading, AuthLayout } from './auth/AuthLayout';

const INDUSTRIES = ['cocoa', 'cashew', 'shea', 'coffee', 'grains', 'tea', 'other'] as const;

const schema = z
  .object({
    kind: z.enum(['DEMO', 'CONTACT']),
    firstName: z.string().trim().min(1, 'demoForm.err.required'),
    lastName: z.string().trim().min(1, 'demoForm.err.required'),
    email: z.string().trim().email('auth.err.emailInvalid'),
    country: z.string(),
    phone: z.string().trim(),
    businessName: z.string().trim().min(2, 'demoForm.err.required'),
    industry: z.string(),
    message: z.string().trim().max(2000),
  })
  .refine((v) => !v.phone || isValidPhone(v.phone, v.country), { path: ['phone'], message: 'demoForm.err.phone' });
type Values = z.infer<typeof schema>;

/** Book a demo / Contact us (PRD A1). Submissions appear in Platform → Leads. */
export function BookDemoPage() {
  const { pathname } = useLocation();
  const { t } = useT();
  const addLead = usePlatformStore((s) => s.addLead);
  const [sent, setSent] = useState<Values | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: pathname.startsWith('/contact') ? 'CONTACT' : 'DEMO', firstName: '', lastName: '', email: '', country: 'GH', phone: '', businessName: '', industry: 'cocoa', message: '' },
  });
  const kind = form.watch('kind');
  const country = COUNTRIES.find((c) => c.code === form.watch('country'));
  const e = form.formState.errors;
  const err = (m?: string) => (m ? t(m) : undefined);

  const submit = async (v: Values) => {
    await latency();
    const dial = COUNTRIES.find((c) => c.code === v.country)?.dialCode ?? '';
    addLead({ id: uid('lead'), kind: v.kind, firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone ? `${dial} ${v.phone}` : '', businessName: v.businessName, industry: v.industry, message: v.message, createdAt: new Date().toISOString() });
    setSent(v);
  };

  if (sent) {
    return (
      <AuthLayout>
        <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span>
        <AuthHeading title={t(sent.kind === 'DEMO' ? 'demoForm.doneDemo' : 'demoForm.doneContact', { name: sent.firstName })} subtitle={t('demoForm.doneBody', { email: sent.email })} />
        <Button asChild size="lg" className="w-full"><Link to="/">{t('demoForm.backHome')}</Link></Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout wide>
      <AuthHeading title={t(kind === 'DEMO' ? 'demoForm.titleDemo' : 'demoForm.titleContact')} subtitle={t('demoForm.subtitle')} />
      <div className="mb-6 grid grid-cols-2 rounded-ctl border border-line p-1" role="radiogroup" aria-label={t('demoForm.type')}>
        {(['DEMO', 'CONTACT'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => form.setValue('kind', k)} className={cn('h-10 rounded-chip text-[14px] font-semibold transition-colors', kind === k ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink')}>
            {t(`demoForm.kind.${k}`)}
          </button>
        ))}
      </div>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label={t('demoForm.firstName')} autoComplete="given-name" error={err(e.firstName?.message)} {...form.register('firstName')} />
          <TextField label={t('demoForm.lastName')} autoComplete="family-name" error={err(e.lastName?.message)} {...form.register('lastName')} />
        </div>
        <TextField label={t('auth.workEmail')} type="email" autoComplete="email" error={err(e.email?.message)} {...form.register('email')} />
        <Field label={t('demoForm.phone')} error={err(e.phone?.message)} helper={t('demoForm.phoneHelper')}>
          <div className="flex gap-2">
            <select aria-label={t('signup.country')} className="h-14 w-36 shrink-0 rounded-ctl border border-line bg-surface px-3 text-[15px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" {...form.register('country')}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{`${c.code} ${c.dialCode}`}</option>
              ))}
            </select>
            <Input type="tel" autoComplete="tel-national" placeholder={country?.code === 'CI' ? '07 01 02 03 04' : '024 123 4567'} aria-invalid={!!e.phone} {...form.register('phone')} />
          </div>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label={t('demoForm.business')} autoComplete="organization" error={err(e.businessName?.message)} {...form.register('businessName')} />
          <SelectField label={t('demoForm.industry')} options={INDUSTRIES.map((i) => ({ value: i, label: t(`demoForm.industries.${i}`) }))} {...form.register('industry')} />
        </div>
        <TextAreaField label={t('demoForm.message')} placeholder={t('demoForm.messagePlaceholder')} {...form.register('message')} />
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('common.loading') : t(kind === 'DEMO' ? 'demoForm.submitDemo' : 'demoForm.submitContact')}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function LegalPage() {
  const { pathname } = useLocation();
  const { t } = useT();
  const kind = pathname.endsWith('privacy') ? 'privacy' : 'terms';
  return (
    <AuthLayout wide>
      <AuthHeading title={t(`auth.${kind}`)} subtitle={t('legal.updated')} />
      <div className="space-y-4 text-[15px] leading-relaxed text-body">
        <p>{t(`legal.${kind}1`)}</p>
        <p>{t(`legal.${kind}2`)}</p>
      </div>
      <Button asChild variant="secondary" size="lg" className="mt-8 w-full"><Link to="/">{t('demoForm.backHome')}</Link></Button>
    </AuthLayout>
  );
}
