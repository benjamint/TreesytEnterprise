import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/web/layout/AppShell';
import { DashboardPage } from '@/web/features/dashboard/DashboardPage';
import { MobilePreviewsPage } from '@/web/features/help/MobilePreviewsPage';
import { SettingsLayout } from '@/web/features/settings/SettingsLayout';
import { PlatformLayout } from '@/web/features/platform/PlatformLayout';
import { PlaceholderPage } from '@/web/features/placeholders/PlaceholderPage';
import { LandingPage } from '@/public/LandingPage';
import { MobileShell } from '@/mobile/layout/MobileShell';
import { HomeScreen } from '@/mobile/flows/home/HomeScreen';
import { TasksScreen } from '@/mobile/flows/home/TasksScreen';
import { SyncScreen } from '@/mobile/flows/home/SyncScreen';
import { MeScreen } from '@/mobile/flows/me/MeScreen';
import { FlowPlaceholder } from '@/mobile/flows/FlowPlaceholder';
import { APP_ROUTES } from './routes';
import { AppIndexRedirect, NotFound, RequireSession, RouteGuard } from './guards';

const CUSTOM = new Set(['dashboard', 'helpMobile', 'settings', 'platform']);
const rel = (path: string) => path.replace(/^\/app\//, '');

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
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
      { path: 'help/mobile', element: <MobilePreviewsPage /> },
      { path: 'settings', element: <RouteGuard routeKey="settings"><SettingsLayout /></RouteGuard> },
      { path: 'settings/:page', element: <RouteGuard routeKey="settings"><SettingsLayout /></RouteGuard> },
      { path: 'platform/*', element: <RouteGuard routeKey="platform"><PlatformLayout /></RouteGuard> },
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
      { path: 'sync', element: <SyncScreen /> },
      { path: 'me', element: <MeScreen /> },
      { path: 'flow/:flowId', element: <FlowPlaceholder /> },
      { path: '*', element: <Navigate to="/m" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
