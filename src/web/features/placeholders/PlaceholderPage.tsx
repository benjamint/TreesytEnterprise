import { useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { comingSoon } from '@/components/shared/coming-soon';
import { usePageTour } from '@/components/shared/PageTour';
import { routeByKey } from '@/app/routes';
import { useCurrentOrg, useFormat, useT } from '@/stores/hooks';
import { TOUR_EVENT } from '@/web/layout/HelpMenu';
import { PREVIEWS, usePreviewCount } from './previews';

/**
 * Phase 1 placeholder for every route in PRD section 7: real PageHeader, a working primary action
 * (toast), a tour, and — where demo data exists — a preview of the company's seeded records.
 */
export function PlaceholderPage({ routeKey }: { routeKey: string }) {
  const route = routeByKey(routeKey);
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const tour = usePageTour();
  const count = usePreviewCount(routeKey);
  const Preview = PREVIEWS[routeKey] as (() => React.ReactNode) | undefined;

  const startTour = tour.start;
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, startTour);
    return () => window.removeEventListener(TOUR_EVENT, startTour);
  }, [startTour]);

  return (
    <>
      {tour.element}
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><route.icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`nav.section.${route.section ?? 'main'}`)}</span>}
        title={t(`nav.${routeKey}`)}
        description={t(`pages.${routeKey}`, { company: org.name })}
        onTour={tour.start}
        actions={<Badge tone="brand">{t('common.phaseChip', { phase: route.phase })}</Badge>}
        primary={
          <Button onClick={() => comingSoon()}>
            <Plus /> {t('placeholder.primaryAction')}
          </Button>
        }
      />
      {Preview && count !== null && count > 0 ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="eyebrow">{t('placeholder.previewRows')}</h2>
            <span className="text-[13px] text-muted">
              {t('placeholder.seeded', { company: org.name })}
              {' · '}
              <span className="tnum">{t('common.records', { count: f.number(count) })}</span>
            </span>
          </div>
          <Preview />
        </section>
      ) : (
        <EmptyState
          title={t(`nav.${routeKey}`)}
          body={t('placeholder.nothingSeeded', { phase: route.phase })}
          action={<Button variant="secondary" onClick={() => comingSoon()}>{t('common.comingSoon')}</Button>}
        />
      )}
    </>
  );
}
