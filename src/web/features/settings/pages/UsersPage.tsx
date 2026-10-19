import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { MoreHorizontal, Search, Upload, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { Membership, User } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/shared/Avatar';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PermissionGate } from '@/components/shared/Gates';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { inviteUser, removeMember, resendInvite, revokeInvite, setMemberRoles, setMemberStatus, unlockUser } from '@/services/userService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActor, useCurrentOrg, useFormat, useRoleName, useT } from '@/stores/hooks';
import { ConfirmDialog, EditTable, Mini, Section, Segmented, Select, SettingsFrame, TextInput } from '../kit';

type Filter = 'all' | 'ACTIVE' | 'INVITED' | 'DEACTIVATED';

/** Settings → Users (PRD A4): invite (single, bulk CSV), roles per company, status, last active, deactivate, remove, resend. */
export function UsersPage() {
  const { orgId, userId } = useActor();
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const roleName = useRoleName();
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const invites = useAccessStore((s) => s.invites);
  const allRoles = useAccessStore((s) => s.roles);
  const roles = useMemo(() => allRoles.filter((r) => r.orgId === orgId), [allRoles, orgId]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [inviting, setInviting] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'deactivate'; m: Membership; u: User } | null>(null);
  const actor = userId ?? 'system';

  const rows = useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u]));
    return memberships
      .filter((m) => m.orgId === orgId)
      .map((m) => ({ m, u: byId.get(m.userId)! }))
      .filter((x) => x.u)
      .map((x) => ({ ...x, status: x.u.status === 'LOCKED' ? 'LOCKED' : x.m.status }))
      .sort((a, b) => a.u.name.localeCompare(b.u.name));
  }, [users, memberships, orgId]);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === 'all' || r.status === filter) && (!query || r.u.name.toLowerCase().includes(query) || r.u.email.toLowerCase().includes(query)));
  const pendingInvite = (email: string) => invites.find((i) => i.orgId === orgId && i.email.toLowerCase() === email.toLowerCase() && i.status === 'PENDING');
  const counts = { all: rows.length, ACTIVE: rows.filter((r) => r.status === 'ACTIVE').length, INVITED: rows.filter((r) => r.status === 'INVITED').length, DEACTIVATED: rows.filter((r) => r.status === 'DEACTIVATED').length };

  return (
    <SettingsFrame
      page="users"
      actions={
        <>
          <PermissionGate permission="settings.manageUsers"><Button variant="secondary" onClick={() => setBulk(true)}><Upload /> {t('set.users.bulk')}</Button></PermissionGate>
          <PermissionGate permission="settings.manageUsers"><Button onClick={() => setInviting(true)}><UserPlus /> {t('set.users.invite')}</Button></PermissionGate>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input compact value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('set.users.search')} className="pl-9" aria-label={t('set.users.search')} />
        </div>
        <Segmented label={t('set.users.filter')} value={filter} onChange={setFilter} options={(['all', 'ACTIVE', 'INVITED', 'DEACTIVATED'] as const).map((x) => ({ value: x, label: `${t(`set.users.filterName.${x}`)} · ${counts[x]}` }))} />
      </div>

      <EditTable head={[t('set.users.person'), t('set.users.role'), t('set.users.status'), t('set.users.lastActive'), '']}>
        {shown.map(({ m, u, status }) => {
          const inv = pendingInvite(u.email);
          const self = u.id === userId;
          return (
            <tr key={m.id} className={cn(status === 'DEACTIVATED' && 'opacity-60')}>
              <td className="min-w-64">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} color={u.avatarColor} size={32} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{u.name} {self && <Badge tone="neutral" className="ml-1">{t('set.users.you')}</Badge>}</div>
                    <div className="truncate text-[12px] text-muted">{u.email}{m.title ? ` · ${m.title}` : ''}</div>
                  </div>
                </div>
              </td>
              <td className="w-60">
                <Select value={m.roleIds[0] ?? ''} disabled={self} onChange={(rid) => { setMemberRoles(m.id, [rid, ...m.roleIds.slice(1).filter((x) => x !== rid)], actor); toast.success(t('set.users.roleChanged', { name: u.name, role: roleName(rid) })); }} options={roles.map((r) => ({ value: r.id, label: roleName(r.id) }))} aria-label={t('set.users.role')} />
                {m.roleIds.length > 1 && <div className="mt-1 text-[12px] text-muted">{t('set.users.moreRoles', { roles: m.roleIds.slice(1).map(roleName).join(', ') })}</div>}
              </td>
              <td className="w-40">
                <StatusBadge status={status} />
                {u.twoFactor.enabled && <Badge tone="neutral" className="ml-1.5">{t('set.users.twoStep')}</Badge>}
                {inv && <div className="mt-1 text-[12px] text-muted">{t('set.users.expires', { when: f.relative(inv.expiresAt) })}</div>}
              </td>
              <td className="w-40 text-[13px] text-muted">{u.lastActiveAt && status !== 'INVITED' ? f.relative(u.lastActiveAt) : '—'}</td>
              <td className="w-12">
                {!self && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="iconSm" aria-label={t('set.users.actions', { name: u.name })}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {inv && <DropdownMenuItem onSelect={() => { resendInvite(inv.id, actor); toast.success(t('set.users.resent', { email: u.email })); }}>{t('set.users.resend')}</DropdownMenuItem>}
                      {inv && <DropdownMenuItem onSelect={() => { revokeInvite(inv.id, actor); toast(t('set.users.revoked', { email: u.email })); }}>{t('set.users.revoke')}</DropdownMenuItem>}
                      {status === 'LOCKED' && <DropdownMenuItem onSelect={() => { unlockUser(u.id, orgId, actor); toast.success(t('set.users.unlocked', { name: u.name })); }}>{t('set.users.unlock')}</DropdownMenuItem>}
                      {status === 'DEACTIVATED' ? (
                        <DropdownMenuItem onSelect={() => { setMemberStatus(m.id, 'ACTIVE', actor); toast.success(t('set.users.reactivated', { name: u.name })); }}>{t('set.users.reactivate')}</DropdownMenuItem>
                      ) : status !== 'INVITED' ? (
                        <DropdownMenuItem onSelect={() => setConfirm({ kind: 'deactivate', m, u })}>{t('set.users.deactivate')}</DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-danger" onSelect={() => setConfirm({ kind: 'remove', m, u })}>{t('set.users.remove', { company: org.name })}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </td>
            </tr>
          );
        })}
      </EditTable>
      {!shown.length && <p className="text-center text-[14px] text-muted">{t('set.users.none')}</p>}

      <Section title={t('set.users.byRole')}>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const n = rows.filter((x) => x.m.roleIds.includes(r.id) && x.status !== 'DEACTIVATED').length;
            return n ? <Badge key={r.id} tone="neutral">{roleName(r.id)} · {n}</Badge> : null;
          })}
        </div>
      </Section>

      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <BulkDialog open={bulk} onOpenChange={setBulk} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        danger
        title={confirm?.kind === 'remove' ? t('set.users.removeTitle', { name: confirm.u.name, company: org.name }) : t('set.users.deactivateTitle', { name: confirm?.u.name ?? '' })}
        body={confirm?.kind === 'remove' ? t('set.users.removeBody') : t('set.users.deactivateBody')}
        confirm={confirm?.kind === 'remove' ? t('set.users.removeConfirm') : t('set.users.deactivate')}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'remove') removeMember(confirm.m.id, actor);
          else setMemberStatus(confirm.m.id, 'DEACTIVATED', actor);
          toast(t(confirm.kind === 'remove' ? 'set.users.removed' : 'set.users.deactivated', { name: confirm.u.name }));
          setConfirm(null);
        }}
      />
    </SettingsFrame>
  );
}

function useInviteRoles() {
  const { orgId } = useActor();
  const allRoles = useAccessStore((s) => s.roles);
  const roleName = useRoleName();
  return useMemo(() => allRoles.filter((r) => r.orgId === orgId).map((r) => ({ value: r.id, label: roleName(r.id), template: r.template })), [allRoles, orgId, roleName]);
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { orgId, userId } = useActor();
  const org = useCurrentOrg();
  const { t } = useT();
  const roles = useInviteRoles();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState('');
  const submit = () => {
    const res = inviteUser(orgId, { name, email, roleIds: [roleId || roles[0]!.value] }, userId ?? 'system');
    if (!res.ok) {
      setError(t(`set.users.err.${res.reason}`));
      return;
    }
    toast.success(t('set.users.invited', { email: res.invite.email, company: org.name }), { description: t('set.users.invitedBody') });
    setName('');
    setEmail('');
    setError('');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('set.users.inviteTitle', { company: org.name })}</DialogTitle>
          <DialogDescription>{t('set.users.inviteHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Mini label={t('set.users.name')}><TextInput value={name} onChange={setName} autoFocus /></Mini>
          <Mini label={t('set.users.email')}><TextInput type="email" value={email} onChange={(v) => { setEmail(v); setError(''); }} aria-invalid={!!error} /></Mini>
          <Mini label={t('set.users.role')}><Select value={roleId || roles[0]?.value || ''} onChange={setRoleId} options={roles} /></Mini>
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={!email.trim()}>{t('set.users.send')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const roles = useInviteRoles();
  const [text, setText] = useState('');
  const parsed = useMemo(() => {
    const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
    const rows = res.data.filter((r) => r.length && !(r[1] ?? '').toLowerCase().includes('email'));
    return rows.map(([name = '', email = '', role = '']) => {
      const match = roles.find((r) => r.label.toLowerCase() === role.trim().toLowerCase() || r.template.toLowerCase() === role.trim().toLowerCase());
      const ok = /^\S+@\S+\.\S+$/.test(email.trim()) && !!match;
      return { name: name.trim(), email: email.trim(), role: role.trim(), roleId: match?.value, ok, why: !match ? 'role' : !ok ? 'email' : '' };
    });
  }, [text, roles]);
  const good = parsed.filter((r) => r.ok);
  const run = () => {
    let sent = 0;
    const failed: string[] = [];
    for (const r of good) {
      const res = inviteUser(orgId, { name: r.name, email: r.email, roleIds: [r.roleId!] }, userId ?? 'system');
      if (res.ok) sent++;
      else failed.push(r.email);
    }
    toast.success(t('set.users.bulkDone', { count: sent }), failed.length ? { description: t('set.users.bulkSkipped', { emails: failed.join(', ') }) } : undefined);
    setText('');
    onOpenChange(false);
  };
  const sample = `${t('set.users.csvHeader')}\nAkosua Frimpong,akosua@example.com,${roles.find((r) => r.template === 'meOfficer')?.label ?? roles[0]?.label ?? ''}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('set.users.bulkTitle')}</DialogTitle>
          <DialogDescription>{t('set.users.bulkHint')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-ctl border border-line px-4 text-[14px] font-medium text-ink hover:border-brand/40">
            <Upload className="h-4 w-4" /> {t('set.locations.chooseFile')}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => setText(await e.target.files?.[0]?.text() ?? '')} />
          </label>
          <Button variant="ghost" onClick={() => setText(sample)}>{t('set.users.useSample')}</Button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={sample} aria-label={t('set.users.bulkTitle')} className="w-full rounded-ctl border border-line bg-surface p-3 font-mono text-[13px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" />
        {parsed.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-ctl border border-line text-[13px]">
            <table className="w-full">
              <tbody>
                {parsed.map((r, i) => (
                  <tr key={i} className="border-t border-line first:border-0">
                    <td className="px-3 py-1.5 text-ink">{r.name || '—'}</td>
                    <td className="px-3 py-1.5 font-mono">{r.email}</td>
                    <td className="px-3 py-1.5">{r.role}</td>
                    <td className="px-3 py-1.5 text-right">{r.ok ? <Badge tone="success">{t('set.users.ready')}</Badge> : <Badge tone="danger">{t(`set.users.bad.${r.why}`)}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={run} disabled={!good.length}>{t('set.users.sendCount', { count: good.length })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
