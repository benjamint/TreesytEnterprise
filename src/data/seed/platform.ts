import type { AuditEntry, DataSharingGrant, Invite, Lead, Membership, Organisation, Plan, Role, RoleTemplate, Session, User } from '@/types';
import { ROLE_TEMPLATES } from '@/engines/permissions';
import { ORG, roleId } from './templates';
import type { Clock } from './rng';

export const PLANS: Plan[] = [
  {
    id: 'plan_starter', name: 'Starter', limits: { agents: 10, farmers: 2_000 },
    modules: ['dashboard', 'farmers', 'buying', 'payments', 'forms', 'traceboard', 'reports', 'notifications', 'system'],
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
      planId: 'plan_enterprise', status: 'ACTIVE', createdAt: at(400),
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

/** Demo password for every seeded account. */
export const DEMO_PASSWORD = 'demo1234';

/** Users with 2-step sign-in switched on in the seed (finance roles where the company requires it). */
const TWO_FACTOR = new Set(['u_efua', 'u_jeanmarc', 'u_aicha']);
/** Status demo moments (PRD A2): one locked office user, one deactivated agent. */
const STATUS: Record<string, User['status']> = { u_peter: 'LOCKED', u_vit_ag12: 'DEACTIVATED' };

export function makeUser(p: PersonaSeed, i: number, persona: boolean, lastActiveAt: string): User {
  return {
    id: p.id, name: p.name, email: emailFor(p.name, p.orgId), phone: p.phone, language: p.language, status: STATUS[p.id] ?? 'ACTIVE',
    avatarColor: COLORS[i % COLORS.length], isPlatformOwner: p.template === 'platformOwner', persona, lastActiveAt,
    password: DEMO_PASSWORD,
    twoFactor: { enabled: TWO_FACTOR.has(p.id), method: 'APP', backupCodes: TWO_FACTOR.has(p.id) ? ['4821-7730', '1958-0264', '6637-4411', '9012-5583'] : [] },
    failedAttempts: STATUS[p.id] === 'LOCKED' ? 5 : 0,
    trustedDevices: [],
  };
}

export function makeMembership(p: PersonaSeed): Membership {
  return { id: `mem_${p.id}_${p.orgId}`, userId: p.id, orgId: p.orgId, roleIds: [roleId(p.orgId, p.template)], status: STATUS[p.id] ?? 'ACTIVE', title: p.title };
}

/** Extra memberships: Naa Lamptey also advises Kakao Ivoire on EUDR, so she picks a company at sign-in. */
export function extraMemberships(): Membership[] {
  return [{ id: 'mem_u_naa_org_kakao', userId: 'u_naa', orgId: ORG.kakao, roleIds: [roleId(ORG.kakao, 'sustainabilityOfficer')], status: 'ACTIVE', title: 'Conseillère RDUE' }];
}

export function invites(clock: Clock): Invite[] {
  return [
    { id: 'inv_1', token: 'inv-vitara-akosua', orgId: ORG.vitara, email: 'akosua.dery@vitara.example', name: 'Akosua Dery', roleIds: [roleId(ORG.vitara, 'meOfficer')], invitedBy: 'u_ama', createdAt: clock.iso(clock.daysAgo(1)), expiresAt: clock.iso(clock.daysAgo(-6)), status: 'PENDING' },
    { id: 'inv_2', token: 'inv-kakao-expired', orgId: ORG.kakao, email: 'serge.tape@kakao-ivoire.example', name: 'Serge Tapé', roleIds: [roleId(ORG.kakao, 'warehouseManager')], invitedBy: 'u_aicha', createdAt: clock.iso(clock.daysAgo(12)), expiresAt: clock.iso(clock.daysAgo(5)), status: 'PENDING' },
  ];
}

const DEVICES = [
  { device: 'MacBook Pro', browser: 'Chrome 141', os: 'macOS 15', location: 'Accra, GH', ip: '41.66.201.14' },
  { device: 'iPhone 15', browser: 'Safari 19', os: 'iOS 19', location: 'Tamale, GH', ip: '154.160.3.77' },
  { device: 'Lenovo ThinkPad', browser: 'Edge 141', os: 'Windows 11', location: 'Wa, GH', ip: '197.251.140.9' },
  { device: 'Samsung Galaxy A55', browser: 'Chrome 141', os: 'Android 15', location: 'Abidjan, CI', ip: '160.154.48.120' },
];

/** Other signed-in devices per persona, for My account → Sessions. */
export function sessions(users: User[], memberships: Membership[], clock: Clock): Session[] {
  return users
    .filter((u) => u.persona)
    .flatMap((u, i) => {
      const orgId = memberships.find((m) => m.userId === u.id)?.orgId ?? ORG.treesyt;
      const picks = [DEVICES[(i + 1) % 4]!, DEVICES[(i + 2) % 4]!].slice(0, 1 + (i % 2));
      return picks.map((d, k) => ({
        id: `ses_${u.id}_${k}`, userId: u.id, orgId, ...d,
        createdAt: clock.iso(clock.daysAgo(3 + k * 4)), lastActiveAt: clock.iso(new Date(clock.today.getTime() - (2 + k * 20) * 3_600_000)),
      }));
    });
}

/** Admin actions across companies (Platform → Audit). */
export function auditSeed(clock: Clock): AuditEntry[] {
  const e = (i: number, orgId: string, actorId: string, entity: string, entityId: string, key: string, days: number, before?: unknown, after?: unknown): AuditEntry => ({
    id: `aud_${i}`, orgId, actorId, entity, entityId, key, before, after, at: clock.iso(clock.daysAgo(days)),
  });
  return [
    e(1, ORG.vitara, 'u_benjamin', 'organisation', ORG.vitara, 'company.created', 900),
    e(2, ORG.kakao, 'u_benjamin', 'organisation', ORG.kakao, 'company.created', 400),
    e(3, ORG.kakao, 'u_benjamin', 'organisation', ORG.kakao, 'company.planChanged', 120, { plan: 'Growth' }, { plan: 'Enterprise' }),
    e(4, ORG.nordic, 'u_benjamin', 'organisation', ORG.nordic, 'company.created', 300),
    e(5, ORG.vitara, 'u_ama', 'grant', 'grant_vit_nsb', 'grant.created', 200, undefined, { to: 'Nordic Shea Butter AB' }),
    e(6, ORG.vitara, 'u_ama', 'settings', 'approvals', 'settings.updated', 30, { page: 'approvals' }),
    e(7, ORG.afp, 'u_benjamin', 'organisation', ORG.afp, 'company.created', 45),
    e(8, ORG.vitara, 'u_ama', 'invite', 'inv_1', 'user.invited', 1, undefined, { email: 'akosua.dery@vitara.example' }),
    e(9, ORG.kakao, 'u_aicha', 'settings', 'terminology', 'settings.updated', 60, { page: 'terminology' }),
    e(10, ORG.vitara, 'u_ama', 'user', 'u_peter', 'user.locked', 2, undefined, { reason: 'failedAttempts' }),
  ];
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
