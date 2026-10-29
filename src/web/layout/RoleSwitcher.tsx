import { useNavigate } from 'react-router-dom';
import { Languages, LogOut, Moon, Sun, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSessionStore } from '@/stores/sessionStore';
import type { Lang } from '@/types';
import { Avatar } from '@/components/shared/Avatar';
import { useCurrentOrg, useCurrentUser, useRoleName, useT } from '@/stores/hooks';
import { useAccessStore } from '@/stores/accessStore';
import { signOutThisTab } from '@/services/authService';

/** Account menu (avatar): account, language, appearance, sign out. Demo persona switching lives in the Demo panel. */
export function RoleSwitcher() {
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const memberships = useAccessStore((s) => s.memberships);
  const roleName = useRoleName();
  const navigate = useNavigate();
  const { t } = useT();
  const { language, setLanguage, theme, setTheme } = useSessionStore();
  if (!user) return null;
  const langs: Lang[] = ['en', 'fr'];
  const m = memberships.find((x) => x.userId === user.id && x.orgId === org.id) ?? memberships.find((x) => x.userId === user.id);
  const role = user.isPlatformOwner ? t('shell.platformBadge') : m ? m.title ?? roleName(m.roleIds[0]!) : '';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full p-1 transition-colors hover:bg-canvas lg:pr-3" aria-label={t('shell.myAccount')} data-tour="persona">
        <Avatar name={user.name} color={user.avatarColor} />
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight text-ink">{user.name}</span>
          <span className="block max-w-[140px] truncate text-[12px] leading-tight text-muted">{role}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 py-2">
          <div className="truncate text-[14px] font-semibold text-ink">{user.name}</div>
          <div className="truncate text-[12px] text-muted">{user.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/app/account')}>
          <UserCircle /> {t('shell.myAccount')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger value={language.toUpperCase()}><Languages /> {t('shell.language')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={language} onValueChange={(v) => setLanguage(v as Lang)}>
              {langs.map((l) => <DropdownMenuRadioItem key={l} value={l}>{t(`set.lang.${l}`)}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger value={theme === 'dark' ? t('shell.themeDark') : t('shell.themeLight')}>{theme === 'dark' ? <Moon /> : <Sun />} {t('shell.theme')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark')}>
              <DropdownMenuRadioItem value="light">{t('shell.themeLight')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">{t('shell.themeDark')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOutThisTab();
            toast(t('shell.signedOut'));
            navigate('/sign-in');
          }}
        >
          <LogOut /> {t('shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
