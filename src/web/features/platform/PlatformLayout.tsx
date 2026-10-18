import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { PLATFORM_PAGES } from '@/app/routes';
import { cn } from '@/lib/utils';
import { useCan, useT } from '@/stores/hooks';

/** Platform console (PRD A3) for the platform owner. */
export function PlatformLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const can = useCan();
  const { t } = useT();
  // The wizard and company detail have their own headers.
  if (/\/companies\/.+/.test(pathname)) return <Outlet />;
  return (
    <>
      <PageHeader
        title={t('platform.title')}
        description={t('pages.platform')}
        primary={can('platform.manageCompanies') && <Button onClick={() => navigate('/app/platform/companies/new')}><Plus /> {t('platform.addCompany')}</Button>}
      />
      <nav className="mb-8 flex flex-wrap gap-2" aria-label={t('platform.title')}>
        {PLATFORM_PAGES.map((p) => (
          <NavLink key={p} to={`/app/platform/${p}`} className={({ isActive }) => cn('rounded-full border px-4 py-2 text-[14px] font-medium transition-colors', isActive ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-body hover:border-brand/40')}>
            {t(`platform.page.${p}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
