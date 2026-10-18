import { NavLink, Navigate, useParams } from 'react-router-dom';
import { RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { comingSoon } from '@/components/shared/coming-soon';
import { APP_ROUTES, SETTINGS_GROUPS, SETTINGS_PAGES, type SettingsPage } from '@/app/routes';
import { cn } from '@/lib/utils';
import { useCurrentOrg, useOrgSettings, useT, useLang } from '@/stores/hooks';

/** What the company currently has for a settings page — a read-only peek until phase 3 builds the editors. */
function CurrentValue({ page }: { page: SettingsPage }) {
  const s = useOrgSettings();
  const org = useCurrentOrg();
  const lang = useLang();
  const { t, terms } = useT();
  const lines: string[] = (() => {
    switch (page) {
      case 'profile': return [org.legalName, `${org.currency} · ${org.locale} · ${org.timezone}`, `${t('col.code')}: ${org.code}`];
      case 'branding': return [org.branding.primaryColor, org.branding.senderName, org.branding.signatureName];
      case 'modules': return Object.entries(s.modules).filter(([, on]) => on).map(([k]) => k);
      case 'locations': return [s.locationLevels.map((l) => l.label[lang] ?? l.label.en).join(' → '), ...s.zones.map((z) => z.name)];
      case 'commodities': return s.commodities.map((c) => `${c.code} · ${c.name[lang] ?? c.name.en} · ${c.lossTolerancePct}%`);
      case 'units': return [s.units.map((u) => u.code).join(', '), ...s.packaging.map((p) => `${p.name}: ${p.minKg}–${p.maxKg} kg`)];
      case 'approvals': return s.workflows.map((w) => `${w.docType}: ${w.steps.map((x) => (x.auto ? `${x.name} (auto)` : x.name)).join(' → ')}`);
      case 'numbering': return s.numbering.map((n) => `${n.docType}: ${n.pattern}`);
      case 'payments': return s.paymentProviders.map((p) => `${p.name}${p.share ? ` · ${Math.round(p.share * 100)}%` : ''}`);
      case 'supportLoans': return [`${s.loanTerms.interestType} · ${Math.round(s.loanTerms.rate * 100)}% / ${s.loanTerms.period}`, `${s.loanTerms.penalty.type} · ${Math.round(s.loanTerms.penalty.rate * 100)}%`];
      case 'fieldTeam': return s.agentTypes.map((a) => a.name[lang] ?? a.name.en ?? a.code);
      case 'terminology': return Object.entries(terms).map(([k, v]) => `${k}: ${v}`);
      case 'mobile': return [`OTP ${s.mobile.otpLength}`, `≥ ${s.mobile.minAppVersion}`];
      case 'security': return [`${s.security.sessionMinutes} min`];
      case 'buyingRules': return [`${s.buyingRules.debtPolicy}`, `±${s.buyingRules.reconTolerancePct}%`];
      default: return [];
    }
  })();
  if (!lines.length) return null;
  return (
    <ul className="space-y-1.5">
      {lines.map((l) => (
        <li key={l} className="font-mono text-[13px] text-body">{l}</li>
      ))}
    </ul>
  );
}

/** Company settings (PRD A4): left sub-navigation, Save / Reset to template on every page. */
export function SettingsLayout() {
  const { page } = useParams();
  const org = useCurrentOrg();
  const { t } = useT();
  const route = APP_ROUTES.find((r) => r.key === 'settings')!;
  if (!page || !(SETTINGS_PAGES as readonly string[]).includes(page)) return <Navigate to="/app/settings/profile" replace />;
  const p = page as SettingsPage;
  const usedBy = APP_ROUTES.filter((r) => r.configurable?.includes(p));

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('pages.settings', { company: org.name })} actions={<Badge tone="brand">{t('common.phaseChip', { phase: route.phase })}</Badge>} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <nav aria-label={t('settings.title')} className="space-y-6">
          {SETTINGS_GROUPS.map((g) => (
            <div key={g.key}>
              <div className="eyebrow mb-2 px-3">{t(`settings.group.${g.key}`)}</div>
              <ul className="space-y-0.5">
                {g.pages.map((k) => (
                  <li key={k}>
                    <NavLink to={`/app/settings/${k}`} className={({ isActive }) => cn('block rounded-ctl px-3 py-2 text-[14px] font-medium transition-colors', isActive ? 'bg-brand-soft text-brand' : 'text-body hover:bg-surface')}>
                      {t(`settings.page.${k}`)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <Card>
          <CardContent className="space-y-8 p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl">{t(`settings.page.${p}`)}</h2>
                <p className="mt-1 text-muted">{t(`settings.pageDesc.${p}`, { company: org.name })}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => comingSoon()}>
                  <RotateCcw /> {t('common.cancel')}
                </Button>
                <Button onClick={() => comingSoon()}>
                  <Save /> {t('common.save')}
                </Button>
              </div>
            </div>
            <section>
              <div className="eyebrow mb-3">{t('settings.currentValue', { company: org.name })}</div>
              <div className="rounded-ctl border border-line bg-canvas p-5">
                <CurrentValue page={p} />
              </div>
            </section>
            {usedBy.length > 0 && (
              <section>
                <div className="eyebrow mb-3">{t('shell.whatsConfigurable')}</div>
                <div className="flex flex-wrap gap-2">
                  {usedBy.map((r) => (
                    <NavLink key={r.key} to={r.path} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink hover:border-brand/40">
                      <r.icon className="h-3.5 w-3.5 text-muted" /> {t(`nav.${r.key}`)}
                    </NavLink>
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
