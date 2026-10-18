import type { DataSharingGrant, Lead, Membership, Organisation, Plan, Role, RoleTemplate, User } from '@/types';
import { ROLE_TEMPLATES } from '@/engines/permissions';
import { ORG, roleId } from './templates';
import type { Clock } from './rng';

export const PLANS: Plan[] = [
  {
    id: 'plan_starter', name: 'Starter', limits: { agents: 10, farmers: 2_000 },
    modules: ['dashboard', 'farmers', 'buying', 'payments', 'forms', 'reports', 'notifications', 'system'],
    permissionCeiling: ['*', '!aggregators.*', '!eudr.*', '!carbon.*', '!settings.manageIntegrations'],
  },
  {
    id: 'plan_growth', name: 'Growth', limits: { agents: 50, farmers: 20_000 },
    modules: ['dashboard', 'ai', 'farmers', 'dataQuality', 'imports', 'buying', 'aggregators', 'payments', 'support', 'recovery', 'inventory', 'dispatch', 'salesContracts', 'traceboard', 'forms', 'workshops', 'fieldTeam', 'weeklyBudgets', 'commissions', 'reports', 'notifications', 'system'],
    permissionCeiling: ['*', '!carbon.*'],
  },
  {
    id: 'plan_enterprise', name: 'Enterprise', limits: { agents: 1_000, farmers: 500_000 },
    modules: ['*'],
    permissionCeiling: ['*'],
  },
];

export function organisations(clock: Clock): Organisation[] {
  const at = (d: number) => clock.iso(clock.daysAgo(d));
  return [
    {
      id: ORG.treesyt, code: 'TS', name: 'TreeSyt', legalName: 'TreeSyt Technologies Ltd', type: 'PLATFORM', countries: ['GH'],
      currency: 'GHS', locale: 'en-GH', language: 'en', languages: ['en', 'fr'], timezone: 'Africa/Accra', weekStart: 1,
      planId: 'plan_enterprise', status: 'ACTIVE', createdAt: at(1200),
      branding: { primaryColor: '#14583F', logoText: 'TS', senderName: 'TreeSyt', signatureName: 'The TreeSyt Team' },
    },
    {
      id: ORG.vitara, code: 'VIT', name: 'Vitara', legalName: 'Vitara Agro Sourcing Ltd', type: 'SUPPLIER', countries: ['GH'],
      currency: 'GHS', locale: 'en-GH', language: 'en', languages: ['en'], timezone: 'Africa/Accra', weekStart: 1,
      planId: 'plan_enterprise', status: 'ACTIVE', createdAt: at(900),
      branding: { primaryColor: '#14583F', logoText: 'V', senderName: 'Vitara', signatureName: 'The Sales Team' },
    },
    {
      id: ORG.kakao, code: 'KI', name: 'Kakao Ivoire', legalName: 'Union des Coopératives Kakao Ivoire SCOOPS', type: 'SUPPLIER', countries: ['CI'],
      currency: 'XOF', locale: 'fr-CI', language: 'fr', languages: ['fr', 'en'], timezone: 'Africa/Abidjan', weekStart: 1,
      planId: 'plan_growth', status: 'ACTIVE', createdAt: at(400),
      branding: { primaryColor: '#7A3E12', logoText: 'KI', senderName: 'Kakao Ivoire', signatureName: "L'équipe commerciale" },
    },
    {
      id: ORG.nordic, code: 'NSB', name: 'Nordic Shea Butter AB', legalName: 'Nordic Shea Butter AB', type: 'BUYER', countries: ['SE'],
      currency: 'EUR', locale: 'en-SE', language: 'en', languages: ['en'], timezone: 'Europe/Stockholm', weekStart: 1,
      planId: 'plan_starter', status: 'ACTIVE', createdAt: at(300),
      branding: { primaryColor: '#1F4E79', logoText: 'NS', senderName: 'Nordic Shea Butter', signatureName: 'Sourcing team' },
    },
    {
      id: ORG.afp, code: 'AFP', name: 'Accra Food Processors Ltd', legalName: 'Accra Food Processors Ltd', type: 'BUYER', countries: ['GH'],
      currency: 'GHS', locale: 'en-GH', language: 'en', languages: ['en'], timezone: 'Africa/Accra', weekStart: 1,
      planId: 'plan_starter', status: 'TRIAL', createdAt: at(45),
      branding: { primaryColor: '#B7791F', logoText: 'AF', senderName: 'Accra Food Processors', signatureName: 'Procurement' },
    },
  ];
}

export interface PersonaSeed {
  id: string;
  name: string;
  orgId: string;
  template: RoleTemplate;
  language: 'en' | 'fr';
  title?: string;
  phone: string;
}

/** Demo personas from PRD 2.2 (invented names only). */
export const PERSONAS: PersonaSeed[] = [
  { id: 'u_benjamin', name: 'Benjamin Sackey', orgId: ORG.treesyt, template: 'platformOwner', language: 'en', phone: '+233200000001' },
  { id: 'u_ama', name: 'Ama Mensah', orgId: ORG.vitara, template: 'companyAdmin', language: 'en', phone: '+233244100201' },
  { id: 'u_kwame', name: 'Kwame Asante', orgId: ORG.vitara, template: 'operationsManager', language: 'en', phone: '+233244100202' },
  { id: 'u_efua', name: 'Efua Boateng', orgId: ORG.vitara, template: 'financeOfficer', language: 'en', phone: '+233244100203' },
  { id: 'u_ibrahim', name: 'Ibrahim Seidu', orgId: ORG.vitara, template: 'logisticsManager', language: 'en', phone: '+233244100204' },
  { id: 'u_adwoa', name: 'Adwoa Owusu', orgId: ORG.vitara, template: 'warehouseManager', language: 'en', phone: '+233244100205' },
  { id: 'u_kojo', name: 'Kojo Mensah', orgId: ORG.vitara, template: 'salesOfficer', language: 'en', phone: '+233244100206' },
  { id: 'u_salamatu', name: 'Salamatu Iddrisu', orgId: ORG.vitara, template: 'meOfficer', language: 'en', phone: '+233244100207' },
  { id: 'u_naa', name: 'Naa Lamptey', orgId: ORG.vitara, template: 'sustainabilityOfficer', language: 'en', phone: '+233244100208' },
  { id: 'u_fuseini', name: 'Fuseini Abdulai', orgId: ORG.vitara, template: 'fieldSupervisor', language: 'en', phone: '+233244100209' },
  { id: 'u_yaw', name: 'Yaw Darko', orgId: ORG.vitara, template: 'fieldAgent', language: 'en', title: 'Community Engagement Officer', phone: '+233245551234' },
  { id: 'u_mariama', name: 'Mariama Bayor', orgId: ORG.vitara, template: 'fieldAgent', language: 'en', title: 'Conservation agent', phone: '+233205552345' },
  { id: 'u_sulemana', name: 'Sulemana Bawa', orgId: ORG.vitara, template: 'warehouseOfficer', language: 'en', title: 'Warehouse officer, Wa', phone: '+233545553456' },
  { id: 'u_aicha', name: 'Aïcha Koné', orgId: ORG.kakao, template: 'companyAdmin', language: 'fr', phone: '+2250701020301' },
  { id: 'u_jeanmarc', name: 'Jean-Marc Yao', orgId: ORG.kakao, template: 'financeOfficer', language: 'fr', phone: '+2250701020302' },
  { id: 'u_moussa', name: 'Moussa Traoré', orgId: ORG.kakao, template: 'fieldAgent', language: 'fr', title: 'Délégué', phone: '+2250707112233' },
  { id: 'u_lena', name: 'Lena Hartmann', orgId: ORG.nordic, template: 'buyerUser', language: 'en', phone: '+46701234567' },
];

/** Non-persona office users needed by workflows. */
export const STAFF: PersonaSeed[] = [
  { id: 'u_koffi', name: "Koffi N'Guessan", orgId: ORG.kakao, template: 'fieldSupervisor', language: 'fr', title: 'Superviseur de zone', phone: '+2250701020303' },
  { id: 'u_lassina', name: 'Lassina Bamba', orgId: ORG.kakao, template: 'fieldSupervisor', language: 'fr', title: 'Superviseur de zone', phone: '+2250701020304' },
  { id: 'u_serge', name: 'Serge Gnahoré', orgId: ORG.kakao, template: 'operationsManager', language: 'fr', title: 'Directeur des opérations', phone: '+2250701020305' },
  { id: 'u_esi', name: 'Esi Quaye', orgId: ORG.afp, template: 'buyerUser', language: 'en', phone: '+233244100301' },
  { id: 'u_mohammed', name: 'Mohammed Alhassan', orgId: ORG.vitara, template: 'fieldSupervisor', language: 'en', phone: '+233244100210' },
  { id: 'u_rahinatu', name: 'Rahinatu Yakubu', orgId: ORG.vitara, template: 'fieldSupervisor', language: 'en', phone: '+233244100211' },
  { id: 'u_peter', name: 'Peter Kuuire', orgId: ORG.vitara, template: 'fieldSupervisor', language: 'en', phone: '+233244100212' },
];

const DOMAIN: Record<string, string> = {
  [ORG.treesyt]: 'treesyt.example', [ORG.vitara]: 'vitara.example', [ORG.kakao]: 'kakao-ivoire.example',
  [ORG.nordic]: 'nordicshea.example', [ORG.afp]: 'afp.example',
};

const COLORS = ['#14583F', '#2F6FDB', '#B7791F', '#7C4DC4', '#C0392B', '#0F8080', '#3D4A44', '#1F8A4C'];

export function emailFor(name: string, orgId: string): string {
  const local = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .trim()
    .replace(/\s+/g, '.');
  return `${local}@${DOMAIN[orgId] ?? 'example.com'}`;
}

export function makeUser(p: PersonaSeed, i: number, persona: boolean, lastActiveAt: string): User {
  return {
    id: p.id, name: p.name, email: emailFor(p.name, p.orgId), phone: p.phone, language: p.language, status: 'ACTIVE',
    avatarColor: COLORS[i % COLORS.length], isPlatformOwner: p.template === 'platformOwner', persona, lastActiveAt,
  };
}

export function makeMembership(p: PersonaSeed): Membership {
  return { id: `mem_${p.id}_${p.orgId}`, userId: p.id, orgId: p.orgId, roleIds: [roleId(p.orgId, p.template)], status: 'ACTIVE', title: p.title };
}

const KAKAO_ROLE_NAMES: Partial<Record<RoleTemplate, string>> = {
  companyAdmin: 'Administrateur', operationsManager: 'Directeur des opérations', financeOfficer: 'Responsable financier',
  fieldSupervisor: 'Superviseur de zone', fieldAgent: 'Délégué', warehouseOfficer: 'Magasinier', warehouseManager: 'Responsable magasin',
  salesOfficer: 'Responsable commercial', meOfficer: 'Chargé de suivi-évaluation', sustainabilityOfficer: 'Chargé de durabilité',
  logisticsManager: 'Responsable logistique', auditor: 'Auditeur',
};

/** Every company gets a role per template (except the platform owner role, which lives on TreeSyt). */
export function rolesFor(orgId: string, kind: 'platform' | 'supplier' | 'buyer'): Role[] {
  const templates = (Object.keys(ROLE_TEMPLATES) as RoleTemplate[]).filter((t) => {
    if (kind === 'platform') return t === 'platformOwner';
    if (kind === 'buyer') return t === 'buyerUser' || t === 'companyAdmin';
    return t !== 'platformOwner' && t !== 'buyerUser';
  });
  return templates.map((template) => ({
    id: roleId(orgId, template),
    orgId,
    template,
    name: orgId === ORG.kakao ? KAKAO_ROLE_NAMES[template] : undefined,
    permissions:
      orgId === ORG.kakao && template === 'fieldSupervisor'
        ? [...ROLE_TEMPLATES[template].permissions, 'purchaseRequests.approveManagement']
        : [...ROLE_TEMPLATES[template].permissions],
    mobile: ROLE_TEMPLATES[template].mobile,
  }));
}

export function leads(clock: Clock): Lead[] {
  return [
    { id: 'lead_1', kind: 'DEMO', firstName: 'Grace', lastName: 'Achieng', email: 'grace@kerichoteas.example', phone: '+254712000111', businessName: 'Kericho Highland Teas', industry: 'Tea', message: 'We buy from 4,000 smallholders and want mobile payments.', createdAt: clock.iso(clock.daysAgo(2)) },
    { id: 'lead_2', kind: 'CONTACT', firstName: 'Ousmane', lastName: 'Diallo', email: 'o.diallo@casamance-cajou.example', phone: '+221770001122', businessName: 'Casamance Cajou SARL', industry: 'Cashew', message: 'Avez-vous une version en français ?', createdAt: clock.iso(clock.daysAgo(6)) },
    { id: 'lead_3', kind: 'SIGNUP', firstName: 'Kwesi', lastName: 'Ofori', email: 'kwesi@brongcashew.example', phone: '+233244777888', businessName: 'Brong Cashew Exporters', industry: 'Cashew', message: 'Started a free trial.', createdAt: clock.iso(clock.daysAgo(11)) },
  ];
}

export function grants(clock: Clock): DataSharingGrant[] {
  return [
    { id: 'grant_vit_nsb', fromOrgId: ORG.vitara, toOrgId: ORG.nordic, scopes: ['orders', 'traceability', 'impact'], createdAt: clock.iso(clock.daysAgo(200)), status: 'ACTIVE' },
    { id: 'grant_vit_afp', fromOrgId: ORG.vitara, toOrgId: ORG.afp, scopes: ['orders'], createdAt: clock.iso(clock.daysAgo(40)), status: 'ACTIVE' },
  ];
}
