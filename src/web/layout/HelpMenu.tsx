import { useEffect, useState } from 'react';
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, CircleHelp, Keyboard, PlayCircle, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { APP_ROUTES } from '@/app/routes';
import { useCurrentOrg, useT } from '@/stores/hooks';

export const TOUR_EVENT = 'treesyt:tour';
/** Opens the shortcuts dialog from anywhere (Help centre). */
export const SHORTCUTS_EVENT = 'treesyt:shortcuts';

export function useCurrentRoute() {
  const { pathname } = useLocation();
  return [...APP_ROUTES].sort((a, b) => b.path.length - a.path.length).find((r) => matchPath({ path: r.path, end: false }, pathname));
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-chip border border-line bg-canvas px-2 py-0.5 font-mono text-[12px] text-ink">{children}</kbd>;
}

/** Help menu (PRD 6.5). */
export function HelpMenu() {
  const [shortcuts, setShortcuts] = useState(false);
  const [configurable, setConfigurable] = useState(false);
  const navigate = useNavigate();
  const route = useCurrentRoute();
  const org = useCurrentOrg();
  const { t } = useT();
  useEffect(() => {
    const show = () => setShortcuts(true);
    window.addEventListener(SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(SHORTCUTS_EVENT, show);
  }, []);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('shell.help')} data-tour="help-menu">
            <CircleHelp />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
            <PlayCircle /> {t('shell.replayTour')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfigurable(true)}>
            <Settings2 /> {t('shell.whatsConfigurable')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/app/help')}>
            <BookOpen /> {t('shell.knowledgeBase')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShortcuts(true)}>
            <Keyboard /> {t('shell.shortcuts')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={shortcuts} onOpenChange={setShortcuts}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('help.shortcutsTitle')}</DialogTitle>
          </DialogHeader>
          <dl className="space-y-3 text-[14px]">
            {[
              ['⌘ K', 'shell.shortcutPalette'],
              ['?', 'shell.shortcutHelp'],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between">
                <dt>{t(label!)}</dt>
                <dd><Kbd>{k!}</Kbd></dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>


      <Sheet open={configurable} onOpenChange={setConfigurable}>
        <SheetContent closeLabel={t('common.close')} className="max-w-[440px] p-8">
          <SheetTitle className="text-xl font-semibold text-ink">{t('shell.whatsConfigurable')}</SheetTitle>
          <SheetDescription className="mt-1.5 text-[14px] text-muted">
            {route?.configurable?.length ? t('shell.configurableIntro', { company: org.name }) : t('shell.configurableNone')}
          </SheetDescription>
          <ul className="mt-6 space-y-2">
            {route?.configurable?.map((p) => (
              <li key={p}>
                <Link to={`/app/settings/${p}`} onClick={() => setConfigurable(false)} className="block rounded-ctl border border-line px-4 py-3 transition-colors hover:border-brand/40 hover:bg-brand-soft/50">
                  <span className="block font-medium text-ink">{t(`settings.page.${p}`)}</span>
                  <span className="block text-[13px] text-muted">{t(`settings.pageDesc.${p}`, { company: org.name })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
