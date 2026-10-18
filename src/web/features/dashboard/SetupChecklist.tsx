import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { completeChecklistStep } from '@/services/companyService';
import { useCurrentOrg, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLocationStore } from '@/stores/locationStore';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { usePlatformStore } from '@/stores/platformStore';

interface Step {
  key: string;
  done: boolean;
  to: string;
  /** Steps that can't be detected from data are ticked when opened. */
  manual?: boolean;
}

/** Setup checklist on a new company's dashboard (PRD A1/A3). Steps tick themselves as data appears. */
export function SetupChecklist() {
  const org = useCurrentOrg();
  const s = useOrgSettings();
  const nodes = useOrgRows(useLocationStore((x) => x.nodes));
  const invites = useOrgRows(useAccessStore((x) => x.invites));
  const agents = useOrgRows(useAgentStore((x) => x.agents));
  const farmers = useOrgRows(useFarmerStore((x) => x.farmers));
  const updateOrg = usePlatformStore((x) => x.updateOrg);
  const navigate = useNavigate();
  const { t } = useT();
  const done = useMemo(() => org.onboarding?.done ?? [], [org.onboarding?.done]);

  const steps: Step[] = useMemo(
    () => [
      { key: 'profile', done: true, to: '/app/settings/profile' },
      { key: 'branding', done: done.includes('branding'), to: '/app/settings/branding', manual: true },
      { key: 'locations', done: nodes.length > 0, to: '/app/settings/locations' },
      { key: 'commodities', done: s.commodities.length > 0, to: '/app/settings/commodities' },
      { key: 'priceLists', done: s.priceList.length > 0, to: '/app/settings/priceLists' },
      { key: 'approvals', done: s.workflows.length > 0, to: '/app/settings/approvals' },
      { key: 'team', done: invites.length > 0, to: '/app/settings/users' },
      { key: 'agents', done: agents.length > 0, to: '/app/agents' },
      { key: 'farmers', done: farmers.length > 0, to: '/app/imports' },
      { key: 'mobile', done: done.includes('mobile'), to: '/app/help/mobile', manual: true },
    ],
    [done, nodes.length, s.commodities.length, s.priceList.length, s.workflows.length, invites.length, agents.length, farmers.length],
  );
  if (!org.onboarding || org.onboarding.dismissed) return null;
  const count = steps.filter((x) => x.done).length;
  const pct = Math.round((count / steps.length) * 100);

  return (
    <Card className="mb-10 overflow-hidden" data-tour="setup-checklist">
      <div className="flex flex-col gap-4 border-b border-line p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[19px]">{t('checklist.title', { company: org.name })}</h2>
          <p className="mt-1 text-[14px] text-muted">{t('checklist.subtitle', { done: count, total: steps.length })}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="tnum w-10 text-[14px] font-semibold text-ink">{`${pct}%`}</span>
          <Button variant="ghost" size="iconSm" onClick={() => updateOrg(org.id, { onboarding: { ...org.onboarding!, dismissed: true } })} aria-label={t('checklist.dismiss')}>
            <X />
          </Button>
        </div>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step.key} className="border-b border-line md:odd:border-r">
            <button
              type="button"
              onClick={() => {
                if (step.manual) completeChecklistStep(org.id, step.key);
                navigate(step.to);
              }}
              className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-brand-soft/40"
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold', step.done ? 'border-brand bg-brand text-white' : 'border-line text-muted')}>
                {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[15px] font-medium', step.done ? 'text-muted line-through decoration-1' : 'text-ink')}>{t(`checklist.step.${step.key}.title`)}</span>
                <span className="block text-[13px] text-muted">{t(`checklist.step.${step.key}.desc`)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
