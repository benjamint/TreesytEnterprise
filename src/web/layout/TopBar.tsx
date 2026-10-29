import { useNavigate } from 'react-router-dom';
import { Menu, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { routeByKey } from '@/app/routes';
import { useRouteAccessFn, useT } from '@/stores/hooks';
import { CompanySwitcher } from './CompanySwitcher';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationsBell } from './NotificationsBell';
import { HelpMenu } from './HelpMenu';

/**
 * Top bar (PRD 7): company switcher · search (⌘K) · Ask AI · bell · help · account (language and theme live in the account menu).
 * "Open mobile app" lives in the Demo panel with the other prototype-only controls.
 */
export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const navigate = useNavigate();
  const access = useRouteAccessFn();
  const { t } = useT();
  const aiOpen = access(routeByKey('ai')) === 'ok';

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur-md md:gap-3 md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label={t('nav.menu')}>
        <Menu />
      </Button>
      <CompanySwitcher />
      <button
        type="button"
        onClick={onSearch}
        className="ml-1 hidden h-btn min-w-0 flex-1 items-center gap-2 rounded-ctl border border-line bg-subtle px-3 text-left text-[13px] text-muted transition-colors hover:border-line-strong hover:bg-surface md:flex md:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{t('shell.searchPlaceholder')}</span>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <kbd className="ml-auto rounded border border-line bg-surface px-1.5 font-sans text-[11px] font-medium text-muted">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1 md:gap-1.5">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onSearch} aria-label={t('shell.searchShort')}>
          <Search />
        </Button>
        {aiOpen && (
          <Button variant="secondary" size="sm" className="hidden xl:inline-flex" onClick={() => navigate('/app/ai')}>
            <Sparkles className="text-brand" /> {t('shell.askAi')}
          </Button>
        )}
        <NotificationsBell />
        <HelpMenu />
        <RoleSwitcher />
      </div>
    </header>
  );
}
