import { matchPath } from 'react-router-dom';
import { APP_ROUTES, ALWAYS_ALLOWED } from '@/app/routes';
import { hasPermission, permissionsFor } from '@/engines/permissions';
import { useAccessStore } from '@/stores/accessStore';
import { useSettingsStore } from '@/stores/settingsStore';

/** Non-hook check used right before switching company or persona: would this page still open? */
export function pathOpenFor(pathname: string, orgId: string, userId: string): boolean {
  const route = [...APP_ROUTES].sort((a, b) => b.path.length - a.path.length).find((r) => matchPath({ path: r.path, end: false }, pathname));
  if (!route || ALWAYS_ALLOWED.has(route.key)) return true;
  const settings = useSettingsStore.getState().settings[orgId];
  if (route.module && !settings?.modules[route.module]) return false;
  const { users, memberships, roles } = useAccessStore.getState();
  return hasPermission(permissionsFor(userId, orgId, { users, memberships, roles }), route.permission);
}
