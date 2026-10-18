import { useNavigate } from 'react-router-dom';
import { Menu, Moon, Search, Sparkles, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { routeByKey } from '@/app/routes';
import { useRouteAccessFn, useT } from '@/stores/hooks';
import { useSessionStore } from '@/stores/sessionStore';
import type { Lang } from '@/types';
import { CompanySwitcher } from './CompanySwitcher';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationsBell } from './NotificationsBell';
import { HelpMenu } from './HelpMenu';

/**
 * Top bar (PRD 7): company switcher · search (⌘K) · Ask AI · EN/FR · theme · bell · help · account.
 * "Open mobile app" lives in the Demo panel with the other prototype-only controls.
 */
export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { language, setLanguage, theme, setTheme } = useSessionStore();
  const navigate = useNavigate();
  const access = useRouteAccessFn();
  const { t } = useT();
  const aiOpen = access(routeByKey('ai')) === 'ok';
  const langs: Lang[] = ['en', 'fr'];

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b md:gap-3 border-line bg-surface/95 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label={t('nav.menu')}>
        <Menu />
      </Button>
      <CompanySwitcher />
      <button
        type="button"
        onClick={onSearch}
        className="ml-1 hidden h-10 min-w-0 flex-1 items-center gap-2.5 rounded-ctl border border-line bg-canvas px-3.5 text-left text-[14px] text-muted transition-colors hover:border-brand/40 md:flex md:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{t('shell.searchPlaceholder')}</span>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <kbd className="ml-auto rounded-chip border border-line bg-surface px-1.5 font-mono text-[11px]">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1 md:gap-1.5">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onSearch} aria-label={t('shell.searchShort')}>
          <Search />
        </Button>
        {aiOpen && (
          <Button variant="secondary" size="sm" className="hidden border-transparent bg-brand-soft text-brand hover:bg-brand-soft/70 xl:inline-flex" onClick={() => navigate('/app/ai')}>
            <Sparkles className="text-lime" /> {t('shell.askAi')}
          </Button>
        )}
        <div className="hidden items-center rounded-ctl border border-line p-0.5 sm:flex" role="group" aria-label={t('shell.language')}>
          {langs.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLanguage(l)}
              aria-pressed={language === l}
              className={`h-8 rounded-chip px-2.5 text-[12px] font-semibold uppercase transition-colors ${language === l ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <Tip label={theme === 'dark' ? t('shell.themeLight') : t('shell.themeDark')}>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('shell.theme')}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </Tip>
        <NotificationsBell />
        <HelpMenu />
        <RoleSwitcher />
      </div>
    </header>
  );
}
