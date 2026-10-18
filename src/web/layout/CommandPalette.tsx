import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, RotateCcw, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { APP_ROUTES, SETTINGS_PAGES } from '@/app/routes';
import { useCurrentOrg, useRouteAccessFn, useT, useUserOrgs } from '@/stores/hooks';
import { resetDemoData } from '@/stores/persistence';
import { useSessionStore } from '@/stores/sessionStore';
import { CompanyLogo } from '@/components/shared/Logo';

/** Global search / command palette (⌘K). */
export function CommandPalette({ open, onOpenChange, onOpenMobile }: { open: boolean; onOpenChange: (o: boolean) => void; onOpenMobile: () => void }) {
  const navigate = useNavigate();
  const access = useRouteAccessFn();
  const orgs = useUserOrgs();
  const org = useCurrentOrg();
  const switchOrg = useSessionStore((s) => s.switchOrg);
  const { t } = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };
  const pages = APP_ROUTES.filter((r) => access(r) === 'ok');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">{t('shell.searchShort')}</DialogTitle>
        <Command>
          <CommandInput placeholder={t('shell.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty className="py-8 text-center text-[14px] text-muted">{t('shell.noResults')}</CommandEmpty>
            <CommandGroup heading={t('shell.commandPages')}>
              {pages.map((r) => (
                <CommandItem key={r.key} value={`${t(`nav.${r.key}`)} ${r.path}`} onSelect={() => go(r.path)}>
                  <r.icon /> {t(`nav.${r.key}`)}
                </CommandItem>
              ))}
              {access(APP_ROUTES.find((r) => r.key === 'settings')!) === 'ok' &&
                SETTINGS_PAGES.map((p) => (
                  <CommandItem key={p} value={`${t('nav.settings')} ${t(`settings.page.${p}`)}`} onSelect={() => go(`/app/settings/${p}`)}>
                    <span className="w-[18px]" /> {`${t('nav.settings')} · ${t(`settings.page.${p}`)}`}
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandGroup heading={t('shell.commandActions')}>
              <CommandItem value={t('shell.openMobile')} onSelect={() => { onOpenChange(false); onOpenMobile(); }}>
                <Smartphone /> {t('shell.openMobile')}
              </CommandItem>
              <CommandItem value={t('shell.resetDemo')} onSelect={resetDemoData}>
                <RotateCcw /> {t('shell.resetDemo')}
              </CommandItem>
            </CommandGroup>
            {orgs.length > 1 && (
              <CommandGroup heading={t('shell.commandCompanies')}>
                {orgs.filter((o) => o.id !== org.id).map((o) => (
                  <CommandItem key={o.id} value={`${t('shell.switchCompany')} ${o.name}`} onSelect={() => { switchOrg(o.id, o.language); onOpenChange(false); navigate('/app'); }}>
                    <Building2 /> <CompanyLogo text={o.branding.logoText} color={o.branding.primaryColor} size={20} /> {o.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
