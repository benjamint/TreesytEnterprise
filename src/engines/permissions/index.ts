import type { Membership, Role, User } from '@/types';
import { PERMISSIONS } from './catalogue';

export * from './catalogue';
export * from './modules';
export * from './roles';

function matches(pattern: string, key: string): boolean {
  if (pattern === '*' || pattern === key) return true;
  const [pr, pa] = pattern.split('.');
  const [kr, ka] = key.split('.');
  return (pr === '*' || pr === kr) && (pa === '*' || pa === ka);
}

/**
 * Checks a permission against wildcard patterns. Patterns: `*`, `resource.*`, `*.action`,
 * `resource.action`; a leading `!` denies and wins over grants.
 */
export function hasPermission(patterns: string[], key: string): boolean {
  let granted = false;
  for (const p of patterns) {
    if (p.startsWith('!')) {
      if (matches(p.slice(1), key)) return false;
    } else if (!granted && matches(p, key)) granted = true;
  }
  return granted;
}

/** Expand patterns into concrete catalogue keys (used by the permission matrix and plan ceilings). */
export function expandPermissions(patterns: string[]): string[] {
  return PERMISSIONS.map((p) => p.key).filter((k) => hasPermission(patterns, k));
}

export interface PermissionContext {
  users: User[];
  memberships: Membership[];
  roles: Role[];
  /** Plan ceiling for the company (wildcards). */
  ceilings?: Record<string, string[]>;
}

/** Effective permission patterns of a user inside one company. */
export function permissionsFor(userId: string, orgId: string, ctx: PermissionContext): string[] {
  const user = ctx.users.find((u) => u.id === userId);
  if (!user) return [];
  if (user.isPlatformOwner) return ['*'];
  const m = ctx.memberships.find((x) => x.userId === userId && x.orgId === orgId && x.status !== 'DEACTIVATED');
  if (!m) return [];
  return m.roleIds.flatMap((rid) => ctx.roles.find((r) => r.id === rid && r.orgId === orgId)?.permissions ?? []);
}

/** `can(user, permission, orgId)` — PRD 8.12. Respects the company's plan ceiling. */
export function can(userId: string, permission: string, orgId: string, ctx: PermissionContext): boolean {
  const ceiling = ctx.ceilings?.[orgId];
  if (ceiling && !hasPermission(ceiling, permission)) return false;
  return hasPermission(permissionsFor(userId, orgId, ctx), permission);
}
