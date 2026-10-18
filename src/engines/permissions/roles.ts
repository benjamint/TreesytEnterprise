import type { RoleTemplate } from '@/types';

/** Default permission patterns for each role template (PRD 2.1). Companies copy and edit them. */
export const ROLE_TEMPLATES: Record<RoleTemplate, { permissions: string[]; mobile?: boolean }> = {
  platformOwner: { permissions: ['*'] },
  companyAdmin: { permissions: ['*', '!platform.*'] },
  operationsManager: {
    permissions: [
      '*.view', '*.export', '!platform.*', '!settings.*', 'dashboard.customise', 'purchaseRequests.approveManagement',
      'purchaseRequests.create', 'purchaseRequests.edit', 'expenses.approveLevel3', 'aggregators.approve',
      'aggregators.create', 'support.approve', 'recovery.reviewManager', 'weeklyPlans.*', 'agents.edit',
      'agents.reassign', 'budgets.approveManager', 'agentReports.*', 'compensation.approveFirst', 'communities.score',
    ],
  },
  financeOfficer: {
    permissions: [
      '*.view', '*.export', '!platform.*', '!settings.*', 'purchaseRequests.approveFinance', 'purchaseRequests.confirmRate',
      'purchaseRequests.disburse', 'purchaseRequests.activateTicket', 'expenses.approveLevel4', 'expenses.disburse',
      'aggregators.disburse', 'aggregators.reconcile', 'payments.*', 'wallets.*', 'reconciliation.*', 'support.disburse',
      'recovery.activateFinance', 'recovery.confirmCash', 'recovery.refund', 'budgets.approveFinance', 'budgets.pay',
      'retirements.*', 'carryForwards.*', 'allowances.*', 'compensation.approveSecond', 'compensation.pay',
      'inbound.reviewRepayment', 'warehouseExpenses.disburse', 'salesContracts.recordPayment', 'purchases.pay',
    ],
  },
  logisticsManager: {
    permissions: [
      'dashboard.view', 'ai.view', 'purchaseRequests.view', 'purchases.view', 'expenses.*', '!expenses.approveLevel3',
      '!expenses.approveLevel4', 'dispatch.*', 'warehouses.view', 'inbound.view', 'outbound.*', 'agents.view',
      'reports.view', 'notifications.view', 'communities.view',
    ],
  },
  warehouseManager: {
    permissions: [
      'dashboard.view', 'ai.view', 'warehouses.*', 'inbound.*', '!inbound.reviewRepayment', 'outbound.*', 'stockCounts.*',
      'warehouseExpenses.*', '!warehouseExpenses.disburse', 'purchases.view', 'dispatch.view', 'reports.view', 'notifications.view',
    ],
  },
  salesOfficer: {
    permissions: [
      'dashboard.view', 'ai.view', 'salesContracts.*', '!salesContracts.recordPayment', 'dispatch.*', 'traceboard.*',
      'warehouses.view', 'outbound.view', 'reports.view', 'notifications.view',
    ],
  },
  meOfficer: {
    permissions: [
      'dashboard.view', 'ai.view', 'forms.*', 'dataQuality.*', 'imports.*', 'reports.*', 'communities.view', 'farmers.view',
      'farmers.edit', 'groups.view', 'locations.view', 'workshops.view', 'notifications.view', 'sync.view',
    ],
  },
  sustainabilityOfficer: {
    permissions: [
      'dashboard.view', 'ai.view', 'nurseries.*', 'seedlings.*', 'trees.*', 'plots.*', 'eudr.*', 'carbon.*',
      'communities.view', 'farmers.view', 'reports.view', 'notifications.view',
    ],
  },
  fieldSupervisor: {
    permissions: [
      'dashboard.view', 'ai.view', 'agents.view', 'weeklyPlans.*', 'budgets.view', 'budgets.approveManager', 'retirements.view',
      'scores.view', 'agentReports.view', 'agentReports.create', 'fieldActivity.view', 'communities.view', 'farmers.view',
      'groups.view', 'purchaseRequests.view', 'purchases.view', 'notifications.view', 'mobile.use',
    ],
  },
  fieldAgent: {
    mobile: true,
    permissions: ['mobile.*', '!mobile.warehouse', 'communities.view', 'communities.create', 'farmers.view', 'farmers.create', 'groups.view', 'groups.create', 'purchaseRequests.create', 'purchases.create', 'expenses.create', 'support.create', 'notifications.view'],
  },
  warehouseOfficer: {
    mobile: true,
    permissions: ['mobile.use', 'mobile.warehouse', 'inbound.receive', 'outbound.create', 'outbound.receiveTransfer', 'stockCounts.create', 'warehouseExpenses.create', 'notifications.view'],
  },
  buyerUser: { permissions: ['traceboard.view', 'traceboard.downloadDocuments', 'traceboard.requestInsights'] },
  auditor: { permissions: ['*.view', '*.export', '!platform.*'] },
};

export const ROLE_TEMPLATE_KEYS = Object.keys(ROLE_TEMPLATES) as RoleTemplate[];
