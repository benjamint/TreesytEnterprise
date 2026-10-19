import type { OpsConfig, AgentSeed, GeoNode } from './operations';
import { CI_FEMALE, CI_MALE, CI_SURNAMES } from './names';
import { ORG } from './templates';
import type { Rng } from './rng';

const v = (name: string, lat: number, lng: number): GeoNode => ({ name, code: name.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), lat, lng });

/** District → Région → Département → Village (PRD 12.3). 25 villages. */
export const KAKAO_GEO: GeoNode[] = [
  { name: 'Bas-Sassandra', code: 'BSA', lat: 5.3, lng: -6.4, children: [
    { name: 'Nawa', code: 'NAW', lat: 5.8, lng: -6.6, children: [
      { name: 'Soubré', code: 'SOU', lat: 5.78, lng: -6.6, children: [v('Okrouyo', 5.92, -6.55), v('Liliyo', 5.88, -6.42), v('Grand-Zattry', 5.6, -6.47), v('Gripazo', 5.7, -6.75), v('Kpéhiri', 5.84, -6.7), v('Petit-Bondoukou', 5.66, -6.58)] },
      { name: 'Méagui', code: 'MEA', lat: 5.4, lng: -6.56, children: [v('Oupoyo', 5.45, -6.62), v('Gnipi', 5.35, -6.5), v('Zakoua', 5.48, -6.48), v('Kpada', 5.3, -6.62)] },
    ] },
    { name: 'San-Pédro', code: 'SPR', lat: 4.75, lng: -6.64, children: [{ name: 'San-Pédro', code: 'SPD', lat: 4.75, lng: -6.64, noCommunity: true }] },
  ] },
  { name: 'Gôh-Djiboua', code: 'GDJ', lat: 6.0, lng: -5.6, children: [
    { name: 'Gôh', code: 'GOH', lat: 6.13, lng: -5.95, children: [
      { name: 'Gagnoa', code: 'GAG', lat: 6.13, lng: -5.95, children: [v('Guibéroua', 6.24, -6.17), v('Ouragahio', 6.32, -5.93), v('Bayota', 5.97, -5.95), v('Dignago', 6.02, -6.1), v('Gnagbodougnoa', 6.08, -5.8), v('Yopohué', 6.2, -5.85), v('Doukouyo', 6.1, -6.05), v('Galébré', 6.27, -6.05)] },
    ] },
  ] },
  { name: 'Sassandra-Marahoué', code: 'SMA', lat: 7.0, lng: -6.4, children: [
    { name: 'Haut-Sassandra', code: 'HSA', lat: 6.9, lng: -6.5, children: [
      { name: 'Daloa', code: 'DAL', lat: 6.88, lng: -6.45, children: [v('Gadouan', 6.8, -6.35), v('Zaïbo', 6.95, -6.55), v('Gboguhé', 7.05, -6.5), v('Bédiala', 6.75, -6.28), v('Gonaté', 6.92, -6.62), v('Zoukougbeu', 6.77, -6.62), v('Domangbeu', 6.98, -6.38)] },
    ] },
  ] },
];

export function kakaoAgents(rng: Rng, phone: () => string): AgentSeed[] {
  const out: AgentSeed[] = [{ userId: 'u_moussa', name: 'Moussa Traoré', phone: '+2250707112233', agentTypeId: 'at_del', managerIds: ['u_koffi'] }];
  const used = new Set(out.map((a) => a.name));
  const gen = (agentTypeId: string, n: number, warehouseCode?: string) => {
    for (let i = 0; i < n; i++) {
      let name = '';
      do {
        name = `${rng.pick(rng.chance(0.25) ? CI_FEMALE : CI_MALE)} ${rng.pick(CI_SURNAMES)}`;
      } while (used.has(name));
      used.add(name);
      out.push({ userId: `u_ki_ag${out.length + 1}`, name, phone: phone(), agentTypeId, managerIds: [out.length % 2 ? 'u_koffi' : 'u_lassina'], warehouseCode });
    }
  };
  gen('at_del', 9);
  gen('at_mag', 1, 'SOU');
  gen('at_mag', 1, 'GAG');
  return out;
}

export function kakaoConfig(settings: OpsConfig['settings'], agents: AgentSeed[]): OpsConfig {
  return {
    orgId: ORG.kakao, idp: 'ki', currency: 'XOF', settings, geo: KAKAO_GEO, levels: ['district', 'region', 'department', 'village'],
    zoneDepth: 1, zoneName: (n) => `Zone ${n}`, regionLevel: 'region', bagPrefix: 'KIB',
    basePrices: { com_cocoa: 2800, com_cashew: 425 }, zoneFactors: [1, 1, 1, 1],
    commodityMix: [['com_cocoa', 90], ['com_cashew', 10]],
    farmers: {
      count: 350, womenShare: 0.3, female: CI_FEMALE, male: CI_MALE, surnames: CI_SURNAMES,
      custom: (rng, _gender, age) => {
        const maritalStatus = rng.weighted([['married', 6], ['single', 2], ['widowed', 1]] as const);
        const numberOfChildren = rng.int(0, Math.min(9, Math.max(0, age - 18)));
        // Same RNG draws as before; the household always includes the farmer and their children.
        const extra = rng.int(2, 14);
        return {
          maritalStatus, numberOfChildren, householdSize: Math.min(20, numberOfChildren + Math.max(1, Math.round(extra / 3))),
          language: rng.weighted([['Bété', 3], ['Baoulé', 3], ['Dioula', 3], ['Sénoufo', 1], ['Malinké', 1], ['Français', 2]] as const),
          educationLevel: rng.weighted([['none', 4], ['primary', 4], ['secondary', 2], ['tertiary', 0.3]] as const),
          certification: rng.weighted([['rainforestAlliance', 4], ['fairtrade', 2], ['none', 3]] as const),
          cocoaHectares: Math.round(rng.float(0.8, 7.5) * 10) / 10,
          landOwnership: rng.pick(['owned', 'family', 'sharecropping']),
          idType: rng.pick(['cni', 'carteProducteur', 'none']),
        };
      },
    },
    groups: { types: [['COOPERATIVE', 15]], name: (_t, com) => `Section ${com}` },
    agents, fieldAgentTypeIds: ['at_del'],
    warehouses: [
      { code: 'SOU', name: 'Magasin central de Soubré', type: 'CENTRAL', nodeCode: 'SOU', officerUserIds: [agents.find((a) => a.warehouseCode === 'SOU')!.userId], capacityKg: 2_000_000 },
      { code: 'GAG', name: 'Magasin de Gagnoa', type: 'AGGREGATION_HUB', nodeCode: 'GAG', officerUserIds: [agents.find((a) => a.warehouseCode === 'GAG')!.userId], capacityKg: 800_000 },
      { code: 'SPD', name: 'Entrepôt portuaire de San-Pédro', type: 'PORT', nodeCode: 'SPD', officerUserIds: [], capacityKg: 5_000_000 },
    ],
    requestPlan: [
      ['PENDING', 3, 'none'], ['ZONE_APPROVED', 3, 'first'], ['FINANCE_APPROVED', 2, 'all'], ['RATE_CONFIRMED', 2, 'all'],
      ['PARTIAL_DISBURSEMENT', 2, 'all', 'CASH_ADVANCE'], ['FULL_DISBURSEMENT', 2, 'all', 'CASH_ADVANCE'], ['FUNDS_RECEIVED', 5, 'all', 'CASH_ADVANCE'],
      ['TICKET_ACTIVATED', 5, 'all', 'DIRECT_PAYMENT'], ['RECONCILED', 6, 'all', 'CASH_ADVANCE'], ['RECONCILED', 6, 'all', 'DIRECT_PAYMENT'],
      ['NOT_APPROVED', 2, 'reject'], ['ON_HOLD', 1, 'hold'], ['ARCHIVED', 1, 'all', 'CASH_ADVANCE'],
    ],
    volumeKg: [500, 2500],
    purchasesTotal: 500,
    preCount: 80,
    prePlan: [['APPROVED', 70, 1, 'approve'], ['LEVEL_1_APPROVED', 6, 0, 'approve'], ['REJECTED', 2, 0, 'reject'], ['ON_HOLD', 2, 0, 'hold']],
    suppliers: [
      { name: 'Ets Bamba & Frères', kind: 'COMPANY', status: 'APPROVED', address: 'Quartier Commerce, Soubré' },
      { name: 'Coopérative Yeyasso de Daloa', kind: 'COMPANY', status: 'APPROVED', address: 'Route de Vavoua, Daloa' },
    ],
    aggregatorPlan: [['APPROVED', 1], ['FUNDS_DISBURSED', 3]],
    financeUserId: 'u_jeanmarc', checkerUserId: 'u_aicha',
    wallets: { orange_ci: [48_500_000, 5_000_000], wave_ci: [12_000_000, 2_000_000], mtn_ci: [6_500_000, 2_000_000] },
    dialPrefix: '+225', phoneLength: 10, keepLeadingZero: true,
  };
}
