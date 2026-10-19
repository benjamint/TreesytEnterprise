import { describe, expect, it } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { permissionsFor } from '@/engines/permissions';
import { AI_INTENTS, matchIntent, type AiContext } from './ai-intents';

const now = new Date('2026-10-18T10:00:00Z');
const seed = buildSeed(now);

function ctxFor(orgId: string, userId: string, lang: 'en' | 'fr' = 'en'): AiContext {
  const of = <T extends { orgId: string }>(rows: T[]) => rows.filter((r) => r.orgId === orgId);
  const m = seed.memberships.find((x) => x.userId === userId && x.orgId === orgId);
  const names = new Map(seed.users.map((u) => [u.id, u.name]));
  return {
    orgId, userId, lang, now, settings: seed.settings[orgId]!, userName: (id) => names.get(id) ?? id,
    me: { id: userId, roleIds: m?.roleIds ?? [], permissions: permissionsFor(userId, orgId, seed) },
    requests: of(seed.requests), purchases: of(seed.purchases), expenses: of(seed.expenses), aggregatorPurchases: of(seed.aggregatorPurchases),
    suppliers: of(seed.suppliers), payments: of(seed.payments), wallets: of(seed.wallets), agents: of(seed.agents), communities: of(seed.communities),
    farmers: of(seed.farmers), groups: of(seed.groups), loans: of(seed.loans), nodes: of(seed.nodes), warehouses: of(seed.warehouses), bags: of(seed.bags),
  };
}

describe('AI intents (PRD B2)', () => {
  it('has at least 20 intents with unique keys', () => {
    expect(AI_INTENTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(AI_INTENTS.map((i) => i.key)).size).toBe(AI_INTENTS.length);
  });

  it.each([
    ['Which agents are holding the most cash?', 'agentCash'],
    ['Quels délégués détiennent le plus d’argent ?', 'agentCash'],
    ['Top communities this month', 'topCommunities'],
    ['Farmers with overdue loans', 'overdueLoans'],
    ['Producteurs avec des prêts en retard', 'overdueLoans'],
    ['Requests priced above list', 'aboveList'],
    ['Late reconciliations', 'lateReconciliations'],
    ['Warehouses with open discrepancies', 'openDiscrepancies'],
    ['Agents below 40% of target', 'agentsBelowTarget'],
    ['Payouts failed this week', 'failedPayouts'],
    ['Paiements échoués cette semaine', 'failedPayouts'],
    ['Recovery rate by district', 'recoveryByDistrict'],
    ['Plots missing polygons for EUDR', 'plotsMissing'],
    ['Farmers without consent', 'noConsent'],
    ['Stock available for contract SC-2026-004', 'stockAvailable'],
    ['Buyer orders in transit', 'ordersInTransit'],
    ['Nursery survival by batch', 'nurserySurvival'],
    ['Commissions pending approval', 'commissionsPending'],
    ['Budget requests waiting', 'budgetsWaiting'],
    ['Top suppliers by volume', 'topSuppliers'],
    ['Women share of suppliers', 'womenShare'],
    ['Carbon project tree survival', 'carbonSurvival'],
    ['Data-quality issues by agent', 'dqByAgent'],
    ['What is waiting for my approval?', 'myApprovals'],
    ['How much did we spend by commodity this month?', 'spendByCommodity'],
  ])('matches “%s” → %s', (q, key) => {
    expect(matchIntent(q)?.key).toBe(key);
  });

  it('returns nothing for an unrelated question', () => {
    expect(matchIntent('What is the weather in Paris?')).toBeNull();
  });

  it('finds Yaw Darko holding the most cash at Vitara (PRD 12.5)', () => {
    const res = AI_INTENTS.find((i) => i.key === 'agentCash')!.run(ctxFor(ORG.vitara, 'u_efua'));
    expect(res.params.name).toBe('Yaw Darko');
    expect(Number(res.params.amount)).toBeGreaterThan(1_100_000);
    expect(Number(res.params.amount)).toBeLessThan(1_400_000);
  });

  it('finds Abena Issah with an overdue loan at Vitara', () => {
    const res = AI_INTENTS.find((i) => i.key === 'overdueLoans')!.run(ctxFor(ORG.vitara, 'u_efua'));
    expect(res.table?.rows.some((r) => r.farmer === 'Abena Issah')).toBe(true);
  });

  it('never answers with another company’s records', () => {
    const vit = ctxFor(ORG.vitara, 'u_ama');
    const ki = ctxFor(ORG.kakao, 'u_aicha', 'fr');
    const vitNames = new Set([...vit.communities.map((c) => c.name), ...vit.agents.map((a) => vit.userName(a.userId))]);
    for (const intent of AI_INTENTS) {
      const res = intent.run(ki);
      for (const row of res.table?.rows ?? []) for (const v of Object.values(row)) if (typeof v === 'string' && v.length > 3) expect(vitNames.has(v)).toBe(false);
    }
  });
});
