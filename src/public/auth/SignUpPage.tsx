import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox, OtpInput, PasswordField, SelectField, TextField } from '@/components/shared/Field';
import { StepperHeader } from '@/components/shared/StepperWizard';
import { COUNTRIES, CURRENCIES } from '@/data/catalogs/countries';
import { countryDefaults, emptyDraft, planModules } from '@/data/templates/companyTemplates';
import { roleId } from '@/data/seed/templates';
import { completeSignIn, issueCode } from '@/services/authService';
import { passwordStrength } from '@/services/authPolicy';
import { createCompany } from '@/services/companyService';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useDemoStore } from '@/stores/demoStore';
import { useLang, useT } from '@/stores/hooks';
import type { Lang, User } from '@/types';
import { AuthAlert, AuthHeading, AuthLayout } from './AuthLayout';

const accountSchema = z.object({
  name: z.string().trim().min(2, 'auth.err.nameRequired'),
  email: z.string().trim().email('auth.err.emailInvalid'),
  country: z.string().min(2),
  password: z.string().min(8, 'auth.err.passwordShort'),
});
type Account = z.infer<typeof accountSchema>;

/**
 * Self-service sign-up (PRD A1): account → verify email → company basics → terms → setup checklist.
 * Creates a trial company from the blank template with the new user as company admin.
 */
export function SignUpPage() {
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [company, setCompany] = useState({ name: '', country: 'GH', currency: 'GHS', language: 'en' as Lang });
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const lang = useLang();
  const { t } = useT();
  const latest = useDemoStore((s) => s.codes.find((c) => c.label === 'verifyEmail' && c.to === account?.email));
  const form = useForm<Account>({ resolver: zodResolver(accountSchema), defaultValues: { name: '', email: '', country: 'GH', password: '' } });
  const pw = form.watch('password');
  const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: c.name[lang] }));
  const steps = [t('signup.step.account'), t('signup.step.verify'), t('signup.step.company'), t('signup.step.terms')];

  const submitAccount = (v: Account) => {
    if (useAccessStore.getState().users.some((u) => u.email.toLowerCase() === v.email.toLowerCase())) return setError(t('signup.exists'));
    setError(null);
    setAccount(v);
    const d = countryDefaults(v.country);
    setCompany((c) => ({ ...c, country: v.country, currency: d.currency, language: d.language }));
    issueCode('verifyEmail', v.email);
    setStep(1);
  };

  const finish = () => {
    if (!terms || !account) return setError(t('auth.err.terms'));
    const userId = uid('u');
    const d = countryDefaults(company.country);
    const plan = usePlatformStore.getState().plans.find((p) => p.id === 'plan_growth')!;
    const { org } = createCompany(
      { ...emptyDraft(), name: company.name.trim(), legalName: company.name.trim(), countries: [company.country], currency: company.currency, language: company.language, timezone: d.timezone, planId: plan.id, modules: planModules(plan.modules), admins: [] },
      userId,
      'SIGNUP',
    );
    const user: User = {
      id: userId, name: account.name, email: account.email.toLowerCase(), phone: '', language: company.language, status: 'ACTIVE', avatarColor: '#14583F',
      password: account.password, passwordChangedAt: new Date().toISOString(), twoFactor: { enabled: false, method: 'APP', backupCodes: [] }, failedAttempts: 0, trustedDevices: [],
    };
    const access = useAccessStore.getState();
    access.addUser(user);
    access.addMembership({ id: `mem_${userId}_${org.id}`, userId, orgId: org.id, roleIds: [roleId(org.id, 'companyAdmin')], status: 'ACTIVE' });
    const [first, ...rest] = account.name.split(' ');
    usePlatformStore.getState().addLead({ id: uid('lead'), kind: 'SIGNUP', firstName: first ?? '', lastName: rest.join(' '), email: user.email, phone: '', businessName: org.name, industry: '', message: '', createdAt: new Date().toISOString() });
    completeSignIn(user, org.id);
    toast.success(t('signup.welcome', { company: org.name }));
    navigate('/app/dashboard');
  };

  return (
    <AuthLayout>
      <div className="mb-8">
        <StepperHeader steps={steps} current={step} compact />
        <div className="mt-2 text-[13px] font-medium text-muted">{steps[step]}</div>
      </div>
      {error && <AuthAlert>{error}</AuthAlert>}

      {step === 0 && (
        <>
          <AuthHeading title={t('signup.title')} subtitle={t('signup.subtitle')} />
          <form onSubmit={form.handleSubmit(submitAccount)} noValidate className="space-y-5">
            <TextField label={t('auth.fullName')} autoComplete="name" error={form.formState.errors.name && t(form.formState.errors.name.message!)} {...form.register('name')} />
            <TextField label={t('auth.workEmail')} type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} error={form.formState.errors.email && t(form.formState.errors.email.message!)} {...form.register('email')} />
            <SelectField label={t('signup.country')} helper={t('signup.countryHelper')} options={countryOptions} {...form.register('country')} />
            <PasswordField label={t('auth.password')} autoComplete="new-password" strength={passwordStrength(pw)} error={form.formState.errors.password && t(form.formState.errors.password.message!)} {...form.register('password')} />
            <Button type="submit" size="lg" className="w-full">{t('signup.create')}</Button>
          </form>
          <p className="mt-6 text-center text-[14px] text-muted">
            {t('signup.haveAccount')}{' '}
            <Link to="/sign-in" className="font-semibold text-brand underline underline-offset-[3px]">{t('auth.signIn')}</Link>
          </p>
          <p className="mt-3 text-center text-[12px] text-muted">{t('signup.termsLine')}</p>
        </>
      )}

      {step === 1 && account && (
        <>
          <AuthHeading title={t('signup.verifyTitle')} subtitle={t('signup.verifyBody', { email: account.email })} />
          {codeError && <AuthAlert>{t('auth.err.code')}</AuthAlert>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code === latest?.code) {
                setCodeError(false);
                setStep(2);
              } else setCodeError(true);
            }}
            className="space-y-6"
          >
            <OtpInput label={t('auth.code')} value={code} onChange={(v) => { setCode(v); setCodeError(false); }} invalid={codeError} autoFocus />
            <Button type="submit" size="lg" className="w-full" disabled={code.length < 6}>{t('auth.verify')}</Button>
          </form>
          <div className="mt-6 flex justify-between text-[14px]">
            <button type="button" className="inline-flex items-center gap-1.5 text-muted hover:text-ink" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> {t('signup.changeEmail')}</button>
            <button type="button" className="text-link" onClick={() => issueCode('verifyEmail', account.email)}>{t('auth.resend')}</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <AuthHeading title={t('signup.companyTitle')} subtitle={t('signup.companySubtitle')} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (company.name.trim().length < 2) return setError(t('signup.companyRequired'));
              setError(null);
              setStep(3);
            }}
            noValidate
            className="space-y-5"
          >
            <TextField label={t('signup.companyName')} value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} autoFocus />
            <SelectField
              label={t('signup.country')}
              options={countryOptions}
              value={company.country}
              onChange={(e) => {
                const d = countryDefaults(e.target.value);
                setCompany({ ...company, country: e.target.value, currency: d.currency, language: d.language });
              }}
            />
            <div className="grid grid-cols-2 gap-4">
              <SelectField label={t('signup.currency')} helper={t('signup.currencyHelper')} options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))} value={company.currency} onChange={(e) => setCompany({ ...company, currency: e.target.value })} />
              <SelectField label={t('signup.language')} options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} value={company.language} onChange={(e) => setCompany({ ...company, language: e.target.value as Lang })} />
            </div>
            <Button type="submit" size="lg" className="w-full">{t('auth.continue')}</Button>
          </form>
        </>
      )}

      {step === 3 && (
        <>
          <AuthHeading title={t('signup.termsTitle')} subtitle={t('signup.termsSubtitle')} />
          <div className="mb-6 max-h-48 overflow-y-auto rounded-ctl border border-line bg-canvas p-4 text-[13px] leading-relaxed text-body scrollbar-thin">{t('signup.termsText')}</div>
          <Checkbox label={t('auth.acceptTerms')} checked={terms} onChange={(e) => { setTerms(e.target.checked); setError(null); }} />
          <Button size="lg" className="mt-6 w-full" onClick={finish}>{t('signup.finish')}</Button>
        </>
      )}
    </AuthLayout>
  );
}
