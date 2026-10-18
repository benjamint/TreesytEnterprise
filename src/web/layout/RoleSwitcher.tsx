import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Avatar } from '@/components/shared/Avatar';
import { useCurrentOrg, useCurrentUser, useRoleName, useT } from '@/stores/hooks';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSessionStore } from '@/stores/sessionStore';
import i18n from '@/i18n';

/** Avatar menu with the demo persona switcher (PRD 2.2). */
export function RoleSwitcher() {
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const orgs = usePlatformStore((s) => s.orgs);
  const { signIn, signOut, viewAs, setViewAs } = useSessionStore();
  const roleName = useRoleName();
  const navigate = useNavigate();
  const { t } = useT();

  const personas = useMemo(
    () =>
      users
        .filter((u) => u.persona)
        .map((u) => ({ user: u, membership: memberships.find((m) => m.userId === u.id)! }))
        .filter((p) => p.membership),
    [users, memberships],
  );
  const groups = useMemo(() => orgs.map((o) => ({ org: o, items: personas.filter((p) => p.membership.orgId === o.id) })).filter((g) => g.items.length), [orgs, personas]);
  const myMembership = memberships.find((m) => m.userId === user?.id && m.orgId === org.id) ?? memberships.find((m) => m.userId === user?.id);

  const onPick = (userId: string) => {
    const p = personas.find((x) => x.user.id === userId)!;
    // The platform owner keeps the company being viewed; everyone else lands in their own company.
    const orgId = p.user.isPlatformOwner ? org.id : p.membership.orgId;
    signIn(p.user.id, orgId, p.user.language);
    toast.success(i18n.t('shell.switchedPersona', { name: p.user.name, lng: p.user.language }));
    navigate('/app');
  };

  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full p-1 pr-1 transition-colors hover:bg-canvas lg:pr-3" aria-label={t('shell.switchPersona')} data-tour="persona">
        <Avatar name={user.name} color={user.avatarColor} />
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight text-ink">{user.name}</span>
          <span className="block max-w-[140px] truncate text-[12px] leading-tight text-muted">
            {user.isPlatformOwner ? t('shell.platformBadge') : myMembership ? roleName(myMembership.roleIds[0]!) : ''}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[80vh] w-80 overflow-y-auto scrollbar-thin">
        <div className="px-2.5 py-2 text-[13px] text-muted">{t('shell.signedInAs', { name: user.name })}</div>
        <DropdownMenuItem onSelect={() => navigate('/app/account')}>
          <UserCircle /> {t('shell.myAccount')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setViewAs(!viewAs); }}>
          <Eye />
          <span className="flex-1">
            <span className="block">{t('shell.viewAs')}</span>
            <span className="block text-[12px] text-muted">{t('shell.viewAsHint')}</span>
          </span>
          <Switch checked={viewAs} aria-label={t('shell.viewAs')} tabIndex={-1} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('shell.personas')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={user.id} onValueChange={onPick}>
          {groups.map((g) => (
            <div key={g.org.id}>
              <div className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-muted">{g.org.name}</div>
              {g.items.map(({ user: u, membership: m }) => (
                <DropdownMenuRadioItem key={u.id} value={u.id}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-[12px] text-muted">{u.isPlatformOwner ? t('shell.platformBadge') : m.title ?? roleName(m.roleIds[0]!)}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut();
            toast(t('shell.signedOut'));
            navigate('/');
          }}
        >
          <LogOut /> {t('shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
