import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { comingSoon } from '@/components/shared/coming-soon';
import { CompanyLogo } from '@/components/shared/Logo';
import { Flag } from '@/components/shared/Flag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card } from '@/components/ui/card';
import { PLATFORM_PAGES, PLATFORM_PATHS, type PlatformPage } from '@/app/routes';
import { cn } from '@/lib/utils';
import { useFormat, useT } from '@/stores/hooks';
import { usePlatformStore } from '@/stores/platformStore';

function Companies() {
  const orgs = usePlatformStore((s) => s.orgs);
  const plans = usePlatformStore((s) => s.plans);
  const { t } = useT();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {orgs.map((o) => (
        <Card key={o.id} className="flex items-center gap-4 p-5">
          <CompanyLogo text={o.branding.logoText} color={o.branding.primaryColor} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ink">{o.name}</div>
            <div className="flex items-center gap-1.5 text-[13px] text-muted">
              <Flag code={o.countries[0]!} className="h-2.5 w-3.5" /> {t(`orgType.${o.type}`)} · {plans.find((p) => p.id === o.planId)?.name}
            </div>
          </div>
          <StatusBadge status={o.status} />
        </Card>
      ))}
    </div>
  );
}

function Leads() {
  const leads = usePlatformStore((s) => s.leads);
  const f = useFormat();
  return (
    <div className="space-y-3">
      {leads.map((l) => (
        <Card key={l.id} className="flex flex-col gap-1 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-ink">{`${l.businessName} · ${l.firstName} ${l.lastName}`}</div>
            <div className="text-[13px] text-muted">{l.message}</div>
          </div>
          <div className="text-[13px] text-muted">{f.date(l.createdAt)}</div>
        </Card>
      ))}
    </div>
  );
}

/** Platform console (PRD A3) — phase 2 builds the full console and the onboarding wizard. */
export function PlatformLayout() {
  const { pathname } = useLocation();
  const { t } = useT();
  const sub = pathname.replace(/^\/app\/platform\/?/, '');
  const page = (Object.entries(PLATFORM_PATHS).find(([, p]) => p === sub)?.[0] ?? null) as PlatformPage | null;
  if (!page) return <Navigate to="/app/platform/companies" replace />;
  return (
    <>
      <PageHeader
        title={t('platform.title')}
        description={t('pages.platform')}
        actions={<Badge tone="brand">{t('common.phaseChip', { phase: 2 })}</Badge>}
        primary={<Button onClick={() => comingSoon()}><Plus /> {t('platform.page.newCompany')}</Button>}
      />
      <nav className="mb-8 flex flex-wrap gap-2" aria-label={t('platform.title')}>
        {PLATFORM_PAGES.map((p) => (
          <NavLink key={p} to={`/app/platform/${PLATFORM_PATHS[p]}`} end className={({ isActive }) => cn('rounded-full border px-4 py-2 text-[14px] font-medium transition-colors', isActive ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-body hover:border-brand/40')}>
            {t(`platform.page.${p}`)}
          </NavLink>
        ))}
      </nav>
      <p className="mb-6 text-muted">{t(`platform.pageDesc.${page}`)}</p>
      {page === 'companies' ? <Companies /> : page === 'leads' ? <Leads /> : <EmptyState title={t(`platform.page.${page}`)} body={t('placeholder.nothingSeeded', { phase: 2 })} action={<Button variant="secondary" onClick={() => comingSoon()}>{t('common.comingSoon')}</Button>} />}
    </>
  );
}
