import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { Tip } from '@/components/ui/tooltip';
import { useT } from '@/stores/hooks';
import { useNavSections } from './useNav';

/**
 * Sidebar (PRD 6.1): 248px, logo badge top-left, quiet section labels, active item as a
 * brand-soft pill with brand text. `rail` renders the 1024px icon rail.
 */
export function Sidebar({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const sections = useNavSections();
  const { t } = useT();
  return (
    <nav aria-label={t('nav.menu')} className={cn('flex h-full flex-col bg-subtle', rail ? 'w-[68px]' : 'w-[248px]')}>
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5', rail ? 'justify-center' : 'px-5')}>
        <LogoBadge size={28} />
        {!rail && <Wordmark />}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-5 pt-2 scrollbar-thin">
        {sections.map(({ section, items }) => (
          <div key={section} className="mb-5 last:mb-2">
            {!rail ? <div className="mb-1 px-2.5 text-[12px] font-medium text-muted">{t(`nav.section.${section}`)}</div> : <div className="mx-auto mb-2 h-px w-6 bg-line" />}
            <ul className="space-y-px">
              {items.map((r) => {
                const label = t(`nav.${r.key}`);
                const link = (
                  <NavLink
                    to={r.path}
                    end={r.key === 'payments' || r.key === 'support'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-8 items-center gap-2.5 rounded-chip text-[14px] font-medium transition-colors duration-150',
                        rail ? 'h-10 justify-center px-0' : 'px-2.5',
                        isActive ? 'bg-brand-soft text-brand' : 'text-body hover:bg-line/60 hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <r.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand' : 'text-muted group-hover:text-ink')} aria-hidden="true" />
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
