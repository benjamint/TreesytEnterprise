import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { ChevronRight, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppRoute } from '@/app/routes';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { Tip } from '@/components/ui/tooltip';
import { useActor, useT } from '@/stores/hooks';
import { useNavStore } from '@/stores/navStore';
import { useNavSections } from './useNav';

/** Sections open on first use; the section holding the current page always opens. */
const OPEN_BY_DEFAULT = new Set(['main']);

/**
 * Sidebar (PRD 6.1): 248px, logo badge top-left, collapsible sections (remembered per browser),
 * a Pinned group for each person's favourite pages, active item as a brand-soft pill.
 * `rail` renders the 1024px icon rail (no sections, no pins).
 */
export function Sidebar({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const sections = useNavSections();
  const { t } = useT();
  const { pathname } = useLocation();
  const { userId } = useActor();
  const openPrefs = useNavStore((s) => s.open);
  const toggle = useNavStore((s) => s.toggle);
  const pinnedKeys = useNavStore((s) => s.pinned[userId ?? ''] ?? []);
  const togglePin = useNavStore((s) => s.togglePin);
  const isActive = (r: AppRoute) => !!matchPath({ path: r.path, end: r.key === 'payments' || r.key === 'support' }, pathname);
  const allItems = sections.flatMap((s) => s.items);
  const pinned = pinnedKeys.map((k) => allItems.find((r) => r.key === k)).filter((r): r is AppRoute => !!r);

  const item = (r: AppRoute, inPinned = false) => {
    const label = t(`nav.${r.key}`);
    const isPinned = pinnedKeys.includes(r.key);
    const link = (
      <NavLink
        to={r.path}
        end={r.key === 'payments' || r.key === 'support'}
        onClick={onNavigate}
        className={({ isActive: on }) =>
          cn(
            'group relative flex h-8 items-center gap-2.5 rounded-chip text-[14px] font-medium transition-colors duration-150',
            rail ? 'h-10 justify-center px-0' : 'px-2.5 pr-8',
            on ? 'bg-brand-soft text-brand' : 'text-body hover:bg-line/60 hover:text-ink',
          )
        }
      >
        {({ isActive: on }) => (
          <>
            <r.icon className={cn('h-4 w-4 shrink-0', on ? 'text-brand' : 'text-muted group-hover:text-ink')} aria-hidden="true" />
            {rail ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
          </>
        )}
      </NavLink>
    );
    if (rail) return <li key={r.key}><Tip label={label} side="right">{link}</Tip></li>;
    return (
      <li key={`${inPinned ? 'p:' : ''}${r.key}`} className="group/item relative">
        {link}
        <button
          type="button"
          onClick={() => togglePin(userId ?? '', r.key)}
          aria-label={isPinned ? t('nav.unpin', { page: label }) : t('nav.pin', { page: label })}
          aria-pressed={isPinned}
          className={cn('absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[5px] text-muted transition-opacity hover:bg-line hover:text-ink focus-visible:opacity-100', isPinned && inPinned ? 'opacity-0 group-hover/item:opacity-100' : 'opacity-0 group-hover/item:opacity-100')}
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </li>
    );
  };

  return (
    <nav aria-label={t('nav.menu')} className={cn('flex h-full flex-col bg-subtle', rail ? 'w-[68px]' : 'w-[248px]')}>
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5', rail ? 'justify-center' : 'px-5')}>
        <LogoBadge size={28} />
        {!rail && <Wordmark />}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-5 pt-2 scrollbar-thin">
        {!rail && pinned.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[12px] font-medium text-muted"><Pin className="h-3 w-3" aria-hidden="true" />{t('nav.pinned')}</div>
            <ul className="space-y-px">{pinned.map((r) => item(r, true))}</ul>
          </div>
        )}
        {sections.map(({ section, items }) => {
          const hasActive = items.some(isActive);
          const open = rail || hasActive || (openPrefs[section] ?? OPEN_BY_DEFAULT.has(section));
          const id = `nav-${section}`;
          return (
            <div key={section} className={cn(rail ? 'mb-5 last:mb-2' : 'mb-1')}>
              {rail ? <div className="mx-auto mb-2 h-px w-6 bg-line" /> : (
                <button
                  type="button"
                  onClick={() => toggle(section, !open)}
                  aria-expanded={open}
                  aria-controls={id}
                  disabled={hasActive}
                  className="group flex h-7 w-full items-center gap-1 rounded-chip px-2.5 text-left text-[12px] font-medium text-muted transition-colors hover:text-ink disabled:cursor-default disabled:hover:text-muted"
                >
                  <span className="flex-1 truncate">{t(`nav.section.${section}`)}</span>
                  {!open && <span className="tnum mr-1 text-[11px] text-muted/80">{items.length}</span>}
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-150', open && 'rotate-90', hasActive && 'opacity-0')} aria-hidden="true" />
                </button>
              )}
              {open && <ul id={id} className={cn('space-y-px', !rail && 'mb-3')}>{items.map((r) => item(r))}</ul>}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
