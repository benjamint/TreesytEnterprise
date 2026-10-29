import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Sparkles, MapPinned, Users, UsersRound, ShieldCheck, Upload, ClipboardList, ShoppingBasket, Truck, Store, Scale,
  CreditCard, Wallet, HandHeart, RotateCcw, Wrench, Warehouse, PackageOpen, PackageCheck, ListChecks, Receipt, Send, FileSignature,
  Radar, Sprout, Leaf, Trees, Map, BadgeCheck, CloudSun, FileText, GraduationCap, UserCog, CalendarRange, PiggyBank, ReceiptText,
  Repeat, Gift, Trophy, Coins, Flag, Navigation, BarChart3, Bell, RefreshCcw, ScrollText, Timer, Settings, Building2, QrCode, LineChart,
  Smartphone, BookOpen, UserCircle, Network, Code2, Archive, ListTree, Award,
} from 'lucide-react';
import type { ModuleKey } from '@/types';

/**
 * Every web route (PRD section 7 plus detail pages referenced in section 9). Drives the router,
 * the sidebar, module/permission gating, the command palette and "What's configurable here".
 */
export interface AppRoute {
  key: string;
  path: string;
  icon: LucideIcon;
  module?: ModuleKey;
  permission: string;
  section?: NavSection;
  /** Shown in the sidebar (detail pages are reachable but not listed). */
  nav?: boolean;
  /** The build phase that delivers the full screen (PRD 14). */
  phase: number;
  /** Settings pages (keys) that change how this page behaves. */
  configurable?: string[];
}

export type NavSection = 'main' | 'people' | 'buying' | 'money' | 'support' | 'inventory' | 'trees' | 'forms' | 'fieldTeam' | 'insights' | 'system' | 'admin';

export const NAV_SECTIONS: NavSection[] = ['main', 'people', 'buying', 'money', 'support', 'inventory', 'trees', 'forms', 'fieldTeam', 'insights', 'system', 'admin'];

const r = (key: string, path: string, icon: LucideIcon, permission: string, phase: number, module?: ModuleKey, section?: NavSection, extra: Partial<AppRoute> = {}): AppRoute => ({
  key, path, icon, permission, phase, module, section, nav: section !== undefined, ...extra,
});

export const APP_ROUTES: AppRoute[] = [
  r('dashboard', '/app/dashboard', LayoutDashboard, 'dashboard.view', 4, 'dashboard', 'main', { configurable: ['modules'] }),
  r('ai', '/app/ai', Sparkles, 'ai.view', 4, 'ai', 'main'),

  r('communities', '/app/communities', MapPinned, 'communities.view', 5, 'farmers', 'people', { configurable: ['locations', 'forms', 'terminology'] }),
  r('farmers', '/app/farmers', Users, 'farmers.view', 5, 'farmers', 'people', { configurable: ['forms', 'farmerId', 'biometrics', 'dataQuality'] }),
  r('groups', '/app/groups', UsersRound, 'groups.view', 5, 'farmers', 'people', { configurable: ['forms', 'terminology'] }),
  r('dataQuality', '/app/data-quality', ShieldCheck, 'dataQuality.view', 5, 'dataQuality', 'people', { configurable: ['dataQuality'] }),
  r('imports', '/app/imports', Upload, 'imports.view', 5, 'imports', 'people'),

  r('purchaseRequests', '/app/purchase-requests', ClipboardList, 'purchaseRequests.view', 7, 'buying', 'buying', { configurable: ['approvals', 'numbering', 'priceLists', 'buyingRules', 'notifications'] }),
  r('purchases', '/app/purchases', ShoppingBasket, 'purchases.view', 7, 'buying', 'buying', { configurable: ['buyingRules', 'units', 'commodities'] }),
  r('expenses', '/app/expenses', Truck, 'expenses.view', 7, 'buying', 'buying', { configurable: ['approvals', 'numbering'] }),
  r('aggregators', '/app/aggregators', Store, 'aggregators.view', 10, 'aggregators', 'buying', { configurable: ['approvals', 'commodities', 'priceLists'] }),
  r('reconciliation', '/app/reconciliation', Scale, 'reconciliation.view', 7, 'buying', 'buying', { configurable: ['buyingRules'] }),

  r('payments', '/app/payments', CreditCard, 'payments.view', 8, 'payments', 'money', { configurable: ['payments'] }),
  r('wallets', '/app/payments/wallets', Wallet, 'wallets.view', 8, 'payments', 'money', { configurable: ['payments'] }),

  r('support', '/app/support', HandHeart, 'support.view', 11, 'support', 'support', { configurable: ['supportLoans', 'approvals'] }),
  r('recovery', '/app/recovery', RotateCcw, 'recovery.view', 11, 'recovery', 'support', { configurable: ['supportLoans'] }),
  r('providers', '/app/support/providers', Wrench, 'providers.view', 11, 'support', 'support'),

  r('warehouses', '/app/warehouses', Warehouse, 'warehouses.view', 12, 'inventory', 'inventory', { configurable: ['inventoryRules', 'units'] }),
  r('inbound', '/app/inventory/inbound', PackageOpen, 'inbound.view', 12, 'inventory', 'inventory', { configurable: ['inventoryRules'] }),
  r('outbound', '/app/inventory/outbound', PackageCheck, 'outbound.view', 12, 'inventory', 'inventory', { configurable: ['inventoryRules'] }),
  r('stockCounts', '/app/inventory/stock-counts', ListChecks, 'stockCounts.view', 12, 'inventory', 'inventory'),
  r('warehouseExpenses', '/app/inventory/expenses', Receipt, 'warehouseExpenses.view', 12, 'inventory', 'inventory', { configurable: ['approvals'] }),
  r('dispatch', '/app/dispatch', Send, 'dispatch.view', 13, 'dispatch', 'inventory', { configurable: ['approvals', 'numbering', 'salesRules'] }),
  r('salesContracts', '/app/sales-contracts', FileSignature, 'salesContracts.view', 13, 'salesContracts', 'inventory', { configurable: ['salesRules', 'numbering'] }),
  r('traceboard', '/app/traceboard', Radar, 'traceboard.view', 13, 'traceboard', 'inventory', { configurable: ['salesRules', 'privacy', 'branding'] }),

  r('nurseries', '/app/nurseries', Sprout, 'nurseries.view', 14, 'nurseries', 'trees', { configurable: ['treesLand', 'forms'] }),
  r('seedlings', '/app/seedlings', Leaf, 'seedlings.view', 14, 'trees', 'trees', { configurable: ['treesLand', 'numbering'] }),
  r('trees', '/app/trees', Trees, 'trees.view', 14, 'trees', 'trees', { configurable: ['treesLand', 'forms'] }),
  r('plots', '/app/plots', Map, 'plots.view', 14, 'plots', 'trees', { configurable: ['treesLand', 'units'] }),
  r('eudr', '/app/eudr', BadgeCheck, 'eudr.view', 14, 'eudr', 'trees', { configurable: ['commodities', 'treesLand'] }),
  r('carbon', '/app/carbon', CloudSun, 'carbon.view', 14, 'carbon', 'trees', { configurable: ['treesLand'] }),

  r('forms', '/app/forms', FileText, 'forms.view', 6, 'forms', 'forms', { configurable: ['forms'] }),
  r('workshops', '/app/workshops', GraduationCap, 'workshops.view', 15, 'workshops', 'forms', { configurable: ['training', 'forms', 'numbering'] }),

  r('agents', '/app/agents', UserCog, 'agents.view', 16, 'fieldTeam', 'fieldTeam', { configurable: ['fieldTeam', 'terminology'] }),
  r('weeklyPlans', '/app/weekly-plans', CalendarRange, 'weeklyPlans.view', 16, 'fieldTeam', 'fieldTeam', { configurable: ['fieldTeam'] }),
  r('budgets', '/app/budgets', PiggyBank, 'budgets.view', 16, 'weeklyBudgets', 'fieldTeam', { configurable: ['fieldTeam', 'approvals'] }),
  r('retirements', '/app/retirements', ReceiptText, 'retirements.view', 16, 'weeklyBudgets', 'fieldTeam'),
  r('carryForwards', '/app/carry-forwards', Repeat, 'carryForwards.view', 16, 'weeklyBudgets', 'fieldTeam', { configurable: ['fieldTeam'] }),
  r('allowances', '/app/allowances', Gift, 'allowances.view', 16, 'allowances', 'fieldTeam'),
  r('scores', '/app/scores', Trophy, 'scores.view', 16, 'fieldTeam', 'fieldTeam'),
  r('compensation', '/app/compensation', Coins, 'compensation.view', 16, 'commissions', 'fieldTeam'),
  r('agentReports', '/app/agent-reports', Flag, 'agentReports.view', 16, 'fieldTeam', 'fieldTeam'),
  r('fieldActivity', '/app/field-activity', Navigation, 'fieldActivity.view', 16, 'fieldTeam', 'fieldTeam'),

  r('reports', '/app/reports', BarChart3, 'reports.view', 17, 'reports', 'insights'),
  r('notifications', '/app/notifications', Bell, 'notifications.view', 17, 'notifications', 'insights', { configurable: ['notifications'] }),

  r('sync', '/app/sync', RefreshCcw, 'sync.view', 17, 'system', 'system', { configurable: ['privacy', 'mobile'] }),
  r('audit', '/app/audit', ScrollText, 'audit.view', 17, 'system', 'system'),
  r('jobs', '/app/jobs', Timer, 'jobs.view', 17, 'system', 'system'),

  r('settings', '/app/settings', Settings, 'settings.view', 3, undefined, 'admin'),
  r('platform', '/app/platform', Building2, 'platform.view', 2, undefined, 'admin'),

  // Detail pages referenced in PRD section 9 (not in the sidebar)
  r('communitiesMap', '/app/communities/map', Map, 'communities.view', 5, 'farmers'),
  r('locations', '/app/locations', ListTree, 'locations.view', 5, 'farmers', undefined, { configurable: ['locations'] }),
  r('bags', '/app/purchases/bags', QrCode, 'purchases.view', 7, 'buying'),
  r('priceBoard', '/app/price-board', LineChart, 'priceBoard.view', 7, 'buying', undefined, { configurable: ['priceLists'] }),
  r('allocations', '/app/support/allocations', Archive, 'support.view', 11, 'support'),
  r('optionLists', '/app/forms/option-lists', ListTree, 'forms.view', 6, 'forms'),
  r('trainingCatalogue', '/app/workshops/catalogue', Award, 'workshops.view', 15, 'workshops', undefined, { configurable: ['training'] }),
  r('reportingLines', '/app/agents/reporting-lines', Network, 'agents.view', 16, 'fieldTeam'),
  r('achievements', '/app/achievements', Trophy, 'weeklyPlans.view', 16, 'fieldTeam'),
  r('helpMobile', '/app/help/mobile', Smartphone, 'dashboard.view', 1),
  r('help', '/app/help', BookOpen, 'dashboard.view', 17),
  r('apiDocs', '/app/help/api', Code2, 'settings.view', 17),
  r('account', '/app/account', UserCircle, 'dashboard.view', 2),
];

/** Pages anyone signed in can open regardless of permissions. */
export const ALWAYS_ALLOWED = new Set(['helpMobile', 'help', 'account']);

export function routeByKey(key: string): AppRoute {
  return APP_ROUTES.find((x) => x.key === key)!;
}

/** Company settings pages (PRD A4). */
export const SETTINGS_PAGES = [
  'profile', 'branding', 'modules', 'locations', 'commodities', 'units', 'priceLists', 'approvals', 'numbering', 'payments',
  'buyingRules', 'supportLoans', 'inventoryRules', 'salesRules', 'treesLand', 'training', 'fieldTeam', 'dataQuality', 'forms', 'farmerId', 'biometrics', 'roles', 'users',
  'terminology', 'notifications', 'smsEmail', 'integrations', 'security', 'privacy', 'mobile',
] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export const SETTINGS_GROUPS: { key: string; pages: SettingsPage[] }[] = [
  { key: 'company', pages: ['profile', 'branding', 'modules', 'terminology'] },
  { key: 'operations', pages: ['locations', 'commodities', 'units', 'priceLists', 'buyingRules', 'supportLoans', 'inventoryRules', 'salesRules', 'treesLand', 'training', 'fieldTeam'] },
  { key: 'workflows', pages: ['approvals', 'numbering', 'farmerId', 'forms', 'dataQuality', 'notifications'] },
  { key: 'money', pages: ['payments', 'smsEmail'] },
  { key: 'access', pages: ['roles', 'users', 'security', 'biometrics', 'mobile'] },
  { key: 'data', pages: ['integrations', 'privacy'] },
];

/** Platform console pages (PRD A3). */
export const PLATFORM_PAGES = ['companies', 'plans', 'catalogues', 'leads', 'audit'] as const;
export type PlatformPage = (typeof PLATFORM_PAGES)[number];

/** Mobile flows M1–M12 (PRD 10). */
export const MOBILE_FLOWS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'] as const;
export type MobileFlow = (typeof MOBILE_FLOWS)[number];
export const MOBILE_FLOW_PHASE: Record<MobileFlow, number> = { M1: 9, M2: 9, M3: 9, M4: 9, M5: 9, M6: 11, M7: 11, M8: 12, M9: 14, M10: 15, M11: 16, M12: 16 };
