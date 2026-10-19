import type { DocType, Organisation, OrgSettings, WorkflowDefinition } from '@/types';
import { rehome, type WorkflowRecord } from '@/engines/workflow';
import { uid } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useActivityStore } from '@/stores/activityStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useBuyingStore } from '@/stores/buyingStore';

/**
 * Settings saves (PRD A4): write the company's settings, keep in-flight records consistent with the
 * new rules, and leave an audit entry with before/after values. Every tab sees the change at once.
 */

type BuyingKey = 'requests' | 'expenses' | 'aggregatorPurchases';
const WORKFLOW_RECORDS: Partial<Record<DocType, BuyingKey>> = {
  purchaseRequest: 'requests',
  preExpense: 'expenses',
  aggregatorPurchase: 'aggregatorPurchases',
};

function audit(orgId: string, page: string, before: unknown, after: unknown) {
  const actorId = useSessionStore.getState().userId ?? 'system';
  useActivityStore.getState().addAudit({ id: uid('aud'), orgId, actorId, entity: 'settings', entityId: page, key: 'settings.updated', before, after, at: new Date().toISOString() });
}

/** How many in-flight records of a document type a new definition would move to another step. */
export function recordsMovedBy(orgId: string, def: WorkflowDefinition): number {
  const key = WORKFLOW_RECORDS[def.docType];
  if (!key) return 0;
  const rows = useBuyingStore.getState()[key] as unknown as (WorkflowRecord & { orgId: string })[];
  return rows.filter((r) => r.orgId === orgId && rehome(def, r) !== r).length;
}

function rehomeAll(orgId: string, defs: WorkflowDefinition[]) {
  const patch: Partial<Record<BuyingKey, unknown[]>> = {};
  for (const def of defs) {
    const key = WORKFLOW_RECORDS[def.docType];
    if (!key) continue;
    const rows = useBuyingStore.getState()[key] as unknown as (WorkflowRecord & { orgId: string })[];
    let changed = false;
    const next = rows.map((r) => {
      if (r.orgId !== orgId) return r;
      const n = rehome(def, r);
      if (n !== r) changed = true;
      return n;
    });
    if (changed) patch[key] = next;
  }
  if (Object.keys(patch).length) useBuyingStore.setState(patch as never);
}

export function saveSettings(orgId: string, page: string, patch: Partial<OrgSettings>) {
  const current = useSettingsStore.getState().settings[orgId]!;
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, current[k as keyof OrgSettings]]));
  useSettingsStore.getState().updateSettings(orgId, patch);
  if (patch.workflows) rehomeAll(orgId, patch.workflows);
  audit(orgId, page, before, patch);
}

export function saveOrganisation(orgId: string, page: string, patch: Partial<Organisation>) {
  const org = usePlatformStore.getState().orgs.find((o) => o.id === orgId)!;
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, org[k as keyof Organisation]]));
  usePlatformStore.getState().updateOrg(orgId, patch);
  audit(orgId, page, before, patch);
}

/** Record an audit entry for settings changes saved through other stores (roles, users, locations). */
export function auditSettings(orgId: string, page: string, after: unknown, before?: unknown) {
  audit(orgId, page, before, after);
}
