import { NavLink } from 'react-router-dom';
import { CircleUser, Home, ListTodo, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';
import { useOutboxStore } from '@/stores/outboxStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';

/** Bottom tabs: Home · Tasks · Record (+) · Sync · Me, with a brand-soft active pill (PRD 10). */
export function BottomTabs({ onRecord }: { onRecord: () => void }) {
  const { t } = useT();
  const userId = useMobileSessionStore((s) => s.userId);
  const pending = useOutboxStore((s) => s.items.filter((i) => i.userId === userId).length);
  const tab = (to: string, icon: typeof Home, label: string, badge?: number) => {
    const Icon = icon;
    return (
      <NavLink to={to} end className="flex flex-1 flex-col items-center gap-1 pt-2">
        {({ isActive }) => (
          <>
            <span className={cn('relative flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive ? 'bg-brand-soft text-brand' : 'text-muted')}>
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
              {!!badge && <span className="tnum absolute -right-0.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warning px-1 text-[11px] font-semibold text-white dark:text-canvas">{badge}</span>}
            </span>
            <span className={cn('text-[11px] font-medium tracking-[0.01em]', isActive ? 'text-brand' : 'text-muted')}>{label}</span>
          </>
        )}
      </NavLink>
    );
  };
  return (
    <nav className="relative z-20 flex h-[78px] shrink-0 items-start border-t border-line/70 bg-surface/90 px-2 pb-3 backdrop-blur-xl frame:h-[86px] frame:pb-5" aria-label={t('nav.menu')}>
      {tab('/m', Home, t('mobile.tabs.home'))}
      {tab('/m/tasks', ListTodo, t('mobile.tabs.tasks'))}
      <div className="flex flex-1 justify-center">
        <button type="button" onClick={onRecord} className="-mt-5 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-gradient-to-b from-brand-hover to-brand text-on-brand shadow-[0_10px_24px_-6px_rgb(var(--brand)/0.55),inset_0_1px_0_rgb(255_255_255/0.18)] ring-[5px] ring-surface transition-transform active:scale-95" aria-label={t('mobile.tabs.record')}>
          <Plus className="h-7 w-7" />
        </button>
      </div>
      {tab('/m/sync', RefreshCw, t('mobile.tabs.sync'), pending)}
      {tab('/m/me', CircleUser, t('mobile.tabs.me'))}
    </nav>
  );
}
