import { Navigate, useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { comingSoon } from '@/components/shared/coming-soon';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { MOBILE_FLOWS, MOBILE_FLOW_PHASE, type MobileFlow } from '@/app/routes';
import { useT } from '@/stores/hooks';

/** Placeholder for mobile flows M1–M12 until their phases land. */
export function FlowPlaceholder() {
  const { flowId } = useParams();
  const { t } = useT();
  if (!flowId || !(MOBILE_FLOWS as readonly string[]).includes(flowId)) return <Navigate to="/m" replace />;
  const flow = flowId as MobileFlow;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader back title={t(`mobileFlows.${flow}.title`)} />
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="mb-4 font-mono text-[13px] font-semibold text-brand">{flow}</span>
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Sparkles className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="text-[22px]">{t(`mobileFlows.${flow}.title`)}</h2>
        <p className="mt-2 text-[15px] text-muted">{t(`mobileFlows.${flow}.desc`)}</p>
        <p className="mt-4 text-[13px] text-muted">{t('mobile.flowPlaceholder', { phase: MOBILE_FLOW_PHASE[flow] })}</p>
      </div>
      <div className="shrink-0 border-t border-line p-4">
        <Button size="lg" className="w-full" onClick={() => comingSoon()}>
          {t('common.comingSoon')}
        </Button>
      </div>
    </div>
  );
}
