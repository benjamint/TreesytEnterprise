import type {
  ActivityEvent, AgentReport, AllowanceRun, BudgetRequest, CarryForward, CommissionLine, CommissionPeriod, OrgSettings, PenaltyRun, Retirement, Trip, WeeklyPlan,
} from '@/types';
import { nextNumber } from '@/engines/numbering';
import type { OpsResult } from './operations';
import { Rng } from './rng';

/**
 * Phase 16 seed (PRD J, Journeys 7–8): six weeks of plans per supervisor team with budgets paid net of
 * carry-forwards and retired with receipts, penalty runs, maintenance allowances, two paid commission
 * periods and agent reports. This week: the journey supervisor's plan is a draft waiting to be published,
 * the other teams' budgets sit at each approval step.
 */

export interface FieldSeed {
  plans: WeeklyPlan[]; budgets: BudgetRequest[]; retirements: Retirement[]; carryForwards: CarryForward[]; penaltyRuns: PenaltyRun[];
  allowanceRuns: AllowanceRun[]; commissions: CommissionPeriod[]; reports: AgentReport[]; activity: ActivityEvent[];
}

interface Opts {
  orgId: string; seed: number; today: Date; lang: 'en' | 'fr'; currency: string;
  supervisors: string[];
  /** Supervisor whose current-week plan stays a draft (Journey 7), and the agent who then submits a budget. */
  journeySupervisor: string; journeyUserId?: string;
  financeUserId: string; opsUserId: string;
  weeks: number;
  /** Activities planned each week (ids from the catalogue). */
  activityIds: string[];
  reports: { userId?: string; index?: number; categoryId: string; reason: string; status: AgentReport['status'] }[];
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();
const day = (t: number) => iso(t).slice(0, 10);
const mondayOf = (t: number) => { const d = new Date(t); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime(); };

export function seedFieldTeam(ops: OpsResult, settings: OrgSettings, o: Opts): FieldSeed {
  const rng = new Rng(o.seed);
  const out: FieldSeed = { plans: [], budgets: [], retirements: [], carryForwards: [], penaltyRuns: [], allowanceRuns: [], commissions: [], reports: [], activity: [] };
  const ft = settings.fieldTeam;
  const m = (amountMinor: number) => ({ amountMinor: Math.round(amountMinor), currency: o.currency });
  const issue = (docType: string, at: number) => {
    const p = settings.numbering.find((x) => x.docType === docType)!;
    const r = nextNumber(p, ops.sequences, { date: new Date(at) });
    ops.sequences = r.sequences;
    return r.number;
  };
  const act = (entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, at: number, device?: string) =>
    out.activity.push({ id: `${id}_act_${out.activity.length}`, orgId: o.orgId, entity, entityId: id, key, params, actorId, at: iso(at), ...(device ? { meta: { device } } : {}) } as ActivityEvent);
  const eligibleTypes = new Set(settings.agentTypes.filter((t) => t.budgetEligible).map((t) => t.id));
  // Plans cover field agents (not warehouse officers); only budget-eligible types submit budgets.
  const fieldTypes = new Set(settings.agentTypes.filter((t) => !t.mobileTiles.every((x) => x === 'warehouse')).map((t) => t.id));
  const teamOf = (sup: string) => ops.agents.filter((a) => a.status === 'ACTIVE' && a.managerIds.includes(sup) && fieldTypes.has(a.agentTypeId));
  const commsOf = (agentId: string) => ops.communities.filter((c) => c.agentIds.includes(agentId)).map((c) => c.id);
  const journeyAgent = o.journeyUserId ? ops.agents.find((a) => a.userId === o.journeyUserId) : undefined;
  const thisWeek = mondayOf(o.today.getTime());
  const cfs = new Map<string, CarryForward[]>();
  const addCf = (cf: CarryForward) => { out.carryForwards.push(cf); cfs.set(cf.agentId, [...(cfs.get(cf.agentId) ?? []), cf]); };
  const cfOpen = (agentId: string) => (cfs.get(agentId) ?? []).filter((c) => c.remainingMinor > 0 && c.status !== 'WAIVED');

  const tripsFor = (agentId: string, dates: string[], activityIds: string[]): Trip[] => {
    const comms = commsOf(agentId);
    return rng.sample(dates, Math.min(dates.length, rng.int(2, 4))).sort().map((date, k) => ({
      id: `${agentId}_${date}_t${k}`, date, communityId: rng.pick(comms.length ? comms : ops.communities.map((c) => c.id)),
      activities: rng.sample(activityIds, 2).map((activityId) => ({ activityId, target: rng.int(2, 8) })),
      costs: Object.fromEntries(ft.costCategories.filter((c) => c.id !== 'cc_lodging' || rng.chance(0.2)).map((c) => [c.id, Math.round(c.maxPerDayMinor * rng.float(0.4, 0.85) / 100) * 100])),
    }));
  };
  const approvals = (at: number, agentUserId: string, sup: string) => [
    { stepId: 'mgr', userId: sup, decision: 'APPROVED' as const, at: iso(at + 4 * 3_600_000) },
    { stepId: 'fin', userId: o.financeUserId, decision: 'APPROVED' as const, at: iso(at + 20 * 3_600_000) },
  ].filter(() => agentUserId !== '');

  for (const sup of o.supervisors) {
    const team = teamOf(sup);
    if (!team.length) continue;
    for (let w = o.weeks; w >= 0; w--) {
      const wk = thisWeek - w * 7 * DAY;
      const weekStart = day(wk);
      const current = w === 0;
      const draft = current && sup === o.journeySupervisor;
      const dates = Array.from({ length: 5 }, (_, i) => day(wk + i * DAY)).filter((_, i) => i < rng.int(ft.plan.minDays, Math.min(5, ft.plan.maxDays)));
      const created = wk - 3 * DAY;
      const pid = `${o.orgId}_wp_${sup}_${weekStart}`;
      const activities = rng.sample(o.activityIds, Math.min(o.activityIds.length, rng.int(4, 6))).map((activityId) => ({ activityId, target: rng.int(5, 25) }));
      if (current && sup === o.journeySupervisor) {
        // Journey 7: the plan Fuseini publishes; the targets suit the week's real work.
        activities.splice(0, activities.length, ...o.activityIds.slice(0, 4).map((activityId, i) => ({ activityId, target: [10, 400, 3, 2][i] ?? 5 })));
      }
      const plan: WeeklyPlan = {
        id: pid, orgId: o.orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: sup, number: issue('weeklyPlan', created), weekStart, dates, managerId: sup, activities,
        assignees: { kind: 'team', ids: [sup] }, agentIds: team.map((a) => a.id), communities: Object.fromEntries(team.map((a) => [a.id, commsOf(a.id)])),
        status: draft ? 'DRAFT' : current || w === 1 ? 'PUBLISHED' : 'CLOSED', version: 1, history: [{ version: 1, at: iso(created), by: sup }],
        publishedAt: draft ? undefined : iso(created + 3_600_000), closedAt: !current && w > 1 ? iso(wk + 7 * DAY) : undefined,
      };
      out.plans.push(plan);
      act('weeklyPlan', pid, 'plan.created', { number: plan.number, week: weekStart }, sup, created);
      if (!draft) act('weeklyPlan', pid, 'plan.published', { number: plan.number, count: team.length }, sup, created + 3_600_000);
      if (draft) continue;

      for (const [k, agent] of team.entries()) {
        const isJourney = agent.id === journeyAgent?.id;
        if (!eligibleTypes.has(agent.agentTypeId)) continue;
        if (!isJourney && !rng.chance(0.75)) continue;
        if (current && isJourney) continue;
        const at = wk - 2 * DAY + rng.int(0, 20) * 3_600_000;
        const trips = tripsFor(agent.id, dates, activities.map((x) => x.activityId));
        const total = trips.reduce((s, t) => s + Object.values(t.costs).reduce((a, b) => a + b, 0), 0);
        const open = cfOpen(agent.id);
        let left = total;
        const deductions = ft.carryForward ? open.map((c) => { const amt = Math.min(left, c.remainingMinor); left -= amt; return { carryForwardId: c.id, amountMinor: amt }; }).filter((d) => d.amountMinor > 0) : [];
        const net = total - deductions.reduce((s, d) => s + d.amountMinor, 0);
        const id = `${o.orgId}_wab_${agent.id}_${weekStart}`;
        // This week: other teams' budgets wait at each step.
        const stage = current ? (['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED', 'SUBMITTED'] as const)[k % 4]! : 'APPROVED';
        const paid = !current;
        const b: BudgetRequest = {
          id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: agent.userId, number: issue('weeklyBudget', at), agentId: agent.id, planId: pid, weekStart, trips, total: m(total), deductions, net: m(net),
          wallet: { providerId: agent.wallet.providerId, number: agent.wallet.number, name: agent.wallet.verifiedName }, status: stage,
          approvals: stage === 'SUBMITTED' ? [] : stage === 'MANAGER_APPROVED' ? approvals(at, agent.userId, sup).slice(0, 1) : approvals(at, agent.userId, sup),
          wf: { currentStepId: stage === 'SUBMITTED' ? 'mgr' : stage === 'MANAGER_APPROVED' ? 'fin' : null, stepApprovals: stage === 'MANAGER_APPROVED' ? { mgr: [sup] } : {} },
          extraApproval: 0, payStatus: paid ? (net > 0 ? 'PAID' : 'ABSORBED') : 'UNPAID', paidAt: paid ? iso(at + 26 * 3_600_000) : undefined, device: 'mobile',
        };
        act('weeklyBudget', id, 'budget.submitted', { number: b.number, total: b.total }, agent.userId, at, 'mobile');
        if (stage !== 'SUBMITTED') act('weeklyBudget', id, 'workflow.approved', { step: 'Manager' }, sup, at + 4 * 3_600_000);
        if (stage === 'APPROVED') act('weeklyBudget', id, 'workflow.approved', { step: 'Finance' }, o.financeUserId, at + 20 * 3_600_000);
        if (paid) {
          for (const d of deductions) {
            const c = out.carryForwards.find((x) => x.id === d.carryForwardId)!;
            c.remainingMinor -= d.amountMinor; c.status = c.remainingMinor <= 0 ? 'APPLIED' : 'PARTIAL';
            c.applications.push({ budgetId: id, amountMinor: d.amountMinor, at: b.paidAt! });
          }
          act('weeklyBudget', id, 'budget.paid', { amount: b.net, deducted: m(total - net) }, o.financeUserId, at + 26 * 3_600_000);
          // Retirement: receipts for categories that need them; last week some are still under review.
          const rid = `${o.orgId}_ret_${agent.id}_${weekStart}`;
          b.retirementId = rid;
          const recent = w === 1;
          const status: Retirement['status'] = isJourney ? 'RETIRED' : recent ? (['PENDING_REVIEW', 'PENDING_RESUBMISSION', 'AWAITING_REFUND', 'PENDING_SUBMISSION', 'RETIRED'] as const)[k % 5]! : 'RETIRED';
          const receipts = status === 'PENDING_SUBMISSION' ? [] : ft.costCategories.filter((c) => c.receiptRequired).flatMap((c) => trips.filter((t) => t.costs[c.id]).map((t, j) => {
            const spent = isJourney && c.id === 'cc_fuel' && j === 0 ? Math.round(t.costs[c.id]! * 0.55) : t.costs[c.id]!;
            return {
              id: `${rid}_${c.id}_${j}`, categoryId: c.id, amountMinor: spent, date: t.date, file: `${c.id === 'cc_fuel' ? 'fuel' : c.id === 'cc_airtime' ? 'airtime' : 'lodging'}-${t.date}.jpg`,
              status: (status === 'PENDING_REVIEW' ? 'PENDING' : status === 'PENDING_RESUBMISSION' && j === 0 ? 'REJECTED' : 'APPROVED') as 'PENDING' | 'REJECTED' | 'APPROVED',
              reason: status === 'PENDING_RESUBMISSION' && j === 0 ? (o.lang === 'fr' ? 'Reçu illisible' : 'Receipt not readable') : undefined, at: iso(wk + 5 * DAY),
            };
          }));
          const r: Retirement = {
            id: rid, orgId: o.orgId, createdAt: b.paidAt!, updatedAt: b.paidAt!, createdBy: o.financeUserId, budgetId: id, agentId: agent.id, gross: m(total), receipts, refunds: [], status,
            unused: status === 'AWAITING_REFUND' ? { amountMinor: Math.round(total * 0.1 / 100) * 100, reason: ft.unusedReasons[0] ?? 'Rain', at: iso(wk + 5 * DAY) } : undefined,
            retiredAt: status === 'RETIRED' ? iso(wk + 8 * DAY) : undefined,
          };
          // Journey: Yaw spent less on fuel last week than he was paid and had no receipt for it: an under-spend carry-forward.
          if (isJourney && w === 1 && ft.carryForward) {
            const fuel = trips.find((t) => t.costs.cc_fuel)?.costs.cc_fuel ?? 0;
            const short = Math.round((fuel - Math.round(fuel * 0.55)) / 100) * 100;
            const cfId = `${o.orgId}_cf_${agent.id}_${weekStart}`;
            addCf({ id: cfId, orgId: o.orgId, createdAt: iso(wk + 8 * DAY), updatedAt: iso(wk + 8 * DAY), createdBy: o.financeUserId, agentId: agent.id, type: 'UNDER_SPEND', sourceBudgetId: id, reason: `Retirement of ${b.number}`, amount: m(short), remainingMinor: short, applications: [], status: 'PENDING' });
            r.carryForwardId = cfId;
            act('carryForward', cfId, 'carryForward.underSpend', { amount: m(short), reason: `Retirement of ${b.number}` }, o.financeUserId, wk + 8 * DAY);
          }
          out.retirements.push(r);
          if (status === 'RETIRED') act('retirement', rid, 'retirement.retired', {}, o.financeUserId, wk + 8 * DAY);
        }
        out.budgets.push(b);
      }
    }
  }

  // Penalty runs for closed weeks (achievement as recorded then); penalties carried into the next budget.
  const bands = [...ft.penaltyBands].sort((a, b) => a.fromPct - b.fromPct);
  for (let w = o.weeks; w >= 2; w--) {
    const weekStart = day(thisWeek - w * 7 * DAY);
    const lines: PenaltyRun['lines'] = out.plans.filter((p) => p.weekStart === weekStart && p.status === 'CLOSED').flatMap((p) => p.agentIds.map((agentId) => {
      const pct = agentId === journeyAgent?.id ? rng.int(72, 95) : rng.weighted([[rng.int(20, 39), 1], [rng.int(40, 69), 3], [rng.int(70, 100), 8]] as const);
      const band = bands.find((b) => pct >= b.fromPct && pct < b.toPct) ?? bands.at(-1)!;
      const budget = out.budgets.find((b) => b.agentId === agentId && b.weekStart === weekStart);
      const baseMinor = budget?.total.amountMinor ?? 0;
      return { agentId, achievementPct: pct, bandId: band.id, penaltyPct: band.penaltyPct, baseMinor, amountMinor: Math.round((baseMinor * band.penaltyPct) / 100) };
    }));
    const at = thisWeek - (w - 1) * 7 * DAY + 3_600_000;
    for (const l of lines) {
      if (!l.amountMinor || !ft.carryForward) continue;
      const id = `${o.orgId}_cfp_${l.agentId}_${weekStart}`;
      const applied = w > 2;
      addCf({ id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: 'system', agentId: l.agentId, type: 'PENALTY', reason: `Week of ${weekStart}: ${l.achievementPct}% of plan`, amount: m(l.amountMinor), remainingMinor: applied ? 0 : l.amountMinor,
        applications: applied ? [{ budgetId: '', amountMinor: l.amountMinor, at: iso(at + 3 * DAY) }] : [], status: applied ? 'APPLIED' : 'PENDING',
        penalty: { weekStart, achievementPct: l.achievementPct, bandId: l.bandId ?? '', penaltyPct: l.penaltyPct, baseMinor: l.baseMinor } });
      l.carryForwardId = id;
    }
    out.penaltyRuns.push({ id: `${o.orgId}_pen_${weekStart}`, orgId: o.orgId, weekStart, at: iso(at), by: 'system', lines });
  }
  // One waived penalty (appeal approved by finance).
  const waive = out.carryForwards.find((c) => c.type === 'PENALTY' && c.status === 'PENDING' && c.agentId !== journeyAgent?.id);
  if (waive) { waive.status = 'WAIVED'; waive.waiver = { requestedBy: o.supervisors[0]!, requestedAt: waive.createdAt, reason: o.lang === 'fr' ? 'Moto en panne toute la semaine' : 'Motorbike broken down all week', approvedBy: o.financeUserId, approvedAt: waive.createdAt }; waive.remainingMinor = 0; }
  // The journey agent's open carry-forward must be only the under-spend (penalties applied).
  for (const c of out.carryForwards.filter((x) => x.agentId === journeyAgent?.id && x.type === 'PENALTY' && x.status === 'PENDING')) { c.status = 'APPLIED'; c.remainingMinor = 0; }

  // Monthly maintenance allowances: the last two months paid.
  const maint = ft.allowanceTypes.find((t) => t.frequency === 'MONTHLY');
  if (maint) for (let k = 2; k >= 1; k--) {
    const d = new Date(Date.UTC(o.today.getUTCFullYear(), o.today.getUTCMonth() - k, 1));
    const from = day(d.getTime()); const to = day(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 3);
    const lines = ops.agents.filter((a) => a.status === 'ACTIVE' && eligibleTypes.has(a.agentTypeId)).map((a) => {
      const pct = rng.int(40, 100);
      const tier = [...(maint.tiers ?? [])].sort((x, y) => y.fromPct - x.fromPct).find((x) => pct >= x.fromPct);
      const ok = pct >= maint.thresholdPct;
      return { agentId: a.id, achievementPct: pct, amountMinor: ok ? tier?.amountMinor ?? maint.amountMinor : 0, status: (ok ? 'PAID' : 'NOT_ELIGIBLE') as 'PAID' | 'NOT_ELIGIBLE' };
    });
    out.allowanceRuns.push({ id: `${o.orgId}_alr_${from}`, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at + DAY), createdBy: o.financeUserId, number: issue('monthlyAllowance', at), typeId: maint.id, period: { from, to }, lines, status: 'PAID', approvedBy: o.opsUserId, approvedAt: iso(at + 3_600_000), currency: o.currency });
  }

  // Two paid commission periods (August, September).
  for (let k = 2; k >= 1; k--) {
    const d = new Date(Date.UTC(o.today.getUTCFullYear(), o.today.getUTCMonth() - k, 1));
    const from = day(d.getTime()); const to = day(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 2);
    const lines: CommissionLine[] = [];
    for (const a of ops.agents.filter((x) => x.status === 'ACTIVE')) {
      const cards = ft.rateCards.filter((c) => c.agentTypeId === a.agentTypeId);
      if (!cards.length) continue;
      const items = cards.map((c) => {
        const achieved = c.per >= 100 ? rng.int(2, 40) * c.per / 10 : rng.int(0, 14);
        const amount = Math.round((achieved / c.per) * c.rate.amountMinor);
        return { rateCardId: c.id, activityId: c.metricKey, achieved, counted: achieved, unit: c.unit, per: c.per, rate: c.rate, amount: m(amount), notes: [] };
      });
      lines.push({ id: `${o.orgId}_cl_${a.id}_${from}`, agentId: a.id, items, total: m(items.reduce((s, x) => s + x.amount.amountMinor, 0)), status: 'APPROVED', first: { by: o.opsUserId, at: iso(at + DAY) }, second: { by: o.financeUserId, at: iso(at + 2 * DAY) }, paid: true });
    }
    out.commissions.push({ id: `${o.orgId}_com_${from}`, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at + 3 * DAY), createdBy: o.financeUserId, number: issue('commissionPeriod', at), name: new Date(at - 5 * DAY).toLocaleDateString(o.lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }), from, to, window: { opens: day(at), closes: day(at + 10 * DAY) }, status: 'PAID', lines, confirmedAt: iso(at + 2 * DAY), confirmedBy: o.financeUserId, currency: o.currency });
  }

  // Agent reports with consequences.
  const others = ops.agents.filter((a) => a.status === 'ACTIVE' && a.userId !== o.journeyUserId && fieldTypes.has(a.agentTypeId));
  for (const [k, r] of o.reports.entries()) {
    const agent = r.userId ? ops.agents.find((a) => a.userId === r.userId)! : others[(r.index ?? k) % others.length]!;
    const at = o.today.getTime() - rng.int(3, 40) * DAY;
    const id = `${o.orgId}_rep_${k + 1}`;
    out.reports.push({
      id, orgId: o.orgId, createdAt: iso(at), updatedAt: iso(at), createdBy: agent.managerIds[0] ?? o.opsUserId, number: issue('agentReport', at), agentId: agent.id, categoryId: r.categoryId, reason: r.reason, files: rng.chance(0.5) ? ['evidence.jpg'] : [],
      status: r.status, assigneeId: o.opsUserId, dueDate: day(at + 14 * DAY), responses: r.status !== 'OPEN' ? [{ by: agent.userId, at: iso(at + DAY), text: o.lang === 'fr' ? 'J’étais à la clinique ce jour-là.' : 'I was at the clinic that day; the visit was moved.' }] : [],
      resolution: r.status === 'RESOLVED' ? { comment: o.lang === 'fr' ? 'Justificatif reçu, dossier clos.' : 'Explanation accepted; closed.', files: [], by: o.opsUserId, at: iso(at + 4 * DAY) } : undefined,
    });
    act('agent', agent.id, 'agent.reported', { number: out.reports.at(-1)!.number, category: ft.issueCategories.find((c) => c.id === r.categoryId)?.name ?? '' }, agent.managerIds[0] ?? o.opsUserId, at);
    // An open "extra approval" report puts an extra step on this week's submitted budget.
    if (r.status !== 'RESOLVED' && ft.issueCategories.find((c) => c.id === r.categoryId)?.consequence === 'EXTRA_APPROVAL') {
      const b = out.budgets.find((x) => x.agentId === agent.id && x.status === 'SUBMITTED');
      if (b) b.extraApproval = 1;
    }
  }
  return out;
}
