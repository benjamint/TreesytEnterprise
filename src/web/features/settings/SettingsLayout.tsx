import type { ComponentType } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { SETTINGS_GROUPS, SETTINGS_PAGES, type SettingsPage } from '@/app/routes';
import { cn } from '@/lib/utils';
import { useCurrentOrg, useT } from '@/stores/hooks';
import { BrandingPage, ModulesPage, ProfilePage, TerminologyPage } from './pages/company';
import { BuyingRulesPage, CommoditiesPage, InventoryRulesPage, PriceListsPage, UnitsPage } from './pages/operations';
import { LocationsPage } from './pages/LocationsPage';
import { FieldTeamPage, SupportLoansPage } from './pages/support';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { FarmerIdPage, NumberingPage } from './pages/numbering';
import { BiometricsPage, DataQualityPage, FormsPage, NotificationsPage } from './pages/rules';
import { PaymentsPage, SmsEmailPage } from './pages/money';
import { RolesPage } from './pages/RolesPage';
import { UsersPage } from './pages/UsersPage';
import { MobilePage, SecurityPage } from './pages/access';
import { IntegrationsPage, PrivacyPage } from './pages/data';
import { SalesRulesPage } from './pages/sales';

const PAGES: Record<SettingsPage, ComponentType> = {
  profile: ProfilePage,
  branding: BrandingPage,
  modules: ModulesPage,
  terminology: TerminologyPage,
  locations: LocationsPage,
  commodities: CommoditiesPage,
  units: UnitsPage,
  priceLists: PriceListsPage,
  buyingRules: BuyingRulesPage,
  supportLoans: SupportLoansPage,
  inventoryRules: InventoryRulesPage,
  salesRules: SalesRulesPage,
  fieldTeam: FieldTeamPage,
  approvals: ApprovalsPage,
  numbering: NumberingPage,
  farmerId: FarmerIdPage,
  forms: FormsPage,
  dataQuality: DataQualityPage,
  notifications: NotificationsPage,
  payments: PaymentsPage,
  smsEmail: SmsEmailPage,
  roles: RolesPage,
  users: UsersPage,
  security: SecurityPage,
  biometrics: BiometricsPage,
  mobile: MobilePage,
  integrations: IntegrationsPage,
  privacy: PrivacyPage,
};

/** Company settings (PRD A4): left sub-navigation; each page has Save, Reset to template and "Where this is used". */
export function SettingsLayout() {
  const { page } = useParams();
  const org = useCurrentOrg();
  const { t } = useT();
  useDemoNotes([{ id: 'settings', key: 'demo.note.settingsLive' }]);
  if (!page || !(SETTINGS_PAGES as readonly string[]).includes(page)) return <Navigate to="/app/settings/profile" replace />;
  const p = page as SettingsPage;
  const Page = PAGES[p];

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('pages.settings', { company: org.name })} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
        <nav aria-label={t('settings.title')} className="space-y-6 lg:sticky lg:top-24 lg:self-start">
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
        <Card className="min-w-0">
          <CardContent className="p-6 md:p-8">
            {/* Keyed by company and page so drafts never leak across a company switch. */}
            <Page key={`${org.id}:${p}`} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
