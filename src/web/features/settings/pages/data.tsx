import { useMemo, useState } from 'react';
import { Code2, Copy, Download, KeyRound, Plus, Send, Webhook as WebhookIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { DataSharingGrant, OrgSettings, RetentionKey, Webhook } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/shared/Field';
import { Flag } from '@/components/shared/Flag';
import { comingSoon } from '@/components/shared/coming-soon';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { saveSettings, auditSettings } from '@/services/settingsService';
import { cn, latency, uid } from '@/lib/utils';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAccessStore } from '@/stores/accessStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useGroupStore } from '@/stores/groupStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActivityStore } from '@/stores/activityStore';
import { useActor, useCurrentOrg, useFormat, useOrgSettings, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { ConfirmDialog, EditTable, Mini, RowDelete, Section, Select, SettingsFrame, TextInput } from '../kit';

// ---------------------------------------------------------------- Integrations

const API_SCOPES = ['farmers:read', 'farmers:write', 'purchases:read', 'payments:read', 'inventory:read', 'traceability:read', 'reports:read', 'webhooks:manage'];
const WEBHOOK_EVENTS = ['purchase.recorded', 'purchaseRequest.approved', 'payment.sent', 'payment.failed', 'inbound.received', 'dispatch.delivered', 'farmer.created'];
const INT_KEYS = ['integrations'] as const;
const randomKey = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

/** Settings → Integrations (PRD A4, K8): API keys, webhooks with test delivery and log, accounting export. */
export function IntegrationsPage() {
  const d = useSettingsDraft('integrations', INT_KEYS);
  const int = d.value.integrations;
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const users = useAccessStore((s) => s.users);
  const [newKey, setNewKey] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const setHook = (id: string, patch: Partial<Webhook>) => d.set('integrations', { ...int, webhooks: int.webhooks.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  // Keys and test deliveries are events, saved straight away; they need the rest of the page saved first.
  const commit = (next: OrgSettings['integrations']) => saveSettings(orgId, 'integrations', { integrations: next });
  const busy = d.dirty;

  const test = async (w: Webhook) => {
    setTesting(w.id);
    await latency(400, 900);
    const ok = /^https:\/\//.test(w.url) && !w.url.includes('localhost');
    const delivery = { id: uid('whd'), at: new Date().toISOString(), event: w.event, status: ok ? 200 : 502, ms: Math.round(120 + Math.random() * 300) };
    commit({ ...int, webhooks: int.webhooks.map((x) => (x.id === w.id ? { ...x, deliveries: [delivery, ...x.deliveries].slice(0, 20) } : x)) });
    setTesting(null);
    setOpenLog(w.id);
    if (ok) toast.success(t('set.int.testOk', { status: delivery.status, ms: delivery.ms }));
    else toast.error(t('set.int.testFailed', { status: delivery.status }));
  };
  const errors = int.webhooks.filter((w) => !/^https:\/\/\S+$/.test(w.url)).map((w) => t('set.int.errUrl', { event: w.event }));
  const lockTip = (node: React.ReactElement) => (busy ? <Tip label={t('set.int.saveFirst')}><span tabIndex={0}>{node}</span></Tip> : node);

  return (
    <SettingsFrame page="integrations" {...bind(d)} errors={errors}>
      <Section
        title={t('set.int.keys')}
        description={t('set.int.keysHint')}
        actions={<><Button variant="ghost" size="sm" asChild><Link to="/app/help/api"><Code2 /> {t('set.int.apiDocs')}</Link></Button>{lockTip(<Button variant="secondary" size="sm" disabled={busy} onClick={() => setNewKey(true)}><Plus /> {t('set.int.newKey')}</Button>)}</>}
      >
        <EditTable head={[t('set.int.keyName'), t('set.int.key'), t('set.int.scopes'), t('set.int.created'), t('set.int.lastUsed'), '']}>
          {int.apiKeys.map((k) => (
            <tr key={k.id} className={cn(k.revokedAt && 'bg-canvas/70 [&_td]:text-muted')}>
              <td className="font-medium text-ink"><span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-muted" /> {k.name}</span></td>
              <td className="font-mono text-[13px]">{k.prefix}••••{k.last4}</td>
              <td><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} tone="neutral" className="font-mono">{s}</Badge>)}</div></td>
              <td className="whitespace-nowrap text-[13px] text-muted">{f.date(k.createdAt)} · {users.find((u) => u.id === k.createdBy)?.name ?? '—'}</td>
              <td className="whitespace-nowrap text-[13px] text-muted">{k.revokedAt ? <Badge tone="danger">{t('set.int.revoked')}</Badge> : k.lastUsedAt ? f.relative(k.lastUsedAt) : t('set.int.never')}</td>
              <td className="w-24 text-right">
                {!k.revokedAt && lockTip(
                  <Button variant="dangerOutline" size="xs" disabled={busy} onClick={() => { commit({ ...int, apiKeys: int.apiKeys.map((x) => (x.id === k.id ? { ...x, revokedAt: new Date().toISOString() } : x)) }); toast(t('set.int.revokedToast', { name: k.name })); }}>{t('set.int.revoke')}</Button>,
                )}
              </td>
            </tr>
          ))}
        </EditTable>
        {!int.apiKeys.length && <p className="mt-3 text-[14px] text-muted">{t('set.int.noKeys')}</p>}
      </Section>

      <Section
        title={t('set.int.webhooks')}
        description={t('set.int.webhooksHint')}
        actions={<Button variant="secondary" size="sm" onClick={() => d.set('integrations', { ...int, webhooks: [...int.webhooks, { id: uid('wh'), event: WEBHOOK_EVENTS[0]!, url: 'https://', secret: `whsec_${randomKey(24)}`, enabled: true, deliveries: [] }] })}><Plus /> {t('set.int.newHook')}</Button>}
      >
        <div className="space-y-3">
          {int.webhooks.map((w) => {
            const failed = w.deliveries.filter((x) => x.status >= 400).length;
            return (
              <div key={w.id} className="rounded-card border border-line p-4">
                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
                  <Mini label={t('set.int.event')}><Select value={w.event} onChange={(event) => setHook(w.id, { event })} options={WEBHOOK_EVENTS.map((e) => ({ value: e, label: e }))} className="font-mono" /></Mini>
                  <Mini label={t('set.int.url')}><TextInput value={w.url} onChange={(url) => setHook(w.id, { url })} className="font-mono" /></Mini>
                  <div className="flex items-end gap-2 pb-0.5">
                    <Switch checked={w.enabled} onCheckedChange={(enabled) => setHook(w.id, { enabled })} aria-label={t('set.enabled')} />
                    <RowDelete label={t('set.remove')} onClick={() => d.set('integrations', { ...int, webhooks: int.webhooks.filter((x) => x.id !== w.id) })} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="text-muted">{t('set.int.secret')}</span>
                  <code className="rounded bg-canvas px-2 py-0.5 font-mono text-[12px] text-ink">{shown === w.id ? w.secret : `${w.secret.slice(0, 6)}••••••••`}</code>
                  <Button variant="link" size="xs" onClick={() => setShown(shown === w.id ? null : w.id)}>{shown === w.id ? t('auth.hidePassword') : t('auth.showPassword')}</Button>
                  <div className="ml-auto flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOpenLog(openLog === w.id ? null : w.id)}>
                      <WebhookIcon /> {t('set.int.log', { count: w.deliveries.length })}
                      {failed > 0 && <Badge tone="danger" className="ml-1">{failed}</Badge>}
                    </Button>
                    {lockTip(<Button variant="secondary" size="sm" disabled={busy || testing === w.id} onClick={() => test(w)}><Send /> {t('set.int.test')}</Button>)}
                  </div>
                </div>
                {openLog === w.id && (
                  <ul className="mt-3 divide-y divide-line rounded-ctl border border-line font-mono text-[12px]">
                    {w.deliveries.length ? w.deliveries.map((x) => (
                      <li key={x.id} className="flex items-center gap-4 px-3 py-2">
                        <Badge tone={x.status < 400 ? 'success' : 'danger'}>{x.status}</Badge>
                        <span className="text-ink">{x.event}</span>
                        <span className="text-muted">{t('set.int.ms', { ms: x.ms })}</span>
                        <span className="ml-auto text-muted">{f.dateTime(x.at)}</span>
                      </li>
                    )) : <li className="px-3 py-4 text-center font-sans text-muted">{t('set.int.noDeliveries')}</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={t('set.int.accounting')} description={t('set.int.accountingHint')}>
        <div className="flex flex-wrap items-end gap-3">
          <Mini label={t('set.int.system')} className="w-64">
            <Select value={int.accounting} onChange={(accounting) => d.set('integrations', { ...int, accounting })} options={(['NONE', 'XERO', 'QUICKBOOKS', 'SAGE'] as const).map((x) => ({ value: x, label: t(`set.int.acc.${x}`) }))} />
          </Mini>
          {int.accounting !== 'NONE' && <Button variant="secondary" onClick={() => comingSoon()}>{t('set.int.connect')}</Button>}
        </div>
      </Section>

      <NewKeyDialog
        open={newKey}
        onOpenChange={setNewKey}
        onCreate={(name, scopes) => {
          const secret = `ts_live_${randomKey(32)}`;
          commit({ ...int, apiKeys: [{ id: uid('key'), name, prefix: 'ts_live_', last4: secret.slice(-4), scopes, createdAt: new Date().toISOString(), createdBy: userId ?? 'system' }, ...int.apiKeys] });
          return secret;
        }}
      />
    </SettingsFrame>
  );
}

function NewKeyDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string, scopes: string[]) => string }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['purchases:read']);
  const [secret, setSecret] = useState<string | null>(null);
  const close = (o: boolean) => {
    if (!o) {
      setSecret(null);
      setName('');
    }
    onOpenChange(o);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{secret ? t('set.int.keyCreated') : t('set.int.newKey')}</DialogTitle>
          <DialogDescription>{secret ? t('set.int.keyOnce') : t('set.int.newKeyHint')}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="flex items-center gap-2 rounded-ctl border border-line bg-canvas p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">{secret}</code>
            <Button variant="ghost" size="iconSm" aria-label={t('set.int.copy')} onClick={() => { void navigator.clipboard?.writeText(secret); toast.success(t('set.int.copied')); }}><Copy /></Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Mini label={t('set.int.keyName')}><TextInput value={name} onChange={setName} autoFocus /></Mini>
            <div>
              <div className="mb-2 text-[12px] font-medium text-muted">{t('set.int.scopes')}</div>
              <div className="grid grid-cols-2 gap-2">
                {API_SCOPES.map((s) => <Checkbox key={s} label={<span className="font-mono text-[13px]">{s}</span>} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />)}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {secret ? <Button onClick={() => close(false)}>{t('set.int.done')}</Button> : (
            <>
              <Button variant="secondary" onClick={() => close(false)}>{t('common.cancel')}</Button>
              <Button disabled={!name.trim() || !scopes.length} onClick={() => setSecret(onCreate(name.trim(), scopes))}>{t('set.int.create')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Data & privacy

const RETENTION: RetentionKey[] = ['syncLogs', 'payloads', 'audio', 'photos', 'activity'];
const RETENTION_DAYS = [14, 30, 60, 90, 180, 365, 730, 1825, 2555, 0];
const SCOPES: DataSharingGrant['scopes'] = ['farmers', 'communities', 'purchases', 'orders', 'traceability', 'impact'];
const PRIVACY_KEYS = ['privacy'] as const;

export function PrivacyPage() {
  const d = useSettingsDraft('privacy', PRIVACY_KEYS);
  const p = d.value.privacy;
  const { orgId, userId } = useActor();
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const orgs = usePlatformStore((s) => s.orgs);
  const allGrants = usePlatformStore((s) => s.grants);
  const grants = useMemo(() => allGrants.filter((g) => g.fromOrgId === orgId || g.toOrgId === orgId), [allGrants, orgId]);
  const [granting, setGranting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const settings = useOrgSettings();
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const flagOf = (id: string) => orgs.find((o) => o.id === id)?.countries[0] ?? 'GH';

  const revoke = (g: DataSharingGrant) => {
    usePlatformStore.getState().updateGrant(g.id, { status: 'REVOKED' });
    useActivityStore.getState().addAudit({ id: uid('aud'), orgId, actorId: userId ?? 'system', entity: 'grant', entityId: g.id, key: 'grant.revoked', before: { status: 'ACTIVE' }, after: { status: 'REVOKED' }, at: new Date().toISOString() });
    toast(t('set.privacy.revoked', { company: orgName(g.toOrgId) }));
  };
  const exportAll = () => {
    const own = <T extends { orgId: string }>(rows: T[]) => rows.filter((r) => r.orgId === orgId);
    const b = useBuyingStore.getState();
    const data = {
      exportedAt: new Date().toISOString(), company: org, settings,
      farmers: own(useFarmerStore.getState().farmers), communities: own(useCommunityStore.getState().communities), groups: own(useGroupStore.getState().groups),
      purchaseRequests: own(b.requests), purchases: own(b.purchases), expenses: own(b.expenses), payments: own(usePaymentStore.getState().payments),
      audit: own(useActivityStore.getState().audit),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${org.code.toLowerCase()}-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    saveSettings(orgId, 'privacy', { privacy: { ...useSettingsStore.getState().settings[orgId]!.privacy, exportRequestedAt: data.exportedAt } });
    toast.success(t('set.privacy.exported'));
  };
  const setDeletion = (at: string | undefined) => {
    saveSettings(orgId, 'privacy', { privacy: { ...useSettingsStore.getState().settings[orgId]!.privacy, deletionRequestedAt: at } });
    auditSettings(orgId, 'privacy', { deletionRequestedAt: at ?? null });
  };

  return (
    <SettingsFrame page="privacy" {...bind(d)}>
      {p.deletionRequestedAt && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger/5 px-5 py-4" role="alert">
          <span className="text-[14px] text-ink">{t('set.privacy.deletionPending', { date: f.date(p.deletionRequestedAt) })}</span>
          <Button variant="secondary" size="sm" onClick={() => setDeletion(undefined)}>{t('set.privacy.cancelDeletion')}</Button>
        </div>
      )}

      <Section title={t('set.privacy.retention')} description={t('set.privacy.retentionHint')}>
        <EditTable head={[t('set.privacy.dataType'), t('set.privacy.keepFor')]} className="[&_table]:min-w-0">
          {RETENTION.map((k) => (
            <tr key={k}>
              <td>
                <div className="font-medium text-ink">{t(`set.privacy.type.${k}`)}</div>
                <div className="text-[12px] text-muted">{t(`set.privacy.typeHint.${k}`)}</div>
              </td>
              <td className="w-56">
                <Select value={String(p.retentionDays[k])} onChange={(v) => d.set('privacy', { ...p, retentionDays: { ...p.retentionDays, [k]: Number(v) } })} options={RETENTION_DAYS.map((n) => ({ value: String(n), label: n === 0 ? t('set.privacy.forever') : n % 365 === 0 ? t('set.privacy.years', { count: n / 365 }) : t('set.privacy.days', { count: n }) }))} aria-label={t('set.privacy.keepFor')} />
              </td>
            </tr>
          ))}
        </EditTable>
      </Section>

      <Section title={t('set.privacy.grants')} description={t('set.privacy.grantsHint')} actions={<Button variant="secondary" size="sm" onClick={() => setGranting(true)}><Plus /> {t('set.privacy.newGrant')}</Button>}>
        <EditTable head={[t('set.privacy.direction'), t('set.privacy.company'), t('set.privacy.scopes'), t('set.privacy.since'), t('set.users.status'), '']}>
          {grants.map((g) => {
            const outgoing = g.fromOrgId === orgId;
            const other = outgoing ? g.toOrgId : g.fromOrgId;
            return (
              <tr key={g.id} className={cn(g.status === 'REVOKED' && 'bg-canvas/70 [&_td]:text-muted')}>
                <td className="w-32"><Badge tone={outgoing ? 'brand' : 'info'}>{t(outgoing ? 'set.privacy.outgoing' : 'set.privacy.incoming')}</Badge></td>
                <td className="font-medium text-ink"><span className="flex items-center gap-2"><Flag code={flagOf(other)} /> {orgName(other)}</span></td>
                <td><div className="flex flex-wrap gap-1">{g.scopes.map((s) => <Badge key={s} tone="neutral">{t(`set.privacy.scope.${s}`)}</Badge>)}{g.communityIds?.length ? <Badge tone="info">{t('share.communitiesCount', { count: g.communityIds.length })}</Badge> : null}</div></td>
                <td className="whitespace-nowrap text-[13px] text-muted">{f.date(g.createdAt)}</td>
                <td className="w-28"><Badge tone={g.status === 'ACTIVE' ? 'teal' : 'neutral'}>{t(`set.privacy.grantStatus.${g.status}`)}</Badge></td>
                <td className="w-24 text-right">{outgoing && g.status === 'ACTIVE' && <Button variant="dangerOutline" size="xs" onClick={() => revoke(g)}>{t('set.int.revoke')}</Button>}</td>
              </tr>
            );
          })}
        </EditTable>
        {!grants.length && <p className="mt-3 text-[14px] text-muted">{t('set.privacy.noGrants')}</p>}
      </Section>

      <Section title={t('set.privacy.export')} description={t('set.privacy.exportHint')}>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="secondary" onClick={exportAll}><Download /> {t('set.privacy.exportBtn')}</Button>
          {p.exportRequestedAt && <span className="text-[13px] text-muted">{t('set.privacy.lastExport', { when: f.relative(p.exportRequestedAt) })}</span>}
        </div>
      </Section>

      <Section title={t('set.privacy.danger')}>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-danger/30 p-5">
          <div>
            <div className="font-medium text-ink">{t('set.privacy.deleteTitle', { company: org.name })}</div>
            <p className="text-[13px] text-muted">{t('set.privacy.deleteHint')}</p>
          </div>
          <Button variant="danger" disabled={!!p.deletionRequestedAt} onClick={() => setDeleting(true)}>{t('set.privacy.deleteBtn')}</Button>
        </div>
      </Section>

      <GrantDialog open={granting} onOpenChange={setGranting} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={(o) => { setDeleting(o); setConfirmName(''); }}
        danger
        title={t('set.privacy.deleteTitle', { company: org.name })}
        body={t('set.privacy.deleteConfirm', { company: org.name })}
        confirm={t('set.privacy.deleteBtn')}
        onConfirm={() => {
          if (confirmName.trim() !== org.name) return;
          setDeletion(new Date().toISOString());
          setDeleting(false);
          setConfirmName('');
          toast(t('set.privacy.deletionRequested'));
        }}
      >
        <TextInput value={confirmName} onChange={setConfirmName} placeholder={org.name} aria-label={t('set.privacy.typeName')} />
      </ConfirmDialog>
    </SettingsFrame>
  );
}

function GrantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const orgs = usePlatformStore((s) => s.orgs);
  const options = orgs.filter((o) => o.id !== orgId && o.type !== 'PLATFORM');
  const [to, setTo] = useState(options[0]?.id ?? '');
  const [scopes, setScopes] = useState<DataSharingGrant['scopes']>(['orders', 'traceability']);
  const own = useCommunityStore((s) => s.communities).filter((c) => c.orgId === orgId).sort((a, b) => a.name.localeCompare(b.name));
  const [picked, setPicked] = useState<string[]>([]);
  const [cq, setCq] = useState('');
  const people = scopes.includes('farmers') || scopes.includes('communities');
  const create = () => {
    const g: DataSharingGrant = { id: uid('grant'), fromOrgId: orgId, toOrgId: to, scopes, communityIds: people && picked.length ? picked : undefined, createdAt: new Date().toISOString(), status: 'ACTIVE' };
    usePlatformStore.getState().addGrant(g);
    useActivityStore.getState().addAudit({ id: uid('aud'), orgId, actorId: userId ?? 'system', entity: 'grant', entityId: g.id, key: 'grant.created', after: { to, scopes }, at: g.createdAt });
    toast.success(t('set.privacy.granted', { company: orgs.find((o) => o.id === to)?.name }));
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('set.privacy.newGrant')}</DialogTitle>
          <DialogDescription>{t('set.privacy.newGrantHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Mini label={t('set.privacy.company')}><Select value={to} onChange={setTo} options={options.map((o) => ({ value: o.id, label: o.name }))} /></Mini>
          <div className="grid grid-cols-2 gap-2">
            {SCOPES.map((s) => <Checkbox key={s} label={t(`set.privacy.scope.${s}`)} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />)}
          </div>
          {people && (
            <Mini label={t('share.whichCommunities')}>
              <p className="mb-2 text-[12px] text-muted">{picked.length ? t('share.pickedCount', { count: picked.length }) : t('share.allCommunities')}</p>
              <TextInput value={cq} onChange={setCq} placeholder={t('share.searchCommunities')} aria-label={t('share.searchCommunities')} />
              <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto rounded-ctl border border-line p-2 sm:grid-cols-2">
                {own.filter((c) => !cq || c.name.toLowerCase().includes(cq.toLowerCase())).map((c) => <Checkbox key={c.id} label={c.name} checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />)}
              </div>
            </Mini>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={!to || !scopes.length} onClick={create}>{t('set.privacy.grant')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
