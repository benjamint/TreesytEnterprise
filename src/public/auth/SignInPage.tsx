import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, PasswordField, TextField } from '@/components/shared/Field';
import { checkCredentials, type SignInResult } from '@/services/authService';
import { useT } from '@/stores/hooks';
import { AuthAlert, AuthHeading, AuthLayout } from './AuthLayout';
import { continueSignIn } from './signInFlow';

const schema = z.object({
  email: z.string().trim().min(1, 'auth.err.emailRequired').email('auth.err.emailInvalid'),
  password: z.string().min(1, 'auth.err.passwordRequired'),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;

/** Sign in (PRD A2): email + password, SSO, remember this device, account states. */
export function SignInPage() {
  const [params] = useSearchParams();
  const next = params.get('next');
  const navigate = useNavigate();
  const { t } = useT();
  const [problem, setProblem] = useState<SignInResult | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', remember: false } });

  const onSubmit = (v: Values) => {
    const res = checkCredentials(v.email, v.password);
    if (!continueSignIn(res, navigate, { remember: v.remember, next })) setProblem(res);
  };

  const err = (k?: string) => (k ? t(k) : undefined);
  return (
    <AuthLayout>
      <AuthHeading title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')} />
      {problem && (
        <AuthAlert tone={problem.status === 'invalid' ? 'danger' : 'warning'}>
          {problem.status === 'invalid' ? t('auth.err.invalid', { count: problem.attemptsLeft }) : t(`auth.err.${problem.status}`)}
        </AuthAlert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <TextField label={t('auth.workEmail')} type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} error={err(formState.errors.email?.message)} {...register('email')} />
        <div>
          <PasswordField label={t('auth.password')} autoComplete="current-password" error={err(formState.errors.password?.message)} {...register('password')} />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" className="text-link text-[13px]">{t('auth.forgot')}</Link>
          </div>
        </div>
        <Checkbox label={t('auth.remember')} description={t('auth.rememberHint')} {...register('remember')} />
        <Button type="submit" size="lg" className="w-full">{t('auth.signIn')}</Button>
        <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.08em] text-muted">
          <span className="h-px flex-1 bg-line" />
          {t('auth.or')}
          <span className="h-px flex-1 bg-line" />
        </div>
        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => navigate(`/sign-in/sso${next ? `?next=${encodeURIComponent(next)}` : ''}`)}>
          <KeyRound /> {t('auth.sso')}
        </Button>
      </form>
      <p className="mt-8 text-center text-[14px] text-muted">
        {t('auth.noAccount')}{' '}
        <Link to="/sign-up" className="font-semibold text-brand underline underline-offset-[3px]">{t('auth.startTrial')}</Link>
      </p>
    </AuthLayout>
  );
}
