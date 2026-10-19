import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/web/layout/AppShell';
import { DashboardPage } from '@/web/features/dashboard/DashboardPage';
import { AiPage } from '@/web/features/ai/AiPage';
import { MobilePreviewsPage } from '@/web/features/help/MobilePreviewsPage';
import { SettingsLayout } from '@/web/features/settings/SettingsLayout';
import { PlatformLayout } from '@/web/features/platform/PlatformLayout';
import { CompaniesPage } from '@/web/features/platform/CompaniesPage';
import { CompanyDetailPage } from '@/web/features/platform/CompanyDetailPage';
import { NewCompanyWizard } from '@/web/features/platform/NewCompanyWizard';
import { PlansPage } from '@/web/features/platform/PlansPage';
import { CataloguesPage } from '@/web/features/platform/CataloguesPage';
import { LeadsPage } from '@/web/features/platform/LeadsPage';
import { PlatformAuditPage } from '@/web/features/platform/PlatformAuditPage';
import { AccountPage } from '@/web/features/account/AccountPage';
import { BookDemoPage, LegalPage } from '@/public/BookDemoPage';
import { SignInPage } from '@/public/auth/SignInPage';
import { IdpPage, SsoPage } from '@/public/auth/SsoPages';
import { TwoStepPage } from '@/public/auth/TwoStepPage';
import { ChooseCompanyPage } from '@/public/auth/ChooseCompanyPage';
import { AcceptInvitePage, ForgotPasswordPage, ForgotSentPage, ResetPasswordPage } from '@/public/auth/PasswordPages';
import { SignUpPage } from '@/public/auth/SignUpPage';
import { CommunitiesMapPage, CommunitiesPage } from '@/web/features/people/CommunitiesPage';
import { FarmersPage } from '@/web/features/people/FarmersPage';
import { GroupsPage } from '@/web/features/people/GroupsPage';
import { LocationsExplorerPage } from '@/web/features/people/LocationsPage';
import { DataQualityPage } from '@/web/features/quality/DataQualityPage';
import { ImportsPage } from '@/web/features/imports/ImportsPage';
import { FormsPage } from '@/web/features/forms/FormsPage';
import { FormBuilderPage } from '@/web/features/forms/FormBuilderPage';
import { ResponsesPage } from '@/web/features/forms/ResponsesPage';
import { OptionListsPage } from '@/web/features/forms/OptionListsPage';
import { SurveysScreen } from '@/mobile/flows/surveys/SurveysScreen';
import { SurveyFillScreen, SurveyFixScreen, FormPreviewScreen } from '@/mobile/flows/surveys/SurveyFillScreen';
import { RegisterFarmerScreen } from '@/mobile/flows/farmers/RegisterFarmerScreen';
import { PurchaseRequestsPage } from '@/web/features/buying/PurchaseRequestsPage';
import { PurchasesPage } from '@/web/features/buying/PurchasesPage';
import { BagsPage } from '@/web/features/buying/BagsPage';
import { ExpensesPage } from '@/web/features/buying/ExpensesPage';
import { ReconciliationPage } from '@/web/features/buying/ReconciliationPage';
import { PriceBoardPage } from '@/web/features/buying/PriceBoardPage';
import { PaymentsPage } from '@/web/features/payments/PaymentsPage';
import { WalletsPage } from '@/web/features/payments/WalletsPage';
import { PlaceholderPage } from '@/web/features/placeholders/PlaceholderPage';
import { LandingPage } from '@/public/LandingPage';
import { MobileShell } from '@/mobile/layout/MobileShell';
import { HomeScreen } from '@/mobile/flows/home/HomeScreen';
import { TasksScreen } from '@/mobile/flows/home/TasksScreen';
import { TaskFixScreen } from '@/mobile/flows/home/TaskFixScreen';
import { SyncScreen } from '@/mobile/flows/home/SyncScreen';
import { MeScreen } from '@/mobile/flows/me/MeScreen';
import { FlowPlaceholder } from '@/mobile/flows/FlowPlaceholder';
import { CommunitiesScreen, CommunityFlowScreen } from '@/mobile/flows/profiling/CommunityScreens';
import { FarmerDetailScreen, FarmerEditScreen, FarmersScreen } from '@/mobile/flows/farmers/FarmerScreens';
import { GroupFlowScreen, GroupsScreen } from '@/mobile/flows/farmers/GroupScreens';
import { BuyingScreen, NewRequestScreen, RequestDetailScreen } from '@/mobile/flows/buying/BuyingScreens';
import { RecordPurchaseScreen } from '@/mobile/flows/buying/RecordPurchaseScreen';
import { NewPreScreen, VoicePurchaseScreen } from '@/mobile/flows/buying/VoiceAndPreScreens';
import { APP_ROUTES } from './routes';
import { AppIndexRedirect, NotFound, RequireSession, RouteGuard } from './guards';

const CUSTOM = new Set(['dashboard', 'ai', 'helpMobile', 'settings', 'platform', 'account', 'communities', 'communitiesMap', 'farmers', 'groups', 'dataQuality', 'imports', 'locations', 'forms', 'optionLists', 'purchaseRequests', 'purchases', 'bags', 'expenses', 'reconciliation', 'priceBoard', 'payments', 'wallets']);
const rel = (path: string) => path.replace(/^\/app\//, '');

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/book-a-demo', element: <BookDemoPage /> },
  { path: '/contact', element: <BookDemoPage /> },
  { path: '/legal/terms', element: <LegalPage /> },
  { path: '/legal/privacy', element: <LegalPage /> },
  { path: '/sign-up', element: <SignUpPage /> },
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/sign-in/sso', element: <SsoPage /> },
  { path: '/sign-in/sso/idp', element: <IdpPage /> },
  { path: '/sign-in/two-step', element: <TwoStepPage /> },
  { path: '/choose-company', element: <ChooseCompanyPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/forgot-password/sent', element: <ForgotSentPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  {
    path: '/app',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <AppIndexRedirect /> },
      { path: 'dashboard', element: <RouteGuard routeKey="dashboard"><DashboardPage /></RouteGuard> },
      { path: 'ai', element: <RouteGuard routeKey="ai"><AiPage /></RouteGuard> },
      { path: 'help/mobile', element: <MobilePreviewsPage /> },
      { path: 'settings', element: <RouteGuard routeKey="settings"><SettingsLayout /></RouteGuard> },
      { path: 'settings/:page', element: <RouteGuard routeKey="settings"><SettingsLayout /></RouteGuard> },
      { path: 'account', element: <AccountPage /> },
      { path: 'communities/map', element: <RouteGuard routeKey="communitiesMap"><CommunitiesMapPage /></RouteGuard> },
      { path: 'communities', element: <RouteGuard routeKey="communities"><CommunitiesPage /></RouteGuard> },
      { path: 'farmers', element: <RouteGuard routeKey="farmers"><FarmersPage /></RouteGuard> },
      { path: 'groups', element: <RouteGuard routeKey="groups"><GroupsPage /></RouteGuard> },
      { path: 'locations', element: <RouteGuard routeKey="locations"><LocationsExplorerPage /></RouteGuard> },
      { path: 'data-quality', element: <RouteGuard routeKey="dataQuality"><DataQualityPage /></RouteGuard> },
      { path: 'imports', element: <RouteGuard routeKey="imports"><ImportsPage /></RouteGuard> },
      { path: 'forms', element: <RouteGuard routeKey="forms"><FormsPage /></RouteGuard> },
      { path: 'forms/option-lists', element: <RouteGuard routeKey="optionLists"><OptionListsPage /></RouteGuard> },
      { path: 'forms/:formId', element: <RouteGuard routeKey="forms"><FormBuilderPage /></RouteGuard> },
      { path: 'purchase-requests', element: <RouteGuard routeKey="purchaseRequests"><PurchaseRequestsPage /></RouteGuard> },
      { path: 'purchases', element: <RouteGuard routeKey="purchases"><PurchasesPage /></RouteGuard> },
      { path: 'purchases/bags', element: <RouteGuard routeKey="bags"><BagsPage /></RouteGuard> },
      { path: 'expenses', element: <RouteGuard routeKey="expenses"><ExpensesPage /></RouteGuard> },
      { path: 'reconciliation', element: <RouteGuard routeKey="reconciliation"><ReconciliationPage /></RouteGuard> },
      { path: 'payments', element: <RouteGuard routeKey="payments"><PaymentsPage /></RouteGuard> },
      { path: 'payments/wallets', element: <RouteGuard routeKey="wallets"><WalletsPage /></RouteGuard> },
      { path: 'price-board', element: <RouteGuard routeKey="priceBoard"><PriceBoardPage /></RouteGuard> },
      { path: 'forms/:formId/responses', element: <RouteGuard routeKey="forms"><ResponsesPage /></RouteGuard> },
      {
        path: 'platform',
        element: <RouteGuard routeKey="platform"><PlatformLayout /></RouteGuard>,
        children: [
          { index: true, element: <Navigate to="companies" replace /> },
          { path: 'companies', element: <CompaniesPage /> },
          { path: 'companies/new', element: <NewCompanyWizard /> },
          { path: 'companies/:orgId', element: <CompanyDetailPage /> },
          { path: 'plans', element: <PlansPage /> },
          { path: 'catalogues', element: <CataloguesPage /> },
          { path: 'leads', element: <LeadsPage /> },
          { path: 'audit', element: <PlatformAuditPage /> },
        ],
      },
      ...APP_ROUTES.filter((r) => !CUSTOM.has(r.key)).map((r) => ({
        path: rel(r.path),
        element: (
          <RouteGuard routeKey={r.key}>
            <PlaceholderPage key={r.key} routeKey={r.key} />
          </RouteGuard>
        ),
      })),
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/m',
    element: <MobileShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'tasks', element: <TasksScreen /> },
      { path: 'tasks/:taskId', element: <TaskFixScreen /> },
      { path: 'surveys', element: <SurveysScreen /> },
      { path: 'surveys/fix/:responseId', element: <SurveyFixScreen /> },
      { path: 'surveys/:formId', element: <SurveyFillScreen /> },
      { path: 'preview/:formId', element: <FormPreviewScreen /> },
      { path: 'communities', element: <CommunitiesScreen /> },
      { path: 'communities/new', element: <CommunityFlowScreen /> },
      { path: 'communities/:id', element: <CommunityFlowScreen /> },
      { path: 'farmers', element: <FarmersScreen /> },
      { path: 'farmers/new', element: <RegisterFarmerScreen /> },
      { path: 'farmers/:id', element: <FarmerDetailScreen /> },
      { path: 'farmers/:id/edit', element: <FarmerEditScreen /> },
      { path: 'groups', element: <GroupsScreen /> },
      { path: 'groups/new', element: <GroupFlowScreen /> },
      { path: 'groups/:id', element: <GroupFlowScreen /> },
      { path: 'buying', element: <BuyingScreen /> },
      { path: 'buying/requests/new', element: <NewRequestScreen /> },
      { path: 'buying/requests/:id', element: <RequestDetailScreen /> },
      { path: 'buying/purchase', element: <RecordPurchaseScreen /> },
      { path: 'buying/voice', element: <VoicePurchaseScreen /> },
      { path: 'buying/pre/new', element: <NewPreScreen /> },
      { path: 'sync', element: <SyncScreen /> },
      { path: 'me', element: <MeScreen /> },
      { path: 'flow/:flowId', element: <FlowPlaceholder /> },
      { path: '*', element: <Navigate to="/m" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } });
