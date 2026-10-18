import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/shared/Field';
import { CompanyLogo } from '@/components/shared/Logo';
import { afterPassword, ssoLookup, ssoProviderName } from '@/services/authService';
import { emailDomain } from '@/services/authPolicy';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useT } from '@/stores/hooks';
import { AuthAlert, AuthHeading, AuthLayout, useNeutralBrand } from './AuthLayout';
import { continueSignIn } from './signInFlow';

/** Sign in with SSO (PRD A2): company domain lookup, then the company's identity provider. */
export function SsoPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useT();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/\S+@\S+\.\S+/.test(email)) return setError(t('auth.err.emailInvalid'));
    const org = ssoLookup(email);
    if (!org) return setError(t('auth.err.noSso', { domain: emailDomain(email) }));
    const q = new URLSearchParams({ org: org.id, email });
    if (params.get('next')) q.set('next', params.get('next')!);
    navigate(`/sign-in/sso/idp?${q.toString()}`);
  };
  return (
    <AuthLayout>
      <Link to="/sign-in" className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('auth.backToSignIn')}
      </Link>
      <AuthHeading title={t('auth.ssoTitle')} subtitle={t('auth.ssoSubtitle')} />
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} noValidate className="space-y-5">
        <TextField label={t('auth.workEmail')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPlaceholder')} helper={t('auth.ssoHelper')} autoFocus />
        <Button type="submit" size="lg" className="w-full">{t('auth.continue')}</Button>
      </form>
    </AuthLayout>
  );
}

/** A deliberately different-looking page: the company's identity provider (simulated). */
export function IdpPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useT();
  useNeutralBrand();
  const org = usePlatformStore((s) => s.orgs.find((o) => o.id === params.get('org')));
  const email = params.get('email') ?? '';
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const [error, setError] = useState<string | null>(null);
  if (!org) return null;
  const idp = ssoProviderName(org.id);
  const go = () => {
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !memberships.some((m) => m.userId === user.id && m.orgId === org.id)) return setError(t('auth.err.idpUnknown', { idp }));
    if (user.status !== 'ACTIVE') return setError(t(`auth.err.${user.status === 'LOCKED' ? 'locked' : user.status === 'INVITED' ? 'invited' : 'deactivated'}`));
    continueSignIn(afterPassword(user), navigate, { remember: false, next: params.get('next'), viaSso: true });
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef1f5] px-4">
      <div className="w-full max-w-[400px] rounded-[10px] border border-[#d6dbe2] bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <CompanyLogo text={org.branding.logoText} color={org.branding.primaryColor} size={36} />
          <div>
            <div className="text-[15px] font-semibold text-[#1f2933]">{idp}</div>
            <div className="text-[12px] text-[#6b7785]">{t('auth.idpSecure')}</div>
          </div>
        </div>
        <h1 className="text-[20px] font-semibold text-[#1f2933]" style={{ letterSpacing: 0 }}>{t('auth.idpTitle', { app: 'TreeSyt' })}</h1>
        <p className="mt-2 text-[14px] text-[#52606d]">{t('auth.idpBody', { email })}</p>
        {error && <p role="alert" className="mt-4 rounded bg-[#fdecea] px-3 py-2 text-[13px] text-[#b42318]">{error}</p>}
        <button type="button" onClick={go} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[#1f4e79] text-[14px] font-semibold text-white hover:bg-[#173d5f]">
          <ShieldCheck className="h-4 w-4" /> {t('auth.idpContinue')}
        </button>
        <button type="button" onClick={() => navigate('/sign-in')} className="mt-3 h-10 w-full rounded-[6px] text-[14px] text-[#52606d] hover:bg-[#f4f6f8]">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
