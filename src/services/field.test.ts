import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useFormStore } from '@/stores/formStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLandStore } from '@/stores/landStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { act } from './workflowService';
import {
  achievementGrid, agentBlocks, budgetLimits, budgetOf, createBudget, mondayOf, outstandingMinor, payBudget, penaltyRunFor, postPenalties, previewPenalties, publishPlan,
  recomputeWeek, retirementOf, retirementSummary, reviewReceipts, submitRetirement, approveWaiver, requestWaiver,
} from './fieldService';
import { approveLines, approveProblem, confirmPeriod, createCommissionPeriod, createReport, inviteAgent, payPeriod, periodOf, recalculateScores, resolveReport } from './teamService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }) }));

const NOW = new Date('2026-10-18T10:00:00Z');
function load() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const s = buildSeed(NOW);
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useGroupStore.setState({ groups: s.groups, groupMemberships: s.groupMemberships, seeded: true } as never);
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses, seeded: true });
  usePaymentStore.setState({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [], seeded: true });
  useSupportStore.setState({ providers: s.providers, requests: s.supportRequests, windows: s.recoveryWindows, recoveries: s.recoveryRequests, repayments: s.repayments, refunds: s.loanRefunds, legacy: s.legacyAllocations, seeded: true });
  useFormStore.setState({ forms: s.forms, optionLists: s.optionLists, responses: s.responses, seeded: true });
  useLandStore.setState({ plots: s.plots, trees: s.trees, nurseries: s.nurseries, lots: s.seedlingLots, allocations: s.seedlingAllocations, lossZones: s.lossZones, eudrLots: s.eudrLots, statements: s.statements, projects: s.carbonProjects, seeded: true });
  useTrainingStore.setState({ topics: s.trainingTopics, workshops: s.workshops, seeded: true });
  useFieldStore.setState({ plans: s.weeklyPlans, budgets: s.budgets, retirements: s.retirements, carryForwards: s.carryForwards, penaltyRuns: s.penaltyRuns, achievements: [], allowanceRuns: s.allowanceRuns, commissions: s.commissionPeriods, reports: s.agentReports, geofences: [], seeded: true } as never);
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}
afterAll(() => { vi.useRealTimers(); });

const Fs = () => useFieldStore.getState();
const yaw = () => useAgentStore.getState().agents.find((a) => a.userId === 'u_yaw')!;
const week = mondayOf(NOW);

describe('Journey 7: field team week', () => {
  beforeAll(load);
  let budgetId = '';

  it('the seed has a draft plan for Fuseini this week and an under-spend carry-forward for Yaw', () => {
    const plan = Fs().plans.find((p) => p.managerId === 'u_fuseini' && p.weekStart === week)!;
    expect(plan.status).toBe('DRAFT');
    expect(plan.agentIds).toContain(yaw().id);
    expect(outstandingMinor(yaw().id)).toBeGreaterThan(0);
    expect(Fs().retirements.filter((r) => r.agentId === yaw().id).every((r) => r.status === 'RETIRED')).toBe(true);
  });

  it('Fuseini publishes; Yaw submits a budget within limits; over-limit is refused', () => {
    const plan = Fs().plans.find((p) => p.managerId === 'u_fuseini' && p.weekStart === week)!;
    publishPlan(plan.id, 'u_fuseini');
    expect(Fs().plans.find((p) => p.id === plan.id)!.status).toBe('PUBLISHED');
    const home = useCommunityStore.getState().communities.find((c) => c.agentIds.includes(yaw().id))!;
    const trip = (date: string, fuel: number) => ({ date, communityId: home.id, activities: [{ activityId: plan.activities[0]!.activityId, target: 4 }], costs: { cc_fuel: fuel, cc_airtime: 1_000, cc_perdiem: 4_000 } });
    expect(budgetLimits(ORG.vitara, [trip(plan.dates[0]!, 9_000)])[0]!.overDays).toHaveLength(1);
    expect(() => createBudget({ orgId: ORG.vitara, agentId: yaw().id, planId: plan.id, trips: [trip(plan.dates[0]!, 9_000)], actorId: 'u_yaw' })).toThrow('overLimit');
    const b = createBudget({ orgId: ORG.vitara, agentId: yaw().id, planId: plan.id, trips: [trip(plan.dates[0]!, 6_000), trip(plan.dates[1]!, 5_000)], actorId: 'u_yaw', device: 'mobile' });
    budgetId = b.id;
    expect(b.number).toMatch(/^WAB-26-\d{5}$/);
    expect(b.status).toBe('SUBMITTED');
    expect(b.deductions.reduce((s, d) => s + d.amountMinor, 0)).toBe(Math.min(outstandingMinor(yaw().id), b.total.amountMinor));
    expect(b.net.amountMinor).toBeLessThan(b.total.amountMinor);
  });

  it('manager then finance approve; paid net of the carry-forward; a retirement opens', async () => {
    expect(act(ORG.vitara, 'weeklyBudget', budgetId, 'APPROVE', 'u_efua').ok).toBe(false);
    expect(act(ORG.vitara, 'weeklyBudget', budgetId, 'APPROVE', 'u_fuseini')).toEqual({ ok: true, status: 'MANAGER_APPROVED' });
    expect(act(ORG.vitara, 'weeklyBudget', budgetId, 'APPROVE', 'u_efua')).toEqual({ ok: true, status: 'APPROVED' });
    const before = outstandingMinor(yaw().id);
    const payments = await payBudget(budgetId, 'u_efua');
    expect(payments[0]!.amount.amountMinor).toBe(budgetOf(budgetId).net.amountMinor);
    const b = budgetOf(budgetId);
    expect(b.payStatus).toBe('PAID');
    expect(outstandingMinor(yaw().id)).toBe(before - b.deductions.reduce((s, d) => s + d.amountMinor, 0));
    expect(retirementOf(b.retirementId!).status).toBe('PENDING_SUBMISSION');
  });

  it('retirement: one receipt rejected, resubmitted, then retired', () => {
    const b = budgetOf(budgetId);
    const rid = b.retirementId!;
    submitRetirement(rid, b.trips.flatMap((t) => [{ categoryId: 'cc_fuel', amountMinor: t.costs.cc_fuel!, date: t.date, file: `fuel-${t.date}.jpg` }, { categoryId: 'cc_airtime', amountMinor: t.costs.cc_airtime!, date: t.date, file: `air-${t.date}.jpg` }]), undefined, 'u_yaw', 'mobile');
    const r = retirementOf(rid);
    expect(r.status).toBe('PENDING_REVIEW');
    const [bad, ...good] = r.receipts;
    expect(() => reviewReceipts(rid, { [bad!.id]: { approve: false } }, 'u_efua')).toThrow('reasonRequired');
    reviewReceipts(rid, { [bad!.id]: { approve: false, reason: 'Blurred' }, ...Object.fromEntries(good.map((x) => [x.id, { approve: true }])) }, 'u_efua');
    expect(retirementOf(rid).status).toBe('PENDING_RESUBMISSION');
    submitRetirement(rid, [{ categoryId: bad!.categoryId, amountMinor: bad!.amountMinor, date: bad!.date, file: 'fuel-retake.jpg', replaces: bad!.id }], undefined, 'u_yaw', 'mobile');
    const fresh = retirementOf(rid).receipts.find((x) => x.replaces === bad!.id)!;
    reviewReceipts(rid, { [fresh.id]: { approve: true } }, 'u_efua');
    expect(retirementOf(rid).status).toBe('RETIRED');
    expect(retirementSummary(retirementOf(rid)).unaccounted).toBe(0);
  });

  it('achievements recompute and the penalty run creates a carry-forward', () => {
    const plan = Fs().plans.find((p) => p.managerId === 'u_fuseini' && p.weekStart === week)!;
    const grid = recomputeWeek(plan.id, 'u_fuseini');
    expect(grid.length).toBe(plan.agentIds.length);
    expect(Fs().achievements.filter((a) => a.planId === plan.id).length).toBe(plan.agentIds.length * plan.activities.length);
    const preview = previewPenalties(ORG.vitara, week);
    const mine = preview.find((l) => l.agentId === yaw().id)!;
    expect(mine.baseMinor).toBe(budgetOf(budgetId).total.amountMinor);
    const run = postPenalties(ORG.vitara, week, 'u_efua');
    expect(penaltyRunFor(ORG.vitara, week)!.id).toBe(run.id);
    expect(() => postPenalties(ORG.vitara, week, 'u_efua')).toThrow('alreadyRun');
    const withAmount = run.lines.filter((l) => l.amountMinor > 0);
    expect(withAmount.every((l) => Fs().carryForwards.some((c) => c.id === l.carryForwardId && c.type === 'PENALTY'))).toBe(true);
    expect(withAmount.length).toBeGreaterThan(0);
    const cf = Fs().carryForwards.find((c) => c.id === withAmount[0]!.carryForwardId)!;
    requestWaiver(cf.id, 'Appeal', 'u_fuseini');
    expect(() => approveWaiver(cf.id, 'u_fuseini')).toThrow('sameUser');
    approveWaiver(cf.id, 'u_efua');
    expect(Fs().carryForwards.find((c) => c.id === cf.id)!.status).toBe('WAIVED');
    expect(achievementGrid(plan).every((g) => g.pct >= 0 && g.pct <= 100)).toBe(true);
  });
});

describe('Journey 8: commissions and scores', () => {
  beforeAll(load);
  let periodId = '';

  it('creating a period generates lines with eligibility notes', () => {
    const p = createCommissionPeriod({ orgId: ORG.vitara, name: 'October 2026', from: '2026-10-01', to: '2026-10-31', actorId: 'u_efua' });
    periodId = p.id;
    expect(p.number).toMatch(/^COM-2026-\d{2}$/);
    expect(p.lines.length).toBeGreaterThan(10);
    expect(p.lines.every((l) => l.total.amountMinor === l.items.reduce((s, x) => s + x.amount.amountMinor, 0))).toBe(true);
    const ws = p.lines.flatMap((l) => l.items).filter((x) => x.activityId === 'act_workshop');
    expect(ws.some((x) => x.counted <= x.achieved)).toBe(true);
  });

  it('two approvals by two different users, then bulk pay (blocked agents skipped)', async () => {
    const p = periodOf(periodId);
    const ids = p.lines.map((l) => l.id);
    expect(approveProblem(p, p.lines[0]!, 'second', 'u_efua')).toBe('wrongStep');
    const first = approveLines(periodId, ids, 'first', 'u_kwame');
    expect(first.ok.length).toBe(ids.length);
    expect(approveProblem(periodOf(periodId), periodOf(periodId).lines[0]!, 'second', 'u_kwame')).not.toBeNull();
    const second = approveLines(periodId, ids, 'second', 'u_efua');
    expect(second.ok.length).toBe(ids.length);
    confirmPeriod(periodId, 'u_efua');
    const blockedAgent = Fs().reports.find((r) => r.orgId === ORG.vitara && r.status !== 'RESOLVED' && r.categoryId === 'ic_price')!.agentId;
    expect(agentBlocks(ORG.vitara, blockedAgent).payouts).toBeTruthy();
    const { payments, blocked } = await payPeriod(periodId, 'u_efua');
    expect(blocked).toContain(blockedAgent);
    expect(payments.length).toBe(periodOf(periodId).lines.filter((l) => l.total.amountMinor > 0 && !blocked.includes(l.agentId)).length);
    expect(periodOf(periodId).lines.filter((l) => !blocked.includes(l.agentId) && l.total.amountMinor > 0).every((l) => l.paid)).toBe(true);
  });

  it('scores recalculate; reports open / resolve; invite an agent', () => {
    const scores = recalculateScores(ORG.vitara, 'u_kwame');
    expect(scores.size).toBeGreaterThan(10);
    const r = createReport({ orgId: ORG.vitara, agentId: yaw().id, categoryId: 'ic_receipt', reason: 'Receipt dated after the trip', files: [], actorId: 'u_fuseini' });
    expect(agentBlocks(ORG.vitara, yaw().id).budgets).toBeTruthy();
    resolveReport(r.id, 'Explained', [], 'u_kwame');
    expect(agentBlocks(ORG.vitara, yaw().id).budgets).toBeFalsy();
    const a = inviteAgent({ orgId: ORG.vitara, name: 'Adjoa Bawa', phone: '024 777 8899', agentTypeId: 'at_ceo', areaNodeIds: [useAgentStore.getState().agents[0]!.areaNodeIds[0]!], managerIds: ['u_fuseini'], wallet: { providerId: 'mtn', number: '0247778899', verifiedName: 'Adjoa Bawa' }, language: 'en', actorId: 'u_kwame' });
    expect(a.status).toBe('INVITED');
    expect(useNotificationStore.getState().outbox.some((m) => m.channel === 'SMS' && m.body.includes('code'))).toBe(true);
  });
});
