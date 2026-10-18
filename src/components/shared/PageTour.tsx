import { useCallback, useState } from 'react';
import Joyride, { STATUS, type Step } from 'react-joyride';
import { useT } from '@/stores/hooks';

/**
 * Page tours (PRD 6.5) with react-joyride. Phase 1 ships the generic page-header tour;
 * page-specific steps and first-visit auto-run come with each page.
 */
export function usePageTour(extra: Step[] = []) {
  const { t } = useT();
  const [run, setRun] = useState(false);
  const start = useCallback(() => setRun(true), []);
  const steps: Step[] = [
    { target: '[data-tour="page-title"]', content: t('placeholder.sampleTour1'), disableBeacon: true },
    { target: '[data-tour="page-primary"]', content: t('placeholder.sampleTour2') },
    ...extra,
    { target: '[data-tour="page-tour"]', content: t('placeholder.sampleTour3') },
  ];
  const element = (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      callback={(data) => {
        if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) setRun(false);
      }}
      locale={{ back: t('mobile.back'), close: t('common.close'), last: t('common.close'), next: '→', skip: t('common.cancel') }}
      styles={{ options: { primaryColor: 'rgb(var(--brand))', zIndex: 80, textColor: '#33413B' } }}
    />
  );
  return { start, element };
}
