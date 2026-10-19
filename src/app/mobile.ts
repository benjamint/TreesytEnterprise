import { toast } from 'sonner';
import i18n from '@/i18n';
import type { Membership, Role } from '@/types';

/** Default field user to open the mobile app as, per company (PRD 2.2 personas). */
const DEFAULT_MOBILE_USER: Record<string, string> = { org_vitara: 'u_yaw', org_kakao: 'u_moussa' };

export function defaultMobileUser(orgId: string, currentUserId: string | null, memberships: Membership[], roles: Role[]): string | null {
  const isMobile = (m: Membership) => m.roleIds.some((r) => roles.find((x) => x.id === r)?.mobile);
  const mine = memberships.find((m) => m.userId === currentUserId && m.orgId === orgId);
  if (mine && isMobile(mine)) return mine.userId;
  if (DEFAULT_MOBILE_USER[orgId]) return DEFAULT_MOBILE_USER[orgId]!;
  return memberships.find((m) => m.orgId === orgId && isMobile(m))?.userId ?? null;
}

/** PRD 4.2: the mobile app opens in its own phone-sized window. */
export function openMobileWindow(orgId: string, userId: string, flow?: string, go?: string) {
  const qs = new URLSearchParams({ org: orgId, user: userId });
  if (flow) qs.set('flow', flow);
  if (go) qs.set('go', go);
  const w = window.open(`/m?${qs.toString()}`, 'treesyt-mobile', 'width=420,height=880');
  if (!w) toast.error(i18n.t('shell.popupBlocked'));
  else w.focus();
}
