import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, MoreHorizontal, Pause, Play, Repeat2, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Organisation } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { changePlan, setCompanyStatus } from '@/services/companyService';
import { cn } from '@/lib/utils';
import { usePlatformStore } from '@/stores/platformStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useCan, useT } from '@/stores/hooks';
import i18n from '@/i18n';

/** Row actions: View, View as company, Suspend / Reactivate, Change plan (PRD A3). */
export function CompanyActions({ org, variant = 'menu' }: { org: Organisation; variant?: 'menu' | 'buttons' }) {
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState(org.planId);
  const plans = usePlatformStore((s) => s.plans);
  const { userId, switchOrg } = useSessionStore();
  const navigate = useNavigate();
  const can = useCan();
  const { t } = useT();
  const manage = can('platform.manageCompanies');
  const suspended = org.status === 'SUSPENDED';

  const viewAs = () => {
    switchOrg(org.id, org.language);
    toast.success(i18n.t('shell.switchedCompany', { company: org.name, lng: org.language }));
    navigate('/app');
  };
  const toggle = () => {
    setCompanyStatus(org.id, suspended ? 'ACTIVE' : 'SUSPENDED', userId!);
    toast(t(suspended ? 'platform.reactivated' : 'platform.suspended', { company: org.name }));
  };

  const dialog = (
    <Dialog open={planOpen} onOpenChange={setPlanOpen}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('platform.changePlan')}</DialogTitle>
          <DialogDescription>{t('platform.changePlanBody', { company: org.name })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="radiogroup">
          {plans.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={plan === p.id} onClick={() => setPlan(p.id)} className={cn('flex w-full items-center justify-between rounded-ctl border px-4 py-3 text-left', plan === p.id ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40')}>
              <span>
                <span className="block font-semibold text-ink">{p.name}</span>
                <span className="block text-[13px] text-muted">{t('platform.planLimits', { agents: p.limits.agents, farmers: p.limits.farmers })}</span>
              </span>
              {org.planId === p.id && <span className="text-[12px] font-medium text-muted">{t('platform.currentPlan')}</span>}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPlanOpen(false)}>{t('common.cancel')}</Button>
          <Button
            disabled={plan === org.planId}
            onClick={() => {
              changePlan(org.id, plan, userId!);
              setPlanOpen(false);
              toast.success(t('platform.planChanged', { company: org.name, plan: plans.find((p) => p.id === plan)?.name }));
            }}
          >
            {t('platform.changePlan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === 'buttons') {
    return (
      <div className="flex flex-wrap gap-2">
        {manage && <Button variant="secondary" size="sm" onClick={() => setPlanOpen(true)}><Repeat2 /> {t('platform.changePlan')}</Button>}
        {manage && org.type !== 'PLATFORM' && <Button variant={suspended ? 'secondary' : 'dangerOutline'} size="sm" onClick={toggle}>{suspended ? <Play /> : <Pause />} {t(suspended ? 'platform.reactivate' : 'platform.suspend')}</Button>}
        <Button size="sm" onClick={viewAs}><Eye /> {t('platform.viewAs')}</Button>
        {dialog}
      </div>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label={t('platform.actions', { company: org.name })} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => navigate(`/app/platform/companies/${org.id}`)}><ArrowUpRight /> {t('platform.view')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={viewAs}><Eye /> {t('platform.viewAs')}</DropdownMenuItem>
          {manage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPlanOpen(true)}><Repeat2 /> {t('platform.changePlan')}</DropdownMenuItem>
              {org.type !== 'PLATFORM' && (
                <DropdownMenuItem onSelect={toggle} className={suspended ? '' : 'text-danger focus:text-danger [&_svg]:text-danger'}>
                  {suspended ? <Play /> : <Pause />} {t(suspended ? 'platform.reactivate' : 'platform.suspend')}
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  );
}
