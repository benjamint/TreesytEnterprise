import type {
  AchievementRecord, Agent, BudgetRequest, CarryForward, FieldActivity, Money, OrgSettings, PenaltyRun, Receipt, Retirement, Trip, WeeklyPlan,
} from '@/types';
import { computeMetric, metricRows, type MetricDefinition } from '@/engines/metrics';
import { makeEvent } from '@/engines/activity';
import { canAct, start, type WorkflowRecord } from '@/engines/workflow';
import { uid } from '@/lib/utils';
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
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { sendPush } from './pushGateway';
import { usePlatformStore } from '@/stores/platformStore';
import { pay, registerPayable } from './paymentService';
import { workflowUser } from './workflowService';

/**
 * Field team (PRD J2–J6, M11): activity metrics read from the company's records, weekly plans,
 * achievement measurement, budget requests with limits and approvals, payout net of carry-forwards,
 * retirements with receipts and refunds, carry-forwards with waivers, and the performance penalty run.
 */

const F = () => useFieldStore.getState();
const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const now = () => new Date().toISOString();
const DAY = 86_400_000;
type Device = 'web' | 'mobile';
export const money = (amountMinor: number, currency: string): Money => ({ amountMinor: Math.round(amountMinor), currency });
export const currencyOf = (orgId: string) => usePlatformStore.getState().orgs.find((o) => o.id === orgId)?.currency ?? 'GHS';
const issue = (orgId: string, docType: string, date = new Date()) => useSettingsStore.getState().issueNumber(orgId, docType, { date });
export const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device: Device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
export function notify(orgId: string, userIds: string[], key: string, params: Record<string, unknown>, link: string, kind: 'APPROVAL' | 'PAYMENT' | 'ALERT' = 'ALERT') {
  const at = now();
  for (const userId of new Set(userIds)) useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId, kind, key, params, link, read: false, at });
}
export const agentOf = (id: string) => useAgentStore.getState().agents.find((a) => a.id === id);
export const agentByUser = (orgId: string, userId: string) => useAgentStore.getState().agents.find((a) => a.orgId === orgId && a.userId === userId);
export const userName = (id: string) => useAccessStore.getState().users.find((u) => u.id === id)?.name ?? id;
/** Push to a user's phone (simulated gateway, written to the outbox). */
export function pushToUser(orgId: string, userId: string, subject: string, body: string) {
  const u = useAccessStore.getState().users.find((x) => x.id === userId);
  if (u) sendPush({ orgId, to: u.phone ?? u.id, templateId: 'push', language: u.language ?? 'en', subject, body });
}

// ---------------------------------------------------------------- Weeks

/** Monday of the week that contains the date (YYYY-MM-DD, UTC). */
export function mondayOf(d: Date | string): string {
  const x = new Date(typeof d === 'string' ? `${d.slice(0, 10)}T12:00:00Z` : d.getTime());
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
export const addDays = (iso: string, n: number) => new Date(new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
export const weekEnd = (weekStart: string) => addDays(weekStart, 6);
export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

// ---------------------------------------------------------------- Metrics (PRD 8.5)

type Row = Record<string, unknown>;
const agentIdOfUser = (orgId: string) => {
  const m = new Map(useAgentStore.getState().agents.filter((a) => a.orgId === orgId).map((a) => [a.userId, a.id]));
  return (userId?: string) => (userId ? m.get(userId) : undefined);
};

/** Rows of one source, normalised to { id, agentId, communityId, date, …fields }. */
export function sourceRows(orgId: string, source: FieldActivity['metric']['source']): Row[] {
  const own = <T extends { orgId: string }>(xs: T[]) => xs.filter((x) => x.orgId === orgId);
  const byUser = agentIdOfUser(orgId);
  switch (source) {
    case 'farmers': return own(useFarmerStore.getState().farmers).map((f) => ({ id: f.id, agentId: f.agentId, communityId: f.communityId, date: f.registeredAt, gender: f.gender }));
    case 'communities': return own(useCommunityStore.getState().communities).map((c) => ({ id: c.id, agentId: c.agentIds[0], communityId: c.id, date: c.profiledAt }));
    case 'groups': return own(useGroupStore.getState().groups).map((g) => ({ id: g.id, agentId: byUser(g.createdBy), communityId: g.communityId, date: g.createdAt }));
    case 'purchases': return own(useBuyingStore.getState().purchases).map((p) => ({ id: p.id, agentId: p.agentId, communityId: p.communityId, date: p.createdAt, quantity: p.quantity, commodityId: p.commodityId, farmerId: p.farmerId, number: p.number }));
    case 'responses': {
      const fc = new Map(useFarmerStore.getState().farmers.map((f) => [f.id, f.communityId]));
      return own(useFormStore.getState().responses).map((r) => ({ id: r.id, agentId: r.agentId, communityId: r.subject?.entity === 'community' ? r.subject.id : r.subject ? fc.get(r.subject.id) : undefined, date: r.submittedAt, number: r.number }));
    }
    case 'workshops': return own(useTrainingStore.getState().workshops).filter((w) => w.status === 'HELD' || w.status === 'ARCHIVED').map((w) => ({ id: w.id, agentId: w.agentId, communityId: w.communityId, date: w.heldAt ?? w.date, number: w.number, attendees: w.attendance.filter((a) => a.farmerId).length }));
    case 'attendance': return own(useTrainingStore.getState().workshops).filter((w) => w.status === 'HELD' || w.status === 'ARCHIVED').flatMap((w) => w.attendance.filter((a) => a.farmerId).map((a) => ({ id: `${w.id}:${a.id}`, agentId: w.agentId, communityId: w.communityId, date: w.heldAt ?? w.date, farmerId: a.farmerId })));
    case 'treeVisits': return own(useLandStore.getState().trees).flatMap((t) => t.visits.map((v) => ({ id: `${t.id}:${v.id}`, agentId: byUser(v.by), communityId: t.communityId, date: v.at, code: t.code })));
    case 'plots': return own(useLandStore.getState().plots).map((p) => ({ id: p.id, agentId: p.agentId ?? byUser(p.createdBy), communityId: p.communityId, date: p.createdAt, typeId: p.typeId, code: p.code }));
    case 'seedlings': return own(useLandStore.getState().allocations).filter((a) => a.kind === 'TO_FARMER').map((a) => ({ id: a.id, agentId: a.agentId, communityId: a.communityId, date: a.createdAt, quantity: a.quantity }));
    case 'nurseryRounds': return own(useLandStore.getState().nurseries).flatMap((n) => n.rounds.filter((r) => r.doneAt).map((r) => ({ id: `${n.id}:${r.id}`, agentId: n.agentId ?? byUser(r.by), communityId: n.communityId, date: r.doneAt })));
    case 'repayments': {
      const fc = new Map(useFarmerStore.getState().farmers.map((f) => [f.id, f.communityId]));
      return useSupportStore.getState().repayments.filter((r) => r.orgId === orgId).map((r) => ({ id: r.id, agentId: r.agentId, communityId: fc.get(r.farmerId), date: r.date, amountMajor: ((r.cash?.amountMinor ?? 0) + (r.produceValue?.amountMinor ?? 0)) / 100 }));
    }
    case 'manual': return [];
  }
}

const defOf = (a: FieldActivity): MetricDefinition => ({ key: a.id, label: a.name.en ?? a.id, sourceEntity: a.metric.source, filter: a.metric.filter, aggregate: a.metric.aggregate, field: a.metric.field, unit: a.unit, attribution: a.metric.attribution, dateField: 'date' });
export const activityOf = (orgId: string, id: string) => settingsOf(orgId).fieldTeam.activities.find((a) => a.id === id);
export const activityName = (a: FieldActivity | undefined, lang: 'en' | 'fr') => (a ? a.name[lang] ?? a.name.en ?? a.id : '—');

export interface MeasureScope { agentId?: string; from?: string; to?: string; plannedCommunityIds?: string[]; rows?: Row[] }

/** Value of an activity for an agent over a period (planned communities when the metric says so). */
export function measure(orgId: string, activity: FieldActivity, scope: MeasureScope): number {
  const rows = scope.rows ?? sourceRows(orgId, activity.metric.source);
  return computeMetric(defOf(activity), rows, { agentId: scope.agentId, from: scope.from, to: scope.to ? `${scope.to}T23:59:59.999Z` : undefined, plannedCommunityIds: scope.plannedCommunityIds });
}
/** The records an activity counted ("drill into the records counted"). */
export function countedRows(orgId: string, activity: FieldActivity, scope: MeasureScope): Row[] {
  return metricRows(defOf(activity), scope.rows ?? sourceRows(orgId, activity.metric.source), { agentId: scope.agentId, from: scope.from, to: scope.to ? `${scope.to}T23:59:59.999Z` : undefined, plannedCommunityIds: scope.plannedCommunityIds });
}

// ---------------------------------------------------------------- Weekly plans (J2)

export interface PlanInput {
  orgId: string; weekStart: string; dates: string[]; managerId: string; activities: WeeklyPlan['activities'];
  assignees: WeeklyPlan['assignees']; communities?: WeeklyPlan['communities']; actorId: string;
}

/** Agents a plan is for: a supervisor's team, an agent type, or named agents. */
export function resolveAssignees(orgId: string, a: WeeklyPlan['assignees']): string[] {
  const agents = useAgentStore.getState().agents.filter((x) => x.orgId === orgId && x.status !== 'DEACTIVATED');
  if (a.kind === 'team') return agents.filter((x) => x.managerIds.some((m) => a.ids.includes(m))).map((x) => x.id);
  if (a.kind === 'agentType') return agents.filter((x) => a.ids.includes(x.agentTypeId)).map((x) => x.id);
  return agents.filter((x) => a.ids.includes(x.id)).map((x) => x.id);
}

export function validatePlan(orgId: string, input: Pick<PlanInput, 'weekStart' | 'dates' | 'activities'>, today = new Date()): string | null {
  const s = settingsOf(orgId).fieldTeam.plan;
  const current = mondayOf(today);
  if (input.weekStart < current) return 'pastWeek';
  if (input.weekStart > addDays(current, s.planAheadWeeks * 7)) return 'tooFarAhead';
  if (input.dates.some((d) => d < input.weekStart || d > weekEnd(input.weekStart))) return 'datesOutside';
  if (input.dates.length < s.minDays || input.dates.length > s.maxDays) return 'dayCount';
  if (!input.activities.length) return 'noActivities';
  return null;
}

/** Each agent's planned communities: the communities they cover, unless set. */
const defaultCommunities = (orgId: string, agentIds: string[]) =>
  Object.fromEntries(agentIds.map((id) => [id, useCommunityStore.getState().communities.filter((c) => c.orgId === orgId && c.agentIds.includes(id)).map((c) => c.id)]));

export function createPlan(input: PlanInput): WeeklyPlan {
  const problem = validatePlan(input.orgId, input);
  if (problem) throw new Error(problem);
  const at = now();
  const agentIds = resolveAssignees(input.orgId, input.assignees);
  const p: WeeklyPlan = {
    id: uid('wp'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(input.orgId, 'weeklyPlan', new Date(input.weekStart)),
    weekStart: input.weekStart, dates: [...input.dates].sort(), managerId: input.managerId, activities: input.activities, assignees: input.assignees, agentIds,
    communities: { ...defaultCommunities(input.orgId, agentIds), ...input.communities }, status: 'DRAFT', version: 1, history: [{ version: 1, at, by: input.actorId }],
  };
  F().save('plans', p);
  log(input.orgId, 'weeklyPlan', p.id, 'plan.created', { number: p.number, week: p.weekStart }, input.actorId);
  return p;
}

export const planOf = (id: string) => F().plans.find((p) => p.id === id)!;
export const targetFor = (plan: WeeklyPlan, activityId: string, agentId: string) => {
  const a = plan.activities.find((x) => x.activityId === activityId);
  return a ? a.perAgent?.[agentId] ?? a.target : 0;
};

/** Publish: assignees get a push and the plan on the phone; weekly allowances are created per policy. */
export function publishPlan(id: string, actorId: string) {
  const p = planOf(id);
  if (p.status !== 'DRAFT') throw new Error('notDraft');
  F().patch('plans', id, { status: 'PUBLISHED', publishedAt: now() });
  log(p.orgId, 'weeklyPlan', id, 'plan.published', { number: p.number, count: p.agentIds.length }, actorId);
  for (const agentId of p.agentIds) {
    const a = agentOf(agentId);
    if (!a) continue;
    pushToUser(p.orgId, a.userId, 'Weekly plan published', `Week of ${p.weekStart}`);
    notify(p.orgId, [a.userId], 'planPublished', { number: p.number, week: p.weekStart }, '/m/plan');
  }
  createWeeklyAllowances(planOf(id), actorId);
}

/** Amend after publishing: a new version, the reason kept, assignees told. */
export function amendPlan(id: string, patch: Partial<Pick<WeeklyPlan, 'activities' | 'dates' | 'communities'>>, note: string, actorId: string) {
  const p = planOf(id);
  if (p.status === 'CLOSED') throw new Error('closed');
  const version = p.version + 1;
  F().patch('plans', id, { ...patch, version, history: [...p.history, { version, at: now(), by: actorId, note }] });
  log(p.orgId, 'weeklyPlan', id, 'plan.amended', { version, note }, actorId);
  if (p.status === 'PUBLISHED') notify(p.orgId, p.agentIds.map((x) => agentOf(x)?.userId ?? ''), 'planAmended', { number: p.number, version }, '/m/plan');
}

export function closePlan(id: string, actorId: string) {
  const p = planOf(id);
  recomputeWeek(id, actorId);
  F().patch('plans', id, { status: 'CLOSED', closedAt: now() });
  log(p.orgId, 'weeklyPlan', id, 'plan.closed', { number: p.number }, actorId);
}

/** The agent's published plan for a week (the phone shows the current one). */
export const agentPlan = (agentId: string, weekStart: string) =>
  F().plans.find((p) => p.agentIds.includes(agentId) && p.weekStart === weekStart && p.status !== 'DRAFT');

// ---------------------------------------------------------------- Achievements (J6)

const manualValue = (planId: string, agentId: string, activityId: string) =>
  F().achievements.find((r) => r.planId === planId && r.agentId === agentId && r.activityId === activityId && r.manual)?.achieved;

export function achievedFor(plan: WeeklyPlan, agentId: string, activityId: string, rows?: Row[]): number {
  const a = activityOf(plan.orgId, activityId);
  if (!a) return 0;
  if (a.metric.source === 'manual') return manualValue(plan.id, agentId, activityId) ?? 0;
  return measure(plan.orgId, a, { agentId, from: plan.weekStart, to: weekEnd(plan.weekStart), plannedCommunityIds: plan.communities[agentId], rows });
}

/** Agents × activities: target and achieved for the week. */
export function achievementGrid(plan: WeeklyPlan) {
  const cache = new Map<string, Row[]>();
  const rowsOf = (activityId: string) => {
    const a = activityOf(plan.orgId, activityId);
    if (!a || a.metric.source === 'manual') return undefined;
    if (!cache.has(a.metric.source)) cache.set(a.metric.source, sourceRows(plan.orgId, a.metric.source));
    return cache.get(a.metric.source);
  };
  return plan.agentIds.map((agentId) => {
    const cells = plan.activities.map((x) => {
      const target = targetFor(plan, x.activityId, agentId);
      const achieved = achievedFor(plan, agentId, x.activityId, rowsOf(x.activityId));
      return { activityId: x.activityId, target, achieved, pct: target ? Math.round((achieved / target) * 100) : 0 };
    });
    const pct = cells.length ? Math.round(cells.reduce((s, c) => s + Math.min(100, c.pct), 0) / cells.length) : 0;
    return { agentId, cells, pct };
  });
}

export const achievementPct = (plan: WeeklyPlan, agentId: string) => achievementGrid({ ...plan, agentIds: [agentId] })[0]?.pct ?? 0;

/** Supervisor enters a manual activity (meetings, radio programmes…). */
export function setManualAchievement(planId: string, agentId: string, activityId: string, value: number, actorId: string) {
  const p = planOf(planId);
  const existing = F().achievements.find((r) => r.planId === planId && r.agentId === agentId && r.activityId === activityId);
  const rec: AchievementRecord = { id: existing?.id ?? uid('ach'), orgId: p.orgId, planId, agentId, activityId, target: targetFor(p, activityId, agentId), achieved: value, computedAt: now(), manual: { by: actorId, at: now() } };
  F().save('achievements', rec);
}

/** "Recompute week": snapshot of each cell, and each agent's week target % on their record. */
export function recomputeWeek(planId: string, actorId: string) {
  const p = planOf(planId);
  const at = now();
  const grid = achievementGrid(p);
  const records: AchievementRecord[] = grid.flatMap((g) => g.cells.map((c) => {
    const existing = F().achievements.find((r) => r.planId === planId && r.agentId === g.agentId && r.activityId === c.activityId);
    return { id: existing?.id ?? uid('ach'), orgId: p.orgId, planId, agentId: g.agentId, activityId: c.activityId, target: c.target, achieved: c.achieved, computedAt: at, manual: existing?.manual };
  }));
  F().saveMany('achievements', records);
  const pct = new Map(grid.map((g) => [g.agentId, g.pct]));
  useAgentStore.setState({ agents: useAgentStore.getState().agents.map((a) => (pct.has(a.id) ? { ...a, weekTargetPct: pct.get(a.id)! } : a)) });
  log(p.orgId, 'weeklyPlan', planId, 'plan.recomputed', { count: grid.length }, actorId);
  return grid;
}

// ---------------------------------------------------------------- Agent reports: consequences (J10)

export function openReports(orgId: string, agentId: string) {
  const cats = settingsOf(orgId).fieldTeam.issueCategories;
  return F().reports.filter((r) => r.agentId === agentId && r.status !== 'RESOLVED').map((r) => ({ report: r, category: cats.find((c) => c.id === r.categoryId) }));
}
/** What open reports block: payouts, budget requests, or an extra approval step. */
export function agentBlocks(orgId: string, agentId: string) {
  const open = openReports(orgId, agentId);
  const find = (c: string) => open.find((x) => x.category?.consequence === c);
  return { payouts: find('BLOCK_PAYOUTS'), budgets: find('BLOCK_BUDGETS'), extra: find('EXTRA_APPROVAL'), flagged: open.length > 0, worst: open.map((x) => x.category?.severity).sort((a, b) => SEV.indexOf(b ?? 'LOW') - SEV.indexOf(a ?? 'LOW'))[0] };
}
const SEV = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// ---------------------------------------------------------------- Carry-forwards (J5)

export const outstanding = (agentId: string) => F().carryForwards.filter((c) => c.agentId === agentId && (c.status === 'PENDING' || c.status === 'PARTIAL') && c.remainingMinor > 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const outstandingMinor = (agentId: string) => outstanding(agentId).reduce((s, c) => s + c.remainingMinor, 0);

export function createCarryForward(input: Pick<CarryForward, 'orgId' | 'agentId' | 'type' | 'reason' | 'sourceBudgetId' | 'penalty'> & { amountMinor: number; actorId: string }): CarryForward {
  const at = now();
  const cf: CarryForward = {
    id: uid('cf'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, agentId: input.agentId, type: input.type, reason: input.reason, sourceBudgetId: input.sourceBudgetId, penalty: input.penalty,
    amount: money(input.amountMinor, currencyOf(input.orgId)), remainingMinor: Math.round(input.amountMinor), applications: [], status: 'PENDING',
  };
  F().save('carryForwards', cf);
  log(input.orgId, 'carryForward', cf.id, `carryForward.${input.type === 'PENALTY' ? 'penalty' : input.type === 'MANUAL' ? 'manual' : 'underSpend'}`, { amount: cf.amount, reason: input.reason }, input.actorId);
  const a = agentOf(input.agentId);
  if (a) notify(input.orgId, [a.userId], 'carryForwardCreated', { amount: cf.amount }, '/m/me/cash');
  return cf;
}

/** Waiver (or appeal): requested by one person, approved by another with `carryForwards.waive`. */
export function requestWaiver(id: string, reason: string, actorId: string) {
  F().patch('carryForwards', id, { waiver: { requestedBy: actorId, requestedAt: now(), reason } });
  const cf = F().carryForwards.find((x) => x.id === id)!;
  log(cf.orgId, 'carryForward', id, 'carryForward.waiverRequested', { reason }, actorId);
}
export function approveWaiver(id: string, actorId: string) {
  const cf = F().carryForwards.find((x) => x.id === id)!;
  if (!cf.waiver) throw new Error('noWaiver');
  if (cf.waiver.requestedBy === actorId) throw new Error('sameUser');
  F().patch('carryForwards', id, { status: 'WAIVED', remainingMinor: 0, waiver: { ...cf.waiver, approvedBy: actorId, approvedAt: now() } });
  log(cf.orgId, 'carryForward', id, 'carryForward.waived', { amount: money(cf.remainingMinor, cf.amount.currency) }, actorId);
}

/** Deduct outstanding carry-forwards from a payout, oldest first. */
export function deductionsFor(agentId: string, totalMinor: number, orgId: string) {
  if (!settingsOf(orgId).fieldTeam.carryForward) return [];
  let left = totalMinor;
  const out: BudgetRequest['deductions'] = [];
  for (const c of outstanding(agentId)) {
    if (left <= 0) break;
    const amt = Math.min(left, c.remainingMinor);
    out.push({ carryForwardId: c.id, amountMinor: amt });
    left -= amt;
  }
  return out;
}

function applyDeductions(b: BudgetRequest) {
  for (const d of b.deductions) {
    const c = F().carryForwards.find((x) => x.id === d.carryForwardId);
    if (!c || c.applications.some((x) => x.budgetId === b.id)) continue;
    const remaining = Math.max(0, c.remainingMinor - d.amountMinor);
    F().patch('carryForwards', c.id, { remainingMinor: remaining, status: remaining === 0 ? 'APPLIED' : 'PARTIAL', applications: [...c.applications, { budgetId: b.id, amountMinor: d.amountMinor, at: now() }] });
  }
}

// ---------------------------------------------------------------- Budget requests (J3, M11)

export interface BudgetInput { orgId: string; agentId: string; planId: string; trips: Omit<Trip, 'id'>[]; actorId: string; device?: Device }

/** Live limit check per category: per day (all trips that day) and per week. */
export function budgetLimits(orgId: string, trips: Pick<Trip, 'date' | 'costs'>[]) {
  const cats = settingsOf(orgId).fieldTeam.costCategories;
  return cats.map((c) => {
    const byDay = new Map<string, number>();
    for (const t of trips) byDay.set(t.date, (byDay.get(t.date) ?? 0) + (t.costs[c.id] ?? 0));
    const week = [...byDay.values()].reduce((s, x) => s + x, 0);
    const overDays = [...byDay.entries()].filter(([, v]) => v > c.maxPerDayMinor).map(([d]) => d);
    return { categoryId: c.id, name: c.name, week, maxWeek: c.maxPerWeekMinor, maxDay: c.maxPerDayMinor, overDays, overWeek: week > c.maxPerWeekMinor };
  });
}

/** The agent's last retirement that is still open (blocks a new budget when the company says so). */
export const openRetirement = (agentId: string) => F().retirements.find((r) => r.agentId === agentId && r.status !== 'RETIRED');

export function budgetProblem(input: Omit<BudgetInput, 'actorId'>): string | null {
  const plan = F().plans.find((p) => p.id === input.planId);
  if (!plan || plan.status === 'DRAFT') return 'noPlan';
  if (!plan.agentIds.includes(input.agentId)) return 'notAssigned';
  if (F().budgets.some((b) => b.agentId === input.agentId && b.planId === input.planId && b.status !== 'REJECTED')) return 'duplicate';
  const s = settingsOf(input.orgId).fieldTeam;
  if (s.retirementBlocksBudget && openRetirement(input.agentId)) return 'retirementOpen';
  if (agentBlocks(input.orgId, input.agentId).budgets) return 'reportBlocks';
  if (!input.trips.length) return 'noTrips';
  if (input.trips.some((t) => !plan.dates.includes(t.date))) return 'tripOutsidePlan';
  if (budgetLimits(input.orgId, input.trips).some((l) => l.overWeek || l.overDays.length)) return 'overLimit';
  return null;
}

const wabDef = (orgId: string) => settingsOf(orgId).workflows.find((w) => w.docType === 'weeklyBudget')!;
const totalOf = (trips: Pick<Trip, 'costs'>[]) => trips.reduce((s, t) => s + Object.values(t.costs).reduce((a, b) => a + b, 0), 0);

export function createBudget(input: BudgetInput): BudgetRequest {
  const problem = budgetProblem(input);
  if (problem) throw new Error(problem);
  const { orgId } = input;
  const plan = planOf(input.planId);
  const agent = agentOf(input.agentId)!;
  const currency = currencyOf(orgId);
  const total = totalOf(input.trips);
  const deductions = deductionsFor(input.agentId, total, orgId);
  const at = now();
  const base = {
    id: uid('wab'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(orgId, 'weeklyBudget'), agentId: input.agentId, planId: plan.id, weekStart: plan.weekStart,
    trips: input.trips.map((t) => ({ ...t, id: uid('trip') })), total: money(total, currency), deductions, net: money(total - deductions.reduce((s, d) => s + d.amountMinor, 0), currency),
    wallet: { providerId: agent.wallet.providerId, number: agent.wallet.number, name: agent.wallet.verifiedName }, extraApproval: agentBlocks(orgId, input.agentId).extra ? 1 : 0, payStatus: 'UNPAID' as const, device: input.device,
  };
  const b = start(wabDef(orgId), base as never, at).record as unknown as BudgetRequest;
  F().save('budgets', b);
  log(orgId, 'weeklyBudget', b.id, 'budget.submitted', { number: b.number, total: b.total }, input.actorId, input.device);
  const def = wabDef(orgId);
  const approvers = useAccessStore.getState().memberships.filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && m.userId !== input.actorId && canAct(b as unknown as WorkflowRecord, def, workflowUser(m.userId, orgId))).map((m) => m.userId);
  notify(orgId, approvers, 'approvalNeeded', { docType: 'weeklyBudget', number: b.number }, `/app/budgets?open=${b.id}`, 'APPROVAL');
  return b;
}

export const budgetOf = (id: string) => F().budgets.find((b) => b.id === id)!;
/** What the agent is paid: the approved amount (finance may override) less deductions. */
export const grossOf = (b: BudgetRequest) => b.approvedTotal ?? b.total;

/** Finance overrides the amount before approving (with a reason); deductions are recalculated. */
export function overrideBudget(id: string, amountMinor: number, reason: string, actorId: string) {
  const b = budgetOf(id);
  if (!reason.trim()) throw new Error('reasonRequired');
  const deductions = deductionsFor(b.agentId, amountMinor, b.orgId);
  F().patch('budgets', id, { approvedTotal: money(amountMinor, b.total.currency), overrideReason: reason, deductions, net: money(amountMinor - deductions.reduce((s, d) => s + d.amountMinor, 0), b.total.currency) });
  log(b.orgId, 'weeklyBudget', id, 'budget.overridden', { amount: money(amountMinor, b.total.currency), reason }, actorId);
}

/** Refresh the deduction preview (carry-forwards may have changed since submission). */
export function refreshDeductions(id: string) {
  const b = budgetOf(id);
  if (b.payStatus !== 'UNPAID') return;
  const gross = grossOf(b).amountMinor;
  const deductions = deductionsFor(b.agentId, gross, b.orgId);
  F().patch('budgets', id, { deductions, net: money(gross - deductions.reduce((s, d) => s + d.amountMinor, 0), b.total.currency) });
}

export function payProblem(b: BudgetRequest): string | null {
  if (b.status !== 'APPROVED') return 'notApproved';
  if (b.payStatus === 'PAID' || b.payStatus === 'ABSORBED' || b.payStatus === 'PROCESSING') return 'alreadyPaid';
  if (agentBlocks(b.orgId, b.agentId).payouts) return 'reportBlocksPayout';
  return null;
}

/** Pay the net amount by mobile money; when deductions cover everything, absorb it instead. */
export async function payBudget(id: string, actorId: string, onProgress?: Parameters<typeof pay>[1]) {
  refreshDeductions(id);
  const b = budgetOf(id);
  const problem = payProblem(b);
  if (problem) throw new Error(problem);
  if (b.net.amountMinor <= 0) {
    settleBudget(b, 'ABSORBED', actorId);
    return [];
  }
  F().patch('budgets', id, { payStatus: 'PROCESSING' });
  return pay({ orgId: b.orgId, type: 'WEEKLY_BUDGET', payableId: b.id, payees: [{ name: b.wallet.name, number: b.wallet.number, providerId: b.wallet.providerId, amount: b.net }], actorId, meta: { number: b.number } }, onProgress);
}

function settleBudget(b: BudgetRequest, status: 'PAID' | 'ABSORBED', actorId: string, paymentId?: string) {
  applyDeductions(b);
  const ret = openRetirementFor(b, actorId);
  F().patch('budgets', b.id, { payStatus: status, paidAt: now(), paymentId, retirementId: ret.id });
  log(b.orgId, 'weeklyBudget', b.id, status === 'PAID' ? 'budget.paid' : 'budget.absorbed', { amount: b.net, deducted: money(b.deductions.reduce((s, d) => s + d.amountMinor, 0), b.total.currency) }, actorId);
  const a = agentOf(b.agentId);
  if (a) {
    notify(b.orgId, [a.userId], status === 'PAID' ? 'budgetPaid' : 'budgetAbsorbed', { number: b.number, amount: b.net }, `/m/budget/${b.id}`, 'PAYMENT');
    pushToUser(b.orgId, a.userId, 'Budget paid', b.number);
  }
}

registerPayable('WEEKLY_BUDGET', {
  onStatus: (p) => {
    const b = F().budgets.find((x) => x.id === p.payableId);
    if (!b) return;
    if (p.status === 'SUCCESSFUL' && b.payStatus !== 'PAID') settleBudget(b, 'PAID', p.initiatedBy, p.id);
    if (p.status === 'FAILED' || p.status === 'REVERSED') F().patch('budgets', b.id, { payStatus: 'UNPAID' });
  },
});

/** Display status: workflow status, then Paid / Retirement opened / Closed. */
export function budgetStage(b: BudgetRequest): string {
  if (b.payStatus === 'PAID' || b.payStatus === 'ABSORBED') {
    const r = F().retirements.find((x) => x.id === b.retirementId);
    return r?.status === 'RETIRED' ? 'CLOSED' : 'RETIREMENT_OPEN';
  }
  if (b.payStatus === 'PROCESSING') return 'PAYING';
  return b.status;
}

// ---------------------------------------------------------------- Retirements (J4, M11)

function openRetirementFor(b: BudgetRequest, actorId: string): Retirement {
  const existing = F().retirements.find((r) => r.budgetId === b.id);
  if (existing) return existing;
  const at = now();
  const r: Retirement = { id: uid('ret'), orgId: b.orgId, createdAt: at, updatedAt: at, createdBy: actorId, budgetId: b.id, agentId: b.agentId, gross: grossOf(b), receipts: [], refunds: [], status: 'PENDING_SUBMISSION' };
  F().save('retirements', r);
  return r;
}
export const retirementOf = (id: string) => F().retirements.find((r) => r.id === id)!;

/** Spend per category in the budget; categories without receipts are accounted for automatically. */
export function retirementSummary(r: Retirement) {
  const b = budgetOf(r.budgetId);
  const cats = settingsOf(r.orgId).fieldTeam.costCategories;
  const live = r.receipts.filter((x) => !r.receipts.some((y) => y.replaces === x.id));
  const byCat = cats.map((c) => {
    const budgeted = b.trips.reduce((s, t) => s + (t.costs[c.id] ?? 0), 0);
    const rs = live.filter((x) => x.categoryId === c.id);
    const submitted = rs.reduce((s, x) => s + x.amountMinor, 0);
    const approved = c.receiptRequired ? rs.filter((x) => x.status === 'APPROVED').reduce((s, x) => s + x.amountMinor, 0) : budgeted;
    return { categoryId: c.id, name: c.name, receiptRequired: c.receiptRequired, budgeted, submitted, approved };
  }).filter((x) => x.budgeted > 0 || x.submitted > 0);
  const approved = Math.min(r.gross.amountMinor, byCat.reduce((s, x) => s + x.approved, 0));
  const unused = r.unused?.amountMinor ?? 0;
  const refunded = r.refunds.reduce((s, x) => s + x.amountMinor, 0);
  const unaccounted = Math.max(0, r.gross.amountMinor - approved - unused);
  return { byCat, approved, unused, refunded, unaccounted, live };
}

export interface ReceiptInput { categoryId: string; amountMinor: number; date: string; file: string; replaces?: string }

/** The agent submits receipts (and optionally unused funds); rejected ones are resubmitted the same way. */
export function submitRetirement(id: string, receipts: ReceiptInput[], unused: { amountMinor: number; reason: string } | undefined, actorId: string, device: Device = 'web') {
  const r = retirementOf(id);
  if (r.status === 'RETIRED' || r.status === 'AWAITING_REFUND') throw new Error('closed');
  const at = now();
  const all = F().retirements.filter((x) => x.agentId === r.agentId).flatMap((x) => x.receipts);
  const added: Receipt[] = receipts.map((x) => {
    const dup = all.find((y) => y.id !== x.replaces && ((y.amountMinor === x.amountMinor && y.date === x.date && y.categoryId === x.categoryId) || y.file === x.file));
    return { id: uid('rcp'), categoryId: x.categoryId, amountMinor: Math.round(x.amountMinor), date: x.date, file: x.file, status: 'PENDING', replaces: x.replaces, duplicateOf: dup?.id, at };
  });
  F().patch('retirements', id, { receipts: [...r.receipts, ...added], unused: unused && unused.amountMinor > 0 ? { ...unused, at } : r.unused, status: 'PENDING_REVIEW' });
  log(r.orgId, 'retirement', id, added.some((x) => x.replaces) ? 'retirement.resubmitted' : 'retirement.submitted', { count: added.length }, actorId, device);
  const reviewers = useAccessStore.getState().memberships.filter((m) => m.orgId === r.orgId && m.status === 'ACTIVE' && workflowUser(m.userId, r.orgId).permissions.some((p) => p === 'retirements.*' || p === 'retirements.review' || p === '*')).map((m) => m.userId);
  notify(r.orgId, reviewers.filter((u) => u !== actorId), 'retirementToReview', { number: budgetOf(r.budgetId).number }, `/app/retirements?open=${id}`, 'APPROVAL');
  if (r.status === 'PENDING_SUBMISSION' && !added.length && !unused) finalize(id, actorId);
}

/** Approve / reject each pending receipt in one batch; then the retirement settles or goes back to the agent. */
export function reviewReceipts(id: string, decisions: Record<string, { approve: boolean; reason?: string }>, actorId: string) {
  const r = retirementOf(id);
  if (Object.values(decisions).some((d) => !d.approve && !d.reason?.trim())) throw new Error('reasonRequired');
  const receipts = r.receipts.map((x) => (decisions[x.id] && x.status === 'PENDING' ? { ...x, status: (decisions[x.id]!.approve ? 'APPROVED' : 'REJECTED') as Receipt['status'], reason: decisions[x.id]!.reason } : x));
  F().patch('retirements', id, { receipts });
  const rejected = receipts.filter((x) => x.status === 'REJECTED' && !receipts.some((y) => y.replaces === x.id));
  log(r.orgId, 'retirement', id, 'retirement.reviewed', { approved: Object.values(decisions).filter((d) => d.approve).length, rejected: Object.values(decisions).filter((d) => !d.approve).length }, actorId);
  if (rejected.length) {
    F().patch('retirements', id, { status: 'PENDING_RESUBMISSION' });
    const a = agentOf(r.agentId);
    if (a) notify(r.orgId, [a.userId], 'receiptsRejected', { count: rejected.length }, `/m/retirement/${id}`);
    return;
  }
  if (receipts.some((x) => x.status === 'PENDING')) return;
  finalize(id, actorId);
}

/** All receipts settled: unaccounted money becomes an under-spend carry-forward; unused funds await a refund. */
function finalize(id: string, actorId: string) {
  const r = retirementOf(id);
  const s = retirementSummary(r);
  let carryForwardId: string | undefined;
  if (s.unaccounted > 0 && settingsOf(r.orgId).fieldTeam.carryForward)
    carryForwardId = createCarryForward({ orgId: r.orgId, agentId: r.agentId, type: 'UNDER_SPEND', reason: `Retirement of ${budgetOf(r.budgetId).number}`, sourceBudgetId: r.budgetId, amountMinor: s.unaccounted, actorId }).id;
  const done = s.unused <= s.refunded;
  F().patch('retirements', id, { status: done ? 'RETIRED' : 'AWAITING_REFUND', carryForwardId, retiredAt: done ? now() : undefined });
  if (done) log(r.orgId, 'retirement', id, 'retirement.retired', {}, actorId);
}

/** Finance confirms one or more refunds of unused funds (with proof); retired once covered. */
export function confirmRefund(id: string, amountMinor: number, proof: string | undefined, actorId: string) {
  const r = retirementOf(id);
  if (r.status !== 'AWAITING_REFUND') throw new Error('notAwaiting');
  const refunds = [...r.refunds, { id: uid('rf'), amountMinor: Math.round(amountMinor), proof, at: now(), by: actorId }];
  const total = refunds.reduce((s, x) => s + x.amountMinor, 0);
  const done = total >= (r.unused?.amountMinor ?? 0);
  F().patch('retirements', id, { refunds, status: done ? 'RETIRED' : 'AWAITING_REFUND', retiredAt: done ? now() : undefined });
  log(r.orgId, 'retirement', id, done ? 'retirement.retired' : 'retirement.refund', { amount: money(amountMinor, r.gross.currency) }, actorId);
}

// ---------------------------------------------------------------- Performance penalties (J5)

/** Preview: each agent's achievement for the week, the band reached and the penalty on that week's budget. */
export function previewPenalties(orgId: string, weekStart: string): PenaltyRun['lines'] {
  const bands = [...settingsOf(orgId).fieldTeam.penaltyBands].sort((a, b) => a.fromPct - b.fromPct);
  const plans = F().plans.filter((p) => p.orgId === orgId && p.weekStart === weekStart && p.status !== 'DRAFT');
  return plans.flatMap((plan) => achievementGrid(plan).map((g) => {
    const band = bands.find((b) => g.pct >= b.fromPct && g.pct < b.toPct) ?? bands.at(-1);
    const budget = F().budgets.find((b) => b.agentId === g.agentId && b.weekStart === weekStart && (b.payStatus === 'PAID' || b.payStatus === 'ABSORBED'));
    const baseMinor = budget ? grossOf(budget).amountMinor : 0;
    const penaltyPct = band?.penaltyPct ?? 0;
    return { agentId: g.agentId, achievementPct: g.pct, bandId: band?.id, penaltyPct, baseMinor, amountMinor: Math.round((baseMinor * penaltyPct) / 100) };
  }));
}

export const penaltyRunFor = (orgId: string, weekStart: string) => F().penaltyRuns.find((r) => r.orgId === orgId && r.weekStart === weekStart);

/** Post the run: a penalty carry-forward for each agent with an amount. One run per week. */
export function postPenalties(orgId: string, weekStart: string, actorId: string): PenaltyRun {
  if (penaltyRunFor(orgId, weekStart)) throw new Error('alreadyRun');
  const carry = settingsOf(orgId).fieldTeam.carryForward;
  const lines = previewPenalties(orgId, weekStart).map((l) => (l.amountMinor > 0 && carry
    ? { ...l, carryForwardId: createCarryForward({ orgId, agentId: l.agentId, type: 'PENALTY', reason: `Week of ${weekStart}: ${l.achievementPct}% of plan`, amountMinor: l.amountMinor, actorId, penalty: { weekStart, achievementPct: l.achievementPct, bandId: l.bandId ?? '', penaltyPct: l.penaltyPct, baseMinor: l.baseMinor } }).id }
    : l));
  const run: PenaltyRun = { id: uid('pen'), orgId, weekStart, at: now(), by: actorId, lines };
  F().save('penaltyRuns', run);
  return run;
}

// ---------------------------------------------------------------- Weekly allowances created on publish (J2 → J7)

function createWeeklyAllowances(plan: WeeklyPlan, actorId: string) {
  const types = settingsOf(plan.orgId).fieldTeam.allowanceTypes.filter((t) => t.frequency === 'WEEKLY');
  for (const t of types) {
    if (F().allowanceRuns.some((r) => r.typeId === t.id && r.period.from === plan.weekStart && r.orgId === plan.orgId)) continue;
    const at = now();
    F().save('allowanceRuns', {
      id: uid('alr'), orgId: plan.orgId, createdAt: at, updatedAt: at, createdBy: actorId, number: issue(plan.orgId, 'monthlyAllowance'), typeId: t.id, period: { from: plan.weekStart, to: weekEnd(plan.weekStart) },
      lines: plan.agentIds.map((agentId) => ({ agentId, achievementPct: 0, amountMinor: t.amountMinor, status: 'ELIGIBLE' as const })), status: t.approval ? 'PREVIEW' : 'APPROVED', currency: currencyOf(plan.orgId),
    });
  }
}

export type { Agent };
