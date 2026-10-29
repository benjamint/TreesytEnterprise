import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Lock, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { routeByKey } from './routes';
import { useCurrentOrg, useRouteAccessFn, useT } from '@/stores/hooks';
import { useSessionStore } from '@/stores/sessionStore';
import { useHomePath } from '@/web/layout/useNav';

/** Auth guard: the web app needs a signed-in session. */
export function RequireSession({ children }: { children: ReactNode }) {
  const userId = useSessionStore((s) => s.userId);
  const { pathname, search } = useLocation();
  if (!userId) return <Navigate to={`/sign-in?next=${encodeURIComponent(pathname + search)}`} replace />;
  return <>{children}</>;
}

/** /app → the first page this user can open in this company (buyers land on Traceboard). */
export function AppIndexRedirect() {
  return <Navigate to={useHomePath()} replace />;
}

function Blocked({ icon: Icon, title, body }: { icon: typeof Lock; title: string; body: string }) {
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon className="h-6 w-6" />
      </span>
      <h1 className="font-display text-[26px]">{title}</h1>
      <p className="mt-2 text-muted">{body}</p>
      <Button asChild className="mt-6" variant="secondary">
        <Link to="/app">{t('common.backToDashboard')}</Link>
      </Button>
    </div>
  );
}

/** Module + permission route guard (PRD 8.12, principle 5). */
export function RouteGuard({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const route = routeByKey(routeKey);
  const access = useRouteAccessFn()(route);
  const org = useCurrentOrg();
  const { t } = useT();
  if (access === 'module') return <Blocked icon={PowerOff} title={t('errors.moduleOffTitle')} body={t('common.moduleOff', { module: t(`module.${route.module}`), company: org.name })} />;
  if (access === 'permission') return <Blocked icon={Lock} title={t('errors.noAccessTitle')} body={t('common.missingPermission', { permission: route.permission })} />;
  return <>{children}</>;
}

export function NotFound() {
  const { t } = useT();
  return <Blocked icon={Lock} title={t('errors.notFound')} body={t('errors.notFoundBody')} />;
}
