import type { ActivityMetric, FieldActivity, FieldTeamSettings } from '@/types';
import type { RateCard } from '@/engines/rates';
import type { ScoreModel } from '@/engines/scoring';

/**
 * Field-team templates (PRD J2, J7–J10): the activity catalogue (Vitara's 25), commission rate cards
 * per agent type, agent score cards, allowance types and report categories with their consequences.
 */

const A = (id: string, en: string, fr: string, unit: string, metric: ActivityMetric, needsCommunity = true): FieldActivity => ({ id, name: { en, fr }, unit, needsCommunity, metric, active: true });
const count = (source: ActivityMetric['source'], extra: Partial<ActivityMetric> = {}): ActivityMetric => ({ source, aggregate: 'count', attribution: 'plannedCommunities', ...extra });
const manual: ActivityMetric = { source: 'manual', aggregate: 'sum', attribution: 'anywhere' };

/** Vitara's 25 activities: 18 measured from records, 7 entered by the supervisor. */
export function vitaraActivities(): FieldActivity[] {
  return [
    A('act_profile', 'Farmer profiling', 'Profilage des producteurs', 'farmers', count('farmers')),
    A('act_community', 'Community profiling', 'Profilage des communautés', 'communities', count('communities', { attribution: 'anywhere' })),
    A('act_group', 'Farmer group formation', 'Formation de groupements', 'groups', count('groups')),
    A('act_shea', 'Shea nut purchase', 'Achat de noix de karité', 'kg', { source: 'purchases', aggregate: 'sum', field: 'quantity', filter: [{ field: 'commodityId', op: 'equals', value: 'com_shea' }], attribution: 'plannedCommunities' }),
    A('act_soy', 'Soybean purchase', 'Achat de soja', 'kg', { source: 'purchases', aggregate: 'sum', field: 'quantity', filter: [{ field: 'commodityId', op: 'equals', value: 'com_soy' }], attribution: 'plannedCommunities' }),
    A('act_maize', 'Maize purchase', 'Achat de maïs', 'kg', { source: 'purchases', aggregate: 'sum', field: 'quantity', filter: [{ field: 'commodityId', op: 'equals', value: 'com_maize' }], attribution: 'plannedCommunities' }),
    A('act_buyers', 'Farmers bought from', 'Producteurs achetés', 'farmers', { source: 'purchases', aggregate: 'distinct', field: 'farmerId', attribution: 'plannedCommunities' }),
    A('act_survey', 'Survey completion', 'Enquêtes réalisées', 'responses', count('responses', { attribution: 'anywhere' })),
    A('act_workshop', 'Workshop facilitation', 'Animation d’ateliers', 'workshops', count('workshops')),
    A('act_trained', 'Farmers trained', 'Producteurs formés', 'farmers', { source: 'attendance', aggregate: 'distinct', field: 'farmerId', attribution: 'plannedCommunities' }),
    A('act_treemon', 'Tree monitoring', 'Suivi des arbres', 'trees', count('treeVisits')),
    A('act_farmland', 'Farmland mapping', 'Cartographie des champs', 'plots', count('plots', { filter: [{ field: 'typeId', op: 'equals', value: 'pt_farm' }] })),
    A('act_parkland', 'Parkland mapping', 'Cartographie des parcs', 'plots', count('plots', { filter: [{ field: 'typeId', op: 'equals', value: 'pt_park' }] })),
    A('act_seedlings', 'Seedling distribution', 'Distribution de plants', 'seedlings', { source: 'seedlings', aggregate: 'sum', field: 'quantity', attribution: 'plannedCommunities' }),
    A('act_nursery', 'Nursery monitoring', 'Suivi des pépinières', 'rounds', count('nurseryRounds')),
    A('act_recovery', 'Loan recovery visits', 'Visites de recouvrement', 'repayments', count('repayments')),
    A('act_recoveryAmt', 'Loan recovery collected', 'Montant recouvré', 'GHS', { source: 'repayments', aggregate: 'sum', field: 'amountMajor', attribution: 'plannedCommunities' }),
    A('act_women', 'Women farmers profiled', 'Productrices profilées', 'farmers', count('farmers', { filter: [{ field: 'gender', op: 'equals', value: 'F' }] })),
    A('act_meeting', 'Community meeting', 'Réunion communautaire', 'meetings', manual),
    A('act_leaders', 'Leaders meeting', 'Réunion des leaders', 'meetings', manual),
    A('act_vsla', 'VSLA meeting attended', 'Réunion AVEC', 'meetings', manual),
    A('act_radio', 'Radio programme', 'Émission radio', 'programmes', manual, false),
    A('act_fieldday', 'Field day / demonstration', 'Journée de démonstration', 'events', manual),
    A('act_fire', 'Bushfire patrol', 'Patrouille anti-feux', 'patrols', manual),
    A('act_market', 'Market price check', 'Relevé des prix du marché', 'markets', manual, false),
  ];
}

const card = (id: string, agentTypeId: string, metricKey: string, per: number, unit: string, minor: number, currency: string, eligibility: RateCard['eligibility'] = []): RateCard =>
  ({ id, agentTypeId, metricKey, per, unit, rate: { amountMinor: minor, currency }, eligibility, effectiveFrom: '2026-01-01' });

/** Vitara's GHS rates for Community Engagement Officers and Conservation agents (invented figures). */
export function vitaraRateCards(): RateCard[] {
  const c = 'GHS';
  return [
    card('rc_ceo_shea', 'at_ceo', 'act_shea', 100, 'kg', 500, c),
    card('rc_ceo_soy', 'at_ceo', 'act_soy', 100, 'kg', 300, c),
    card('rc_ceo_profile', 'at_ceo', 'act_profile', 1, 'farmer', 200, c),
    card('rc_ceo_group', 'at_ceo', 'act_group', 1, 'group', 1_500, c),
    card('rc_ceo_workshop', 'at_ceo', 'act_workshop', 1, 'workshop', 3_000, c),
    card('rc_ceo_survey', 'at_ceo', 'act_survey', 1, 'response', 300, c),
    card('rc_ceo_recovery', 'at_ceo', 'act_recovery', 1, 'repayment', 100, c, [{ kind: 'minValue', value: 5, noteKey: 'comm.note.minRepayments' }]),
    card('rc_cons_tree', 'at_cons', 'act_treemon', 10, 'trees', 500, c),
    card('rc_cons_farm', 'at_cons', 'act_farmland', 1, 'plot', 1_000, c),
    card('rc_cons_park', 'at_cons', 'act_parkland', 1, 'plot', 1_200, c),
    card('rc_cons_seed', 'at_cons', 'act_seedlings', 100, 'seedlings', 2_000, c),
    card('rc_cons_workshop', 'at_cons', 'act_workshop', 1, 'workshop', 3_000, c),
    card('rc_cons_profile', 'at_cons', 'act_profile', 1, 'farmer', 200, c),
  ];
}

const comp = (id: string, metric: string, target: number, weight: number) => ({ id, name: id, metric, rule: 'linear-to-target' as const, target, weight });

/** Vitara agent score cards (PRD J8): Conservation and Community Engagement Officer, weights total 100. */
export function vitaraScoreModels(): ScoreModel[] {
  return [
    {
      id: 'sm_agent_cons', entity: 'agent', agentTypeId: 'at_cons', period: 'year', version: 1,
      components: [comp('act_profile', 'act_profile', 1_000, 10), comp('act_farmland', 'act_farmland', 250, 20), comp('act_parkland', 'act_parkland', 450, 20), comp('act_seedlings', 'act_seedlings', 10_000, 15), comp('act_treemon', 'act_treemon', 10_000, 20), comp('act_trained', 'act_trained', 2_000, 15)],
    },
    {
      id: 'sm_agent_ceo', entity: 'agent', agentTypeId: 'at_ceo', period: 'year', version: 1,
      components: [comp('act_shea', 'act_shea', 60_000, 30), comp('act_profile', 'act_profile', 400, 15), comp('act_group', 'act_group', 12, 10), comp('act_workshop', 'act_workshop', 12, 15), comp('act_survey', 'act_survey', 150, 10), comp('act_recovery', 'act_recovery', 80, 20)],
    },
  ];
}

export function vitaraFieldTeam(m: (major: number) => number): FieldTeamSettings {
  return {
    plan: { minDays: 3, maxDays: 6, planAheadWeeks: 2 },
    reportingLevels: 3,
    costCategories: [
      { id: 'cc_fuel', name: 'Fuel', maxPerDayMinor: m(80), maxPerWeekMinor: m(400), receiptRequired: true },
      { id: 'cc_airtime', name: 'Airtime & data', maxPerDayMinor: m(10), maxPerWeekMinor: m(50), receiptRequired: true },
      { id: 'cc_perdiem', name: 'Per diem', maxPerDayMinor: m(60), maxPerWeekMinor: m(300), receiptRequired: false },
      { id: 'cc_lodging', name: 'Lodging', maxPerDayMinor: m(150), maxPerWeekMinor: m(450), receiptRequired: true },
    ],
    penaltyBands: [
      { id: 'pb_1', fromPct: 0, toPct: 40, penaltyPct: 30 },
      { id: 'pb_2', fromPct: 40, toPct: 70, penaltyPct: 15 },
      { id: 'pb_3', fromPct: 70, toPct: 101, penaltyPct: 0 },
    ],
    carryForward: true,
    retirementBlocksBudget: true,
    allowanceTypes: [
      { id: 'al_maint', name: 'Motorbike maintenance', amountMinor: m(250), frequency: 'MONTHLY', thresholdPct: 60, tiers: [{ fromPct: 60, amountMinor: m(200) }, { fromPct: 85, amountMinor: m(250) }], approval: true },
      { id: 'al_airtime', name: 'Weekly airtime', amountMinor: m(20), frequency: 'WEEKLY', thresholdPct: 0, approval: false },
    ],
    unusedReasons: ['Community visit cancelled', 'Rain', 'Shared transport', 'Market closed'],
    issueCategories: [
      { id: 'ic_absent', name: 'Absent from planned community', severity: 'MEDIUM', consequence: 'FLAG' },
      { id: 'ic_receipt', name: 'Missing or false receipt', severity: 'HIGH', consequence: 'BLOCK_BUDGETS' },
      { id: 'ic_price', name: 'Paid farmers below list price', severity: 'CRITICAL', consequence: 'BLOCK_PAYOUTS' },
      { id: 'ic_cash', name: 'Cash advance not reconciled', severity: 'HIGH', consequence: 'EXTRA_APPROVAL' },
      { id: 'ic_late', name: 'Late sync', severity: 'LOW', consequence: 'FLAG' },
    ],
    activities: vitaraActivities(),
    rateCards: vitaraRateCards(),
    scoreModels: vitaraScoreModels(),
    managerScore: 'BY_AGENTS',
    geofenceKm: 4,
  };
}

/** Kakao Ivoire: délégués buy cocoa; no allowances, no carry-forward; FCFA rates. */
export function kakaoFieldTeam(m: (major: number) => number): FieldTeamSettings {
  const v = vitaraFieldTeam(m);
  const keep = new Set(['act_profile', 'act_community', 'act_group', 'act_buyers', 'act_survey', 'act_workshop', 'act_trained', 'act_farmland', 'act_women', 'act_meeting']);
  const activities: FieldActivity[] = [
    ...v.activities.filter((a) => keep.has(a.id)).map((a) => (a.id === 'act_farmland' ? { ...a, metric: { ...a.metric, filter: [{ field: 'typeId', op: 'equals' as const, value: 'pt_cocoa' }] }, name: { en: 'Cocoa plot mapping', fr: 'Cartographie des parcelles' } } : a)),
    A('act_cocoa', 'Cocoa purchase', 'Achat de cacao', 'kg', { source: 'purchases', aggregate: 'sum', field: 'quantity', filter: [{ field: 'commodityId', op: 'equals', value: 'com_cocoa' }], attribution: 'plannedCommunities' }),
  ];
  return {
    ...v,
    costCategories: [
      { id: 'cc_fuel', name: 'Carburant', maxPerDayMinor: m(10_000), maxPerWeekMinor: m(50_000), receiptRequired: true },
      { id: 'cc_airtime', name: 'Crédit téléphone', maxPerDayMinor: m(1_000), maxPerWeekMinor: m(5_000), receiptRequired: false },
    ],
    allowanceTypes: [],
    carryForward: false,
    retirementBlocksBudget: false,
    unusedReasons: ['Visite annulée', 'Pluie', 'Transport partagé'],
    issueCategories: [
      { id: 'ic_absent', name: 'Absent de la communauté prévue', severity: 'MEDIUM', consequence: 'FLAG' },
      { id: 'ic_price', name: 'Prix bord champ non respecté', severity: 'CRITICAL', consequence: 'BLOCK_PAYOUTS' },
      { id: 'ic_late', name: 'Synchronisation tardive', severity: 'LOW', consequence: 'FLAG' },
    ],
    activities,
    rateCards: [
      card('rc_del_cocoa', 'at_del', 'act_cocoa', 1_000, 'kg', 5_000, 'XOF'),
      card('rc_del_profile', 'at_del', 'act_profile', 1, 'farmer', 500, 'XOF'),
      card('rc_del_plot', 'at_del', 'act_farmland', 1, 'plot', 2_000, 'XOF'),
    ],
    scoreModels: [{ id: 'sm_agent_del', entity: 'agent', agentTypeId: 'at_del', period: 'year', version: 1, components: [comp('act_cocoa', 'act_cocoa', 120_000, 50), comp('act_profile', 'act_profile', 300, 20), comp('act_farmland', 'act_farmland', 250, 30)] }],
    managerScore: 'EQUAL',
    geofenceKm: 6,
  };
}
