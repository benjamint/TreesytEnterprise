import { describe, expect, it } from 'vitest';
import type { WorkflowDefinition } from '@/types';
import { apply, canAct, getAllowedActions, pendingSteps, rehome, start, WorkflowError, type WorkflowUser } from '.';

const base = {
  holdAllowed: true,
  rejectReasonRequired: true,
  separation: { requesterCannotApprove: true, sameUserNotTwoSteps: true },
};

const prDef: WorkflowDefinition = {
  ...base,
  id: 'wf_pr',
  docType: 'purchaseRequest',
  statuses: ['PENDING', 'MANAGEMENT_APPROVED', 'FINANCE_APPROVED', 'NOT_APPROVED', 'ON_HOLD'],
  steps: [
    { id: 'mgmt', name: 'Management', roleIds: [], permission: 'purchaseRequests.approveManagement' },
    { id: 'fin', name: 'Finance', roleIds: [], permission: 'purchaseRequests.approveFinance', allowEditAmount: true },
  ],
  stepStatus: { mgmt: 'MANAGEMENT_APPROVED', fin: 'FINANCE_APPROVED' },
  initialStatus: 'PENDING',
  approvedStatus: 'FINANCE_APPROVED',
  rejectedStatus: 'NOT_APPROVED',
  heldStatus: 'ON_HOLD',
  resumeFrom: 'same',
};

const preDef: WorkflowDefinition = {
  ...base,
  id: 'wf_pre',
  docType: 'preExpense',
  statuses: [],
  steps: [
    { id: 'l1', name: 'Level 1', roleIds: [], permission: 'expenses.approveLevel1', auto: true },
    { id: 'l2', name: 'Level 2', roleIds: [], permission: 'expenses.approveLevel2' },
    { id: 'l3', name: 'Level 3', roleIds: [], permission: 'expenses.approveLevel3' },
    { id: 'l4', name: 'Level 4', roleIds: [], permission: 'expenses.approveLevel4' },
  ],
  stepStatus: { l1: 'LEVEL_1_APPROVED', l2: 'LEVEL_2_APPROVED', l3: 'LEVEL_3_APPROVED', l4: 'APPROVED' },
  initialStatus: 'PENDING',
  approvedStatus: 'APPROVED',
  rejectedStatus: 'REJECTED',
  heldStatus: 'ON_HOLD',
  resumeFrom: 'previous',
};

const kakaoDef: WorkflowDefinition = {
  ...prDef,
  id: 'wf_ki',
  steps: [
    { id: 'zone', name: 'Superviseur de zone', roleIds: [], permission: 'purchaseRequests.approveManagement' },
    { id: 'dirops', name: 'Directeur des opérations', roleIds: [], permission: 'purchaseRequests.approveManagement', condition: { field: 'total', op: '>', value: 2_000_000 } },
    { id: 'fin', name: 'Finance', roleIds: [], permission: 'purchaseRequests.approveFinance' },
  ],
  stepStatus: { zone: 'ZONE_APPROVED', dirops: 'OPS_APPROVED', fin: 'FINANCE_APPROVED' },
};

const u = (id: string, ...permissions: string[]): WorkflowUser => ({ id, roleIds: [], permissions });
const kwame = u('kwame', 'purchaseRequests.approveManagement', 'expenses.approveLevel3');
const efua = u('efua', 'purchaseRequests.approveFinance', 'expenses.approveLevel4');
const ibrahim = u('ibrahim', 'expenses.approveLevel2');
const admin = u('admin', '*');

const newRecord = (total: number, createdBy = 'yaw') =>
  start(prDef, { id: 'r1', createdBy, total: { amountMinor: total, currency: 'GHS' } }).record;

describe('workflow engine', () => {
  it('starts at the first step and walks management → finance', () => {
    let r = newRecord(100_000);
    expect(r.status).toBe('PENDING');
    expect(r.wf.currentStepId).toBe('mgmt');
    expect(canAct(r, prDef, efua)).toBe(false);
    expect(canAct(r, prDef, kwame)).toBe(true);

    r = apply(r, prDef, 'APPROVE', kwame).record;
    expect(r.status).toBe('MANAGEMENT_APPROVED');
    expect(r.wf.currentStepId).toBe('fin');

    const res = apply(r, prDef, 'APPROVE', efua);
    expect(res.record.status).toBe('FINANCE_APPROVED');
    expect(res.record.wf.currentStepId).toBeNull();
    expect(res.events.map((e) => e.key)).toContain('workflow.completed');
    expect(getAllowedActions(res.record, prDef, admin)).toEqual([]);
  });

  it('reports why an action is blocked (for "View as" tooltips)', () => {
    const r = newRecord(100_000);
    const actions = getAllowedActions(r, prDef, efua);
    expect(actions[0]).toMatchObject({ action: 'APPROVE', allowed: false, reason: 'missingPermission', permission: 'purchaseRequests.approveManagement' });
    expect(() => apply(r, prDef, 'APPROVE', efua)).toThrow(WorkflowError);
  });

  it('enforces separation of duties', () => {
    const r = newRecord(100_000, 'admin');
    expect(getAllowedActions(r, prDef, admin)[0].reason).toBe('requesterCannotApprove');

    const r2 = apply(newRecord(100_000), prDef, 'APPROVE', admin).record;
    expect(getAllowedActions(r2, prDef, admin)[0].reason).toBe('alreadyApprovedOtherStep');
  });

  it('requires a reason to reject or hold, then resumes at the same step', () => {
    const r = newRecord(100_000);
    expect(() => apply(r, prDef, 'REJECT', kwame)).toThrow('reasonRequired');
    const rejected = apply(r, prDef, 'REJECT', kwame, { comment: 'Price too high' }).record;
    expect(rejected.status).toBe('NOT_APPROVED');

    const held = apply(r, prDef, 'HOLD', kwame, { comment: 'Check community' }).record;
    expect(held.status).toBe('ON_HOLD');
    expect(getAllowedActions(held, prDef, kwame).map((a) => a.action)).toEqual(['RESUME']);
    const resumed = apply(held, prDef, 'RESUME', kwame).record;
    expect(resumed.status).toBe('PENDING');
    expect(resumed.wf.currentStepId).toBe('mgmt');
  });

  it('lets finance edit the amount only on steps that allow it', () => {
    const r = apply(newRecord(100_000), prDef, 'APPROVE', kwame).record;
    const out = apply(r, prDef, 'APPROVE', efua, { amountOverride: { amountMinor: 90_000, currency: 'GHS' } });
    expect(out.record.total?.amountMinor).toBe(90_000);
    expect(() => apply(newRecord(100_000), prDef, 'APPROVE', kwame, { amountOverride: { amountMinor: 1, currency: 'GHS' } })).toThrow('amountNotEditable');
  });

  it('Vitara PRE: auto step 1 then levels 2–4; hold resumes from the previous step', () => {
    let r = start(preDef, { id: 'e1', createdBy: 'yaw' }).record;
    expect(r.status).toBe('LEVEL_1_APPROVED');
    expect(r.approvals[0]).toMatchObject({ stepId: 'l1', userId: 'system' });
    expect(r.wf.currentStepId).toBe('l2');

    r = apply(r, preDef, 'APPROVE', ibrahim).record;
    expect(r.wf.currentStepId).toBe('l3');
    r = apply(r, preDef, 'HOLD', kwame, { comment: 'Bags not counted' }).record;
    r = apply(r, preDef, 'RESUME', kwame).record;
    expect(r.wf.currentStepId).toBe('l2');
    expect(r.status).toBe('LEVEL_1_APPROVED');

    r = apply(r, preDef, 'APPROVE', ibrahim).record;
    r = apply(r, preDef, 'APPROVE', kwame).record;
    r = apply(r, preDef, 'APPROVE', efua).record;
    expect(r.status).toBe('APPROVED');
  });

  it('Kakao Ivoire: Directeur des opérations only above 2,000,000 XOF', () => {
    const small = start(kakaoDef, { id: 'a', createdBy: 'moussa', total: { amountMinor: 1_500_000, currency: 'XOF' } }).record;
    const afterZone = apply(small, kakaoDef, 'APPROVE', kwame).record;
    expect(afterZone.wf.currentStepId).toBe('fin');

    const big = start(kakaoDef, { id: 'b', createdBy: 'moussa', total: { amountMinor: 2_500_000, currency: 'XOF' } }).record;
    const afterZoneBig = apply(big, kakaoDef, 'APPROVE', kwame).record;
    expect(afterZoneBig.wf.currentStepId).toBe('dirops');
  });

  it('supports parallel steps with minimum approvals', () => {
    const def: WorkflowDefinition = {
      ...prDef,
      separation: { requesterCannotApprove: false, sameUserNotTwoSteps: false },
      steps: [
        { id: 'a', name: 'A', roleIds: [], permission: 'x.a', parallel: true, minApprovals: 2 },
        { id: 'b', name: 'B', roleIds: [], permission: 'x.b', parallel: true },
        { id: 'c', name: 'C', roleIds: [], permission: 'x.c' },
      ],
      stepStatus: {},
    };
    let r = start(def, { id: 'p', createdBy: 'z' }).record;
    expect(pendingSteps(def, r).map((s) => s.id)).toEqual(['a', 'b']);
    r = apply(r, def, 'APPROVE', u('b1', 'x.b')).record;
    expect(pendingSteps(def, r).map((s) => s.id)).toEqual(['a']);
    r = apply(r, def, 'APPROVE', u('a1', 'x.a')).record;
    expect(r.wf.currentStepId).toBe('a');
    r = apply(r, def, 'APPROVE', u('a2', 'x.a')).record;
    expect(r.wf.currentStepId).toBe('c');
  });

  it('rehomes in-flight records when a step is removed in Settings', () => {
    const atMgmt = newRecord(100_000);
    const atFin = apply(newRecord(100_000), prDef, 'APPROVE', kwame).record;
    const noMgmt: WorkflowDefinition = { ...prDef, steps: prDef.steps.filter((s) => s.id !== 'mgmt') };
    expect(rehome(noMgmt, atMgmt).wf.currentStepId).toBe('fin');
    expect(canAct(rehome(noMgmt, atMgmt), noMgmt, efua)).toBe(true);
    expect(rehome(noMgmt, atFin)).toBe(atFin);
    const none: WorkflowDefinition = { ...prDef, steps: [] };
    expect(rehome(none, atMgmt).status).toBe('FINANCE_APPROVED');
    const held = apply(atMgmt, prDef, 'HOLD', kwame, { comment: 'Check price' }).record;
    expect(rehome(noMgmt, held).wf.heldAtStepId).toBe('fin');
  });
});
