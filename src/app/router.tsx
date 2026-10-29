import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/web/layout/AppShell';
import { PlaceholderPage } from '@/web/features/placeholders/PlaceholderPage';
import { LandingPage } from '@/public/LandingPage';
import { MobileShell } from '@/mobile/layout/MobileShell';
import { APP_ROUTES } from './routes';
import { AppIndexRedirect, NotFound, RequireSession, RouteGuard } from './guards';

// Pages load on demand: each route is its own chunk (PRD 15, first load < 3 s).
const DashboardPage = lazy(() => import('@/web/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AiPage = lazy(() => import('@/web/features/ai/AiPage').then((m) => ({ default: m.AiPage })));
const MobilePreviewsPage = lazy(() => import('@/web/features/help/MobilePreviewsPage').then((m) => ({ default: m.MobilePreviewsPage })));
const ReportsPage = lazy(() => import('@/web/features/system/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const NotificationsPage = lazy(() => import('@/web/features/system/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SyncPage = lazy(() => import('@/web/features/system/SyncPage').then((m) => ({ default: m.SyncPage })));
const AuditPage = lazy(() => import('@/web/features/system/AuditPage').then((m) => ({ default: m.AuditPage })));
const JobsPage = lazy(() => import('@/web/features/system/JobsPage').then((m) => ({ default: m.JobsPage })));
const HelpPage = lazy(() => import('@/web/features/system/HelpPage').then((m) => ({ default: m.HelpPage })));
const ApiDocsPage = lazy(() => import('@/web/features/system/ApiDocsPage').then((m) => ({ default: m.ApiDocsPage })));
const SettingsLayout = lazy(() => import('@/web/features/settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })));
const PlatformLayout = lazy(() => import('@/web/features/platform/PlatformLayout').then((m) => ({ default: m.PlatformLayout })));
const CompaniesPage = lazy(() => import('@/web/features/platform/CompaniesPage').then((m) => ({ default: m.CompaniesPage })));
const CompanyDetailPage = lazy(() => import('@/web/features/platform/CompanyDetailPage').then((m) => ({ default: m.CompanyDetailPage })));
const NewCompanyWizard = lazy(() => import('@/web/features/platform/NewCompanyWizard').then((m) => ({ default: m.NewCompanyWizard })));
const PlansPage = lazy(() => import('@/web/features/platform/PlansPage').then((m) => ({ default: m.PlansPage })));
const CataloguesPage = lazy(() => import('@/web/features/platform/CataloguesPage').then((m) => ({ default: m.CataloguesPage })));
const LeadsPage = lazy(() => import('@/web/features/platform/LeadsPage').then((m) => ({ default: m.LeadsPage })));
const PlatformAuditPage = lazy(() => import('@/web/features/platform/PlatformAuditPage').then((m) => ({ default: m.PlatformAuditPage })));
const AccountPage = lazy(() => import('@/web/features/account/AccountPage').then((m) => ({ default: m.AccountPage })));
const BookDemoPage = lazy(() => import('@/public/BookDemoPage').then((m) => ({ default: m.BookDemoPage })));
const LegalPage = lazy(() => import('@/public/BookDemoPage').then((m) => ({ default: m.LegalPage })));
const SignInPage = lazy(() => import('@/public/auth/SignInPage').then((m) => ({ default: m.SignInPage })));
const IdpPage = lazy(() => import('@/public/auth/SsoPages').then((m) => ({ default: m.IdpPage })));
const SsoPage = lazy(() => import('@/public/auth/SsoPages').then((m) => ({ default: m.SsoPage })));
const TwoStepPage = lazy(() => import('@/public/auth/TwoStepPage').then((m) => ({ default: m.TwoStepPage })));
const ChooseCompanyPage = lazy(() => import('@/public/auth/ChooseCompanyPage').then((m) => ({ default: m.ChooseCompanyPage })));
const AcceptInvitePage = lazy(() => import('@/public/auth/PasswordPages').then((m) => ({ default: m.AcceptInvitePage })));
const ForgotPasswordPage = lazy(() => import('@/public/auth/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })));
const ForgotSentPage = lazy(() => import('@/public/auth/PasswordPages').then((m) => ({ default: m.ForgotSentPage })));
const ResetPasswordPage = lazy(() => import('@/public/auth/PasswordPages').then((m) => ({ default: m.ResetPasswordPage })));
const SignUpPage = lazy(() => import('@/public/auth/SignUpPage').then((m) => ({ default: m.SignUpPage })));
const CommunitiesMapPage = lazy(() => import('@/web/features/people/CommunitiesPage').then((m) => ({ default: m.CommunitiesMapPage })));
const CommunitiesPage = lazy(() => import('@/web/features/people/CommunitiesPage').then((m) => ({ default: m.CommunitiesPage })));
const FarmersPage = lazy(() => import('@/web/features/people/FarmersPage').then((m) => ({ default: m.FarmersPage })));
const GroupsPage = lazy(() => import('@/web/features/people/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const LocationsExplorerPage = lazy(() => import('@/web/features/people/LocationsPage').then((m) => ({ default: m.LocationsExplorerPage })));
const DataQualityPage = lazy(() => import('@/web/features/quality/DataQualityPage').then((m) => ({ default: m.DataQualityPage })));
const ImportsPage = lazy(() => import('@/web/features/imports/ImportsPage').then((m) => ({ default: m.ImportsPage })));
const FormsPage = lazy(() => import('@/web/features/forms/FormsPage').then((m) => ({ default: m.FormsPage })));
const FormBuilderPage = lazy(() => import('@/web/features/forms/FormBuilderPage').then((m) => ({ default: m.FormBuilderPage })));
const ResponsesPage = lazy(() => import('@/web/features/forms/ResponsesPage').then((m) => ({ default: m.ResponsesPage })));
const OptionListsPage = lazy(() => import('@/web/features/forms/OptionListsPage').then((m) => ({ default: m.OptionListsPage })));
const SurveysScreen = lazy(() => import('@/mobile/flows/surveys/SurveysScreen').then((m) => ({ default: m.SurveysScreen })));
const SurveyFillScreen = lazy(() => import('@/mobile/flows/surveys/SurveyFillScreen').then((m) => ({ default: m.SurveyFillScreen })));
const SurveyFixScreen = lazy(() => import('@/mobile/flows/surveys/SurveyFillScreen').then((m) => ({ default: m.SurveyFixScreen })));
const FormPreviewScreen = lazy(() => import('@/mobile/flows/surveys/SurveyFillScreen').then((m) => ({ default: m.FormPreviewScreen })));
const RegisterFarmerScreen = lazy(() => import('@/mobile/flows/farmers/RegisterFarmerScreen').then((m) => ({ default: m.RegisterFarmerScreen })));
const PurchaseRequestsPage = lazy(() => import('@/web/features/buying/PurchaseRequestsPage').then((m) => ({ default: m.PurchaseRequestsPage })));
const PurchasesPage = lazy(() => import('@/web/features/buying/PurchasesPage').then((m) => ({ default: m.PurchasesPage })));
const BagsPage = lazy(() => import('@/web/features/buying/BagsPage').then((m) => ({ default: m.BagsPage })));
const ExpensesPage = lazy(() => import('@/web/features/buying/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const ReconciliationPage = lazy(() => import('@/web/features/buying/ReconciliationPage').then((m) => ({ default: m.ReconciliationPage })));
const PriceBoardPage = lazy(() => import('@/web/features/buying/PriceBoardPage').then((m) => ({ default: m.PriceBoardPage })));
const PaymentsPage = lazy(() => import('@/web/features/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const WalletsPage = lazy(() => import('@/web/features/payments/WalletsPage').then((m) => ({ default: m.WalletsPage })));
const AggregatorsPage = lazy(() => import('@/web/features/aggregators/AggregatorsPage').then((m) => ({ default: m.AggregatorsPage })));
const SupportPage = lazy(() => import('@/web/features/support/SupportPage').then((m) => ({ default: m.SupportPage })));
const ProvidersPage = lazy(() => import('@/web/features/support/ProvidersPage').then((m) => ({ default: m.ProvidersPage })));
const AllocationsPage = lazy(() => import('@/web/features/support/AllocationsPage').then((m) => ({ default: m.AllocationsPage })));
const RecoveryPage = lazy(() => import('@/web/features/support/RecoveryPage').then((m) => ({ default: m.RecoveryPage })));
const WarehousesPage = lazy(() => import('@/web/features/inventory/WarehousesPage').then((m) => ({ default: m.WarehousesPage })));
const InboundPage = lazy(() => import('@/web/features/inventory/InboundPage').then((m) => ({ default: m.InboundPage })));
const OutboundPage = lazy(() => import('@/web/features/inventory/OutboundPage').then((m) => ({ default: m.OutboundPage })));
const StockCountsPage = lazy(() => import('@/web/features/inventory/StockCountsPage').then((m) => ({ default: m.StockCountsPage })));
const WarehouseExpensesPage = lazy(() => import('@/web/features/inventory/WarehouseExpensesPage').then((m) => ({ default: m.WarehouseExpensesPage })));
const DispatchPage = lazy(() => import('@/web/features/sales/DispatchPage').then((m) => ({ default: m.DispatchPage })));
const NurseriesPage = lazy(() => import('@/web/features/land/NurseriesPage').then((m) => ({ default: m.NurseriesPage })));
const WorkshopSessionScreen = lazy(() => import('@/mobile/flows/workshops/WorkshopScreens').then((m) => ({ default: m.WorkshopSessionScreen })));
const WorkshopsHomeScreen = lazy(() => import('@/mobile/flows/workshops/WorkshopScreens').then((m) => ({ default: m.WorkshopsHomeScreen })));
const BudgetNewScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.BudgetNewScreen })));
const BudgetStatusScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.BudgetStatusScreen })));
const MyCashScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.MyCashScreen })));
const MyCommissionsScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.MyCommissionsScreen })));
const MyNotificationsScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.MyNotificationsScreen })));
const MyReportsScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.MyReportsScreen })));
const MyScoreScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.MyScoreScreen })));
const PlanScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.PlanScreen })));
const RetirementScreen = lazy(() => import('@/mobile/flows/field/FieldScreens').then((m) => ({ default: m.RetirementScreen })));
const AllocateScreen = lazy(() => import('@/mobile/flows/land/TreeScreens').then((m) => ({ default: m.AllocateScreen })));
const NurseryNewScreen = lazy(() => import('@/mobile/flows/land/TreeScreens').then((m) => ({ default: m.NurseryNewScreen })));
const NurseryRoundScreen = lazy(() => import('@/mobile/flows/land/TreeScreens').then((m) => ({ default: m.NurseryRoundScreen })));
const NurseryScreen = lazy(() => import('@/mobile/flows/land/TreeScreens').then((m) => ({ default: m.NurseryScreen })));
const TreeVisitScreen = lazy(() => import('@/mobile/flows/land/TreeScreens').then((m) => ({ default: m.TreeVisitScreen })));
const TreeVisitsScreen = lazy(() => import('@/mobile/flows/land/TreeScreens').then((m) => ({ default: m.TreeVisitsScreen })));
const TreesHomeScreen = lazy(() => import('@/mobile/flows/land/TreeScreens').then((m) => ({ default: m.TreesHomeScreen })));
const MapPlotScreen = lazy(() => import('@/mobile/flows/land/PlotScreens').then((m) => ({ default: m.MapPlotScreen })));
const PlotMonitorScreen = lazy(() => import('@/mobile/flows/land/PlotScreens').then((m) => ({ default: m.PlotMonitorScreen })));
const PlotsHomeScreen = lazy(() => import('@/mobile/flows/land/PlotScreens').then((m) => ({ default: m.PlotsHomeScreen })));
const SeedlingsPage = lazy(() => import('@/web/features/land/SeedlingsPage').then((m) => ({ default: m.SeedlingsPage })));
const TreesPage = lazy(() => import('@/web/features/land/TreesPage').then((m) => ({ default: m.TreesPage })));
const PlotsPage = lazy(() => import('@/web/features/land/PlotsPage').then((m) => ({ default: m.PlotsPage })));
const EudrPage = lazy(() => import('@/web/features/land/EudrPage').then((m) => ({ default: m.EudrPage })));
const CarbonPage = lazy(() => import('@/web/features/land/CarbonPage').then((m) => ({ default: m.CarbonPage })));
const AgentsPage = lazy(() => import('@/web/features/field/AgentsPage').then((m) => ({ default: m.AgentsPage })));
const ReportingLinesPage = lazy(() => import('@/web/features/field/ReportingLinesPage').then((m) => ({ default: m.ReportingLinesPage })));
const FieldActivityPage = lazy(() => import('@/web/features/field/FieldActivityPage').then((m) => ({ default: m.FieldActivityPage })));
const WeeklyPlansPage = lazy(() => import('@/web/features/field/PlansPage').then((m) => ({ default: m.PlansPage })));
const BudgetsPage = lazy(() => import('@/web/features/field/BudgetsPage').then((m) => ({ default: m.BudgetsPage })));
const RetirementsPage = lazy(() => import('@/web/features/field/RetirementsPage').then((m) => ({ default: m.RetirementsPage })));
const CarryForwardsPage = lazy(() => import('@/web/features/field/CarryForwardsPage').then((m) => ({ default: m.CarryForwardsPage })));
const AchievementsPage = lazy(() => import('@/web/features/field/AchievementsPage').then((m) => ({ default: m.AchievementsPage })));
const AllowancesPage = lazy(() => import('@/web/features/field/AllowancesPage').then((m) => ({ default: m.AllowancesPage })));
const ScoresPage = lazy(() => import('@/web/features/field/ScoresPage').then((m) => ({ default: m.ScoresPage })));
const CompensationPage = lazy(() => import('@/web/features/field/CompensationPage').then((m) => ({ default: m.CompensationPage })));
const AgentReportsPage = lazy(() => import('@/web/features/field/AgentReportsPage').then((m) => ({ default: m.AgentReportsPage })));
const WorkshopsPage = lazy(() => import('@/web/features/training/WorkshopsPage').then((m) => ({ default: m.WorkshopsPage })));
const TrainingCataloguePage = lazy(() => import('@/web/features/training/CataloguePage').then((m) => ({ default: m.TrainingCataloguePage })));
const SalesContractsPage = lazy(() => import('@/web/features/sales/SalesContractsPage').then((m) => ({ default: m.SalesContractsPage })));
const TraceboardPage = lazy(() => import('@/web/features/sales/TraceboardPage').then((m) => ({ default: m.TraceboardPage })));
const HomeScreen = lazy(() => import('@/mobile/flows/home/HomeScreen').then((m) => ({ default: m.HomeScreen })));
const TasksScreen = lazy(() => import('@/mobile/flows/home/TasksScreen').then((m) => ({ default: m.TasksScreen })));
const TaskFixScreen = lazy(() => import('@/mobile/flows/home/TaskFixScreen').then((m) => ({ default: m.TaskFixScreen })));
const SyncScreen = lazy(() => import('@/mobile/flows/home/SyncScreen').then((m) => ({ default: m.SyncScreen })));
const MeScreen = lazy(() => import('@/mobile/flows/me/MeScreen').then((m) => ({ default: m.MeScreen })));
const FlowPlaceholder = lazy(() => import('@/mobile/flows/FlowPlaceholder').then((m) => ({ default: m.FlowPlaceholder })));
const CommunitiesScreen = lazy(() => import('@/mobile/flows/profiling/CommunityScreens').then((m) => ({ default: m.CommunitiesScreen })));
const CommunityFlowScreen = lazy(() => import('@/mobile/flows/profiling/CommunityScreens').then((m) => ({ default: m.CommunityFlowScreen })));
const FarmerDetailScreen = lazy(() => import('@/mobile/flows/farmers/FarmerScreens').then((m) => ({ default: m.FarmerDetailScreen })));
const FarmerEditScreen = lazy(() => import('@/mobile/flows/farmers/FarmerScreens').then((m) => ({ default: m.FarmerEditScreen })));
const FarmersScreen = lazy(() => import('@/mobile/flows/farmers/FarmerScreens').then((m) => ({ default: m.FarmersScreen })));
const GroupFlowScreen = lazy(() => import('@/mobile/flows/farmers/GroupScreens').then((m) => ({ default: m.GroupFlowScreen })));
const GroupsScreen = lazy(() => import('@/mobile/flows/farmers/GroupScreens').then((m) => ({ default: m.GroupsScreen })));
const BuyingScreen = lazy(() => import('@/mobile/flows/buying/BuyingScreens').then((m) => ({ default: m.BuyingScreen })));
const NewRequestScreen = lazy(() => import('@/mobile/flows/buying/BuyingScreens').then((m) => ({ default: m.NewRequestScreen })));
const RequestDetailScreen = lazy(() => import('@/mobile/flows/buying/BuyingScreens').then((m) => ({ default: m.RequestDetailScreen })));
const RecordPurchaseScreen = lazy(() => import('@/mobile/flows/buying/RecordPurchaseScreen').then((m) => ({ default: m.RecordPurchaseScreen })));
const NewPreScreen = lazy(() => import('@/mobile/flows/buying/VoiceAndPreScreens').then((m) => ({ default: m.NewPreScreen })));
const VoicePurchaseScreen = lazy(() => import('@/mobile/flows/buying/VoiceAndPreScreens').then((m) => ({ default: m.VoicePurchaseScreen })));
const NewSupportScreen = lazy(() => import('@/mobile/flows/support/SupportScreens').then((m) => ({ default: m.NewSupportScreen })));
const SupportDetailScreen = lazy(() => import('@/mobile/flows/support/SupportScreens').then((m) => ({ default: m.SupportDetailScreen })));
const SupportScreen = lazy(() => import('@/mobile/flows/support/SupportScreens').then((m) => ({ default: m.SupportScreen })));
const NewRecoveryScreen = lazy(() => import('@/mobile/flows/support/RecoveryScreens').then((m) => ({ default: m.NewRecoveryScreen })));
const RecoveryDetailScreen = lazy(() => import('@/mobile/flows/support/RecoveryScreens').then((m) => ({ default: m.RecoveryDetailScreen })));
const RecoveryScreen = lazy(() => import('@/mobile/flows/support/RecoveryScreens').then((m) => ({ default: m.RecoveryScreen })));
const RepayScreen = lazy(() => import('@/mobile/flows/support/RecoveryScreens').then((m) => ({ default: m.RepayScreen })));
const AgentRepayScreen = lazy(() => import('@/mobile/flows/warehouse/WarehouseScreens').then((m) => ({ default: m.AgentRepayScreen })));
const CountScreen = lazy(() => import('@/mobile/flows/warehouse/WarehouseScreens').then((m) => ({ default: m.CountScreen })));
const OutboundScreen = lazy(() => import('@/mobile/flows/warehouse/WarehouseScreens').then((m) => ({ default: m.OutboundScreen })));
const ReceiveScreen = lazy(() => import('@/mobile/flows/warehouse/WarehouseScreens').then((m) => ({ default: m.ReceiveScreen })));
const ResolveScreen = lazy(() => import('@/mobile/flows/warehouse/WarehouseScreens').then((m) => ({ default: m.ResolveScreen })));
const WarehouseExpensesScreen = lazy(() => import('@/mobile/flows/warehouse/WarehouseScreens').then((m) => ({ default: m.WarehouseExpensesScreen })));
const WarehouseScreen = lazy(() => import('@/mobile/flows/warehouse/WarehouseScreens').then((m) => ({ default: m.WarehouseScreen })));

const CUSTOM = new Set(['dashboard', 'ai', 'helpMobile', 'settings', 'platform', 'account', 'communities', 'communitiesMap', 'farmers', 'groups', 'dataQuality', 'imports', 'locations', 'forms', 'optionLists', 'purchaseRequests', 'purchases', 'bags', 'expenses', 'reconciliation', 'priceBoard', 'payments', 'wallets', 'aggregators', 'support', 'recovery', 'providers', 'allocations', 'warehouses', 'inbound', 'outbound', 'stockCounts', 'warehouseExpenses', 'dispatch', 'salesContracts', 'traceboard', 'nurseries', 'seedlings', 'trees', 'plots', 'eudr', 'carbon', 'workshops', 'trainingCatalogue', 'agents', 'weeklyPlans', 'budgets', 'retirements', 'carryForwards', 'allowances', 'scores', 'compensation', 'agentReports', 'fieldActivity', 'reportingLines', 'achievements', 'reports', 'notifications', 'sync', 'audit', 'jobs', 'help', 'apiDocs']);
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
      { path: 'help', element: <RouteGuard routeKey="help"><HelpPage /></RouteGuard> },
      { path: 'help/api', element: <RouteGuard routeKey="apiDocs"><ApiDocsPage /></RouteGuard> },
      { path: 'reports', element: <RouteGuard routeKey="reports"><ReportsPage /></RouteGuard> },
      { path: 'notifications', element: <RouteGuard routeKey="notifications"><NotificationsPage /></RouteGuard> },
      { path: 'sync', element: <RouteGuard routeKey="sync"><SyncPage /></RouteGuard> },
      { path: 'audit', element: <RouteGuard routeKey="audit"><AuditPage /></RouteGuard> },
      { path: 'jobs', element: <RouteGuard routeKey="jobs"><JobsPage /></RouteGuard> },
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
      { path: 'aggregators', element: <RouteGuard routeKey="aggregators"><AggregatorsPage tab="purchases" /></RouteGuard> },
      { path: 'aggregators/suppliers', element: <RouteGuard routeKey="aggregators"><AggregatorsPage tab="suppliers" /></RouteGuard> },
      { path: 'aggregators/expenses', element: <RouteGuard routeKey="aggregators"><AggregatorsPage tab="expenses" /></RouteGuard> },
      { path: 'support', element: <RouteGuard routeKey="support"><SupportPage /></RouteGuard> },
      { path: 'support/providers', element: <RouteGuard routeKey="providers"><ProvidersPage /></RouteGuard> },
      { path: 'support/allocations', element: <RouteGuard routeKey="allocations"><AllocationsPage /></RouteGuard> },
      { path: 'recovery', element: <RouteGuard routeKey="recovery"><RecoveryPage tab="requests" /></RouteGuard> },
      { path: 'recovery/windows', element: <RouteGuard routeKey="recovery"><RecoveryPage tab="windows" /></RouteGuard> },
      { path: 'recovery/loans', element: <RouteGuard routeKey="recovery"><RecoveryPage tab="loans" /></RouteGuard> },
      { path: 'recovery/repayments', element: <RouteGuard routeKey="recovery"><RecoveryPage tab="repayments" /></RouteGuard> },
      { path: 'recovery/dashboard', element: <RouteGuard routeKey="recovery"><RecoveryPage tab="dashboard" /></RouteGuard> },
      { path: 'warehouses', element: <RouteGuard routeKey="warehouses"><WarehousesPage /></RouteGuard> },
      { path: 'inventory/inbound', element: <RouteGuard routeKey="inbound"><InboundPage /></RouteGuard> },
      { path: 'inventory/outbound', element: <RouteGuard routeKey="outbound"><OutboundPage /></RouteGuard> },
      { path: 'inventory/stock-counts', element: <RouteGuard routeKey="stockCounts"><StockCountsPage /></RouteGuard> },
      { path: 'inventory/expenses', element: <RouteGuard routeKey="warehouseExpenses"><WarehouseExpensesPage /></RouteGuard> },
      { path: 'dispatch', element: <RouteGuard routeKey="dispatch"><DispatchPage /></RouteGuard> },
      { path: 'sales-contracts', element: <RouteGuard routeKey="salesContracts"><SalesContractsPage /></RouteGuard> },
      { path: 'traceboard', element: <RouteGuard routeKey="traceboard"><TraceboardPage /></RouteGuard> },
      { path: 'nurseries', element: <RouteGuard routeKey="nurseries"><NurseriesPage /></RouteGuard> },
      { path: 'seedlings', element: <RouteGuard routeKey="seedlings"><SeedlingsPage /></RouteGuard> },
      { path: 'trees', element: <RouteGuard routeKey="trees"><TreesPage /></RouteGuard> },
      { path: 'plots', element: <RouteGuard routeKey="plots"><PlotsPage /></RouteGuard> },
      { path: 'eudr', element: <RouteGuard routeKey="eudr"><EudrPage /></RouteGuard> },
      { path: 'carbon', element: <RouteGuard routeKey="carbon"><CarbonPage /></RouteGuard> },
      { path: 'agents', element: <RouteGuard routeKey="agents"><AgentsPage /></RouteGuard> },
      { path: 'agents/reporting-lines', element: <RouteGuard routeKey="reportingLines"><ReportingLinesPage /></RouteGuard> },
      { path: 'field-activity', element: <RouteGuard routeKey="fieldActivity"><FieldActivityPage /></RouteGuard> },
      { path: 'weekly-plans', element: <RouteGuard routeKey="weeklyPlans"><WeeklyPlansPage /></RouteGuard> },
      { path: 'budgets', element: <RouteGuard routeKey="budgets"><BudgetsPage /></RouteGuard> },
      { path: 'retirements', element: <RouteGuard routeKey="retirements"><RetirementsPage /></RouteGuard> },
      { path: 'carry-forwards', element: <RouteGuard routeKey="carryForwards"><CarryForwardsPage /></RouteGuard> },
      { path: 'achievements', element: <RouteGuard routeKey="achievements"><AchievementsPage /></RouteGuard> },
      { path: 'allowances', element: <RouteGuard routeKey="allowances"><AllowancesPage /></RouteGuard> },
      { path: 'scores', element: <RouteGuard routeKey="scores"><ScoresPage /></RouteGuard> },
      { path: 'compensation', element: <RouteGuard routeKey="compensation"><CompensationPage /></RouteGuard> },
      { path: 'agent-reports', element: <RouteGuard routeKey="agentReports"><AgentReportsPage /></RouteGuard> },
      { path: 'workshops', element: <RouteGuard routeKey="workshops"><WorkshopsPage /></RouteGuard> },
      { path: 'workshops/catalogue', element: <RouteGuard routeKey="trainingCatalogue"><TrainingCataloguePage /></RouteGuard> },
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
      { path: 'support', element: <SupportScreen /> },
      { path: 'support/new', element: <NewSupportScreen /> },
      { path: 'support/:id', element: <SupportDetailScreen /> },
      { path: 'recovery', element: <RecoveryScreen /> },
      { path: 'recovery/new', element: <NewRecoveryScreen /> },
      { path: 'recovery/:id', element: <RecoveryDetailScreen /> },
      { path: 'recovery/:id/repay', element: <RepayScreen /> },
      { path: 'warehouse', element: <WarehouseScreen /> },
      { path: 'warehouse/receive/:id', element: <ReceiveScreen /> },
      { path: 'warehouse/outbound', element: <OutboundScreen /> },
      { path: 'warehouse/count', element: <CountScreen /> },
      { path: 'warehouse/count/:id', element: <CountScreen /> },
      { path: 'warehouse/expenses', element: <WarehouseExpensesScreen /> },
      { path: 'warehouse/resolve/:id', element: <ResolveScreen /> },
      { path: 'warehouse/repay/:id', element: <AgentRepayScreen /> },
      { path: 'workshops', element: <WorkshopsHomeScreen /> },
      { path: 'workshops/:id', element: <WorkshopSessionScreen /> },
      { path: 'trees', element: <TreesHomeScreen /> },
      { path: 'trees/nursery/new', element: <NurseryNewScreen /> },
      { path: 'trees/nursery/:id', element: <NurseryScreen /> },
      { path: 'trees/nursery/:id/round/:roundId', element: <NurseryRoundScreen /> },
      { path: 'trees/allocate', element: <AllocateScreen /> },
      { path: 'trees/visits', element: <TreeVisitsScreen /> },
      { path: 'trees/visit/:id', element: <TreeVisitScreen /> },
      { path: 'plots', element: <PlotsHomeScreen /> },
      { path: 'plots/new', element: <MapPlotScreen /> },
      { path: 'plots/:id/monitor', element: <PlotMonitorScreen /> },
      { path: 'sync', element: <SyncScreen /> },
      { path: 'me', element: <MeScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      { path: 'budget/new', element: <BudgetNewScreen /> },
      { path: 'budget/:id', element: <BudgetStatusScreen /> },
      { path: 'retirement/:id', element: <RetirementScreen /> },
      { path: 'me/cash', element: <MyCashScreen /> },
      { path: 'me/commissions', element: <MyCommissionsScreen /> },
      { path: 'me/score', element: <MyScoreScreen /> },
      { path: 'me/reports', element: <MyReportsScreen /> },
      { path: 'me/notifications', element: <MyNotificationsScreen /> },
      { path: 'flow/:flowId', element: <FlowPlaceholder /> },
      { path: '*', element: <Navigate to="/m" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } });
