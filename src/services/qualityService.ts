import type { FieldTask, QualityEntity, QualityIssue } from '@/types';
import { checkEntity } from '@/engines/rules';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Data-quality review (PRD C5): rules raise issues on create, import, sync and re-check; reviewers
 * assign fixes to agents' phones or mark records valid; fixes from the phone resolve the issue.
 */

const ACTIVE = new Set<QualityIssue['status']>(['OPEN', 'ASSIGNED']);

function rowsFor(orgId: string, entity: QualityEntity) {
  if (entity === 'farmer') return useFarmerStore.getState().farmers.filter((f) => f.orgId === orgId);
  if (entity === 'community') return useCommunityStore.getState().communities.filter((c) => c.orgId === orgId);
  return useGroupStore.getState().groups.filter((g) => g.orgId === orgId);
}

function agentFor(orgId: string, entity: QualityEntity, recordId: string): string | undefined {
  if (entity === 'farmer') return useFarmerStore.getState().farmers.find((f) => f.id === recordId)?.agentId;
  if (entity === 'community') return useCommunityStore.getState().communities.find((c) => c.id === recordId)?.agentIds[0];
  const g = useGroupStore.getState().groups.find((x) => x.id === recordId);
  return g && useCommunityStore.getState().communities.find((c) => c.id === g.communityId && c.orgId === orgId)?.agentIds[0];
}

/** Keep each farmer's quality chip in step with its active issues. */
function syncFarmerStatus(orgId: string, farmerIds: string[]) {
  const active = new Set(useQualityStore.getState().issues.filter((i) => i.orgId === orgId && i.entity === 'farmer' && ACTIVE.has(i.status)).map((i) => i.recordId));
  useFarmerStore.getState().updateFarmers(farmerIds, (f) => ({ qualityStatus: active.has(f.id) ? 'FLAGGED' : 'OK' }));
}

/**
 * Run the company's rules for some records (or all): raise new issues, and resolve active ones
 * that no longer fail. Returns the newly raised issues.
 */
export function recheck(orgId: string, entity: QualityEntity, recordIds: string[] | null, source: QualityIssue['source'], actorId = 'system'): QualityIssue[] {
  const rules = useSettingsStore.getState().settings[orgId]?.qualityRules ?? [];
  const rows = rowsFor(orgId, entity) as unknown as ({ id: string } & Record<string, unknown>)[];
  const only = recordIds ? new Set(recordIds) : undefined;
  const flags = checkEntity(rules, entity, rows, new Date(), only);
  const store = useQualityStore.getState();
  const existing = store.issues.filter((i) => i.orgId === orgId && i.entity === entity && (!only || only.has(i.recordId)));
  const key = (recordId: string, ruleId: string) => `${recordId}|${ruleId}`;
  const failing = new Set(flags.map((f) => key(f.recordId, f.ruleId)));
  const known = new Set(existing.filter((i) => ACTIVE.has(i.status) || i.status === 'VALID').map((i) => key(i.recordId, i.ruleId)));
  const now = new Date().toISOString();
  const fresh: QualityIssue[] = flags
    .filter((f) => !known.has(key(f.recordId, f.ruleId)))
    .map((f) => ({ id: uid('qi'), orgId, entity, recordId: f.recordId, ruleId: f.ruleId, severity: f.severity, params: f.params, status: 'OPEN', agentId: agentFor(orgId, entity, f.recordId), source, createdAt: now, updatedAt: now }));
  const cleared = existing.filter((i) => ACTIVE.has(i.status) && !failing.has(key(i.recordId, i.ruleId))).map((i) => i.id);
  if (fresh.length) store.addIssues(fresh);
  if (cleared.length) store.updateIssues(cleared, { status: 'RESOLVED', resolvedBy: actorId });
  if (entity === 'farmer') syncFarmerStatus(orgId, [...new Set([...fresh.map((i) => i.recordId), ...existing.map((i) => i.recordId)])]);
  return fresh;
}

/** Send fixes to the agent responsible for each record: one mobile task per record. */
export function assignToAgents(orgId: string, issueIds: string[], actorId: string, note?: string): FieldTask[] {
  const store = useQualityStore.getState();
  const issues = store.issues.filter((i) => issueIds.includes(i.id) && i.orgId === orgId && ACTIVE.has(i.status));
  const rules = useSettingsStore.getState().settings[orgId]?.qualityRules ?? [];
  const agents = useAgentStore.getState().agents;
  const byRecord = new Map<string, QualityIssue[]>();
  for (const i of issues) byRecord.set(i.recordId, [...(byRecord.get(i.recordId) ?? []), i]);
  const tasks: FieldTask[] = [];
  const now = new Date().toISOString();
  for (const [recordId, list] of byRecord) {
    const agentId = list[0]!.agentId ?? agentFor(orgId, list[0]!.entity, recordId);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) continue;
    const task: FieldTask = {
      id: uid('task'), orgId, agentId: agent.id, userId: agent.userId, kind: 'qualityFix', entity: list[0]!.entity, recordId,
      issueIds: list.map((i) => i.id), fields: [...new Set(list.map((i) => rules.find((r) => r.id === i.ruleId)?.field ?? ''))].filter(Boolean),
      note, status: 'OPEN', createdAt: now, createdBy: actorId,
    };
    store.addTask(task);
    store.updateIssues(task.issueIds, { status: 'ASSIGNED', taskId: task.id, agentId: agent.id });
    useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId: agent.userId, kind: 'ALERT', key: 'fixTask', params: { count: list.length }, link: `/m/tasks/${task.id}`, read: false, at: now });
    useActivityStore.getState().log(makeEvent(orgId, list[0]!.entity, recordId, 'quality.assigned', { count: list.length }, actorId));
    tasks.push(task);
  }
  return tasks;
}

export function markValid(orgId: string, issueIds: string[], reason: string, actorId: string) {
  const store = useQualityStore.getState();
  const issues = store.issues.filter((i) => issueIds.includes(i.id) && i.orgId === orgId);
  store.updateIssues(issues.map((i) => i.id), { status: 'VALID', note: reason, resolvedBy: actorId });
  for (const i of issues) useActivityStore.getState().log(makeEvent(orgId, i.entity, i.recordId, 'quality.markedValid', { reason }, actorId));
  syncFarmerStatus(orgId, issues.filter((i) => i.entity === 'farmer').map((i) => i.recordId));
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  const last = parts.pop()!;
  let cur = obj;
  for (const p of parts) cur = (cur[p] = { ...((cur[p] as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
  cur[last] = value;
}

/** Apply a fix from the phone: update the record, re-check it, close the task. */
export function applyFix(taskId: string, values: Record<string, unknown>, actorId: string, device = 'mobile') {
  const store = useQualityStore.getState();
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task || task.status === 'DONE') return { resolved: 0, remaining: 0 };
  if (task.entity === 'farmer') {
    const f = useFarmerStore.getState().farmers.find((x) => x.id === task.recordId);
    if (f) {
      const next = structuredClone(f) as unknown as Record<string, unknown>;
      for (const [path, v] of Object.entries(values)) {
        // Age is entered as an age; the record stores a date of birth.
        if (path === 'age') setPath(next, 'dateOfBirth', new Date(new Date().getFullYear() - Number(v), 6, 1).toISOString().slice(0, 10));
        else setPath(next, path, v);
      }
      next.version = f.version + 1;
      next.updatedAt = new Date().toISOString();
      useFarmerStore.getState().saveFarmer(next as never);
    }
  } else if (task.entity === 'community') {
    const c = useCommunityStore.getState().communities.find((x) => x.id === task.recordId);
    if (c) {
      const next = structuredClone(c) as unknown as Record<string, unknown>;
      for (const [path, v] of Object.entries(values)) setPath(next, path, v);
      useCommunityStore.getState().saveCommunity(next as never);
    }
  }
  useActivityStore.getState().log(makeEvent(task.orgId, task.entity, task.recordId, 'quality.fixed', { fields: Object.keys(values).join(', ') }, actorId, { device }));
  if (task.entity !== 'response') recheck(task.orgId, task.entity, [task.recordId], 'MOBILE', actorId);
  // Anything still failing goes back to the review queue.
  const still = useQualityStore.getState().issues.filter((i) => task.issueIds.includes(i.id) && ACTIVE.has(i.status)).map((i) => i.id);
  if (still.length) store.updateIssues(still, { status: 'OPEN', taskId: undefined });
  const after = useQualityStore.getState().issues.filter((i) => task.issueIds.includes(i.id));
  store.updateTask(taskId, { status: 'DONE', doneAt: new Date().toISOString() });
  return { resolved: after.filter((i) => i.status === 'RESOLVED').length, remaining: after.filter((i) => ACTIVE.has(i.status)).length };
}
