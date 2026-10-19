import type { ApprovalRecord, Money, WorkflowDefinition, WorkflowState, WorkflowStep } from '@/types';
import { hasPermission } from '@/engines/permissions';
import { getPath } from '@/lib/utils';

/**
 * Workflow engine (PRD 8.1). Pure functions: a definition + a record + a user in, a new record +
 * structured activity events + notification intents out. Every approvable document type uses it.
 */

export interface WorkflowRecord {
  id: string;
  status: string;
  createdBy: string;
  approvals: ApprovalRecord[];
  wf: WorkflowState;
  total?: Money;
  [key: string]: unknown;
}

export interface WorkflowUser {
  id: string;
  roleIds: string[];
  /** Effective permission patterns in the record's company. */
  permissions: string[];
}

export type WorkflowAction = 'APPROVE' | 'REJECT' | 'HOLD' | 'RESUME';

export type BlockReason =
  | 'missingPermission'
  | 'missingRole'
  | 'requesterCannotApprove'
  | 'alreadyApprovedOtherStep'
  | 'alreadyApprovedThisStep'
  | 'finished';

export interface AllowedAction {
  action: WorkflowAction;
  stepId: string | null;
  allowed: boolean;
  reason?: BlockReason;
  /** The permission needed, so the UI can name it in a tooltip. */
  permission?: string;
}

export interface EngineEvent {
  key: string;
  params: Record<string, unknown>;
}

export interface ApplyResult<T extends WorkflowRecord> {
  record: T;
  events: EngineEvent[];
  notifications: EngineEvent[];
}

export interface ApplyPayload {
  comment?: string;
  stepId?: string;
  amountOverride?: Money;
  at?: string;
}

export class WorkflowError extends Error {
  constructor(public code: BlockReason | 'notAllowed' | 'reasonRequired' | 'notHeld' | 'amountNotEditable', message?: string) {
    super(message ?? code);
  }
}

export const SYSTEM_USER = 'system';

function numeric(v: unknown): unknown {
  if (v && typeof v === 'object' && 'amountMinor' in (v as Money)) return (v as Money).amountMinor;
  return v;
}

/** Does a step apply to this record? Steps without a condition always apply. */
export function stepApplies(step: WorkflowStep, record: Record<string, unknown>): boolean {
  const c = step.condition;
  if (!c) return true;
  const raw = numeric(getPath(record, c.field));
  switch (c.op) {
    case '>':
      return Number(raw) > Number(c.value);
    case '>=':
      return Number(raw) >= Number(c.value);
    case '<':
      return Number(raw) < Number(c.value);
    case 'in':
      return Array.isArray(c.value) && c.value.includes(raw);
    case 'aboveListPct':
      return Number(raw) > Number(c.value);
    default:
      return true;
  }
}

export function activeSteps(def: WorkflowDefinition, record: Record<string, unknown>): WorkflowStep[] {
  return def.steps.filter((s) => stepApplies(s, record));
}

/** Steps in the group starting at `stepId`: the step plus consecutive parallel steps. */
export function groupAt(def: WorkflowDefinition, record: Record<string, unknown>, stepId: string | null): WorkflowStep[] {
  if (!stepId) return [];
  const steps = activeSteps(def, record);
  const i = steps.findIndex((s) => s.id === stepId);
  if (i < 0) return [];
  const group = [steps[i]];
  if (steps[i].parallel) {
    for (let j = i + 1; j < steps.length && steps[j].parallel; j++) group.push(steps[j]);
  }
  return group;
}

function satisfied(step: WorkflowStep, wf: WorkflowState): boolean {
  return (wf.stepApprovals[step.id]?.length ?? 0) >= (step.minApprovals ?? 1);
}

/** Steps still waiting for a decision right now. */
export function pendingSteps(def: WorkflowDefinition, record: WorkflowRecord): WorkflowStep[] {
  if (isFinished(def, record) || isHeld(def, record)) return [];
  return groupAt(def, record, record.wf.currentStepId).filter((s) => !satisfied(s, record.wf));
}

export function isFinished(def: WorkflowDefinition, record: WorkflowRecord): boolean {
  return record.status === def.approvedStatus || record.status === def.rejectedStatus || record.wf.currentStepId === null;
}

export function isHeld(def: WorkflowDefinition, record: WorkflowRecord): boolean {
  return record.status === def.heldStatus;
}

function eligibility(def: WorkflowDefinition, record: WorkflowRecord, step: WorkflowStep, user: WorkflowUser): BlockReason | null {
  if (!hasPermission(user.permissions, step.permission)) return 'missingPermission';
  if (step.roleIds.length && !step.roleIds.some((r) => user.roleIds.includes(r)) && !user.permissions.includes('*')) return 'missingRole';
  if (def.separation.requesterCannotApprove && record.createdBy === user.id) return 'requesterCannotApprove';
  if ((record.wf.stepApprovals[step.id] ?? []).includes(user.id)) return 'alreadyApprovedThisStep';
  if (def.separation.sameUserNotTwoSteps) {
    const other = Object.entries(record.wf.stepApprovals).some(([sid, users]) => sid !== step.id && users.includes(user.id));
    if (other) return 'alreadyApprovedOtherStep';
  }
  return null;
}

/** Which actions can this user take now? Blocked actions are returned with a reason for "View as" tooltips. */
export function getAllowedActions(record: WorkflowRecord, def: WorkflowDefinition, user: WorkflowUser): AllowedAction[] {
  if (isHeld(def, record)) {
    const step = def.steps.find((s) => s.id === record.wf.heldAtStepId);
    if (!step) return [{ action: 'RESUME', stepId: null, allowed: false, reason: 'finished' }];
    const allowed = hasPermission(user.permissions, step.permission);
    return [{ action: 'RESUME', stepId: step.id, allowed, reason: allowed ? undefined : 'missingPermission', permission: step.permission }];
  }
  if (isFinished(def, record)) return [];
  const pending = pendingSteps(def, record);
  const checks = pending.map((s) => ({ step: s, reason: eligibility(def, record, s, user) }));
  const ok = checks.find((c) => c.reason === null);
  const target = ok ?? checks[0];
  if (!target) return [];
  const base = { stepId: target.step.id, allowed: !target.reason, reason: target.reason ?? undefined, permission: target.step.permission };
  const actions: AllowedAction[] = [
    { action: 'APPROVE', ...base },
    { action: 'REJECT', ...base },
  ];
  if (def.holdAllowed) actions.push({ action: 'HOLD', ...base });
  return actions;
}

function statusBeforeStep(def: WorkflowDefinition, record: Record<string, unknown>, stepId: string): string {
  const steps = activeSteps(def, record);
  const i = steps.findIndex((s) => s.id === stepId);
  for (let j = i - 1; j >= 0; j--) {
    const st = def.stepStatus[steps[j].id];
    if (st) return st;
  }
  return def.initialStatus;
}

/** Move past the current group, auto-approving `auto` steps on the way. */
function advance<T extends WorkflowRecord>(def: WorkflowDefinition, rec: T, fromStepId: string | null, at: string, events: EngineEvent[], notes: EngineEvent[]): T {
  const steps = activeSteps(def, rec);
  let idx = fromStepId === null ? 0 : steps.findIndex((s) => s.id === fromStepId) + groupAt(def, rec, fromStepId).length;
  let next: T = rec;
  while (idx < steps.length && steps[idx].auto) {
    const s = steps[idx];
    next = {
      ...next,
      approvals: [...next.approvals, { stepId: s.id, userId: SYSTEM_USER, decision: 'APPROVED', at }],
      wf: { ...next.wf, stepApprovals: { ...next.wf.stepApprovals, [s.id]: [SYSTEM_USER] } },
      status: def.stepStatus[s.id] ?? next.status,
    };
    events.push({ key: 'workflow.autoApproved', params: { step: s.name } });
    idx++;
  }
  if (idx >= steps.length) {
    events.push({ key: 'workflow.completed', params: {} });
    notes.push({ key: 'approval.completed', params: {} });
    return { ...next, status: def.approvedStatus, wf: { ...next.wf, currentStepId: null } };
  }
  const s = steps[idx];
  notes.push({ key: 'approval.needed', params: { stepId: s.id, step: s.name, permission: s.permission, roleIds: s.roleIds } });
  return { ...next, wf: { ...next.wf, currentStepId: s.id } };
}

/** Initialise a newly submitted record: sets the first step (auto steps approve themselves). */
export function start<T extends Omit<WorkflowRecord, 'wf' | 'status' | 'approvals'> & Partial<WorkflowRecord>>(
  def: WorkflowDefinition,
  record: T,
  at = new Date().toISOString(),
): ApplyResult<T & WorkflowRecord> {
  const events: EngineEvent[] = [{ key: 'workflow.submitted', params: {} }];
  const notes: EngineEvent[] = [];
  const base = { ...record, status: def.initialStatus, approvals: [], wf: { currentStepId: null, stepApprovals: {} } } as unknown as T & WorkflowRecord;
  const rec = advance(def, base, null, at, events, notes);
  return { record: rec, events, notifications: notes };
}

export function apply<T extends WorkflowRecord>(
  record: T,
  def: WorkflowDefinition,
  action: WorkflowAction,
  user: WorkflowUser,
  payload: ApplyPayload = {},
): ApplyResult<T> {
  const at = payload.at ?? new Date().toISOString();
  const allowed = getAllowedActions(record, def, user).find((a) => a.action === action && (!payload.stepId || a.stepId === payload.stepId));
  if (!allowed) throw new WorkflowError('notAllowed', `${action} is not available`);
  if (!allowed.allowed) throw new WorkflowError(allowed.reason ?? 'notAllowed');
  const events: EngineEvent[] = [];
  const notes: EngineEvent[] = [];
  const step = def.steps.find((s) => s.id === allowed.stepId)!;

  if (action === 'RESUME') {
    let rec: T = { ...record, wf: { ...record.wf, heldAtStepId: null, heldFromStatus: undefined } };
    let resumeAt = record.wf.heldAtStepId!;
    if (def.resumeFrom === 'previous') {
      const steps = activeSteps(def, record).filter((s) => !s.auto);
      const i = steps.findIndex((s) => s.id === resumeAt);
      if (i > 0) resumeAt = steps[i - 1].id;
      const cleared = { ...rec.wf.stepApprovals };
      delete cleared[resumeAt];
      delete cleared[record.wf.heldAtStepId!];
      rec = { ...rec, wf: { ...rec.wf, stepApprovals: cleared } };
    }
    rec = { ...rec, status: def.resumeFrom === 'previous' ? statusBeforeStep(def, rec, resumeAt) : record.wf.heldFromStatus ?? def.initialStatus, wf: { ...rec.wf, currentStepId: resumeAt } };
    events.push({ key: 'workflow.resumed', params: { step: def.steps.find((s) => s.id === resumeAt)?.name } });
    notes.push({ key: 'approval.needed', params: { stepId: resumeAt } });
    return { record: rec, events, notifications: notes };
  }

  if ((action === 'REJECT' || action === 'HOLD') && def.rejectReasonRequired && !payload.comment?.trim()) {
    throw new WorkflowError('reasonRequired');
  }

  const decision: ApprovalRecord['decision'] = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'HELD';
  const approval: ApprovalRecord = { stepId: step.id, userId: user.id, decision, comment: payload.comment, amountOverride: payload.amountOverride, at };
  let rec: T = { ...record, approvals: [...record.approvals, approval] };

  if (action === 'REJECT') {
    events.push({ key: 'workflow.rejected', params: { step: step.name, reason: payload.comment ?? '' } });
    notes.push({ key: 'approval.rejected', params: { step: step.name } });
    return { record: { ...rec, status: def.rejectedStatus, wf: { ...rec.wf, currentStepId: null } }, events, notifications: notes };
  }

  if (action === 'HOLD') {
    events.push({ key: 'workflow.held', params: { step: step.name, reason: payload.comment ?? '' } });
    return {
      record: { ...rec, status: def.heldStatus, wf: { ...rec.wf, heldAtStepId: rec.wf.currentStepId, heldFromStatus: record.status } },
      events,
      notifications: notes,
    };
  }

  // APPROVE
  if (payload.amountOverride) {
    if (!step.allowEditAmount) throw new WorkflowError('amountNotEditable');
    events.push({ key: 'workflow.amountChanged', params: { from: rec.total, to: payload.amountOverride } });
    rec = { ...rec, total: payload.amountOverride };
  }
  rec = { ...rec, wf: { ...rec.wf, stepApprovals: { ...rec.wf.stepApprovals, [step.id]: [...(rec.wf.stepApprovals[step.id] ?? []), user.id] } } };
  events.push({ key: 'workflow.approved', params: { step: step.name } });
  if (satisfied(step, rec.wf) && def.stepStatus[step.id]) rec = { ...rec, status: def.stepStatus[step.id] };
  const groupDone = groupAt(def, rec, rec.wf.currentStepId).every((s) => satisfied(s, rec.wf));
  if (groupDone) rec = advance(def, rec, rec.wf.currentStepId, at, events, notes);
  return { record: rec, events, notifications: notes };
}

/** Which users in a list can act on a record now (for "waiting for me" queues and notifications). */
export function canAct(record: WorkflowRecord, def: WorkflowDefinition, user: WorkflowUser): boolean {
  return getAllowedActions(record, def, user).some((a) => a.allowed && (a.action === 'APPROVE' || a.action === 'RESUME'));
}

/**
 * After a definition is edited in Settings → Approvals, move an in-flight record whose current
 * (or held) step no longer exists to the first remaining step it has not passed. Records with no
 * steps left are approved. Unchanged records are returned as-is (same reference).
 */
export function rehome<T extends WorkflowRecord>(def: WorkflowDefinition, record: T): T {
  if (record.status === def.approvedStatus || record.status === def.rejectedStatus) return record;
  const steps = activeSteps(def, record);
  const nextOpen = () => steps.find((s) => !s.auto && !satisfied(s, record.wf));
  if (isHeld(def, record)) {
    if (!record.wf.heldAtStepId || steps.some((s) => s.id === record.wf.heldAtStepId)) return record;
    const next = nextOpen();
    if (!next) return { ...record, status: def.approvedStatus, wf: { ...record.wf, heldAtStepId: null, currentStepId: null } };
    return { ...record, wf: { ...record.wf, heldAtStepId: next.id, currentStepId: next.id } };
  }
  const current = record.wf.currentStepId;
  if (current === null || steps.some((s) => s.id === current)) return record;
  const next = nextOpen();
  if (!next) return { ...record, status: def.approvedStatus, wf: { ...record.wf, currentStepId: null } };
  return { ...record, wf: { ...record.wf, currentStepId: next.id } };
}
