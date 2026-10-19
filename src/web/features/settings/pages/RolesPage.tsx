import { useMemo, useState } from 'react';
import { Check, Copy, Minus, Plus, Search, Smartphone, Users } from 'lucide-react';
import type { Role } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/shared/Field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PERMISSIONS, RESOURCES, expandPermissions, hasPermission } from '@/engines/permissions';
import { rolesFor } from '@/data/seed/platform';
import { auditSettings } from '@/services/settingsService';
import { cn, uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useActor, useCurrentOrg, usePlanCeiling, useT } from '@/stores/hooks';
import { Mini, Section, Select, SettingsFrame, TextInput } from '../kit';

const MODULE_ORDER = [...new Set(RESOURCES.map((r) => r.module))];

/** Settings → Roles & permissions (PRD A4, 8.12): roles with user counts, create/copy, matrix by module, compare. */
export function RolesPage() {
  const { orgId } = useActor();
  const org = useCurrentOrg();
  const { t } = useT();
  const allRoles = useAccessStore((s) => s.roles);
  const memberships = useAccessStore((s) => s.memberships);
  const stored = useMemo(() => allRoles.filter((r) => r.orgId === orgId), [allRoles, orgId]);
  const [draft, setDraft] = useState<Role[] | null>(null);
  const roles = draft ?? stored;
  const [selected, setSelected] = useState(roles[0]?.id ?? '');
  const role = roles.find((r) => r.id === selected) ?? roles[0];
  const [creating, setCreating] = useState(false);
  const plans = usePlatformStore((s) => s.plans);
  const plan = plans.find((p) => p.id === org.planId);
  const ceiling = usePlanCeiling();

  const nameOf = (r: Role) => r.name ?? t(`role.${r.template}`);
  const users = (id: string) => memberships.filter((m) => m.orgId === orgId && m.roleIds.includes(id) && m.status !== 'DEACTIVATED').length;
  const edit = (fn: (rs: Role[]) => Role[]) => setDraft((d) => fn(d ?? stored));
  const setRole = (id: string, patch: Partial<Role>) => edit((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(stored);
  const baseline = useMemo(() => rolesFor(orgId, org.type === 'BUYER' ? 'buyer' : org.type === 'PLATFORM' ? 'platform' : 'supplier'), [orgId, org.type]);

  const errors: string[] = [];
  const admins = roles.filter((r) => hasPermission(r.permissions, 'settings.manageRoles') && users(r.id) > 0);
  if (!admins.length) errors.push(t('set.roles.errNoAdmin'));
  if (roles.some((r) => !nameOf(r).trim())) errors.push(t('set.roles.errName'));

  const save = () => {
    const before = stored.map((r) => ({ id: r.id, permissions: r.permissions.length }));
    useAccessStore.getState().setOrgRoles(orgId, roles);
    auditSettings(orgId, 'roles', roles.map((r) => ({ id: r.id, name: nameOf(r), permissions: r.permissions.length })), before);
    setDraft(null);
  };

  return (
    <SettingsFrame
      page="roles"
      dirty={dirty}
      onSave={save}
      onCancel={() => setDraft(null)}
      onReset={() => setDraft([...baseline, ...stored.filter((r) => !baseline.some((b) => b.id === r.id) && users(r.id) > 0)])}
      canReset={JSON.stringify(baseline) !== JSON.stringify(roles)}
      errors={errors}
      actions={<Button variant="secondary" onClick={() => setCreating(true)}><Plus /> {t('set.roles.new')}</Button>}
    >
      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">{t('set.roles.matrix')}</TabsTrigger>
          <TabsTrigger value="compare">{t('set.roles.compare')}</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-6">
          <div className="grid gap-8 xl:grid-cols-[260px_minmax(0,1fr)]">
            <ul className="space-y-1" aria-label={t('set.roles.list')}>
              {roles.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r.id)} aria-current={r.id === role?.id} className={cn('flex w-full items-center justify-between gap-2 rounded-ctl px-3 py-2.5 text-left text-[14px]', r.id === role?.id ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-canvas')}>
                    <span className="min-w-0 truncate font-medium">{nameOf(r)}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                      {r.mobile && <Smartphone className="h-3.5 w-3.5" aria-label={t('set.roles.mobile')} />}
                      <Users className="h-3.5 w-3.5" aria-hidden="true" /> {users(r.id)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {role && (
              <div className="min-w-0 space-y-6">
                <div className="flex flex-wrap items-end gap-4">
                  <Mini label={t('set.roles.name')} className="w-72"><TextInput value={role.name ?? ''} placeholder={t(`role.${role.template}`)} onChange={(name) => setRole(role.id, { name: name || undefined })} /></Mini>
                  <label className="mb-2.5 flex items-center gap-2 text-[14px] text-body"><Switch checked={!!role.mobile} onCheckedChange={(mobile) => setRole(role.id, { mobile })} /> {t('set.roles.mobileSignIn')}</label>
                  <div className="mb-1 ml-auto flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { const id = uid('role'); edit((rs) => [...rs, { ...role, id, name: t('set.roles.copyOf', { name: nameOf(role) }) }]); setSelected(id); }}><Copy /> {t('set.roles.copy')}</Button>
                    <Tip label={users(role.id) ? t('set.roles.inUse', { count: users(role.id) }) : t('set.roles.delete')}>
                      <span tabIndex={0}>
                        <Button variant="dangerOutline" size="sm" disabled={users(role.id) > 0} onClick={() => { edit((rs) => rs.filter((r) => r.id !== role.id)); setSelected(roles.find((r) => r.id !== role.id)?.id ?? ''); }}>{t('set.roles.delete')}</Button>
                      </span>
                    </Tip>
                  </div>
                </div>
                <Matrix role={role} onChange={(permissions) => setRole(role.id, { permissions })} ceiling={ceiling} planName={plan?.name ?? ''} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="compare" className="mt-6">
          <Compare roles={roles} nameOf={nameOf} />
        </TabsContent>
      </Tabs>

      <NewRoleDialog
        open={creating}
        onOpenChange={setCreating}
        roles={roles}
        nameOf={nameOf}
        onCreate={(name, fromId) => {
          const from = roles.find((r) => r.id === fromId);
          const id = uid('role');
          edit((rs) => [...rs, { id, orgId, template: from?.template ?? 'auditor', name, permissions: from ? [...from.permissions] : ['dashboard.view'], mobile: from?.mobile }]);
          setSelected(id);
          setCreating(false);
        }}
      />
    </SettingsFrame>
  );
}

function Matrix({ role, onChange, ceiling, planName }: { role: Role; onChange: (p: string[]) => void; ceiling: string[]; planName: string }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const granted = useMemo(() => new Set(expandPermissions(role.permissions)), [role.permissions]);
  const set = (keys: string[], on: boolean) => {
    const next = new Set(granted);
    for (const k of keys) {
      if (!hasPermission(ceiling, k) && !k.startsWith('platform.')) continue;
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(PERMISSIONS.map((p) => p.key).filter((k) => next.has(k)));
  };
  const query = q.trim().toLowerCase();
  const label = (resource: string, action: string) => `${t(`perm.resource.${resource}`)} ${t(`perm.action.${action}`)}`.toLowerCase();
  const total = PERMISSIONS.filter((p) => p.module !== 'platform').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input compact value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('set.roles.search')} className="pl-9" aria-label={t('set.roles.search')} />
        </div>
        <Badge tone="brand">{t('set.roles.count', { granted: [...granted].filter((k) => !k.startsWith('platform.')).length, total })}</Badge>
      </div>
      {MODULE_ORDER.filter((m) => m !== 'platform').map((m) => {
        const resources = RESOURCES.filter((r) => r.module === m && (!query || r.actions.some((a) => label(r.resource, a).includes(query) || t(`module.${m}`).toLowerCase().includes(query))));
        if (!resources.length) return null;
        const keys = resources.flatMap((r) => r.actions.map((a) => `${r.resource}.${a}`));
        const allOn = keys.every((k) => granted.has(k) || !hasPermission(ceiling, k));
        return (
          <section key={m} className="rounded-card border border-line">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-2.5">
              <h4 className="text-[14px] font-semibold text-ink">{t(`module.${m}`)}</h4>
              <Button variant="ghost" size="xs" onClick={() => set(keys, !allOn)}>{allOn ? t('set.roles.clearAll') : t('set.roles.selectAll')}</Button>
            </header>
            <div className="divide-y divide-line">
              {resources.map((r) => (
                <div key={r.resource} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                  <div className="w-48 shrink-0 text-[14px] font-medium text-ink">{t(`perm.resource.${r.resource}`)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.actions.map((a) => {
                      const key = `${r.resource}.${a}`;
                      const on = granted.has(key);
                      const allowed = hasPermission(ceiling, key);
                      const chip = (
                        <button key={key} type="button" disabled={!allowed} aria-pressed={on} onClick={() => set([key], !on)} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40', on ? 'border-brand bg-brand text-white' : 'border-line text-body hover:border-brand/40')}>
                          {on && <Check className="h-3 w-3" />} {t(`perm.action.${a}`)}
                        </button>
                      );
                      return allowed ? chip : <Tip key={key} label={t('set.roles.notInPlan', { plan: planName })}><span tabIndex={0}>{chip}</span></Tip>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Compare({ roles, nameOf }: { roles: Role[]; nameOf: (r: Role) => string }) {
  const { t } = useT();
  const [picked, setPicked] = useState<string[]>(roles.slice(1, 3).map((r) => r.id));
  const [onlyDiff, setOnlyDiff] = useState(true);
  const cols = roles.filter((r) => picked.includes(r.id));
  const sets = cols.map((r) => new Set(expandPermissions(r.permissions)));
  const rows = PERMISSIONS.filter((p) => p.module !== 'platform').filter((p) => {
    const vals = sets.map((s) => s.has(p.key));
    return onlyDiff ? vals.some((v) => v !== vals[0]) : vals.some(Boolean);
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {roles.map((r) => (
          <Checkbox key={r.id} label={nameOf(r)} checked={picked.includes(r.id)} disabled={!picked.includes(r.id) && picked.length >= 4} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))} />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[14px] text-body"><Switch checked={onlyDiff} onCheckedChange={setOnlyDiff} /> {t('set.roles.onlyDiff')}</label>
      {cols.length < 2 ? (
        <p className="rounded-ctl border border-dashed border-line px-4 py-8 text-center text-[14px] text-muted">{t('set.roles.pickTwo')}</p>
      ) : (
        <Section title={t('set.roles.diffCount', { count: rows.length })}>
          <div className="max-h-[560px] overflow-auto rounded-ctl border border-line">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-canvas">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.roles.permission')}</th>
                  {cols.map((r) => <th key={r.id} className="px-3 py-2.5 text-center text-[12px] font-semibold text-ink">{nameOf(r)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.key} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{t(`perm.resource.${p.resource}`)} · <span className="text-muted">{t(`perm.action.${p.action}`)}</span></td>
                    {sets.map((s, i) => (
                      <td key={cols[i]!.id} className="px-3 py-2 text-center">{s.has(p.key) ? <Check className="mx-auto h-4 w-4 text-success" aria-label={t('common.yes')} /> : <Minus className="mx-auto h-4 w-4 text-line" aria-label={t('common.no')} />}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function NewRoleDialog({ open, onOpenChange, roles, nameOf, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; roles: Role[]; nameOf: (r: Role) => string; onCreate: (name: string, fromId: string) => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('set.roles.new')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Mini label={t('set.roles.name')}><TextInput value={name} onChange={setName} autoFocus /></Mini>
          <Mini label={t('set.roles.startFrom')}>
            <Select value={from} onChange={setFrom} options={[{ value: '', label: t('set.roles.blank') }, ...roles.map((r) => ({ value: r.id, label: t('set.roles.copyFrom', { name: nameOf(r) }) }))]} />
          </Mini>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={!name.trim()} onClick={() => { onCreate(name.trim(), from); setName(''); setFrom(''); }}>{t('set.roles.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
