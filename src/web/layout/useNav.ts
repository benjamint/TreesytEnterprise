import { useMemo } from 'react';
import { APP_ROUTES, NAV_SECTIONS, type AppRoute, type NavSection } from '@/app/routes';
import { useRouteAccessFn } from '@/stores/hooks';

/** Sidebar items: only routes whose module is on and the user can view (PRD 7). */
export function useNavSections(): { section: NavSection; items: AppRoute[] }[] {
  const access = useRouteAccessFn();
  return useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({ section, items: APP_ROUTES.filter((r) => r.nav && r.section === section && access(r) === 'ok') })).filter((s) => s.items.length > 0),
    [access],
  );
}

/** First page the user can open — the landing page after sign-in or company switch. */
export function useHomePath(): string {
  const sections = useNavSections();
  return sections[0]?.items[0]?.path ?? '/app/help/mobile';
}
