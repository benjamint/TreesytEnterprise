import type { OpsConfig, AgentSeed, GeoNode } from './operations';
import { GH_FEMALE, GH_MALE, GH_SURNAMES } from './names';
import { ORG } from './templates';
import type { Rng } from './rng';

const c = (name: string, lat: number, lng: number): GeoNode => ({ name, code: name.slice(0, 3).toUpperCase(), lat, lng });

/** Northern Ghana (PRD 12.2). Daffiama-Bussie-Issa is listed last so Daffiama gets community code WA-014. */
export const VITARA_GEO: GeoNode[] = [
  { name: 'Upper West', code: 'WA', lat: 10.3, lng: -2.3, children: [
    { name: 'Wa', code: 'WAM', lat: 10.06, lng: -2.5, children: [c('Busa', 10.1, -2.43), c('Kperisi', 10.02, -2.55), c('Charia', 10.12, -2.53), c('Siiriyiri', 10.03, -2.47)] },
    { name: 'Nadowli-Kaleo', code: 'NKD', lat: 10.37, lng: -2.67, children: [c('Kaleo', 10.2, -2.55), c('Nadowli', 10.37, -2.66), c('Takpo', 10.42, -2.7)] },
    { name: 'Jirapa', code: 'JIR', lat: 10.53, lng: -2.7, children: [c('Tizza', 10.58, -2.75), c('Ullo', 10.48, -2.68)] },
    { name: 'Lawra', code: 'LAW', lat: 10.65, lng: -2.9, children: [c('Babile', 10.55, -2.83), c('Eremon', 10.7, -2.85)] },
    { name: 'Sissala East', code: 'SIE', lat: 10.88, lng: -1.98, children: [c('Tumu', 10.88, -1.98), c('Bujan', 10.8, -1.9)] },
    { name: 'Daffiama-Bussie-Issa', code: 'DBI', lat: 10.4, lng: -2.55, children: [c('Daffiama', 10.43, -2.56), c('Bussie', 10.47, -2.48), c('Issa', 10.36, -2.38)] },
  ] },
  { name: 'Northern', code: 'TM', lat: 9.5, lng: -0.9, children: [
    { name: 'Tamale', code: 'TAM', lat: 9.4, lng: -0.84, children: [c('Gbanyamni', 9.45, -0.8), c('Kanvilli', 9.43, -0.86)] },
    { name: 'Savelugu', code: 'SAV', lat: 9.62, lng: -0.82, children: [c('Nabogu', 9.7, -0.78), c('Diare', 9.68, -0.9), c('Pong-Tamale', 9.67, -0.83)] },
    { name: 'Kumbungu', code: 'KUM', lat: 9.56, lng: -0.95, children: [c('Dalun', 9.58, -1.03), c('Voggu', 9.68, -1.05)] },
    { name: 'Tolon', code: 'TOL', lat: 9.43, lng: -1.07, children: [c('Nyankpala', 9.4, -1.0), c('Wantugu', 9.44, -1.1)] },
    { name: 'Karaga', code: 'KAR', lat: 9.92, lng: -0.43, children: [c('Pishigu', 9.95, -0.38), c('Nyong', 9.88, -0.48)] },
  ] },
  { name: 'Savannah', code: 'DM', lat: 9.1, lng: -1.8, children: [
    { name: 'Damongo', code: 'DAM', lat: 9.08, lng: -1.82, children: [c('Busunu', 9.15, -1.52), c('Larabanga', 9.22, -1.86), c('Canteen', 9.05, -1.8)] },
    { name: 'Bole', code: 'BOL', lat: 9.03, lng: -2.48, children: [c('Mandari', 9.1, -2.4), c('Tinga', 9.0, -2.3)] },
    { name: 'Sawla', code: 'SAW', lat: 9.28, lng: -2.42, children: [c('Kalba', 9.35, -2.35), c('Gindabour', 9.4, -2.5)] },
  ] },
  { name: 'North East', code: 'NE', lat: 10.4, lng: -0.6, children: [
    { name: 'Walewale', code: 'WAL', lat: 10.35, lng: -0.8, children: [c('Wungu', 10.4, -0.95), c('Kparigu', 10.33, -0.7), c('Janga', 10.25, -1.0)] },
    { name: 'Gambaga', code: 'GAM', lat: 10.53, lng: -0.44, children: [c('Nalerigu', 10.52, -0.37), c('Gbintiri', 10.58, -0.25), c('Langbinsi', 10.4, -0.55)] },
  ] },
  { name: 'Greater Accra', code: 'AC', lat: 5.6, lng: -0.2, children: [{ name: 'Tema', code: 'TEM', lat: 5.67, lng: -0.01, noCommunity: true }] },
];

export const VITARA_SUPERVISORS = ['u_fuseini', 'u_mohammed', 'u_rahinatu', 'u_peter'];

/** 24 agents: 14 CEOs (incl. Yaw), 8 Conservation (incl. Mariama), 2 warehouse officers (incl. Sulemana). */
export function vitaraAgents(rng: Rng, phone: () => string): AgentSeed[] {
  const out: AgentSeed[] = [
    { userId: 'u_yaw', name: 'Yaw Darko', phone: '+233245551234', agentTypeId: 'at_ceo', managerIds: ['u_fuseini'] },
    { userId: 'u_mariama', name: 'Mariama Bayor', phone: '+233205552345', agentTypeId: 'at_cons', managerIds: ['u_fuseini'] },
    { userId: 'u_sulemana', name: 'Sulemana Bawa', phone: '+233545553456', agentTypeId: 'at_wh', managerIds: ['u_fuseini'], warehouseCode: 'WA' },
  ];
  const used = new Set(out.map((a) => a.name));
  const gen = (agentTypeId: string, n: number, warehouseCode?: string) => {
    for (let i = 0; i < n; i++) {
      let name = '';
      do {
        const f = rng.chance(0.4);
        name = `${rng.pick(f ? GH_FEMALE : GH_MALE)} ${rng.pick(GH_SURNAMES)}`;
      } while (used.has(name));
      used.add(name);
      out.push({ userId: `u_vit_ag${out.length + 1}`, name, phone: phone(), agentTypeId, managerIds: [VITARA_SUPERVISORS[out.length % 4]!], warehouseCode });
    }
  };
  gen('at_ceo', 13);
  gen('at_cons', 7);
  gen('at_wh', 1, 'TM');
  return out;
}

const VSLA_NAMES = ['Tiyumtaba', 'Nansoni', 'Suglo', 'Pagsung', 'Neemtaba', 'Ninsala', 'Songtaba', 'Mbriguuba', 'Zuuri', 'Nyeboka'];

export function vitaraConfig(settings: OpsConfig['settings'], agents: AgentSeed[]): OpsConfig {
  return {
    orgId: ORG.vitara, idp: 'vit', currency: 'GHS', settings, geo: VITARA_GEO, levels: ['region', 'district', 'community'],
    zoneDepth: 0, zoneName: (n) => `${n} catchment`, regionLevel: 'region', bagPrefix: 'VB',
    basePrices: { com_shea: 5.8, com_soy: 8.2, com_maize: 6.1, com_gnut: 12.5, com_sesame: 15, com_cowpea: 10.4, com_millet: 7.2 },
    zoneFactors: [1, 1.04, 0.98, 1.02],
    commodityMix: [['com_shea', 60], ['com_soy', 15], ['com_maize', 10], ['com_gnut', 5], ['com_sesame', 5], ['com_cowpea', 3], ['com_millet', 2]],
    farmers: {
      count: 600, womenShare: 0.6, female: GH_FEMALE, male: GH_MALE, surnames: GH_SURNAMES,
      fixedCommunitySizes: { Daffiama: 30 },
      forced: [{ communityName: 'Daffiama', seq: 23, firstName: 'Abena', lastName: 'Issah', gender: 'F' }],
      custom: (rng, gender, age) => {
        const children = rng.int(0, Math.min(8, Math.max(0, age - 18)));
        return {
          maritalStatus: rng.weighted([['married', 6], ['single', 2], ['widowed', 1], ['divorced', 1]] as const),
          numberOfChildren: children,
          householdSize: Math.min(20, children + rng.int(1, 6)),
          hasMobilePhone: rng.chance(0.82),
          incomePrimary: rng.weighted([['farming', 6], ['sheaPicking', gender === 'F' ? 5 : 1], ['trading', 2], ['livestock', 1]] as const),
          incomeSecondary: rng.pick(['sheaButterProcessing', 'pettyTrading', 'craft', 'none']),
          cropsPrimary: rng.weighted([['shea', 5], ['maize', 3], ['soybeans', 2], ['groundnuts', 2]] as const),
          cropsSecondary: rng.pick(['millet', 'sorghum', 'cowpea', 'yam']),
          language: rng.weighted([['Waale', 3], ['Dagaare', 3], ['Dagbani', 4], ['Sisaali', 1], ['Gonja', 1], ['Mampruli', 1], ['Twi', 1]] as const),
          educationLevel: rng.weighted([['none', 5], ['primary', 3], ['jhs', 2], ['shs', 1], ['tertiary', 0.2]] as const),
          readsWritesEnglish: rng.chance(0.35),
          landSize: Math.round(rng.float(0.5, 9) * 10) / 10,
          landOwnership: rng.pick(['owned', 'family', 'rented', 'communal']),
          hasFarmLandAccess: rng.chance(0.9),
          assets: rng.sample(['bicycle', 'radio', 'mobilePhone', 'motorbike', 'tricycle', 'donkeyCart'], rng.int(0, 3)),
          idType: rng.pick(['ghanaCard', 'votersId', 'nhis', 'none']),
        };
      },
    },
    groups: {
      types: [['VSLA', 10], ['WOMENS_GROUP', 15], ['PRODUCER_GROUP', 12], ['COOPERATIVE', 8]],
      name: (type, com, rng) =>
        type === 'VSLA' ? `${com} ${rng.pick(VSLA_NAMES)} VSLA` : type === 'WOMENS_GROUP' ? `${com} Women Shea Pickers` : type === 'PRODUCER_GROUP' ? `${com} ${rng.pick(['Soybean', 'Maize', 'Groundnut'])} Producers` : `${com} Farmers Cooperative`,
      pendingReviewIndex: 3,
    },
    agents, fieldAgentTypeIds: ['at_ceo', 'at_cons'],
    warehouses: [
      { code: 'WA', name: 'Wa Aggregation Hub', type: 'AGGREGATION_HUB', nodeCode: 'WAM', officerUserIds: ['u_sulemana'], capacityKg: 600_000 },
      { code: 'TM', name: 'Tamale Central Warehouse', type: 'CENTRAL', nodeCode: 'TAM', officerUserIds: [], capacityKg: 1_500_000 },
      { code: 'TE', name: 'Tema Port Store', type: 'PORT', nodeCode: 'TEM', officerUserIds: [], capacityKg: 2_000_000 },
    ],
    requestPlan: [
      ['PENDING', 2, 'none'], ['MANAGEMENT_APPROVED', 4, 'first'], ['FINANCE_APPROVED', 3, 'all'], ['RATE_CONFIRMED', 3, 'all'],
      ['PARTIAL_DISBURSEMENT', 4, 'all', 'CASH_ADVANCE'], ['FULL_DISBURSEMENT', 5, 'all', 'CASH_ADVANCE'], ['FUNDS_RECEIVED', 12, 'all', 'CASH_ADVANCE'],
      ['TICKET_ACTIVATED', 6, 'all', 'DIRECT_PAYMENT'], ['RECONCILED', 18, 'all', 'CASH_ADVANCE'], ['RECONCILED', 22, 'all', 'DIRECT_PAYMENT'],
      ['NOT_APPROVED', 4, 'reject'], ['ON_HOLD', 2, 'hold'], ['PRICE_UPDATE', 2, 'first'], ['ARCHIVED', 3, 'all', 'CASH_ADVANCE'],
    ],
    volumeKg: [900, 2600],
    purchasesTotal: 1200,
    cashGap: { userId: 'u_yaw', gapMinor: 1_240_000 },
    preCount: 300,
    prePlan: [['APPROVED', 268, 3, 'approve'], ['LEVEL_1_APPROVED', 12, 0, 'approve'], ['LEVEL_2_APPROVED', 2, 1, 'approve'], ['LEVEL_3_APPROVED', 8, 2, 'approve'], ['ON_HOLD', 4, 0, 'hold'], ['REJECTED', 6, 1, 'reject']],
    suppliers: [
      { name: 'Wa Shea Traders Ltd', kind: 'COMPANY', status: 'APPROVED', address: 'Zongo Road, Wa' },
      { name: 'Alhassan & Sons Enterprise', kind: 'COMPANY', status: 'APPROVED', address: 'Aboabo, Tamale' },
      { name: 'Gonja Grains Aggregators', kind: 'COMPANY', status: 'APPROVED', address: 'Damongo Main Street' },
      { name: 'Hajia Memuna Shea', kind: 'INDIVIDUAL', status: 'APPROVED', address: 'Walewale Market' },
      { name: 'Mamprusi Women Shea Union', kind: 'COMPANY', status: 'APPROVED', address: 'Nalerigu' },
      { name: 'Sissala Produce Buyers', kind: 'COMPANY', status: 'PENDING_APPROVAL', address: 'Tumu Station' },
    ],
    aggregatorPlan: [['PENDING', 1], ['REJECTED', 2], ['APPROVED', 3], ['PARTIALLY_DISBURSED', 3], ['FUNDS_DISBURSED', 6]],
    financeUserId: 'u_efua', checkerUserId: 'u_ama', unknownPayment: true,
    wallets: { mtn_gh: [245_300, 20_000], telecel_gh: [58_200, 10_000], airteltigo_gh: [8_750, 10_000] },
    dialPrefix: '+233', phoneLength: 10,
  };
}
