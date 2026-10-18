import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { expandPermissions, PERMISSIONS } from '@/engines/permissions';
import { planModules } from '@/data/templates/companyTemplates';
import { usePlatformStore } from '@/stores/platformStore';
import { useFormat, useT } from '@/stores/hooks';

/** Plans (PRD A3): module bundles, limits and the permission ceiling. */
export function PlansPage() {
  const plans = usePlatformStore((s) => s.plans);
  const orgs = usePlatformStore((s) => s.orgs);
  const f = useFormat();
  const { t } = useT();
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {plans.map((p) => {
        const mods = planModules(p.modules);
        const allowed = expandPermissions(p.permissionCeiling).length;
        const companies = orgs.filter((o) => o.planId === p.id).length;
        return (
          <Card key={p.id} className="flex flex-col p-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px]">{p.name}</h2>
              <Badge tone="brand">{t('platform.companiesOnPlan', { count: companies })}</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-ctl bg-canvas p-3"><dt className="eyebrow">{t('platform.col.agents')}</dt><dd className="tnum mt-1 text-[18px] font-semibold text-ink">{f.number(p.limits.agents)}</dd></div>
              <div className="rounded-ctl bg-canvas p-3"><dt className="eyebrow">{t('col.farmers')}</dt><dd className="tnum mt-1 text-[18px] font-semibold text-ink">{f.number(p.limits.farmers)}</dd></div>
            </dl>
            <div className="eyebrow mb-2 mt-6">{t('platform.modulesOn', { count: mods.length, total: 28 })}</div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {mods.map((m) => (
                <li key={m} className="flex items-center gap-1.5 text-[13px] text-body"><Check className="h-3.5 w-3.5 text-brand" />{t(`module.${m}`)}</li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <div className="eyebrow mb-1">{t('platform.ceiling')}</div>
              <p className="tnum text-[14px] text-ink">{t('platform.ceilingCount', { allowed: f.number(allowed), total: f.number(PERMISSIONS.length) })}</p>
              <p className="mt-1 font-mono text-[12px] text-muted">{p.permissionCeiling.join('  ')}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
