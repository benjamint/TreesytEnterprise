import { useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { comingSoon } from '@/components/shared/coming-soon';
import { usePageTour } from '@/components/shared/PageTour';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { routeByKey } from '@/app/routes';
import { useCurrentOrg, useFormat, useT } from '@/stores/hooks';
import { TOUR_EVENT } from '@/web/layout/HelpMenu';
import { PREVIEWS, usePreviewCount } from './previews';
import { AreaSettings } from './AreaSettings';
import { ReportFieldsPreview } from './ReportFieldsPreview';

/**
 * Page for every route in PRD section 7 until its phase lands: header, primary action, tour and the
 * company's records. Build status and data notes go to the Demo panel, not the page.
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

  useDemoNotes([
    { id: 'phase', key: 'demo.note.phase', params: { phase: route.phase } },
    ...(count ? [{ id: 'seeded', key: 'demo.note.seeded', params: { count: f.number(count), company: org.name } }] : []),
  ]);

  return (
    <>
      {tour.element}
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><route.icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`nav.section.${route.section ?? 'main'}`)}</span>}
        title={t(`nav.${routeKey}`)}
        description={t(`pages.${routeKey}`, { company: org.name })}
        onTour={startTour}
        primary={
          <Button onClick={() => comingSoon()}>
            <Plus /> {t('placeholder.primaryAction')}
          </Button>
        }
      />
      <AreaSettings routeKey={routeKey} />
      {routeKey === 'reports' && <div className="mb-5"><ReportFieldsPreview /></div>}
      {Preview && count ? (
        <Preview />
      ) : (
        <EmptyState
          title={t('placeholder.emptyTitle', { what: t(`nav.${routeKey}`).toLocaleLowerCase() })}
          body={t('placeholder.emptyBody')}
          action={
            <Button variant="secondary" onClick={() => comingSoon()}>
              <Plus /> {t('placeholder.primaryAction')}
            </Button>
          }
        />
      )}
    </>
  );
}
