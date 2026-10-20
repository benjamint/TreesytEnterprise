import type { DocType, PurchaseRequest } from '@/types';
import { apply, canAct, type WorkflowAction, type WorkflowRecord, type WorkflowUser, WorkflowError } from '@/engines/workflow';
import { makeEvent } from '@/engines/activity';
import { permissionsFor } from '@/engines/permissions';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useSupportStore } from '@/stores/supportStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Approve / reject / hold / resume any record through the workflow engine (PRD 8.1): updates the
 * record, writes activity events and notifies whoever can act next.
 */

type BuyingKey = 'requests' | 'expenses' | 'aggregatorPurchases' | 'aggregatorExpenses' | 'warehouseExpenses';
type Source = { key: BuyingKey; entity: string; path: string; store?: 'buying' | 'support' | 'warehouse' };
export const DOC_SOURCES: Partial<Record<DocType, Source>> = {
  purchaseRequest: { key: 'requests', entity: 'purchaseRequest', path: '/app/purchase-requests' },
  preExpense: { key: 'expenses', entity: 'preExpense', path: '/app/expenses' },
  aggregatorPurchase: { key: 'aggregatorPurchases', entity: 'aggregatorPurchase', path: '/app/aggregators' },
  aggregatorExpense: { key: 'aggregatorExpenses', entity: 'aggregatorExpense', path: '/app/aggregators/expenses' },
  supportRequest: { key: 'requests', entity: 'supportRequest', path: '/app/support', store: 'support' },
  warehouseExpense: { key: 'warehouseExpenses', entity: 'warehouseExpense', path: '/app/inventory/expenses', store: 'warehouse' },
};

const storeOf = (src: Source) => (src.store === 'support' ? useSupportStore : src.store === 'warehouse' ? useWarehouseStore : useBuyingStore) as unknown as { getState: () => Record<string, unknown>; setState: (p: Record<string, unknown>) => void };

export function workflowUser(userId: string, orgId: string): WorkflowUser {
  const { users, memberships, roles } = useAccessStore.getState();
  const m = memberships.find((x) => x.userId === userId && x.orgId === orgId);
  return { id: userId, roleIds: m?.roleIds ?? [], permissions: permissionsFor(userId, orgId, { users, memberships, roles }) };
}

export type ActOutcome = { ok: true; status: string } | { ok: false; reason: string };

export function act(orgId: string, docType: DocType, recordId: string, action: WorkflowAction, userId: string, comment?: string): ActOutcome {
  const src = DOC_SOURCES[docType];
  const def = useSettingsStore.getState().settings[orgId]?.workflows.find((w) => w.docType === docType);
  if (!src || !def) return { ok: false, reason: 'notAllowed' };
  const store = storeOf(src);
  const rows = store.getState()[src.key] as unknown as (WorkflowRecord & { orgId: string; number: string })[];
  const record = rows.find((r) => r.id === recordId && r.orgId === orgId);
  if (!record) return { ok: false, reason: 'notAllowed' };
  let result;
  try {
    result = apply(record, def, action, workflowUser(userId, orgId), { comment });
  } catch (e) {
    return { ok: false, reason: e instanceof WorkflowError ? e.code : 'notAllowed' };
  }
  const next = { ...result.record, updatedAt: new Date().toISOString() };
  store.setState({ [src.key]: rows.map((r) => (r.id === recordId ? next : r)) });

  const log = useActivityStore.getState().log;
  for (const e of result.events) log(makeEvent(orgId, src.entity, recordId, e.key, e.params, userId));

  // Notify the people who can act on the record now, and the requester when it is finished.
  const notify = useNotificationStore.getState().push;
  const at = new Date().toISOString();
  const link = `${src.path}?open=${recordId}`;
  const members = useAccessStore.getState().memberships.filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && m.userId !== userId);
  for (const m of members) {
    if (canAct(next, def, workflowUser(m.userId, orgId)))
      notify({ id: uid('ntf'), orgId, userId: m.userId, kind: 'APPROVAL', key: 'approvalNeeded', params: { docType, number: record.number }, link, read: false, at });
  }
  const requester = (record as unknown as PurchaseRequest).createdBy;
  if (requester && requester !== userId && (next.status === def.approvedStatus || next.status === def.rejectedStatus))
    notify({ id: uid('ntf'), orgId, userId: requester, kind: 'APPROVAL', key: next.status === def.approvedStatus ? 'approvalDone' : 'approvalRejected', params: { docType, number: record.number }, link, read: false, at });
  return { ok: true, status: next.status };
}
