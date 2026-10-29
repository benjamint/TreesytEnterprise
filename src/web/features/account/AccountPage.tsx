import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Laptop, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar } from '@/components/shared/Avatar';
import { OtpInput, PasswordField, SelectField, TextField } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { PolicyList } from '@/public/auth/PolicyList';
import { needsTwoStep, policyFor, signOutThisTab } from '@/services/authService';
import { oneTimeCode, passwordFailures } from '@/services/authPolicy';
import { isValidPhone, formatPhone } from '@/lib/format';
import { latency } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useDemoStore } from '@/stores/demoStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useCurrentOrg, useCurrentUser, useFormat, useOrgSettings, useRoleName, useT } from '@/stores/hooks';
import type { Lang } from '@/types';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="grid gap-8 p-8 lg:grid-cols-[280px_1fr]">
        <div>
          <h2 className="text-[15px]">{title}</h2>
          {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
        </div>
        <div className="max-w-xl">{children}</div>
      </CardContent>
    </Card>
  );
}

function ProfileTab() {
  const user = useCurrentUser()!;
  const org = useCurrentOrg();
  const updateUser = useAccessStore((s) => s.updateUser);
  const setLanguage = useSessionStore((s) => s.setLanguage);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [lang, setLang] = useState<Lang>(user.language);
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError(t('auth.err.nameRequired'));
    if (phone && !isValidPhone(phone, org.countries[0]!)) return setError(t('demoForm.err.phone'));
    setError(null);
    await latency();
    updateUser(user.id, { name: name.trim(), phone, language: lang });
    setLanguage(lang);
    toast.success(t('account.saved'));
  };
  return (
    <Section title={t('account.profile')} description={t('account.profileDesc')}>
      <form onSubmit={save} noValidate className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={name || user.name} color={user.avatarColor} size={56} />
          <div className="text-[13px] text-muted">{user.email}</div>
        </div>
        <TextField label={t('auth.fullName')} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label={t('col.phone')} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} helper={t('account.phoneHelper', { country: org.countries[0] })} error={error ?? undefined} placeholder={formatPhone('+233241234567')} />
        <SelectField label={t('account.language')} helper={t('account.languageHelper')} value={lang} onChange={(e) => setLang(e.target.value as Lang)} options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
        <Button type="submit">{t('common.save')}</Button>
      </form>
    </Section>
  );
}

function SecurityTab() {
  const user = useCurrentUser()!;
  const org = useCurrentOrg();
  const settings = useOrgSettings();
  const updateUser = useAccessStore((s) => s.updateUser);
  const pushCode = useDemoStore((s) => s.pushCode);
  const roleName = useRoleName();
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const f = useFormat();
  const { t } = useT();
  const policy = policyFor(user, org.id);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ code: string } | null>(null);
  const [entered, setEntered] = useState('');
  const [otpError, setOtpError] = useState(false);
  const secret = useMemo(() => Array.from({ length: 16 }, (_, i) => 'ABCDEFGHJKLMNPQRSTUVWXYZ234567'[(user.id.charCodeAt(i % user.id.length) * (i + 7)) % 30]).join(''), [user.id]);
  const membership = memberships.find((m) => m.userId === user.id && m.orgId === org.id);
  const tpl = roles.find((r) => r.id === membership?.roleIds[0])?.template;
  const required = !!tpl && settings.security.twoFactorRoles.includes(tpl);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (current !== user.password) return setPwError(t('account.err.current'));
    if (passwordFailures(next, policy).length) return setPwError(t('auth.err.policy'));
    setPwError(null);
    await latency();
    updateUser(user.id, { password: next, passwordChangedAt: new Date().toISOString() });
    setCurrent('');
    setNext('');
    toast.success(t('account.passwordChanged'));
  };
  const startSetup = () => {
    const code = oneTimeCode();
    pushCode({ label: 'twoStep', to: user.email, code });
    setSetup({ code });
    setEntered('');
  };
  const confirmSetup = () => {
    if (entered !== setup?.code) return setOtpError(true);
    const codes = Array.from({ length: 6 }, () => `${oneTimeCode().slice(0, 4)}-${oneTimeCode().slice(0, 4)}`);
    updateUser(user.id, { twoFactor: { enabled: true, method: 'APP', backupCodes: codes } });
    setSetup(null);
    toast.success(t('account.twoStepOn'));
  };

  return (
    <div className="space-y-6">
      <Section title={t('account.password')} description={user.passwordChangedAt ? t('account.passwordChangedAt', { when: f.date(user.passwordChangedAt) }) : t('account.passwordDesc')}>
        <form onSubmit={changePassword} noValidate className="space-y-5">
          <PasswordField label={t('account.currentPassword')} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <PasswordField label={t('auth.newPassword')} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={pwError ?? undefined} />
          <PolicyList password={next} policy={policy} />
          <Button type="submit">{t('account.changePassword')}</Button>
        </form>
      </Section>

      <Section title={t('account.twoStep')} description={required ? t('account.twoStepRequired', { role: roleName(membership!.roleIds[0]!) }) : t('account.twoStepDesc')}>
        {user.twoFactor.enabled ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-ctl border border-success/30 bg-success/5 px-4 py-3 text-[14px] text-success">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" /> {t('account.twoStepActive')}
            </div>
            <div>
              <div className="eyebrow mb-2">{t('account.backupCodes')}</div>
              <ul className="grid grid-cols-2 gap-2 font-mono text-[14px] text-ink">
                {user.twoFactor.backupCodes.map((c) => (
                  <li key={c} className="rounded-chip bg-canvas px-3 py-2">{c}</li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] text-muted">{t('account.backupHint')}</p>
            </div>
            <Button variant="dangerOutline" disabled={required} onClick={() => updateUser(user.id, { twoFactor: { enabled: false, method: 'APP', backupCodes: [] } })}>
              {t('account.twoStepOff')}
            </Button>
            {required && <p className="text-[13px] text-muted">{t('account.cannotDisable')}</p>}
          </div>
        ) : setup ? (
          <div className="space-y-5">
            <ol className="list-decimal space-y-1 pl-5 text-[14px] text-body">
              <li>{t('account.setup1')}</li>
              <li>{t('account.setup2')}</li>
            </ol>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="rounded-card border border-line bg-white p-3">
                <QRCodeSVG value={`otpauth://totp/TreeSyt:${encodeURIComponent(user.email)}?secret=${secret}&issuer=TreeSyt`} size={148} fgColor="#0F2A20" />
              </div>
              <div>
                <div className="eyebrow mb-1">{t('account.secret')}</div>
                <code className="font-mono text-[14px] tracking-wider text-ink">{secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              </div>
            </div>
            <OtpInput label={t('auth.code')} value={entered} onChange={(v) => { setEntered(v); setOtpError(false); }} invalid={otpError} />
            {otpError && <p className="text-[13px] text-danger">{t('auth.err.code')}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setSetup(null)}>{t('common.cancel')}</Button>
              <Button onClick={confirmSetup} disabled={entered.length < 6}>{t('account.turnOn')}</Button>
            </div>
          </div>
        ) : (
          <Button onClick={startSetup}><ShieldCheck /> {t('account.setUp')}</Button>
        )}
      </Section>
    </div>
  );
}

function SessionsTab() {
  const user = useCurrentUser()!;
  const sessionId = useSessionStore((s) => s.sessionId);
  const all = useAccessStore((s) => s.sessions);
  const { revokeSession, revokeAllSessions } = useAccessStore();
  const navigate = useNavigate();
  const f = useFormat();
  const { t } = useT();
  const sessions = useMemo(() => all.filter((s) => s.userId === user.id && !s.revokedAt).sort((a, b) => (a.id === sessionId ? -1 : b.id === sessionId ? 1 : b.lastActiveAt.localeCompare(a.lastActiveAt))), [all, user.id, sessionId]);
  const out = () => {
    signOutThisTab();
    navigate('/sign-in');
  };
  return (
    <Section title={t('account.sessions')} description={t('account.sessionsDesc')}>
      <ul className="divide-y divide-line rounded-card border border-line">
        {sessions.map((s) => {
          const current = s.id === sessionId;
          const Icon = /iOS|Android/.test(s.os) ? Smartphone : Laptop;
          return (
            <li key={s.id} className="flex items-center gap-4 px-4 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas text-muted"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
                  {`${s.device} · ${s.browser}`}
                  {current && <Badge tone="brand">{t('account.thisSession')}</Badge>}
                </span>
                <span className="block text-[13px] text-muted">{`${s.os} · ${s.location} · ${s.ip} · ${current ? t('account.activeNow') : f.relative(s.lastActiveAt)}`}</span>
              </span>
              <Button variant="secondary" size="xs" onClick={() => (current ? out() : (revokeSession(s.id), toast(t('account.deviceSignedOut'))))}>
                <LogOut /> {t('account.signOutDevice')}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="dangerOutline" className="mt-5" onClick={() => { revokeAllSessions(user.id); out(); }}>
        <LogOut /> {t('account.signOutAll')}
      </Button>
    </Section>
  );
}

/** My account (PRD A2): profile, password, 2-step, sessions. */
export function AccountPage() {
  const user = useCurrentUser();
  const { t } = useT();
  if (!user) return null;
  return (
    <>
      <PageHeader title={t('nav.account')} description={t('pages.account')} actions={needsTwoStep(user) || user.twoFactor.enabled ? <Badge tone="success"><ShieldCheck className="h-3 w-3" />{t('account.protected')}</Badge> : undefined} />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t('account.profile')}</TabsTrigger>
          <TabsTrigger value="security">{t('account.security')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('account.sessions')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
        <TabsContent value="sessions"><SessionsTab /></TabsContent>
      </Tabs>
    </>
  );
}
