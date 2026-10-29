import type { Agent, AgentReport, AllowanceRun, CommissionItem, CommissionLine, CommissionPeriod, OrgSettings } from '@/types';
import { computeScore, type ScoreBreakdown, type ScoreModel } from '@/engines/scoring';
import { activeRateCards, computeRateLine } from '@/engines/rates';
import { hasPermission } from '@/engines/permissions';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useFormStore } from '@/stores/formStore';
import { useLandStore } from '@/stores/landStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { pay, registerPayable } from './paymentService';
import { workflowUser } from './workflowService';
import { sendSms } from './smsGateway';
import { registerJob } from './jobScheduler';
import {
  achievementGrid, activityOf, agentBlocks, agentOf, currencyOf, log, measure, money, mondayOf, notify, postPenalties, previewPenalties, recomputeWeek, sourceRows, weekEnd,
} from './fieldService';
import { workshopStats } from './trainingService';

/**
 * Field team, part 2 (PRD J1, J7–J11, M12): agents (invite, areas and managers, wallet), monthly
 * allowances, agent and manager scores, commission periods with two approvals, agent reports with
 * consequences, and the field activity map with geofences.
 */

const F = () => useFieldStore.getState();
const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const now = () => new Date().toISOString();
const issue = (orgId: string, docType: string) => useSettingsStore.getState().issueNumber(orgId, docType, { date: new Date() });
const can = (userId: string, orgId: string, perm: string) => hasPermission(workflowUser(userId, orgId).permissions, perm);
const saveAgent = (id: string, patch: Partial<Agent>) => useAgentStore.setState({ agents: useAgentStore.getState().agents.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: now() } : a)) });

// ---------------------------------------------------------------- Agents (J1)

export interface InviteAgentInput { orgId: string; name: string; phone: string; agentTypeId: string; areaNodeIds: string[]; managerIds: string[]; warehouseId?: string; wallet: Agent['wallet']; language: 'en' | 'fr'; actorId: string }

/** Phone numbers per country: Ghana 10 digits starting 0 (or 9 after +233), Côte d'Ivoire 10 digits. */
export function phoneValid(orgId: string, phone: string) {
  const d = phone.replace(/\D/g, '');
  return orgId.includes('kakao') ? /^(225)?0\d{9}$/.test(d) : /^(233)?0?[235]\d{8}$/.test(d);
}

/** Required fields per agent type (areas, warehouse, manager). */
export function inviteProblems(input: InviteAgentInput): string[] {
  const type = settingsOf(input.orgId).agentTypes.find((t) => t.id === input.agentTypeId);
  const out: string[] = [];
  if (!input.name.trim()) out.push('name');
  if (!phoneValid(input.orgId, input.phone)) out.push('phone');
  if (useAccessStore.getState().users.some((u) => u.phone.replace(/\D/g, '').endsWith(input.phone.replace(/\D/g, '').replace(/^0/, '').slice(-9)))) out.push('phoneTaken');
  const req = type?.requiredFields ?? [];
  if ((req.includes('areas') || !req.length) && !input.areaNodeIds.length) out.push('areas');
  if (req.includes('warehouse') && !input.warehouseId) out.push('warehouse');
  if ((req.includes('manager') || !req.length) && !input.managerIds.length) out.push('manager');
  if (!input.wallet.number.trim()) out.push('wallet');
  return out;
}

/** Invite: an SMS code is sent; the agent shows as Invited until their first sign-in on the phone. */
export function inviteAgent(input: InviteAgentInput): Agent {
  const problems = inviteProblems(input);
  if (problems.length) throw new Error(problems[0]);
  const at = now();
  const userId = uid('u');
  const roleId = useAccessStore.getState().roles.find((r) => r.orgId === input.orgId && r.template === 'fieldAgent')?.id;
  const cc = input.orgId.includes('kakao') ? '+225' : '+233';
  const d = input.phone.replace(/\D/g, '');
  const phone = d.startsWith(cc.slice(1)) ? `+${d}` : `${cc}${d.replace(/^0/, input.orgId.includes('kakao') ? '0' : '')}`;
  useAccessStore.getState().addUser({ id: userId, name: input.name.trim(), email: '', phone, language: input.language, status: 'ACTIVE', avatarColor: '#14583F', password: '', twoFactor: { enabled: false, method: 'SMS', backupCodes: [] }, failedAttempts: 0 } as never);
  useAccessStore.getState().addMembership({ id: uid('mem'), userId, orgId: input.orgId, roleIds: roleId ? [roleId] : [], status: 'ACTIVE', title: settingsOf(input.orgId).agentTypes.find((t) => t.id === input.agentTypeId)?.name[input.language] });
  const agent: Agent = {
    id: uid('ag'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, userId, agentTypeId: input.agentTypeId, areaNodeIds: input.areaNodeIds, managerIds: input.managerIds,
    warehouseId: input.warehouseId, wallet: input.wallet, status: 'INVITED', lastSyncAt: '', appVersion: '', weekTargetPct: 0, score: 0, flags: [],
  };
  useAgentStore.setState({ agents: [agent, ...useAgentStore.getState().agents] });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  sendSms({ orgId: input.orgId, to: phone, templateId: 'agentInvite', language: input.language, body: input.language === 'fr' ? `Bienvenue sur TreeSyt. Votre code : ${code}. Téléchargez l'application et connectez-vous avec ce numéro.` : `Welcome to TreeSyt. Your code: ${code}. Download the app and sign in with this number.` });
  log(input.orgId, 'agent', agent.id, 'agent.invited', { name: input.name.trim() }, input.actorId);
  return agent;
}

/** First sign-in on the phone turns an invited agent active. */
export function activateOnSignIn(userId: string, orgId: string, appVersion = '2.4.0') {
  const a = useAgentStore.getState().agents.find((x) => x.userId === userId && x.orgId === orgId);
  if (a && a.status === 'INVITED') {
    saveAgent(a.id, { status: 'ACTIVE', lastSyncAt: now(), appVersion });
    log(orgId, 'agent', a.id, 'agent.activated', {}, userId, 'mobile');
  }
}

export function setAgentAreas(id: string, areaNodeIds: string[], actorId: string) {
  const a = agentOf(id)!;
  saveAgent(id, { areaNodeIds });
  log(a.orgId, 'agent', id, 'agent.areas', { count: areaNodeIds.length }, actorId);
}

/** Reporting line: drag an agent to another supervisor (permission `agents.reassign`). */
export function reassignAgent(id: string, managerIds: string[], actorId: string) {
  const a = agentOf(id)!;
  if (!can(actorId, a.orgId, 'agents.reassign')) throw new Error('missingPermission');
  saveAgent(id, { managerIds });
  log(a.orgId, 'agent', id, 'agent.reassigned', { managers: managerIds.map((m) => useAccessStore.getState().users.find((u) => u.id === m)?.name ?? m).join(', ') }, actorId);
}

/** Wallet edit (permission `agents.editWallet`), name lookup done by the caller; kept in a change log. */
export function updateWallet(id: string, wallet: Agent['wallet'], actorId: string) {
  const a = agentOf(id)!;
  if (!can(actorId, a.orgId, 'agents.editWallet')) throw new Error('missingPermission');
  saveAgent(id, { wallet });
  log(a.orgId, 'agent', id, 'agent.walletChanged', { from: a.wallet.number, to: wallet.number, name: wallet.verifiedName }, actorId);
}

export function setAgentStatus(id: string, status: Agent['status'], actorId: string) {
  const a = agentOf(id)!;
  saveAgent(id, { status });
  log(a.orgId, 'agent', id, status === 'DEACTIVATED' ? 'agent.deactivated' : 'agent.activated', {}, actorId);
}

/** Cash position: advances received, purchases recorded, refunds made, balance held. */
export function cashPosition(agentId: string) {
  const { requests, purchases } = useBuyingStore.getState();
  const mine = requests.filter((r) => r.agentId === agentId && r.fundsReceived);
  const rows = mine.map((r) => {
    const advanced = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
    const spent = purchases.filter((p) => p.requestId === r.id).reduce((s, p) => s + p.amount.amountMinor, 0);
    const refunded = r.reconciliationStatus === 'RECONCILED' ? Math.max(0, advanced - spent) : 0;
    return { id: r.id, number: r.number, at: r.createdAt, advanced, spent, refunded, balance: advanced - spent - refunded, reconciled: r.reconciliationStatus === 'RECONCILED' };
  }).sort((a, b) => b.at.localeCompare(a.at));
  const sum = (k: 'advanced' | 'spent' | 'refunded' | 'balance') => rows.reduce((s, r) => s + r[k], 0);
  return { rows, advanced: sum('advanced'), spent: sum('spent'), refunded: sum('refunded'), balance: sum('balance'), toReconcile: rows.filter((r) => !r.reconciled && r.balance !== 0).length };
}

// ---------------------------------------------------------------- Scores (J8)

export const modelFor = (orgId: string, agentTypeId: string): ScoreModel | undefined => settingsOf(orgId).fieldTeam.scoreModels.find((m) => m.agentTypeId === agentTypeId);

/** Score card for the year (to a date): each component's activity measured anywhere. */
export function agentScore(agent: Agent, year = new Date().getUTCFullYear(), to?: string, rows?: Map<string, Record<string, unknown>[]>): ScoreBreakdown | null {
  const model = modelFor(agent.orgId, agent.agentTypeId);
  if (!model) return null;
  const values: Record<string, number> = {};
  for (const c of model.components) {
    const a = activityOf(agent.orgId, c.metric);
    if (!a) continue;
    values[c.metric] = measure(agent.orgId, { ...a, metric: { ...a.metric, attribution: 'anywhere' } }, { agentId: agent.id, from: `${year}-01-01`, to: to ?? `${year}-12-31`, rows: rows?.get(a.metric.source) });
  }
  return computeScore(model, values);
}

/** Rows of every source a set of models needs, read once. */
export function scoreRows(orgId: string) {
  const m = new Map<string, Record<string, unknown>[]>();
  for (const model of settingsOf(orgId).fieldTeam.scoreModels) for (const c of model.components) {
    const a = activityOf(orgId, c.metric);
    if (a && !m.has(a.metric.source)) m.set(a.metric.source, sourceRows(orgId, a.metric.source));
  }
  return m;
}

/** Score at the end of each month of the year (trend chart). */
export function scoreTrend(agent: Agent, year: number, rows: Map<string, Record<string, unknown>[]>, upTo = new Date()) {
  const months = upTo.getUTCFullYear() === year ? upTo.getUTCMonth() + 1 : 12;
  return Array.from({ length: months }, (_, i) => {
    const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
    return { month: `${year}-${String(i + 1).padStart(2, '0')}`, score: agentScore(agent, year, end, rows)?.total ?? 0 };
  });
}

/** Manager score: their agents' scores, equal weights or weighted by agent count per type (company setting). */
export function managerScore(orgId: string, managerId: string, scores: Map<string, number>) {
  const agents = useAgentStore.getState().agents.filter((a) => a.orgId === orgId && a.managerIds.includes(managerId) && scores.has(a.id));
  if (!agents.length) return null;
  return Math.round((agents.reduce((s, a) => s + scores.get(a.id)!, 0) / agents.length) * 10) / 10;
}

/** "Recalculate now": write each agent's score on their record. */
export function recalculateScores(orgId: string, actorId: string, year = new Date().getUTCFullYear()) {
  const rows = scoreRows(orgId);
  const out = new Map<string, number>();
  for (const a of useAgentStore.getState().agents.filter((x) => x.orgId === orgId && x.status !== 'DEACTIVATED')) {
    const s = agentScore(a, year, undefined, rows);
    if (s) out.set(a.id, s.total);
  }
  useAgentStore.setState({ agents: useAgentStore.getState().agents.map((a) => (out.has(a.id) ? { ...a, score: Math.round(out.get(a.id)!) } : a)) });
  log(orgId, 'agent', orgId, 'scores.recalculated', { count: out.size }, actorId);
  return out;
}

// ---------------------------------------------------------------- Allowances (J7)

/** Average achievement over the plans in a period. */
export function periodAchievement(orgId: string, agentId: string, from: string, to: string) {
  const plans = F().plans.filter((p) => p.orgId === orgId && p.status !== 'DRAFT' && p.agentIds.includes(agentId) && p.weekStart >= mondayOf(from) && p.weekStart <= to);
  if (!plans.length) return 0;
  return Math.round(plans.reduce((s, p) => s + (achievementGrid({ ...p, agentIds: [agentId] })[0]?.pct ?? 0), 0) / plans.length);
}

/** Eligible / not eligible agents with their achievement and amount (tiers when set). */
export function previewAllowance(orgId: string, typeId: string, from: string, to: string): AllowanceRun['lines'] {
  const t = settingsOf(orgId).fieldTeam.allowanceTypes.find((x) => x.id === typeId)!;
  const types = new Set(settingsOf(orgId).agentTypes.filter((x) => x.budgetEligible).map((x) => x.id));
  return useAgentStore.getState().agents.filter((a) => a.orgId === orgId && a.status === 'ACTIVE' && types.has(a.agentTypeId)).map((a) => {
    const pct = periodAchievement(orgId, a.id, from, to);
    const tier = [...(t.tiers ?? [])].sort((x, y) => y.fromPct - x.fromPct).find((x) => pct >= x.fromPct);
    const eligible = pct >= t.thresholdPct;
    return { agentId: a.id, achievementPct: pct, amountMinor: eligible ? tier?.amountMinor ?? t.amountMinor : 0, status: eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE' };
  });
}

export function createAllowanceRun(orgId: string, typeId: string, from: string, to: string, actorId: string): AllowanceRun {
  if (F().allowanceRuns.some((r) => r.orgId === orgId && r.typeId === typeId && r.period.from === from)) throw new Error('alreadyRun');
  const t = settingsOf(orgId).fieldTeam.allowanceTypes.find((x) => x.id === typeId)!;
  const at = now();
  const run: AllowanceRun = { id: uid('alr'), orgId, createdAt: at, updatedAt: at, createdBy: actorId, number: issue(orgId, 'monthlyAllowance'), typeId, period: { from, to }, lines: previewAllowance(orgId, typeId, from, to), status: t.approval ? 'PREVIEW' : 'APPROVED', currency: currencyOf(orgId) };
  F().save('allowanceRuns', run);
  log(orgId, 'allowance', run.id, 'allowance.created', { number: run.number, count: run.lines.filter((l) => l.status === 'ELIGIBLE').length }, actorId);
  return run;
}

export function approveAllowanceRun(id: string, actorId: string) {
  const r = F().allowanceRuns.find((x) => x.id === id)!;
  if (r.createdBy === actorId) throw new Error('sameUser');
  F().patch('allowanceRuns', id, { status: 'APPROVED', approvedBy: actorId, approvedAt: now() });
  log(r.orgId, 'allowance', id, 'allowance.approved', { number: r.number }, actorId);
}

/** Pay eligible lines in bulk; agents blocked by an open report are skipped. Frozen once paid. */
export async function payAllowanceRun(id: string, actorId: string) {
  const r = F().allowanceRuns.find((x) => x.id === id)!;
  if (r.status !== 'APPROVED') throw new Error('notApproved');
  const lines = r.lines.filter((l) => (l.status === 'ELIGIBLE' || l.status === 'FAILED') && l.amountMinor > 0 && !agentBlocks(r.orgId, l.agentId).payouts);
  F().patch('allowanceRuns', id, { lines: r.lines.map((l) => (lines.includes(l) ? { ...l, status: 'PENDING' } : l)) });
  const payees = lines.map((l) => { const a = agentOf(l.agentId)!; return { name: a.wallet.verifiedName, number: a.wallet.number, providerId: a.wallet.providerId, amount: money(l.amountMinor, r.currency), payableId: `${id}#${l.agentId}` }; });
  if (!payees.length) return [];
  return pay({ orgId: r.orgId, type: 'MONTHLY_ALLOWANCE', payableId: id, payees, actorId, meta: { number: r.number } });
}

registerPayable('MONTHLY_ALLOWANCE', {
  onStatus: (p) => {
    const [id, agentId] = p.payableId.split('#');
    const r = F().allowanceRuns.find((x) => x.id === id);
    if (!r || !agentId) return;
    const status = p.status === 'SUCCESSFUL' ? 'PAID' : p.status === 'FAILED' || p.status === 'REVERSED' ? 'FAILED' : 'PENDING';
    const lines = r.lines.map((l) => (l.agentId === agentId ? { ...l, status: status as AllowanceRun['lines'][number]['status'], paymentId: p.id } : l));
    const done = lines.every((l) => l.status === 'PAID' || l.status === 'NOT_ELIGIBLE' || l.amountMinor === 0 || agentBlocks(r.orgId, l.agentId).payouts);
    F().patch('allowanceRuns', r.id, { lines, status: done ? 'PAID' : r.status });
    if (status === 'PAID') { const a = agentOf(agentId); if (a) notify(r.orgId, [a.userId], 'allowancePaid', { number: r.number, amount: p.amount }, '/m/me', 'PAYMENT'); }
  },
});

// ---------------------------------------------------------------- Commissions (J9)

/** Workshops count for commission only within the attendance bounds; the excluded ones are listed. */
function workshopItem(agent: Agent, from: string, to: string) {
  const s = settingsOf(agent.orgId);
  const held = useTrainingStore.getState().workshops.filter((w) => w.agentId === agent.id && (w.status === 'HELD' || w.status === 'ARCHIVED') && w.date >= from && w.date <= to);
  const notes: CommissionItem['notes'] = [];
  let counted = 0;
  for (const w of held) {
    const st = workshopStats(w, s);
    if (st.commissionEligible) counted++;
    else notes.push({ key: st.farmers < st.min ? 'comm.note.workshopBelow' : 'comm.note.workshopAbove', params: { number: w.number, n: st.farmers, min: st.min, max: st.max } });
  }
  return { achieved: held.length, counted, notes };
}

export function commissionLineFor(agent: Agent, from: string, to: string, rows?: Map<string, Record<string, unknown>[]>): CommissionLine | null {
  const cards = activeRateCards(settingsOf(agent.orgId).fieldTeam.rateCards, agent.agentTypeId, to);
  if (!cards.length) return null;
  const currency = currencyOf(agent.orgId);
  const items: CommissionItem[] = cards.map((c) => {
    const a = activityOf(agent.orgId, c.metricKey);
    const w = a?.metric.source === 'workshops' ? workshopItem(agent, from, to) : null;
    const achieved = w ? w.achieved : a ? measure(agent.orgId, { ...a, metric: { ...a.metric, attribution: 'anywhere' } }, { agentId: agent.id, from, to, rows: rows?.get(a.metric.source) }) : 0;
    const counted = w ? w.counted : achieved;
    const line = computeRateLine(c, counted);
    return { rateCardId: c.id, activityId: c.metricKey, achieved: Math.round(achieved * 10) / 10, counted: Math.round(counted * 10) / 10, unit: c.unit, per: c.per, rate: c.rate, amount: line.amount, notes: [...(w?.notes ?? []), ...line.notes] };
  });
  const total = items.reduce((s, x) => s + x.amount.amountMinor, 0);
  return { id: uid('cl'), agentId: agent.id, items, total: money(total, currency), status: 'PENDING' };
}

export interface PeriodInput { orgId: string; name: string; from: string; to: string; window?: { opens: string; closes: string }; actorId: string }

/** Create a period: lines generated from the rate cards for every active agent with a card. */
export function createCommissionPeriod(input: PeriodInput, onProgress?: (done: number, total: number) => void): CommissionPeriod {
  const { orgId } = input;
  if (input.from > input.to) throw new Error('dates');
  const at = now();
  const agents = useAgentStore.getState().agents.filter((a) => a.orgId === orgId && a.status === 'ACTIVE');
  const rows = new Map<string, Record<string, unknown>[]>();
  for (const c of settingsOf(orgId).fieldTeam.rateCards) { const a = activityOf(orgId, c.metricKey); if (a && !rows.has(a.metric.source)) rows.set(a.metric.source, sourceRows(orgId, a.metric.source)); }
  const lines: CommissionLine[] = [];
  agents.forEach((a, i) => { const l = commissionLineFor(a, input.from, input.to, rows); if (l) lines.push(l); onProgress?.(i + 1, agents.length); });
  const window = input.window ?? { opens: at.slice(0, 10), closes: new Date(Math.max(Date.parse(`${input.to}T12:00:00Z`), Date.now()) + 14 * 86_400_000).toISOString().slice(0, 10) };
  const p: CommissionPeriod = { id: uid('com'), orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(orgId, 'commissionPeriod'), name: input.name, from: input.from, to: input.to, window, status: 'IN_REVIEW', lines, currency: currencyOf(orgId) };
  F().save('commissions', p);
  log(orgId, 'commission', p.id, 'commission.created', { number: p.number, count: lines.length }, input.actorId);
  return p;
}

export const periodOf = (id: string) => F().commissions.find((p) => p.id === id)!;
export const windowOpen = (p: CommissionPeriod, at = new Date()) => { const d = at.toISOString().slice(0, 10); return d >= p.window.opens && d <= p.window.closes; };

/** Why a user can't approve a line at a step, if they can't. */
export function approveProblem(p: CommissionPeriod, line: CommissionLine, step: 'first' | 'second', userId: string): string | null {
  if (p.status !== 'IN_REVIEW') return 'notInReview';
  if (!windowOpen(p)) return 'windowClosed';
  if (!can(userId, p.orgId, step === 'first' ? 'compensation.approveFirst' : 'compensation.approveSecond')) return 'missingPermission';
  if (step === 'first' && line.status !== 'PENDING' && line.status !== 'ON_HOLD') return 'wrongStep';
  if (step === 'second' && line.status !== 'FIRST_APPROVED') return 'wrongStep';
  if (step === 'second' && line.first?.by === userId) return 'sameUser';
  if (agentOf(line.agentId)?.userId === userId) return 'ownLine';
  return null;
}

export function approveLines(periodId: string, lineIds: string[], step: 'first' | 'second', userId: string) {
  const p = periodOf(periodId);
  const ok: string[] = []; const blocked: { id: string; reason: string }[] = [];
  const lines = p.lines.map((l) => {
    if (!lineIds.includes(l.id)) return l;
    const problem = approveProblem(p, l, step, userId);
    if (problem) { blocked.push({ id: l.id, reason: problem }); return l; }
    ok.push(l.id);
    return step === 'first' ? { ...l, status: 'FIRST_APPROVED' as const, first: { by: userId, at: now() }, reason: undefined } : { ...l, status: 'APPROVED' as const, second: { by: userId, at: now() } };
  });
  F().patch('commissions', periodId, { lines });
  if (ok.length) log(p.orgId, 'commission', periodId, step === 'first' ? 'commission.firstApproved' : 'commission.secondApproved', { count: ok.length }, userId);
  if (ok.length && step === 'first') {
    const seconds = useAccessStore.getState().memberships.filter((m) => m.orgId === p.orgId && m.status === 'ACTIVE' && m.userId !== userId && can(m.userId, p.orgId, 'compensation.approveSecond')).map((m) => m.userId);
    notify(p.orgId, seconds, 'approvalNeeded', { docType: 'commissionPeriod', number: p.number }, `/app/compensation?open=${p.id}`, 'APPROVAL');
  }
  return { ok, blocked };
}

/** Reject or hold a line, with a reason. */
export function decideLine(periodId: string, lineId: string, decision: 'REJECTED' | 'ON_HOLD', reason: string, userId: string) {
  const p = periodOf(periodId);
  if (!reason.trim()) throw new Error('reasonRequired');
  if (!windowOpen(p)) throw new Error('windowClosed');
  if (!can(userId, p.orgId, 'compensation.approveFirst') && !can(userId, p.orgId, 'compensation.approveSecond')) throw new Error('missingPermission');
  F().patch('commissions', periodId, { lines: p.lines.map((l) => (l.id === lineId ? { ...l, status: decision, reason } : l)) });
  log(p.orgId, 'commission', periodId, decision === 'REJECTED' ? 'commission.rejected' : 'commission.held', { agent: agentOf(p.lines.find((l) => l.id === lineId)!.agentId)?.userId, reason }, userId);
}

/** Confirm once every line is approved or rejected. */
export function confirmPeriod(periodId: string, userId: string) {
  const p = periodOf(periodId);
  const open = p.lines.filter((l) => l.status !== 'APPROVED' && l.status !== 'REJECTED');
  if (open.length) throw new Error('linesOpen');
  F().patch('commissions', periodId, { status: 'CONFIRMED', confirmedAt: now(), confirmedBy: userId });
  log(p.orgId, 'commission', periodId, 'commission.confirmed', { number: p.number }, userId);
}

/** Pay approved lines in bulk (E1); agents blocked by an open report are skipped and listed. */
export async function payPeriod(periodId: string, userId: string, onProgress?: Parameters<typeof pay>[1]) {
  const p = periodOf(periodId);
  if (p.status !== 'CONFIRMED') throw new Error('notConfirmed');
  const lines = p.lines.filter((l) => l.status === 'APPROVED' && !l.paid && l.total.amountMinor > 0);
  const blocked = lines.filter((l) => agentBlocks(p.orgId, l.agentId).payouts);
  const payees = lines.filter((l) => !blocked.includes(l)).map((l) => { const a = agentOf(l.agentId)!; return { name: a.wallet.verifiedName, number: a.wallet.number, providerId: a.wallet.providerId, amount: l.total, payableId: `${periodId}#${l.id}` }; });
  const payments = payees.length ? await pay({ orgId: p.orgId, type: 'COMMISSION', payableId: periodId, payees, actorId: userId, meta: { number: p.number } }, onProgress) : [];
  return { payments, blocked: blocked.map((l) => l.agentId) };
}

registerPayable('COMMISSION', {
  onStatus: (pm) => {
    const [id, lineId] = pm.payableId.split('#');
    const p = F().commissions.find((x) => x.id === id);
    if (!p || !lineId) return;
    const lines = p.lines.map((l) => (l.id === lineId ? { ...l, paymentId: pm.id, paid: pm.status === 'SUCCESSFUL' } : l));
    const allPaid = lines.filter((l) => l.status === 'APPROVED' && l.total.amountMinor > 0).every((l) => l.paid || agentBlocks(p.orgId, l.agentId).payouts);
    F().patch('commissions', p.id, { lines, status: allPaid ? 'PAID' : p.status });
    if (pm.status === 'SUCCESSFUL') { const l = p.lines.find((x) => x.id === lineId); const a = l && agentOf(l.agentId); if (a) notify(p.orgId, [a.userId], 'commissionPaid', { number: p.number, amount: pm.amount }, '/m/me/commissions', 'PAYMENT'); }
  },
});

/** Payroll export rows (agent, wallet, amount, status). */
export function payrollRows(p: CommissionPeriod) {
  const users = useAccessStore.getState().users;
  const payments = usePaymentStore.getState().payments;
  return p.lines.filter((l) => l.status === 'APPROVED').map((l) => {
    const a = agentOf(l.agentId)!;
    return { agent: users.find((u) => u.id === a.userId)?.name ?? '', wallet: a.wallet.number, amount: l.total.amountMinor / 100, reference: payments.find((x) => x.id === l.paymentId)?.reference ?? '', paid: l.paid ? 'yes' : 'no' };
  });
}

// ---------------------------------------------------------------- Agent reports (J10, M12)

export interface ReportInput { orgId: string; agentId: string; categoryId: string; reason: string; files: string[]; assigneeId?: string; dueDate?: string; actorId: string }

export function createReport(input: ReportInput): AgentReport {
  if (!input.reason.trim()) throw new Error('reasonRequired');
  const at = now();
  const r: AgentReport = { id: uid('rep'), orgId: input.orgId, createdAt: at, updatedAt: at, createdBy: input.actorId, number: issue(input.orgId, 'agentReport'), agentId: input.agentId, categoryId: input.categoryId, reason: input.reason.trim(), files: input.files, status: 'OPEN', assigneeId: input.assigneeId, dueDate: input.dueDate, responses: [] };
  F().save('reports', r);
  const cat = settingsOf(input.orgId).fieldTeam.issueCategories.find((c) => c.id === input.categoryId);
  log(input.orgId, 'agent', input.agentId, 'agent.reported', { number: r.number, category: cat?.name ?? '' }, input.actorId);
  log(input.orgId, 'agentReport', r.id, 'report.created', { number: r.number }, input.actorId);
  const a = agentOf(input.agentId);
  if (a) notify(input.orgId, [a.userId], 'reportFiled', { number: r.number }, '/m/me/reports');
  if (input.assigneeId) notify(input.orgId, [input.assigneeId], 'reportAssigned', { number: r.number }, `/app/agent-reports?open=${r.id}`);
  return r;
}

export function updateReport(id: string, patch: Partial<Pick<AgentReport, 'status' | 'assigneeId' | 'dueDate'>>, actorId: string) {
  const r = F().reports.find((x) => x.id === id)!;
  F().patch('reports', id, patch);
  if (patch.status) log(r.orgId, 'agentReport', id, `report.${patch.status === 'IN_PROGRESS' ? 'inProgress' : patch.status === 'OPEN' ? 'reopened' : 'resolved'}`, { number: r.number }, actorId);
}

export function resolveReport(id: string, comment: string, files: string[], actorId: string) {
  const r = F().reports.find((x) => x.id === id)!;
  if (!comment.trim()) throw new Error('reasonRequired');
  if (!can(actorId, r.orgId, 'agentReports.resolve')) throw new Error('missingPermission');
  F().patch('reports', id, { status: 'RESOLVED', resolution: { comment: comment.trim(), files, by: actorId, at: now() } });
  log(r.orgId, 'agentReport', id, 'report.resolved', { number: r.number }, actorId);
  log(r.orgId, 'agent', r.agentId, 'agent.reportResolved', { number: r.number }, actorId);
}

/** The agent answers a report from the phone. */
export function respondToReport(id: string, text: string, actorId: string, device: 'web' | 'mobile' = 'mobile') {
  const r = F().reports.find((x) => x.id === id)!;
  F().patch('reports', id, { responses: [...r.responses, { by: actorId, at: now(), text: text.trim() }] });
  log(r.orgId, 'agentReport', id, 'report.response', { number: r.number }, actorId, device);
  if (r.assigneeId) notify(r.orgId, [r.assigneeId], 'reportResponse', { number: r.number }, `/app/agent-reports?open=${id}`);
}

// ---------------------------------------------------------------- Field activity map and geofences (J11)

export type ActivityKind = 'purchase' | 'profiling' | 'support' | 'recovery' | 'survey' | 'monitoring' | 'mapping' | 'workshop';
export interface FieldPoint { id: string; agentId: string; kind: ActivityKind; at: string; lat: number; lng: number; communityId?: string; label: string; outOfArea: boolean; distanceKm?: number }

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** Every GPS-stamped activity, with out-of-area flags against the community geofence (radius or polygon). */
export function fieldPoints(orgId: string): FieldPoint[] {
  const s = settingsOf(orgId);
  const comms = new Map(useCommunityStore.getState().communities.filter((c) => c.orgId === orgId).map((c) => [c.id, c]));
  const fences = new Map(F().geofences.filter((g) => g.orgId === orgId).map((g) => [g.communityId, g]));
  const byUser = new Map(useAgentStore.getState().agents.filter((a) => a.orgId === orgId).map((a) => [a.userId, a.id]));
  const out: FieldPoint[] = [];
  const add = (p: Omit<FieldPoint, 'outOfArea' | 'distanceKm'>) => {
    if (!p.agentId || !Number.isFinite(p.lat)) return;
    const c = p.communityId ? comms.get(p.communityId) : undefined;
    let outOfArea = false; let distanceKm: number | undefined;
    if (c) {
      const f = fences.get(c.id);
      distanceKm = Math.round(km(c.gps, p) * 10) / 10;
      outOfArea = f?.kind === 'POLYGON' && f.polygon ? !inRing([p.lat, p.lng], f.polygon) : distanceKm > (f?.radiusKm ?? s.fieldTeam.geofenceKm);
    }
    out.push({ ...p, outOfArea, distanceKm });
  };
  const own = <T extends { orgId: string }>(xs: T[]) => xs.filter((x) => x.orgId === orgId);
  for (const p of own(useBuyingStore.getState().purchases)) if (p.evidence.gps) add({ id: p.id, agentId: p.agentId, kind: 'purchase', at: p.createdAt, lat: p.evidence.gps.lat, lng: p.evidence.gps.lng, communityId: p.communityId, label: p.number });
  for (const c of comms.values()) if (c.agentIds[0] && c.profiledAt) add({ id: `prof_${c.id}`, agentId: c.agentIds[0], kind: 'profiling', at: c.profiledAt, lat: c.gps.lat, lng: c.gps.lng, communityId: c.id, label: c.name });
  for (const r of own(useSupportStore.getState().requests)) for (const l of r.lines) if (l.fulfilment?.gps) add({ id: `${r.id}_${l.id}`, agentId: r.agentId, kind: 'support', at: l.fulfilment.at, lat: l.fulfilment.gps.lat, lng: l.fulfilment.gps.lng, communityId: r.communityId, label: r.number });
  for (const r of own(useFormStore.getState().responses)) if (r.gps && r.agentId) add({ id: r.id, agentId: r.agentId, kind: 'survey', at: r.submittedAt, lat: r.gps.lat, lng: r.gps.lng, label: r.number ?? r.id });
  for (const t of own(useLandStore.getState().trees)) for (const v of t.visits) if (v.gps) add({ id: `${t.id}_${v.id}`, agentId: byUser.get(v.by) ?? '', kind: 'monitoring', at: v.at, lat: v.gps.lat, lng: v.gps.lng, communityId: t.communityId, label: t.code });
  for (const p of own(useLandStore.getState().plots)) { const pt = p.point ?? p.polygon[0]; if (pt && p.agentId) add({ id: p.id, agentId: p.agentId, kind: 'mapping', at: p.createdAt, lat: pt[0], lng: pt[1], communityId: p.communityId, label: p.code ?? p.id }); }
  for (const w of own(useTrainingStore.getState().workshops)) if (w.gps && w.heldAt) add({ id: w.id, agentId: w.agentId, kind: 'workshop', at: w.heldAt, lat: w.gps.lat, lng: w.gps.lng, communityId: w.communityId, label: w.number });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function inRing(p: [number, number], ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!; const [yj, xj] = ring[j]!;
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Out-of-area flags per agent. */
export function flagsByAgent(points: FieldPoint[]) {
  const m = new Map<string, { total: number; flagged: number }>();
  for (const p of points) { const x = m.get(p.agentId) ?? { total: 0, flagged: 0 }; x.total++; if (p.outOfArea) x.flagged++; m.set(p.agentId, x); }
  return [...m.entries()].map(([agentId, x]) => ({ agentId, ...x, pct: x.total ? Math.round((x.flagged / x.total) * 100) : 0 })).sort((a, b) => b.flagged - a.flagged);
}

export function saveGeofence(orgId: string, communityId: string, fence: { kind: 'RADIUS' | 'POLYGON'; radiusKm?: number; polygon?: [number, number][] }, actorId: string) {
  const existing = F().geofences.find((g) => g.orgId === orgId && g.communityId === communityId);
  F().save('geofences', { id: existing?.id ?? uid('gf'), orgId, communityId, ...fence });
  log(orgId, 'community', communityId, 'geofence.saved', { kind: fence.kind, km: fence.radiusKm ?? '' }, actorId);
}

// ---------------------------------------------------------------- Scheduled jobs (K6)

const ORGS = (orgId?: string) => (orgId ? [orgId] : Object.keys(useSettingsStore.getState().settings));
registerJob('achievements', async ({ orgId }) => {
  const plans = F().plans.filter((x) => ORGS(orgId).includes(x.orgId) && x.status === 'PUBLISHED');
  for (const p of plans) recomputeWeek(p.id, 'system');
  return [`plans: ${plans.length}`];
});
registerJob('penalties', async ({ orgId }) => {
  const out: string[] = [];
  for (const o of ORGS(orgId)) {
    const last = mondayOf(new Date(Date.now() - 7 * 86_400_000));
    if (F().plans.some((p) => p.orgId === o && p.weekStart === last && p.status !== 'DRAFT') && !F().penaltyRuns.some((r) => r.orgId === o && r.weekStart === last) && previewPenalties(o, last).length) {
      const run = postPenalties(o, last, 'system');
      out.push(`week ${last}: ${run.lines.filter((l) => l.amountMinor > 0).length} penalties`);
    } else out.push(`week ${last}: nothing to post`);
  }
  return out;
});
registerJob('scores', async ({ orgId }) => {
  const out: string[] = [];
  for (const o of ORGS(orgId)) if (settingsOf(o).fieldTeam.scoreModels.length) out.push(`agents scored: ${recalculateScores(o, 'system').size}`);
  return out;
});
registerJob('allowances', async ({ orgId }) => {
  const out: string[] = [];
  const d = new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
  for (const o of ORGS(orgId)) for (const t of settingsOf(o).fieldTeam.allowanceTypes.filter((x) => x.frequency === 'MONTHLY')) {
    if (F().allowanceRuns.some((r) => r.orgId === o && r.typeId === t.id && r.period.from === from)) { out.push(`${t.name}: already run for ${from}`); continue; }
    const run = createAllowanceRun(o, t.id, from, to, 'system');
    out.push(`${t.name}: ${run.lines.length} lines for ${from} – ${to}`);
  }
  return out;
});

export { weekEnd };
