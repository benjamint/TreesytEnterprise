import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, PasswordField, TextField } from '@/components/shared/Field';
import { acceptInvite, checkInvite, checkResetToken, policyFor, requestPasswordReset, resetPassword } from '@/services/authService';
import { passwordFailures } from '@/services/authPolicy';
import { useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/stores/hooks';
import { AuthAlert, AuthHeading, AuthLayout } from './AuthLayout';
import { PolicyList } from './PolicyList';

function StatusIcon({ icon: Icon, tone }: { icon: typeof Clock; tone: 'brand' | 'warning' | 'success' }) {
  const cls = { brand: 'bg-brand-soft text-brand', warning: 'bg-warning/10 text-warning', success: 'bg-success/10 text-success' }[tone];
  return (
    <span className={`mb-6 flex h-14 w-14 items-center justify-center rounded-full ${cls}`}>
      <Icon className="h-7 w-7" aria-hidden="true" />
    </span>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useT();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/\S+@\S+\.\S+/.test(email)) return setError(t('auth.err.emailInvalid'));
    requestPasswordReset(email);
    navigate(`/forgot-password/sent?email=${encodeURIComponent(email)}`);
  };
  return (
    <AuthLayout>
      <Link to="/sign-in" className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('auth.backToSignIn')}
      </Link>
      <AuthHeading title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')} />
      <form onSubmit={submit} noValidate className="space-y-5">
        <TextField label={t('auth.workEmail')} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} error={error ?? undefined} placeholder={t('auth.emailPlaceholder')} autoFocus />
        <Button type="submit" size="lg" className="w-full">{t('auth.sendLink')}</Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotSentPage() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [resent, setResent] = useState(false);
  const { t } = useT();
  return (
    <AuthLayout>
      <StatusIcon icon={MailCheck} tone="brand" />
      <AuthHeading title={t('auth.sentTitle')} subtitle={t('auth.sentBody', { email })} />
      {resent && <AuthAlert tone="success">{t('auth.sentAgain')}</AuthAlert>}
      <Button asChild size="lg" className="w-full">
        <Link to="/sign-in">{t('auth.backToSignIn')}</Link>
      </Button>
      <p className="mt-6 text-center text-[14px] text-muted">
        {t('auth.noEmail')}{' '}
        <button type="button" className="text-link" onClick={() => { requestPasswordReset(email); setResent(true); }}>{t('auth.resend')}</button>
      </p>
    </AuthLayout>
  );
}

function LinkProblem({ reason, kind }: { reason: 'expired' | 'used' | 'unknown'; kind: 'reset' | 'invite' }) {
  const { t } = useT();
  return (
    <AuthLayout>
      <StatusIcon icon={Clock} tone="warning" />
      <AuthHeading title={t(`auth.link.${reason}Title`)} subtitle={t(`auth.link.${kind}.${reason}`)} />
      <Button asChild size="lg" className="w-full">
        <Link to={kind === 'reset' ? '/forgot-password' : '/sign-in'}>{kind === 'reset' ? t('auth.sendNewLink') : t('auth.backToSignIn')}</Link>
      </Button>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const check = useMemo(() => checkResetToken(token), [token]);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { t } = useT();
  if (!check.ok && !done) return <LinkProblem reason={check.reason} kind="reset" />;
  if (done) {
    return (
      <AuthLayout>
        <StatusIcon icon={CheckCircle2} tone="success" />
        <AuthHeading title={t('auth.resetDoneTitle')} subtitle={t('auth.resetDoneBody')} />
        <Button asChild size="lg" className="w-full">
          <Link to="/sign-in">{t('auth.signIn')}</Link>
        </Button>
      </AuthLayout>
    );
  }
  const policy = check.ok ? check.policy : policyFor({ id: '' });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordFailures(pw, policy).length) return setError(t('auth.err.policy'));
    if (pw !== confirm) return setError(t('auth.err.mismatch'));
    const r = resetPassword(token!, pw);
    if (r.ok) setDone(true);
  };
  return (
    <AuthLayout>
      <AuthHeading title={t('auth.resetTitle')} subtitle={check.ok ? t('auth.resetSubtitle', { email: check.user.email }) : undefined} />
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} noValidate className="space-y-5">
        <PasswordField label={t('auth.newPassword')} autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setError(null); }} autoFocus />
        <PolicyList password={pw} policy={policy} />
        <PasswordField label={t('auth.confirmPassword')} autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }} />
        <Button type="submit" size="lg" className="w-full">{t('auth.savePassword')}</Button>
      </form>
    </AuthLayout>
  );
}

/** Accept invite (PRD A2) — its own page, separate from password reset. */
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const check = useMemo(() => checkInvite(token), [token]);
  const settings = useSettingsStore((s) => (check.ok ? s.settings[check.org.id] : undefined));
  const [name, setName] = useState(check.ok ? check.invite.name ?? '' : '');
  const [pw, setPw] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useT();
  if (!check.ok) return <LinkProblem reason={check.reason} kind="invite" />;
  const policy = settings?.security.passwordPolicy ?? policyFor({ id: '' });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError(t('auth.err.nameRequired'));
    if (passwordFailures(pw, policy).length) return setError(t('auth.err.policy'));
    if (!terms) return setError(t('auth.err.terms'));
    const r = acceptInvite(token!, name.trim(), pw);
    if (r.ok) navigate('/app');
  };
  return (
    <AuthLayout>
      <AuthHeading title={t('auth.inviteTitle', { company: check.org.name })} subtitle={t('auth.inviteSubtitle', { email: check.invite.email })} />
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} noValidate className="space-y-5">
        <TextField label={t('auth.fullName')} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} autoComplete="name" autoFocus />
        <TextField label={t('auth.workEmail')} value={check.invite.email} readOnly disabled />
        <PasswordField label={t('auth.choosePassword')} autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setError(null); }} />
        <PolicyList password={pw} policy={policy} />
        <Checkbox label={t('auth.acceptTerms')} checked={terms} onChange={(e) => { setTerms(e.target.checked); setError(null); }} />
        <Button type="submit" size="lg" className="w-full">{t('auth.joinCompany', { company: check.org.name })}</Button>
      </form>
    </AuthLayout>
  );
}
