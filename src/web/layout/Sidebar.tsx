import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { Tip } from '@/components/ui/tooltip';
import { useT } from '@/stores/hooks';
import { useNavSections } from './useNav';

/**
 * Sidebar (PRD 6.1): white, 264px, logo badge top-left, uppercase section eyebrows, active item as a
 * brand-soft pill with brand text and a 3px left indicator. `rail` renders the 1024px icon rail.
 */
export function Sidebar({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const sections = useNavSections();
  const { t } = useT();
  return (
    <nav aria-label={t('nav.menu')} className={cn('flex h-full flex-col bg-surface', rail ? 'w-[76px]' : 'w-[264px]')}>
      <div className={cn('flex h-16 shrink-0 items-center gap-2.5 border-b border-line', rail ? 'justify-center' : 'px-6')}>
        <LogoBadge size={34} />
        {!rail && <Wordmark />}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5 scrollbar-thin">
        {sections.map(({ section, items }) => (
          <div key={section} className="mb-6 last:mb-2">
            {!rail ? <div className="eyebrow mb-2 px-3">{t(`nav.section.${section}`)}</div> : <div className="mx-auto mb-3 h-px w-8 bg-line" />}
            <ul className="space-y-0.5">
              {items.map((r) => {
                const label = t(`nav.${r.key}`);
                const link = (
                  <NavLink
                    to={r.path}
                    end={r.key === 'payments' || r.key === 'support'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-10 items-center gap-3 rounded-ctl text-[14px] font-medium transition-colors duration-150',
                        rail ? 'justify-center px-0' : 'px-3',
                        isActive ? 'bg-brand-soft text-brand' : 'text-body hover:bg-canvas hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand" aria-hidden="true" />}
                        <r.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-brand' : 'text-muted group-hover:text-ink')} aria-hidden="true" />
                        {rail ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
                      </>
                    )}
                  </NavLink>
                );
                return <li key={r.key}>{rail ? <Tip label={label} side="right">{link}</Tip> : link}</li>;
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
