import type { ScoreModel } from '@/engines/scoring';

/**
 * Score models (PRD 8.4, C2–C4). Vitara's community model reproduces today's weights; the field-team
 * phase makes models editable per company. Metric keys are computed in `services/scoreService`.
 */
export const COMMUNITY_MODEL: ScoreModel = {
  id: 'sm_community', entity: 'community', period: 'year', version: 2,
  components: [
    { id: 'vsla', name: 'profile.vsla', metric: 'vsla', rule: 'boolean', weight: 5 },
    { id: 'leaders', name: 'profile.leaders', metric: 'leaders', rule: 'boolean', weight: 5 },
    { id: 'membershipList', name: 'profile.membershipList', metric: 'membershipList', rule: 'boolean', weight: 5 },
    { id: 'records', name: 'profile.records', metric: 'records', rule: 'boolean', weight: 3 },
    { id: 'agreement', name: 'profile.agreement', metric: 'agreement', rule: 'boolean', weight: 2 },
    { id: 'purchases', name: 'purchases', metric: 'purchasesKg', rule: 'linear-to-target', target: 8_700, weight: 35 },
    { id: 'training', name: 'training', metric: 'workshops', rule: 'linear-to-target', target: 4, weight: 15 },
    { id: 'planted', name: 'trees.planted', metric: 'treesPlanted', rule: 'linear-to-target', target: 350, weight: 5 },
    { id: 'alive', name: 'trees.alive', metric: 'treesAlive', rule: 'linear-to-target', target: 350, weight: 15 },
    { id: 'health', name: 'trees.health', metric: 'treeHealth', rule: 'linear-to-target', target: 100, weight: 5 },
    { id: 'parkland', name: 'trees.parkland', metric: 'parkland', rule: 'boolean', weight: 5 },
  ],
};

export const FARMER_MODEL: ScoreModel = {
  id: 'sm_farmer', entity: 'farmer', period: 'year', version: 1,
  components: [
    { id: 'consent', name: 'consent', metric: 'consent', rule: 'boolean', weight: 10 },
    { id: 'identity', name: 'identity', metric: 'identity', rule: 'linear-to-target', target: 3, weight: 20 },
    { id: 'purchases', name: 'purchases', metric: 'purchasesKg', rule: 'linear-to-target', target: 1_500, weight: 50 },
    { id: 'group', name: 'group', metric: 'inGroup', rule: 'boolean', weight: 10 },
    { id: 'noDebt', name: 'noDebt', metric: 'noOverdueLoan', rule: 'boolean', weight: 10 },
  ],
};

/** Vitara group scorecard: automatic criteria plus manual review of meeting minutes (1–4) and contribution records (1–18). */
export const GROUP_MODEL: ScoreModel = {
  id: 'sm_group', entity: 'farmerGroup', period: 'year', version: 3,
  components: [
    { id: 'members', name: 'members', metric: 'members', rule: 'linear-to-target', target: 25, weight: 30 },
    { id: 'women', name: 'women', metric: 'womenPct', rule: 'linear-to-target', target: 100, weight: 20 },
    { id: 'purchases', name: 'purchases', metric: 'purchasesKg', rule: 'bands', weight: 28, bands: [{ min: 0, max: 999.99, points: 0 }, { min: 1_000, max: 4_999.99, points: 10 }, { min: 5_000, max: 9_999.99, points: 20 }, { min: 10_000, max: 1e12, points: 28 }] },
    { id: 'meetingMinutes', name: 'meetingMinutes', metric: 'meetingMinutes', rule: 'manual', weight: 4 },
    { id: 'contributionRecords', name: 'contributionRecords', metric: 'contributionRecords', rule: 'manual', weight: 18 },
  ],
};
