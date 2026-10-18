import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { OtpInput, TextField } from '@/components/shared/Field';
import { afterPassword, issueCode } from '@/services/authService';
import { useAccessStore } from '@/stores/accessStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { useDemoStore } from '@/stores/demoStore';
import { useT } from '@/stores/hooks';
import { AuthAlert, AuthHeading, AuthLayout } from './AuthLayout';
import { continueSignIn } from './signInFlow';

/** 2-step code screen (PRD A2). The code "arrives" in the Demo panel. */
export function TwoStepPage() {
  const flow = useAuthFlowStore();
  const user = useAccessStore((s) => s.users.find((u) => u.id === flow.pendingUserId));
  const latest = useDemoStore((s) => s.codes.find((c) => c.label === 'twoStep' && c.to === user?.email));
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const navigate = useNavigate();
  const { t } = useT();
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  if (!user) return <Navigate to="/sign-in" replace />;

  const proceed = () => {
    const res = afterPassword(user);
    // The code is verified: carry on as if no 2-step were needed.
    const skip = res.status === 'twoStep' ? { ...res, status: res.orgs.length > 1 ? ('chooseCompany' as const) : ('ok' as const) } : res;
    continueSignIn(skip, navigate, { remember: flow.remember, next: flow.next });
  };
  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (backup ? user.twoFactor.backupCodes.includes(backupCode.trim()) : code === latest?.code) proceed();
    else setError(true);
  };
  return (
    <AuthLayout>
      <AuthHeading title={t('auth.twoStepTitle')} subtitle={t(user.twoFactor.method === 'SMS' ? 'auth.twoStepSms' : 'auth.twoStepApp')} />
      {error && <AuthAlert>{t('auth.err.code')}</AuthAlert>}
      <form onSubmit={verify} className="space-y-6">
        {backup ? (
          <TextField label={t('auth.backupCode')} value={backupCode} onChange={(e) => { setBackupCode(e.target.value); setError(false); }} placeholder="0000-0000" autoFocus />
        ) : (
          <OtpInput label={t('auth.code')} value={code} onChange={(v) => { setCode(v); setError(false); }} invalid={error} autoFocus />
        )}
        <Button type="submit" size="lg" className="w-full" disabled={!backup && code.length < 6}>{t('auth.verify')}</Button>
      </form>
      <div className="mt-6 flex items-center justify-between text-[14px]">
        <button type="button" className="text-link disabled:text-muted disabled:no-underline" disabled={cooldown > 0 || backup} onClick={() => { issueCode('twoStep', user.email); setCooldown(30); }}>
          {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
        </button>
        <button type="button" className="text-link" onClick={() => { setBackup((b) => !b); setError(false); }}>
          {backup ? t('auth.useCode') : t('auth.useBackup')}
        </button>
      </div>
    </AuthLayout>
  );
}
