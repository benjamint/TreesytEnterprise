import { createContext, useCallback, useContext, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import type { Lang, ModuleKey, Money, Organisation, OrgSettings, User } from '@/types';
import { formatMoney } from '@/engines/money';
import { resolveTerms, termVariables, type Terms } from '@/engines/terminology';
import { hasPermission, permissionsFor } from '@/engines/permissions';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import type { AppRoute } from '@/app/routes';
import { ALWAYS_ALLOWED } from '@/app/routes';
import { useSessionStore } from './sessionStore';
import { usePlatformStore } from './platformStore';
import { useAccessStore } from './accessStore';
import { useSettingsStore } from './settingsStore';

export interface Actor {
  orgId: string;
  userId: string | null;
  lang: Lang;
}

/**
 * Who is acting in this window. The web app uses the web session; the mobile window provides
 * its own actor (the signed-in field user) so the same hooks work in both.
 */
export const ActorContext = createContext<Actor | null>(null);

export function useActor(): Actor {
  const ctx = useContext(ActorContext);
  const web = useSessionStore(useShallow((s) => ({ orgId: s.orgId, userId: s.userId, lang: s.language })));
  return ctx ?? web;
}

/** The company this window is working in. */
export function useCurrentOrg(): Organisation {
  const { orgId } = useActor();
  const orgs = usePlatformStore((s) => s.orgs);
  return useMemo(() => orgs.find((o) => o.id === orgId) ?? orgs[0]!, [orgs, orgId]);
}

export function useCurrentUser(): User | undefined {
  const { userId } = useActor();
  const users = useAccessStore((s) => s.users);
  return useMemo(() => users.find((u) => u.id === userId), [users, userId]);
}

export function useOrgSettings(orgId?: string): OrgSettings {
  const { orgId: current } = useActor();
  return useSettingsStore((s) => s.settings[orgId ?? current]!);
}

export function useLang(): Lang {
  return useActor().lang;
}

export function useTerms(orgId?: string, lang?: Lang): Terms {
  const settings = useOrgSettings(orgId);
  const sessionLang = useLang();
  return useMemo(() => resolveTerms(settings?.terminology, lang ?? sessionLang), [settings?.terminology, lang, sessionLang]);
}

/**
 * `t()` with company terminology injected, so strings can say "Assign {{term.agent}}".
 * Re-renders when the company, its terminology or the language changes.
 */
export function useT(termsOverride?: Terms) {
  const { t: rawT, i18n } = useTranslation();
  const ownTerms = useTerms();
  const terms = termsOverride ?? ownTerms;
  const vars = useMemo(() => termVariables(terms), [terms]);
  // Translate in the actor's language explicitly: memoised cells then follow a language or company
  // switch even if they mounted after i18next's own languageChanged event.
  const lng = useLang();
  const t = useCallback(
    (key: string, opts: Record<string, unknown> = {}) => rawT(key, { lng, ...vars, ...opts }) as string,
    [rawT, vars, lng],
  );
  return { t, i18n, terms };
}

/** Money, numbers and dates in the company's currency, locale and time zone. */
export function useFormat(orgOverride?: Organisation) {
  const current = useCurrentOrg();
  const org = orgOverride ?? current;
  const lang = useLang();
  return useMemo(
    () => ({
      money: (v: number | Money, opts?: { compact?: boolean }) =>
        typeof v === 'number' ? formatMoney(v, org.currency, org.locale, opts) : formatMoney(v.amountMinor, v.currency, org.locale, opts),
      number: (n: number, opts?: Intl.NumberFormatOptions) => formatNumber(n, org.locale, opts),
      kg: (n: number) => `${formatNumber(n, org.locale, { maximumFractionDigits: 1 })} kg`,
      date: (iso: string | Date, pattern?: string) => formatDate(iso, org.timezone, lang, pattern),
      dateTime: (iso: string | Date) => formatDate(iso, org.timezone, lang, 'd MMM yyyy, HH:mm'),
      relative: (iso: string | Date) => formatRelative(iso, lang),
      org,
      lang,
    }),
    [org, lang],
  );
}

/** Effective permission patterns for the signed-in user in the current company. */
export function usePermissionPatterns(): string[] {
  const { userId, orgId } = useActor();
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  return useMemo(() => (userId ? permissionsFor(userId, orgId, { users, memberships, roles }) : []), [userId, orgId, users, memberships, roles]);
}

/** The plan's permission ceiling for the current company (platform permissions are exempt). */
export function usePlanCeiling(): string[] {
  const org = useCurrentOrg();
  const plans = usePlatformStore((s) => s.plans);
  return useMemo(() => plans.find((p) => p.id === org?.planId)?.permissionCeiling ?? ['*'], [plans, org?.planId]);
}

export function useCan() {
  const patterns = usePermissionPatterns();
  const ceiling = usePlanCeiling();
  return useCallback(
    (permission: string) => hasPermission(patterns, permission) && (permission.startsWith('platform.') || hasPermission(ceiling, permission)),
    [patterns, ceiling],
  );
}

export function useModules(): Record<ModuleKey, boolean> {
  return useOrgSettings().modules;
}

export type Access = 'ok' | 'module' | 'permission';

/** Can the current user open this route in the current company? */
export function useRouteAccessFn() {
  const can = useCan();
  const modules = useModules();
  return useCallback(
    (route: AppRoute): Access => {
      if (ALWAYS_ALLOWED.has(route.key)) return 'ok';
      if (route.module && !modules[route.module]) return 'module';
      if (!can(route.permission)) return 'permission';
      return 'ok';
    },
    [can, modules],
  );
}

/** Rows of the current company only (PRD principle 1). */
export function useOrgRows<T extends { orgId: string }>(rows: T[]): T[] {
  const { orgId } = useActor();
  return useMemo(() => rows.filter((r) => r.orgId === orgId), [rows, orgId]);
}

/** Companies the user can switch to: memberships, or every company for the platform owner. */
export function useUserOrgs(): Organisation[] {
  const user = useCurrentUser();
  const orgs = usePlatformStore((s) => s.orgs);
  const memberships = useAccessStore((s) => s.memberships);
  return useMemo(() => {
    if (!user) return [];
    if (user.isPlatformOwner) return orgs;
    const ids = new Set(memberships.filter((m) => m.userId === user.id && m.status !== 'DEACTIVATED').map((m) => m.orgId));
    return orgs.filter((o) => ids.has(o.id));
  }, [user, orgs, memberships]);
}

/** Role display name: a company's custom name, or the translated template name. */
export function useRoleName() {
  const { t } = useT();
  const roles = useAccessStore((s) => s.roles);
  return useCallback(
    (roleId: string) => {
      const r = roles.find((x) => x.id === roleId);
      return r ? r.name ?? t(`role.${r.template}`) : roleId;
    },
    [roles, t],
  );
}
