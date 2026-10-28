import type { OutboxType } from '@/stores/outboxStore';

/** The 44 sync types the phone app sends or downloads (PRD K3), in the order agents meet them. */
export const SYNC_TYPES = [
  'masterData', 'settingsDownload', 'farmers', 'farmerEdits', 'farmerPhotos', 'fingerprints', 'communities', 'groups', 'groupMembers', 'leaders',
  'purchaseRequests', 'purchases', 'bags', 'fundsReceived', 'preExpenses', 'expenseReceipts', 'surveys', 'qualityFixes',
  'supportRequests', 'supportConfirmations', 'supportFulfilment', 'supportAssets', 'recoveryRequests', 'repayments', 'recoveryFeedback',
  'inboundReceipts', 'transfers', 'stockCounts', 'warehouseExpenses', 'discrepancies', 'bagTopUps', 'agentRepayments',
  'nurseries', 'nurseryRounds', 'seedlingAllocations', 'treeVisits', 'plots', 'plotVisits', 'workshops', 'attendance',
  'weeklyBudgets', 'retirements', 'reportResponses', 'gpsTrack',
] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

/** Which sync type each queued phone item is logged under. */
export const OUTBOX_SYNC_TYPE: Record<OutboxType, SyncType> = {
  purchase: 'purchases', purchaseRequest: 'purchaseRequests', fundsReceived: 'fundsReceived', receipt: 'expenseReceipts', farmer: 'farmers', farmerEdit: 'farmerEdits',
  community: 'communities', group: 'groups', expense: 'preExpenses', survey: 'surveys', qualityFix: 'qualityFixes', supportRequest: 'supportRequests',
  supportConfirm: 'supportConfirmations', supportFulfil: 'supportFulfilment', supportAssets: 'supportAssets', recoveryRequest: 'recoveryRequests', repayment: 'repayments',
  recoveryFeedback: 'recoveryFeedback', inboundReceive: 'inboundReceipts', transfer: 'transfers', stockCount: 'stockCounts', warehouseExpense: 'warehouseExpenses',
  discrepancyResolve: 'discrepancies', topUp: 'bagTopUps', agentRepayment: 'agentRepayments', nursery: 'nurseries', nurseryRound: 'nurseryRounds',
  seedlingAllocation: 'seedlingAllocations', treeVisit: 'treeVisits', plot: 'plots', plotVisit: 'plotVisits', workshop: 'workshops', budget: 'weeklyBudgets',
  retirement: 'retirements', reportResponse: 'reportResponses', other: 'masterData',
};
