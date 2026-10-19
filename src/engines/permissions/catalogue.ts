import type { ModuleKey, Permission } from '@/types';

type ResourceDef = { resource: string; module: ModuleKey | 'settings' | 'platform' | 'mobile'; actions: string[] };

const CRUD = ['view', 'create', 'edit', 'delete', 'export'];

/**
 * Permission catalogue grouped by module and resource (PRD 8.12). Keys are `resource.action`.
 * Labels are produced in the UI from translated resource and action names, so the catalogue
 * stays language-neutral.
 */
export const RESOURCES: ResourceDef[] = [
  { resource: 'dashboard', module: 'dashboard', actions: ['view', 'customise', 'setDefault'] },
  { resource: 'ai', module: 'ai', actions: ['view'] },
  { resource: 'locations', module: 'farmers', actions: CRUD },
  { resource: 'communities', module: 'farmers', actions: [...CRUD, 'score'] },
  { resource: 'farmers', module: 'farmers', actions: [...CRUD, 'merge', 'viewSensitive', 'manageNfc'] },
  { resource: 'groups', module: 'farmers', actions: [...CRUD, 'reviewScore', 'manageSavings'] },
  { resource: 'dataQuality', module: 'dataQuality', actions: ['view', 'resolve', 'assign'] },
  { resource: 'imports', module: 'imports', actions: ['view', 'create', 'undo'] },
  { resource: 'purchaseRequests', module: 'buying', actions: [...CRUD, 'approveManagement', 'approveFinance', 'confirmRate', 'disburse', 'activateTicket', 'archive', 'updatePrice'] },
  { resource: 'purchases', module: 'buying', actions: [...CRUD, 'editWallet', 'pay'] },
  { resource: 'expenses', module: 'buying', actions: [...CRUD, 'approveLevel1', 'approveLevel2', 'approveLevel3', 'approveLevel4', 'disburse'] },
  { resource: 'aggregators', module: 'aggregators', actions: [...CRUD, 'approve', 'approveSupplier', 'disburse', 'reconcile'] },
  { resource: 'reconciliation', module: 'buying', actions: ['view', 'refund', 'writeOff', 'reconcile', 'export'] },
  { resource: 'priceBoard', module: 'buying', actions: ['view', 'suggest'] },
  { resource: 'payments', module: 'payments', actions: ['view', 'initiate', 'check', 'retry', 'reverse', 'export'] },
  { resource: 'wallets', module: 'payments', actions: ['view', 'topUp'] },
  { resource: 'support', module: 'support', actions: [...CRUD, 'approve', 'disburse', 'fulfil', 'editAmount'] },
  { resource: 'recovery', module: 'recovery', actions: [...CRUD, 'reviewManager', 'activateFinance', 'confirmCash', 'refund', 'recordRepayment'] },
  { resource: 'providers', module: 'support', actions: CRUD },
  { resource: 'warehouses', module: 'inventory', actions: CRUD },
  { resource: 'inbound', module: 'inventory', actions: ['view', 'receive', 'resolve', 'reviewRepayment', 'export'] },
  { resource: 'outbound', module: 'inventory', actions: ['view', 'create', 'receiveTransfer', 'export'] },
  { resource: 'stockCounts', module: 'inventory', actions: ['view', 'create', 'approveAdjustment'] },
  { resource: 'warehouseExpenses', module: 'inventory', actions: [...CRUD, 'approve', 'disburse'] },
  { resource: 'dispatch', module: 'dispatch', actions: [...CRUD, 'approve', 'track', 'verify'] },
  { resource: 'salesContracts', module: 'salesContracts', actions: [...CRUD, 'approve', 'recordPayment'] },
  { resource: 'traceboard', module: 'traceboard', actions: ['view', 'share', 'downloadDocuments', 'requestInsights'] },
  { resource: 'nurseries', module: 'nurseries', actions: CRUD },
  { resource: 'seedlings', module: 'trees', actions: [...CRUD, 'assign'] },
  { resource: 'trees', module: 'trees', actions: CRUD },
  { resource: 'plots', module: 'plots', actions: [...CRUD, 'verify'] },
  { resource: 'eudr', module: 'eudr', actions: ['view', 'runCheck', 'generateDds', 'submitDds'] },
  { resource: 'carbon', module: 'carbon', actions: CRUD },
  { resource: 'forms', module: 'forms', actions: [...CRUD, 'publish', 'reviewResponses'] },
  { resource: 'workshops', module: 'workshops', actions: CRUD },
  { resource: 'agents', module: 'fieldTeam', actions: [...CRUD, 'editWallet', 'reassign'] },
  { resource: 'weeklyPlans', module: 'fieldTeam', actions: [...CRUD, 'publish'] },
  { resource: 'budgets', module: 'weeklyBudgets', actions: ['view', 'create', 'approveManager', 'approveFinance', 'pay', 'export'] },
  { resource: 'retirements', module: 'weeklyBudgets', actions: ['view', 'review', 'confirmRefund', 'export'] },
  { resource: 'carryForwards', module: 'weeklyBudgets', actions: ['view', 'waive', 'runPenalties'] },
  { resource: 'allowances', module: 'allowances', actions: ['view', 'run', 'approve', 'pay'] },
  { resource: 'scores', module: 'fieldTeam', actions: ['view', 'recalculate'] },
  { resource: 'compensation', module: 'commissions', actions: ['view', 'create', 'approveFirst', 'approveSecond', 'pay', 'export'] },
  { resource: 'agentReports', module: 'fieldTeam', actions: ['view', 'create', 'resolve'] },
  { resource: 'fieldActivity', module: 'fieldTeam', actions: ['view', 'manageGeofences'] },
  { resource: 'reports', module: 'reports', actions: ['view', 'create', 'schedule', 'export'] },
  { resource: 'notifications', module: 'notifications', actions: ['view', 'viewOutbox'] },
  { resource: 'sync', module: 'system', actions: ['view', 'viewPayloads', 'manageDevices'] },
  { resource: 'audit', module: 'system', actions: ['view', 'export'] },
  { resource: 'jobs', module: 'system', actions: ['view', 'run'] },
  { resource: 'settings', module: 'settings', actions: ['view', 'edit', 'manageUsers', 'manageRoles', 'manageIntegrations'] },
  { resource: 'platform', module: 'platform', actions: ['view', 'manageCompanies', 'managePlans', 'manageCatalogues'] },
  { resource: 'mobile', module: 'mobile', actions: ['use', 'buy', 'profile', 'support', 'recovery', 'warehouse', 'trees', 'surveys', 'workshops', 'budget'] },
];

export const PERMISSIONS: Permission[] = RESOURCES.flatMap((r) =>
  r.actions.map((action) => ({ key: `${r.resource}.${action}`, module: r.module, resource: r.resource, action })),
);

export const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));
