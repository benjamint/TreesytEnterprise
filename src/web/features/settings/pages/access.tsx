import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { OrgSettings } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, StrengthMeter } from '@/components/shared/Field';
import { TILES } from '@/mobile/flows/catalog';
import { passwordFailures, passwordStrength } from '@/services/authPolicy';
import { describeDevice } from '@/services/authService';
import { cn, latency } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActor, useCurrentOrg, useOrgSettings, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { ChipsInput, Grid, Mini, NumberInput, Rows, Section, Segmented, Select, SettingsFrame, SwitchRow, TextInput } from '../kit';

// ---------------------------------------------------------------- Security

const SEC_KEYS = ['security'] as const;
const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d|[12]\d|3[0-2]))?$/;

export function SecurityPage() {
  const d = useSettingsDraft('security', SEC_KEYS);
  const s = d.value.security;
  const { orgId } = useActor();
  const { t } = useT();
  const allRoles = useAccessStore((st) => st.roles);
  const templates = useMemo(() => [...new Set(allRoles.filter((r) => r.orgId === orgId && !r.mobile).map((r) => r.template))], [allRoles, orgId]);
  const [sample, setSample] = useState('Shea2026');
  const [testing, setTesting] = useState(false);
  const set = (patch: Partial<OrgSettings['security']>) => d.set('security', { ...s, ...patch });
  const pp = s.passwordPolicy;
  const failures = passwordFailures(sample, pp);
  const myIp = describeDevice().ip;

  const errors: string[] = [];
  const badIps = s.ipAllowList.filter((ip) => !IP_RE.test(ip) || ip.split(/[./]/).slice(0, 4).some((n) => Number(n) > 255));
  if (badIps.length) errors.push(t('set.security.errIp', { ips: badIps.join(', ') }));
  if (s.sso.enabled && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.sso.domain)) errors.push(t('set.security.errDomain'));
  if (s.ipAllowList.length && !s.ipAllowList.some((ip) => ip.split('/')[0] === myIp || ip.endsWith('/0'))) errors.push(t('set.security.errLockout', { ip: myIp }));

  const testSso = async () => {
    setTesting(true);
    await latency(700, 1200);
    setTesting(false);
    toast.success(t('set.security.ssoOk', { idp: s.sso.idpName || s.sso.protocol }));
  };

  return (
    <SettingsFrame page="security" {...bind(d)} errors={errors}>
      <Section title={t('set.security.sessions')}>
        <Grid cols={3}>
          <Mini label={t('set.security.sessionLength')}>
            <Select value={String(s.sessionMinutes)} onChange={(v) => set({ sessionMinutes: Number(v) })} options={[15, 30, 60, 120, 240, 480].map((m) => ({ value: String(m), label: t('set.security.minutes', { count: m }) }))} />
          </Mini>
        </Grid>
        <p className="mt-2 text-[13px] text-muted">{t('set.security.sessionHint')}</p>
      </Section>

      <Section title={t('set.security.twoStep')} description={t('set.security.twoStepHint')}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <Checkbox key={tpl} label={t(`role.${tpl}`)} checked={s.twoFactorRoles.includes(tpl)} onChange={(e) => set({ twoFactorRoles: e.target.checked ? [...s.twoFactorRoles, tpl] : s.twoFactorRoles.filter((x) => x !== tpl) })} />
          ))}
        </div>
      </Section>

      <Section title={t('set.security.sso')} description={t('set.security.ssoHint')}>
        <Rows>
          <SwitchRow label={t('set.security.ssoOn')} checked={s.sso.enabled} onChange={(enabled) => set({ sso: { ...s.sso, enabled } })} />
        </Rows>
        {s.sso.enabled && (
          <div className="mt-5 space-y-5">
            <Segmented label={t('set.security.protocol')} value={s.sso.protocol} onChange={(protocol) => set({ sso: { ...s.sso, protocol } })} options={[{ value: 'SAML', label: 'SAML 2.0' }, { value: 'OIDC', label: 'OpenID Connect' }]} />
            <Grid>
              <Mini label={t('set.security.domain')}><TextInput value={s.sso.domain} onChange={(domain) => set({ sso: { ...s.sso, domain } })} className="font-mono" /></Mini>
              <Mini label={t('set.security.idpName')}><TextInput value={s.sso.idpName} onChange={(idpName) => set({ sso: { ...s.sso, idpName } })} /></Mini>
              <Mini label={t(s.sso.protocol === 'SAML' ? 'set.security.metadataSaml' : 'set.security.metadataOidc')} className="md:col-span-2">
                <textarea value={s.sso.metadata ?? ''} onChange={(e) => set({ sso: { ...s.sso, metadata: e.target.value } })} rows={3} className="w-full rounded-ctl border border-line bg-surface p-3 font-mono text-[12px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" placeholder={s.sso.protocol === 'SAML' ? 'https://idp.example.com/metadata.xml' : 'https://idp.example.com/.well-known/openid-configuration'} />
              </Mini>
            </Grid>
            <Button variant="secondary" size="sm" onClick={testSso} disabled={testing}>{testing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {t('set.security.testSso')}</Button>
          </div>
        )}
      </Section>

      <Section title={t('set.security.passwords')}>
        <Grid cols={4}>
          <Mini label={t('set.security.minLength')}><NumberInput value={pp.minLength} min={6} max={32} onChange={(v) => set({ passwordPolicy: { ...pp, minLength: Math.round(v) } })} /></Mini>
        </Grid>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {(['requireNumber', 'requireSymbol', 'requireMixedCase'] as const).map((k) => (
            <Checkbox key={k} label={t(`set.security.${k}`)} checked={pp[k]} onChange={(e) => set({ passwordPolicy: { ...pp, [k]: e.target.checked } })} />
          ))}
        </div>
        <div className="mt-5 max-w-md rounded-ctl border border-line bg-canvas p-4">
          <Mini label={t('set.security.tryPassword')}><TextInput value={sample} onChange={setSample} className="font-mono" /></Mini>
          <StrengthMeter score={passwordStrength(sample)} />
          <p className={cn('mt-2 text-[13px]', failures.length ? 'text-warning' : 'text-success')}>
            {failures.length ? t('set.security.wouldFail', { rules: failures.map((x) => t(`set.security.rule.${x}`, { count: pp.minLength })).join(', ') }) : t('set.security.wouldPass')}
          </p>
        </div>
      </Section>

      <Section title={t('set.security.ip')} description={t('set.security.ipHint', { ip: myIp })}>
        <ChipsInput label={t('set.security.ip')} values={s.ipAllowList} onChange={(ipAllowList) => set({ ipAllowList })} placeholder="196.168.10.0/24" />
        <p className="mt-2 text-[13px] text-muted">{s.ipAllowList.length ? t('set.security.ipOn', { count: s.ipAllowList.length }) : t('set.security.ipOff')}</p>
      </Section>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Mobile app

const MOBILE_KEYS = ['agentTypes', 'mobile'] as const;

export function MobilePage() {
  const d = useSettingsDraft('mobile', MOBILE_KEYS);
  const { agentTypes, mobile } = d.value;
  const { modules } = useOrgSettings();
  const org = useCurrentOrg();
  const { t } = useT();
  const [preview, setPreview] = useState(agentTypes[0]?.id ?? '');
  const previewType = agentTypes.find((a) => a.id === preview) ?? agentTypes[0];
  const toggle = (typeId: string, tile: string, on: boolean) => d.set('agentTypes', agentTypes.map((a) => (a.id === typeId ? { ...a, mobileTiles: on ? [...a.mobileTiles, tile] : a.mobileTiles.filter((x) => x !== tile) } : a)));
  const setM = (patch: Partial<OrgSettings['mobile']>) => d.set('mobile', { ...mobile, ...patch });
  const errors: string[] = [];
  if (!/^\d+\.\d+\.\d+$/.test(mobile.minAppVersion)) errors.push(t('set.mobile.errVersion'));
  const typeName = (a: (typeof agentTypes)[number]) => a.name[org.language] ?? a.name.en ?? a.code;

  return (
    <SettingsFrame page="mobile" {...bind(d)} errors={errors}>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Section title={t('set.mobile.tiles')} description={t('set.mobile.tilesHint')}>
          <div className="overflow-x-auto rounded-ctl border border-line">
            <table className="w-full min-w-[520px] text-[14px]">
              <thead>
                <tr className="bg-canvas">
                  <th className="px-3 py-2.5 text-left text-[12px] font-medium text-muted">{t('set.mobile.tile')}</th>
                  {agentTypes.map((a) => <th key={a.id} className="px-3 py-2.5 text-center text-[12px] font-semibold text-ink">{typeName(a)}</th>)}
                </tr>
              </thead>
              <tbody>
                {TILES.map((tile) => {
                  const off = !modules[tile.module];
                  return (
                    <tr key={tile.key} className="border-t border-line">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 text-ink"><tile.icon className="h-4 w-4 text-muted" /> {t(`mobile.tile.${tile.key}`)}</span>
                        {off && <span className="text-[12px] text-warning">{t('set.mobile.moduleOff', { module: t(`module.${tile.module}`) })}</span>}
                      </td>
                      {agentTypes.map((a) => (
                        <td key={a.id} className="px-3 py-2 text-center">
                          <Checkbox className="justify-center" label={<span className="sr-only">{`${typeName(a)} · ${t(`mobile.tile.${tile.key}`)}`}</span>} checked={a.mobileTiles.includes(tile.key)} onChange={(e) => toggle(a.id, tile.key, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <aside aria-label={t('set.preview')} className="space-y-3">
          <div className="eyebrow">{t('set.preview')}</div>
          {agentTypes.length > 0 && previewType && (
            <>
              <Select value={previewType.id} onChange={setPreview} options={agentTypes.map((a) => ({ value: a.id, label: typeName(a) }))} aria-label={t('set.mobile.previewAs')} />
              <div className="mx-auto w-60 rounded-[32px] border-[6px] border-ink/85 bg-canvas p-3">
                <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-ink"><Smartphone className="h-3.5 w-3.5" /> {org.name}</div>
                <div className="grid grid-cols-2 gap-2">
                  {TILES.filter((x) => previewType.mobileTiles.includes(x.key) && modules[x.module]).map((x) => (
                    <div key={x.key} className="flex flex-col items-start gap-2 rounded-2xl bg-surface p-2.5 shadow-soft">
                      <x.icon className="h-4 w-4 text-brand" />
                      <span className="text-[11px] font-medium text-ink">{t(`mobile.tile.${x.key}`)}</span>
                    </div>
                  ))}
                </div>
                {!TILES.some((x) => previewType.mobileTiles.includes(x.key) && modules[x.module]) && <p className="py-6 text-center text-[12px] text-muted">{t('set.mobile.noTiles')}</p>}
              </div>
            </>
          )}
        </aside>
      </div>

      <Section title={t('set.mobile.signIn')}>
        <Segmented label={t('set.mobile.signIn')} value={mobile.loginMethod} onChange={(loginMethod) => setM({ loginMethod })} options={(['PHONE_SMS', 'PHONE_PIN', 'EMAIL'] as const).map((x) => ({ value: x, label: t(`set.mobile.login.${x}`) }))} />
        <Grid cols={4} className="mt-5">
          <Mini label={t('set.mobile.minVersion')}><TextInput value={mobile.minAppVersion} onChange={(minAppVersion) => setM({ minAppVersion })} className="font-mono" /></Mini>
        </Grid>
        <p className="mt-2 text-[13px] text-muted">{t('set.mobile.minVersionHint')}</p>
      </Section>

      <Section title={t('set.mobile.offline')} description={t('set.mobile.offlineHint')}>
        <Grid cols={3}>
          <Mini label={t('set.mobile.maxDays')}><NumberInput value={mobile.offline.maxDays} min={1} max={60} suffix={t('set.days')} onChange={(v) => setM({ offline: { ...mobile.offline, maxDays: Math.round(v) } })} /></Mini>
          <Mini label={t('set.mobile.maxRecords')}><NumberInput value={mobile.offline.maxRecords} min={50} onChange={(v) => setM({ offline: { ...mobile.offline, maxRecords: Math.round(v) } })} /></Mini>
          <Mini label={t('set.mobile.maxMedia')}><NumberInput value={mobile.offline.maxMediaMb} min={10} suffix="MB" onChange={(v) => setM({ offline: { ...mobile.offline, maxMediaMb: Math.round(v) } })} /></Mini>
        </Grid>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="neutral">{t('set.mobile.otpFrom', { count: mobile.otpLength })}</Badge>
        </div>
      </Section>
    </SettingsFrame>
  );
}

