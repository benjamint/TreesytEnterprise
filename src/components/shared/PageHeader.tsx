import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Joyride, { STATUS, type Step } from 'react-joyride';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { useDemoStore } from '@/stores/demoStore';
import { useT } from '@/stores/hooks';
import { TOUR_EVENT, useCurrentRoute } from '@/web/layout/HelpMenu';

/** Tours run once per page per browser session (PRD 6.5); never under browser automation. */
const seenKey = (route: string) => `treesyt-tour:${route}`;
function firstVisit(route: string) {
  try {
    if (sessionStorage.getItem(seenKey(route))) return false;
    sessionStorage.setItem(seenKey(route), '1');
    return true;
  } catch {
    return false;
  }
}
const automated = () => typeof navigator !== 'undefined' && navigator.webdriver;

/** The parts of a page a tour can point at, in reading order. */
const TARGETS: [string, string][] = [
  ['page-primary', 'tour.generic.primary'], ['stat', 'tour.generic.stats'], ['page-tabs', 'tour.generic.tabs'],
  ['filter-bar', 'tour.generic.filters'], ['data-table', 'tour.generic.table'], ['help-menu', 'tour.generic.help'],
];

/** A 3–6 step tour built from what the page shows (title, action, stats, tabs, filters, table, help). */
function useGenericTour(routeKey?: string) {
  const { t } = useT();
  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const start = useCallback(() => {
    const intro = routeKey ? t(`pages.${routeKey}`, { defaultValue: '' }) : '';
    const s: Step[] = [{ target: '[data-tour="page-title"]', content: intro || t('tour.generic.title'), disableBeacon: true }];
    for (const [target, key] of TARGETS) if (document.querySelector(`[data-tour="${target}"]`)) s.push({ target: `[data-tour="${target}"]`, content: t(key), disableBeacon: true });
    setSteps(s.slice(0, 6));
    setRun(true);
  }, [t, routeKey]);
  const element = run ? (
    <Joyride steps={steps} run continuous showSkipButton showProgress scrollOffset={120}
      callback={(d) => { if (d.status === STATUS.FINISHED || d.status === STATUS.SKIPPED) setRun(false); }}
      locale={{ back: t('mobile.back'), close: t('common.close'), last: t('tour.done'), next: t('tour.next'), skip: t('tour.skip') }}
      styles={{ options: { primaryColor: 'rgb(var(--brand))', zIndex: 80, textColor: '#33413B' } }} />
  ) : null;
  return { start, element };
}

/** List/detail page header: title, one-line description, one primary action, "?" tour (PRD 6.2). */
export function PageHeader({
  eyebrow,
  title,
  description,
  primary,
  actions,
  onTour,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  primary?: ReactNode;
  actions?: ReactNode;
  onTour?: () => void;
}) {
  const { t } = useT();
  const route = useCurrentRoute();
  const generic = useGenericTour(route?.key);
  const tour = onTour ?? generic.start;
  const autoTours = useDemoStore((s) => s.autoTours);
  const tourRef = useRef(tour);
  tourRef.current = tour;
  // Pages with their own tour listen for Help → Replay tour themselves.
  useEffect(() => {
    if (onTour) return;
    const replay = () => tourRef.current();
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, [onTour]);
  useEffect(() => {
    if (!route || !autoTours || automated() || !firstVisit(route.key)) return;
    const id = setTimeout(() => tourRef.current(), 900);
    return () => clearTimeout(id);
  }, [route, autoTours]);
  return (
    <header className="flex flex-col gap-5 pb-8 md:flex-row md:items-end md:justify-between" data-tour="page-header">
      <div className="min-w-0 space-y-2">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] leading-[1.15] md:text-[32px] lg:text-[36px]" data-tour="page-title">{title}</h1>
          <Tip label={t('common.tour')}>
            <button type="button" onClick={tour} className="rounded-full p-1 text-muted hover:bg-brand-soft hover:text-brand" aria-label={t('common.tour')} data-tour="page-tour">
              <CircleHelp className="h-5 w-5" />
            </button>
          </Tip>
        </div>
        {description && <p className="max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {(primary || actions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-3" data-tour="page-primary">
          {actions}
          {primary}
        </div>
      )}
      {!onTour && generic.element}
    </header>
  );
}

export { Button };

/** For pages with their own header layout: the same "?" tour button (and first-visit auto-run). */
export function PageTourButton() {
  const { t } = useT();
  const route = useCurrentRoute();
  const generic = useGenericTour(route?.key);
  const autoTours = useDemoStore((s) => s.autoTours);
  const ref = useRef(generic.start);
  ref.current = generic.start;
  useEffect(() => {
    const replay = () => ref.current();
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, []);
  useEffect(() => {
    if (!route || !autoTours || automated() || !firstVisit(route.key)) return;
    const id = setTimeout(() => ref.current(), 900);
    return () => clearTimeout(id);
  }, [route, autoTours]);
  return (
    <>
      <Tip label={t('common.tour')}>
        <button type="button" onClick={generic.start} className="rounded-full p-1 text-muted hover:bg-brand-soft hover:text-brand" aria-label={t('common.tour')} data-tour="page-tour">
          <CircleHelp className="h-5 w-5" />
        </button>
      </Tip>
      {generic.element}
    </>
  );
}
