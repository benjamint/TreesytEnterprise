import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { CompanyLogo } from '@/components/shared/Logo';
import { Flag } from '@/components/shared/Flag';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCurrentOrg, useCurrentUser, useT, useUserOrgs } from '@/stores/hooks';
import { useSessionStore } from '@/stores/sessionStore';
import { usePlatformStore } from '@/stores/platformStore';
import i18n from '@/i18n';
import { pathOpenFor } from './access';

/** Company switcher pill with logo + flag (PRD 6.1 top bar, A5). */
export function CompanySwitcher() {
  const org = useCurrentOrg();
  const orgs = useUserOrgs();
  const user = useCurrentUser();
  const switchOrg = useSessionStore((s) => s.switchOrg);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useT();

  const onSwitch = (orgId: string) => {
    if (orgId === org.id) return;
    const target = usePlatformStore.getState().orgs.find((o) => o.id === orgId)!;
    switchOrg(orgId, target.language);
    // Toast in the company's language so the change is obvious.
    toast.success(i18n.t('shell.switchedCompany', { company: target.name, lng: target.language }));
    if (!pathOpenFor(location.pathname, orgId, user!.id)) navigate('/app');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-11 min-w-0 shrink-0 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-2 sm:pr-3 text-left shadow-soft transition-colors hover:border-brand/40"
        aria-label={t('shell.switchCompany')}
        data-tour="company-switcher"
      >
        <CompanyLogo text={org.branding.logoText} color={org.branding.primaryColor} size={32} />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-[14px] font-semibold leading-tight text-ink">{org.name}</span>
          <span className="flex items-center gap-1.5 text-[12px] leading-tight text-muted">
            <Flag code={org.countries[0]!} className="h-2.5 w-3.5" />
            {t(`orgType.${org.type}`)}
          </span>
        </span>
        <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>{user?.isPlatformOwner ? t('shell.allCompanies') : t('shell.yourCompanies')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={org.id} onValueChange={onSwitch}>
          {orgs.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id} className="py-2.5">
              <CompanyLogo text={o.branding.logoText} color={o.branding.primaryColor} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{o.name}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <Flag code={o.countries[0]!} className="h-2.5 w-3.5" />
                  {t(`orgType.${o.type}`)}
                  <span aria-hidden="true">·</span>
                  {o.currency}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
