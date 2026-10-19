import { useMemo, useState } from 'react';
import { FlaskConical, KeyRound, Send } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import type { FormBinding, Lang } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/shared/Field';
import { runRules, type QualityRule } from '@/engines/rules';
import type { Channel, NotificationRule } from '@/engines/notify';
import { renderMessage, templateVariables, type MessageTemplate } from '@/engines/templates';
import { formatMoney, toMinor } from '@/engines/money';
import { sendEmail } from '@/services/emailGateway';
import { sendSms } from '@/services/smsGateway';
import { sendPush } from '@/services/pushGateway';
import { cn, uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useActor, useCurrentOrg, useCurrentUser, useFormat, useLang, useRoleName, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { AddRow, EditTable, LangInputs, Mini, NumberInput, RowDelete, Rows, Section, Segmented, Select, SettingsFrame, SwitchRow, TextInput } from '../kit';

// ---------------------------------------------------------------- Data quality

const QUALITY_FIELDS: Record<QualityRule['entity'], string[]> = {
  farmer: ['firstName', 'lastName', 'phone', 'age', 'gender', 'primaryCrop', 'communityId', 'identity.consent', 'customFields.householdSize', 'customFields.numberOfChildren', 'customFields.idNumber', 'customFields.language', 'customFields.educationLevel', 'customFields.assets'],
  community: ['name', 'code', 'population', 'contactPerson.phone'],
  farmerGroup: ['name', 'score', 'established'],
};
const OPERATORS: QualityRule['operator'][] = ['between', 'notEmpty', 'notEquals', 'notContains', 'unique', 'lessThanField'];
const DQ_KEYS = ['qualityRules'] as const;

export function DataQualityPage() {
  const d = useSettingsDraft('dataQuality', DQ_KEYS);
  const rules = d.value.qualityRules;
  const { orgId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const farmers = useFarmerStore((s) => s.farmers);
  const communities = useCommunityStore((s) => s.communities);
  const groups = useGroupStore((s) => s.groups);
  const [result, setResult] = useState<{ checked: Record<string, number>; flags: Record<string, { count: number; samples: string[] }> } | null>(null);
  const setRule = (id: string, patch: Partial<QualityRule>) => d.set('qualityRules', rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const test = () => {
    const now = Date.now();
    const sample = {
      farmer: farmers.filter((x) => x.orgId === orgId).slice(0, 500).map((x) => ({ ...x, age: Math.floor((now - new Date(x.dateOfBirth).getTime()) / 31_557_600_000) })),
      community: communities.filter((x) => x.orgId === orgId).slice(0, 500),
      farmerGroup: groups.filter((x) => x.orgId === orgId).slice(0, 500),
    };
    const names: Record<string, string> = {};
    for (const x of sample.farmer) names[x.id] = `${x.firstName} ${x.lastName}`;
    for (const x of [...sample.community, ...sample.farmerGroup]) names[x.id] = x.name;
    const flags: Record<string, { count: number; samples: string[] }> = {};
    for (const entity of Object.keys(sample) as QualityRule['entity'][]) {
      const rows = sample[entity] as unknown as ({ id: string } & Record<string, unknown>)[];
      for (const flag of runRules(rules.filter((r) => r.entity === entity), rows)) {
        const e = (flags[flag.ruleId] ??= { count: 0, samples: [] });
        e.count++;
        if (e.samples.length < 3) e.samples.push(names[flag.recordId] ?? flag.recordId);
      }
    }
    setResult({ checked: { farmer: sample.farmer.length, community: sample.community.length, farmerGroup: sample.farmerGroup.length }, flags });
  };

  return (
    <SettingsFrame page="dataQuality" {...bind(d)} actions={<Button variant="secondary" onClick={test}><FlaskConical /> {t('set.dq.test')}</Button>}>
      {result && (
        <div className="rounded-card border border-info/30 bg-info/5 px-5 py-4 text-[14px]" role="status">
          <div className="font-semibold text-ink">{t('set.dq.tested', { farmers: f.number(result.checked.farmer ?? 0), communities: f.number(result.checked.community ?? 0), groups: f.number(result.checked.farmerGroup ?? 0) })}</div>
          <p className="mt-1 text-muted">{t('set.dq.testedFlags', { count: Object.values(result.flags).reduce((s, x) => s + x.count, 0) })}</p>
        </div>
      )}
      <Section title={t('set.dq.rules')} description={t('set.dq.rulesHint')}>
        <EditTable head={[t('set.dq.entity'), t('set.dq.field'), t('set.dq.check'), t('set.dq.value'), t('set.dq.severity'), t('set.enabled'), '']}>
          {rules.map((r) => {
            const res = result?.flags[r.id];
            return (
              <tr key={r.id}>
                <td className="w-36"><Select value={r.entity} onChange={(entity) => setRule(r.id, { entity, field: QUALITY_FIELDS[entity][0]! })} options={(Object.keys(QUALITY_FIELDS) as QualityRule['entity'][]).map((e) => ({ value: e, label: t(`set.dq.entityName.${e}`) }))} aria-label={t('set.dq.entity')} /></td>
                <td className="w-40"><Select value={r.field} onChange={(field) => setRule(r.id, { field })} options={QUALITY_FIELDS[r.entity].map((x) => ({ value: x, label: t(`set.dq.fieldName.${x.replace('.', '_')}`) }))} aria-label={t('set.dq.field')} /></td>
                <td className="w-44"><Select value={r.operator} onChange={(operator) => setRule(r.id, { operator, value: operator === 'between' ? [0, 100] : operator === 'notEquals' || operator === 'notContains' ? '' : undefined })} options={OPERATORS.map((o) => ({ value: o, label: t(`set.dq.op.${o}`) }))} aria-label={t('set.dq.check')} /></td>
                <td className="min-w-48">
                  {r.operator === 'between' && (
                    <div className="flex items-center gap-2">
                      <NumberInput className="w-24" value={(r.value as [number, number])[0]} onChange={(v) => setRule(r.id, { value: [v, (r.value as [number, number])[1]] })} aria-label={t('set.commodities.min')} />
                      <span className="text-muted">–</span>
                      <NumberInput className="w-24" value={(r.value as [number, number])[1]} onChange={(v) => setRule(r.id, { value: [(r.value as [number, number])[0], v] })} aria-label={t('set.commodities.max')} />
                    </div>
                  )}
                  {(r.operator === 'notEquals' || r.operator === 'notContains') && <TextInput value={String(r.value ?? '')} onChange={(value) => setRule(r.id, { value })} aria-label={t('set.dq.value')} />}
                  {r.operator === 'unique' && <Select value={r.duplicateScope ?? 'company'} onChange={(duplicateScope) => setRule(r.id, { duplicateScope })} options={(['company', 'community'] as const).map((x) => ({ value: x, label: t(`set.dq.scope.${x}`) }))} aria-label={t('set.dq.value')} />}
                  {r.operator === 'lessThanField' && <Select value={r.crossField ?? ''} onChange={(crossField) => setRule(r.id, { crossField })} options={QUALITY_FIELDS[r.entity].map((x) => ({ value: x, label: t(`set.dq.fieldName.${x.replace('.', '_')}`) }))} aria-label={t('set.dq.value')} />}
                  {res && <div className="mt-1 text-[12px] text-warning">{t('set.dq.hits', { count: res.count, samples: res.samples.join(', ') })}</div>}
                  {result && !res && r.enabled && <div className="mt-1 text-[12px] text-success">{t('set.dq.noHits')}</div>}
                  {r.note && <div className="mt-1 text-[12px] text-muted">{r.note}</div>}
                </td>
                <td className="w-32"><Select value={r.severity} onChange={(severity) => setRule(r.id, { severity })} options={(['info', 'warning', 'block'] as const).map((x) => ({ value: x, label: t(`set.dq.sev.${x}`) }))} aria-label={t('set.dq.severity')} /></td>
                <td className="w-20"><Switch checked={r.enabled} onCheckedChange={(enabled) => setRule(r.id, { enabled })} aria-label={t('set.enabled')} /></td>
                <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => d.set('qualityRules', rules.filter((x) => x.id !== r.id))} /></td>
              </tr>
            );
          })}
        </EditTable>
        <div className="mt-3">
          <AddRow onClick={() => d.set('qualityRules', [...rules, { id: uid('qr'), entity: 'farmer', field: 'phone', operator: 'notEmpty', severity: 'warning', enabled: true }])}>{t('set.dq.add')}</AddRow>
        </div>
      </Section>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Forms

const FORM_KEYS = ['formBindings', 'formLibrary'] as const;
const BINDINGS: FormBinding[] = ['farmer', 'community', 'farmerGroup', 'nursery', 'plot', 'plotMonitoring', 'treeMonitoring', 'nurseryMonitoring', 'workshopFeedback', 'recoveryFeedback', 'agentReport'];

export function FormsPage() {
  const d = useSettingsDraft('forms', FORM_KEYS);
  const { formBindings, formLibrary } = d.value;
  const { t } = useT();
  return (
    <SettingsFrame page="forms" {...bind(d)} actions={<Button variant="secondary" asChild><NavLink to="/app/forms">{t('set.forms.open')}</NavLink></Button>}>
      <Section title={t('set.forms.bindings')} description={t('set.forms.bindingsHint')}>
        <EditTable head={[t('set.forms.profile'), t('set.forms.form'), t('set.forms.version')]} className="[&_table]:min-w-0">
          {BINDINGS.map((b) => {
            const options = formLibrary.filter((x) => x.binding === b);
            const current = formLibrary.find((x) => x.id === formBindings[b]);
            return (
              <tr key={b}>
                <td className="font-medium text-ink">{t(`set.forms.binding.${b}`)}</td>
                <td className="w-80">
                  <Select value={formBindings[b] ?? ''} onChange={(id) => d.set('formBindings', { ...formBindings, [b]: id || undefined })} options={[{ value: '', label: t('set.forms.noForm') }, ...options.map((o) => ({ value: o.id, label: o.name }))]} aria-label={t('set.forms.form')} />
                </td>
                <td className="w-28">{current ? <Badge tone="neutral">{t('set.forms.v', { n: current.version })}</Badge> : <span className="text-muted">—</span>}</td>
              </tr>
            );
          })}
        </EditTable>
      </Section>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Biometrics & consent

const BIO_KEYS = ['biometrics'] as const;

export function BiometricsPage() {
  const d = useSettingsDraft('biometrics', BIO_KEYS);
  const b = d.value.biometrics;
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const set = (patch: Partial<typeof b>) => d.set('biometrics', { ...b, ...patch });
  const langs = org.languages.length ? org.languages : [org.language];
  return (
    <SettingsFrame page="biometrics" {...bind(d)}>
      <Section title={t('set.bio.capture')}>
        <Rows>
          <SwitchRow label={t('set.bio.thumbprint')} description={t('set.bio.thumbprintHint')} checked={b.thumbprint} onChange={(thumbprint) => set({ thumbprint })} />
          <SwitchRow label={t('set.bio.nfc')} description={t('set.bio.nfcHint')} checked={b.nfcCards} onChange={(nfcCards) => set({ nfcCards })} />
        </Rows>
      </Section>
      <Section title={t('set.bio.consent')} description={t('set.bio.consentHint')}>
        <Segmented label={t('set.bio.consent')} value={b.consentType} onChange={(consentType) => set({ consentType })} options={(['AUDIO', 'SIGNATURE', 'TICK'] as const).map((x) => ({ value: x, label: t(`set.bio.consentType.${x}`) }))} />
        <Mini label={t('set.bio.text')} className="mt-5"><LangInputs multiline label={t('set.bio.text')} value={b.consentText} onChange={(consentText) => set({ consentText })} languages={langs} /></Mini>
      </Section>
      {b.nfcCards && (
        <Section title={t('set.bio.keys')}>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line p-5">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 text-brand" />
              <div>
                <div className="font-medium text-ink">{t('set.bio.keysServer')}</div>
                <p className="text-[13px] text-muted">{t('set.bio.keysRotated', { date: f.date(b.cardKeyRotatedAt) })}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => set({ cardKeyRotatedAt: new Date().toISOString() })}>{t('set.bio.rotate')}</Button>
          </div>
        </Section>
      )}
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Notifications

const CHANNELS: Channel[] = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'];
const NOTIF_KEYS = ['notificationRules', 'templates'] as const;

export function NotificationsPage() {
  const d = useSettingsDraft('notifications', NOTIF_KEYS);
  const { notificationRules: rules, templates } = d.value;
  const { orgId } = useActor();
  const { t } = useT();
  const roleName = useRoleName();
  const allRoles = useAccessStore((s) => s.roles);
  const roles = useMemo(() => allRoles.filter((r) => r.orgId === orgId), [allRoles, orgId]);
  const [tplId, setTplId] = useState(templates[0]?.id ?? '');
  const setRule = (id: string, patch: Partial<NotificationRule>) => d.set('notificationRules', rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const tpl = templates.find((x) => x.id === tplId);
  const setTpl = (patch: Partial<MessageTemplate>) => d.set('templates', templates.map((x) => (x.id === tplId ? { ...x, ...patch } : x)));

  const recipientValue = (r: NotificationRule) => (r.recipients.kind === 'roles' ? `role:${r.recipients.roleIds[0] ?? ''}` : r.recipients.kind);
  const setRecipient = (id: string, v: string) =>
    setRule(id, { recipients: v.startsWith('role:') ? { kind: 'roles', roleIds: [v.slice(5)] } : v === 'owner' ? { kind: 'owner' } : { kind: 'buyerAdmins' } });

  return (
    <SettingsFrame page="notifications" {...bind(d)}>
      <Section title={t('set.notif.grid')} description={t('set.notif.gridHint')}>
        <EditTable head={[t('set.notif.event'), ...CHANNELS.map((c) => t(`set.notif.channel.${c}`)), t('set.notif.recipients'), t('set.notif.template'), t('set.enabled')]}>
          {rules.map((r) => (
            <tr key={r.id} className={cn(!r.enabled && 'opacity-60')}>
              <td className="min-w-52 font-medium text-ink">{t(`set.notif.eventName.${r.eventKey.replace('.', '_')}`)}</td>
              {CHANNELS.map((c) => (
                <td key={c} className="w-20 text-center">
                  <Checkbox className="justify-center" label={<span className="sr-only">{t(`set.notif.channel.${c}`)}</span>} checked={r.channels.includes(c)} onChange={(e) => setRule(r.id, { channels: e.target.checked ? [...r.channels, c] : r.channels.filter((x) => x !== c) })} />
                </td>
              ))}
              <td className="w-56">
                <Select value={recipientValue(r)} onChange={(v) => setRecipient(r.id, v)} options={[{ value: 'owner', label: t('set.notif.owner') }, { value: 'buyerAdmins', label: t('set.notif.buyerAdmins') }, ...roles.map((x) => ({ value: `role:${x.id}`, label: roleName(x.id) }))]} aria-label={t('set.notif.recipients')} />
              </td>
              <td className="w-56">
                <Select value={r.templateId} onChange={(templateId) => setRule(r.id, { templateId })} options={templates.map((x) => ({ value: x.id, label: t(`set.notif.tplName.${x.id}`, { defaultValue: x.id }) }))} aria-label={t('set.notif.template')} />
              </td>
              <td className="w-20"><Switch checked={r.enabled} onCheckedChange={(enabled) => setRule(r.id, { enabled })} aria-label={t('set.enabled')} /></td>
            </tr>
          ))}
        </EditTable>
      </Section>

      <Section title={t('set.notif.templates')} description={t('set.notif.templatesHint')}>
        <div className="mb-4 flex flex-wrap gap-2">
          {templates.map((x) => (
            <button key={x.id} type="button" onClick={() => setTplId(x.id)} className={cn('rounded-full border px-3 py-1.5 text-[13px] font-medium', x.id === tplId ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink hover:border-brand/40')}>
              {t(`set.notif.tplName.${x.id}`, { defaultValue: x.id })} <span className="ml-1 text-[11px] text-muted">{t(`set.notif.kind.${x.channel}`)}</span>
            </button>
          ))}
        </div>
        {tpl && <TemplateEditor tpl={tpl} onChange={setTpl} />}
      </Section>
    </SettingsFrame>
  );
}

function TemplateEditor({ tpl, onChange }: { tpl: MessageTemplate; onChange: (p: Partial<MessageTemplate>) => void }) {
  const org = useCurrentOrg();
  const user = useCurrentUser();
  const lang = useLang();
  const { t } = useT();
  const langs = org.languages.length ? org.languages : [org.language];
  const [previewLang, setPreviewLang] = useState<Lang>(langs.includes(lang) ? lang : langs[0]!);
  const vars = useMemo(() => {
    const m = (major: number) => formatMoney(toMinor(major, org.currency), org.currency, org.locale);
    return {
      company: { name: org.name, signature: org.branding.signatureName }, recipient: { name: user?.name ?? '' }, agent: { name: 'Yaw Darko' },
      farmer: { name: 'Abena Issah' }, payee: { name: 'Abena Issah' }, inviter: { name: user?.name ?? '' },
      number: 'CS-2610-0042', docType: t('docType.purchaseRequest'), amount: m(org.currency === 'XOF' ? 350_000 : 4_680), price: m(org.currency === 'XOF' ? 1_250 : 5.2),
      quantity: '900 kg', commodity: t('set.notif.sampleCommodity'), reference: 'PAY-2610-00318', reason: t('set.notif.sampleReason'),
      warehouse: 'Wa', received: '4,860 kg', expected: '4,900 kg', community: 'Busa', method: 'MTN MoMo',
    };
  }, [org, user, t]);
  const rendered = renderMessage(tpl, previewLang, vars);
  const used = templateVariables(`${Object.values(tpl.body).join(' ')} ${Object.values(tpl.subject ?? {}).join(' ')}`);

  const sendTest = () => {
    const to = tpl.channel === 'EMAIL' ? user?.email ?? '' : user?.phone ?? '';
    const base = { orgId: org.id, to, templateId: tpl.id, language: previewLang };
    if (tpl.channel === 'EMAIL') sendEmail({ ...base, subject: rendered.subject ?? '', body: rendered.body });
    else if (tpl.channel === 'PUSH') sendPush({ ...base, subject: org.name, body: rendered.body });
    else sendSms({ ...base, body: rendered.body });
    toast.success(t('set.notif.testSent', { to }), { description: t('set.notif.testSentBody') });
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {tpl.subject && <Mini label={t('set.notif.subject')}><LangInputs label={t('set.notif.subject')} value={tpl.subject} onChange={(subject) => onChange({ subject })} languages={langs} /></Mini>}
        <Mini label={t('set.notif.body')}><LangInputs multiline label={t('set.notif.body')} value={tpl.body} onChange={(body) => onChange({ body })} languages={langs} /></Mini>
        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.notif.variables')}</div>
          <div className="flex flex-wrap gap-1.5">
            {used.map((v) => <code key={v} className="rounded bg-canvas px-2 py-0.5 text-[12px] text-ink">{`{{${v}}}`}</code>)}
          </div>
        </div>
      </div>
      <aside className="space-y-3" aria-label={t('set.preview')}>
        <div className="flex items-center justify-between">
          <span className="eyebrow">{t('set.preview')}</span>
          <div className="flex items-center gap-2">
            {langs.length > 1 && <Segmented label={t('set.preview')} value={previewLang} onChange={setPreviewLang} options={langs.map((l) => ({ value: l, label: l.toUpperCase() }))} />}
            {tpl.channel !== 'RECEIPT' && tpl.channel !== 'CONTRACT' && <Button size="sm" variant="secondary" onClick={sendTest}><Send /> {t('set.notif.sendTest')}</Button>}
          </div>
        </div>
        {tpl.channel === 'EMAIL' && (
          <div className="overflow-hidden rounded-ctl border border-line bg-white text-[13px] text-[#1f2a24]">
            <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: org.branding.primaryColor }}>{org.branding.emailHeader || org.name}</div>
            <div className="px-4 py-3">
              <div className="mb-2 font-semibold">{rendered.subject}</div>
              <div className="whitespace-pre-line">{rendered.body}</div>
            </div>
          </div>
        )}
        {tpl.channel === 'SMS' && (
          <div className="mx-auto w-64 rounded-[28px] border-4 border-ink/80 bg-canvas p-3">
            <div className="mb-2 text-center text-[11px] font-semibold text-muted">{org.branding.senderName}</div>
            <div className="rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-[13px] text-ink shadow-soft">{rendered.body}</div>
            <div className="mt-1 text-right text-[10px] text-muted">{t('set.notif.chars', { count: rendered.body.length, sms: Math.ceil(rendered.body.length / 160) })}</div>
          </div>
        )}
        {tpl.channel === 'PUSH' && (
          <div className="rounded-card bg-ink/90 p-3 text-surface shadow-lift dark:bg-canvas dark:text-ink">
            <div className="flex items-center gap-2 text-[11px] opacity-70"><span className="h-4 w-4 rounded" style={{ background: org.branding.primaryColor }} /> {t('set.notif.pushApp')}</div>
            <div className="mt-1 text-[13px] font-semibold">{org.name}</div>
            <div className="text-[13px]">{rendered.body}</div>
          </div>
        )}
        {(tpl.channel === 'RECEIPT' || tpl.channel === 'CONTRACT') && (
          <pre className="mx-auto w-60 whitespace-pre-wrap rounded-[6px] border border-dashed border-line bg-white p-4 font-mono text-[11px] leading-5 text-[#1f2a24]">{rendered.body}{org.branding.receiptFooter ? `\n\n${org.branding.receiptFooter}` : ''}</pre>
        )}
      </aside>
    </div>
  );
}
