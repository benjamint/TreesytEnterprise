import type { Agent, AuditEntry, Device, Farmer, JobRun, KbArticle, Membership, OrgSettings, OutboxMessage, Payment, Purchase, Role, SavedReport, SyncErrorCode, SyncLog, User } from '@/types';
import { SYNC_TYPES, type SyncType } from '@/data/catalogs/syncTypes';
import { REPORT_LIBRARY } from '@/data/reports/library';
import { renderMessage } from '@/engines/templates';
import { Rng, type Clock } from './rng';
import { ORG, roleId } from './templates';
import { KB_ARTICLES } from './kbArticles';

const MODELS: [string, Device['os'], string][] = [
  ['Samsung Galaxy A15', 'ANDROID', '14'], ['Tecno Spark 20', 'ANDROID', '13'], ['Infinix Hot 40', 'ANDROID', '13'], ['itel A70', 'ANDROID', '13'],
  ['Samsung Galaxy A05s', 'ANDROID', '14'], ['Xiaomi Redmi 13C', 'ANDROID', '14'], ['Nokia C32', 'ANDROID', '13'], ['iPhone 12', 'IOS', '18.6'], ['iPhone SE (2022)', 'IOS', '18.6'],
];

/** Types an agent of each kind syncs, most frequent first. */
const TYPES_BY_KIND: Record<string, SyncType[]> = {
  buyer: ['purchases', 'purchaseRequests', 'bags', 'farmers', 'fundsReceived', 'preExpenses', 'farmerEdits', 'surveys', 'gpsTrack', 'repayments', 'weeklyBudgets', 'retirements', 'supportRequests', 'groupMembers', 'farmerPhotos', 'qualityFixes', 'masterData'],
  conservation: ['treeVisits', 'seedlingAllocations', 'plots', 'nurseryRounds', 'workshops', 'attendance', 'farmers', 'plotVisits', 'nurseries', 'gpsTrack', 'weeklyBudgets', 'retirements', 'surveys', 'communities', 'leaders', 'masterData'],
  warehouse: ['inboundReceipts', 'transfers', 'stockCounts', 'warehouseExpenses', 'discrepancies', 'bagTopUps', 'agentRepayments', 'masterData', 'settingsDownload'],
};

const ERRORS: { code: SyncErrorCode; en: string; types?: SyncType[] }[] = [
  { code: 'DUPLICATE', en: 'Farmer phone number already registered to another farmer', types: ['farmers', 'farmerEdits'] },
  { code: 'DUPLICATE', en: 'Bag code already used on another purchase', types: ['purchases', 'bags'] },
  { code: 'VALIDATION', en: 'Price outside the list tolerance without a reason', types: ['purchaseRequests'] },
  { code: 'VALIDATION', en: 'Attendance has fewer people than the workshop minimum', types: ['workshops', 'attendance'] },
  { code: 'CONFLICT', en: 'The office changed this record after it was downloaded' },
  { code: 'TIMEOUT', en: 'Photo upload timed out on a slow network', types: ['farmerPhotos', 'treeVisits', 'plotVisits', 'expenseReceipts', 'retirements'] },
  { code: 'VERSION', en: 'App version below the company minimum' },
  { code: 'AUTH', en: 'Session expired: sign in again with the PIN' },
];

/** A couple of records in the shape the phone sends them; personal fields are masked in the viewer. */
function sampleRecords(type: SyncType, n: number, rng: Rng, farmers: Farmer[], purchases: Purchase[]) {
  return Array.from({ length: Math.min(n, 2) }, (_, i) => {
    const f = rng.pick(farmers);
    const base = { localId: `L-${rng.int(10_000, 99_999)}`, savedAt: 'phone', gps: f.orgId === ORG.kakao ? { lat: Number(rng.float(5.8, 6.9).toFixed(5)), lng: Number(rng.float(-6.9, -5.6).toFixed(5)) } : { lat: Number(rng.float(9.9, 10.9).toFixed(5)), lng: Number(rng.float(-2.8, -1.4).toFixed(5)) } };
    if (type === 'purchases' && purchases.length) {
      const p = rng.pick(purchases);
      return { ...base, number: p.number, farmerName: `${f.firstName} ${f.lastName}`, farmerPhone: f.phone, commodityId: p.commodityId, quantity: p.quantity, bagCodes: p.bagCodes.slice(0, 2) };
    }
    if (type === 'farmers' || type === 'farmerEdits' || type === 'farmerPhotos' || type === 'fingerprints')
      return { ...base, farmerCode: f.farmerCode, firstName: f.firstName, lastName: f.lastName, phone: f.phone, idNumber: String(f.customFields.idNumber ?? `${f.orgId === ORG.kakao ? 'CI' : 'GHA'}-${rng.int(100_000_000, 999_999_999)}`), gender: f.gender };
    return { ...base, ref: `${type}-${i + 1}`, recordCount: n };
  });
}

export interface SystemSeedInput {
  clock: Clock;
  users: User[];
  memberships: Membership[];
  roles: Role[];
  agents: Agent[];
  settings: Record<string, OrgSettings>;
  farmers: Farmer[];
  purchases: Purchase[];
  payments: Payment[];
}

export function seedSystem(input: SystemSeedInput) {
  const { clock, users, agents, settings } = input;
  const rng = new Rng(1717);
  const userOf = new Map(users.map((u) => [u.id, u]));
  const devices: Device[] = [];
  const syncLogs: SyncLog[] = [];
  const iso = (ms: number) => new Date(ms).toISOString();
  const now = clock.today.getTime() + 5 * 3_600_000;

  // ---- Devices and sync logs, per agent (K3) ----
  for (const a of agents.filter((x) => x.status !== 'INVITED')) {
    const s = settings[a.orgId]!;
    const kind = a.agentTypeId === 'at_wh' || a.agentTypeId === 'at_mag' ? 'warehouse' : a.agentTypeId === 'at_cons' ? 'conservation' : 'buyer';
    const [model, os, osVersion] = rng.pick(MODELS);
    const lastSeen = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : now - rng.int(1, 72) * 3_600_000;
    const dev: Device = {
      id: `dev_${a.id}`, orgId: a.orgId, userId: a.userId, model, os, osVersion, appVersion: a.appVersion || '3.9.2',
      push: rng.chance(0.88) ? 'ACTIVE' : 'EXPIRED', lastSeenAt: iso(lastSeen), status: 'ACTIVE',
    };
    devices.push(dev);
    // Some agents changed phones: the old one is signed out, on an older app.
    if (rng.chance(0.18)) {
      const [m2, os2, v2] = rng.pick(MODELS);
      devices.push({ id: `dev_${a.id}_old`, orgId: a.orgId, userId: a.userId, model: m2, os: os2, osVersion: v2, appVersion: rng.pick(['3.6.0', '3.7.1', '3.7.4']), push: 'NONE', lastSeenAt: iso(lastSeen - rng.int(40, 120) * 86_400_000), status: 'SIGNED_OUT', signedOutAt: iso(lastSeen - rng.int(30, 40) * 86_400_000) });
    }
    const types = TYPES_BY_KIND[kind]!;
    const orgFarmers = input.farmers.filter((f) => f.orgId === a.orgId && f.agentId === a.id);
    const farmersPool = orgFarmers.length ? orgFarmers : input.farmers.filter((f) => f.orgId === a.orgId).slice(0, 40);
    const purchasesPool = input.purchases.filter((p) => p.agentId === a.id);
    const payloadDays = s.privacy.retentionDays.payloads;
    let t = lastSeen;
    let version = dev.appVersion;
    while (t > now - 96 * 86_400_000) {
      const daysAgo = (now - t) / 86_400_000;
      // Older syncs ran on older app versions.
      if (daysAgo > 60) version = '3.7.4'; else if (daysAgo > 30 && version === dev.appVersion && rng.chance(0.5)) version = '3.8.4';
      const n = rng.int(1, 3);
      const picked = new Set<SyncType>(['masterData']);
      while (picked.size < n + 1) picked.add(types[Math.min(types.length - 1, Math.floor(Math.pow(rng.next(), 1.6) * types.length))]!);
      let offset = 0;
      for (const type of picked) {
        const sent = type === 'masterData' || type === 'settingsDownload' ? 0 : rng.int(1, type === 'gpsTrack' ? 240 : 18);
        const roll = rng.next();
        const status: SyncLog['status'] = sent === 0 ? 'SUCCESS' : roll < 0.05 ? 'FAILED' : roll < 0.14 ? 'PARTIAL' : 'SUCCESS';
        const failed = status === 'FAILED' ? sent : status === 'PARTIAL' ? rng.int(1, Math.max(1, Math.floor(sent / 2))) : 0;
        const ok = sent - failed;
        const created = type === 'farmerEdits' ? 0 : Math.round(ok * (type.endsWith('Edits') ? 0 : 0.85));
        const err = failed ? rng.pick(ERRORS.filter((e) => !e.types || e.types.includes(type))) : undefined;
        const at = t + offset;
        offset += rng.int(2, 9) * 1000;
        const purged = daysAgo > payloadDays;
        syncLogs.push({
          id: `sl_${a.id}_${syncLogs.length}`, orgId: a.orgId, userId: a.userId, deviceId: dev.id, appVersion: version, type, sent, created, updated: ok - created, failed, status,
          ms: rng.int(300, 2500) + sent * rng.int(20, 120), at: iso(at),
          request: purged ? null : sent === 0 ? { since: iso(at - 86_400_000), appVersion: version } : { appVersion: version, type, count: sent, records: sampleRecords(type, sent, rng, farmersPool, purchasesPool) },
          response: purged ? null : sent === 0 ? { downloaded: { priceLists: rng.int(1, 3), forms: rng.int(4, 9), optionLists: rng.int(5, 20) } } : { created, updated: ok - created, failed: err ? [{ localId: 'L-' + rng.int(10_000, 99_999), code: err.code, message: err.en }] : [] },
          error: err?.en, errorCode: err?.code, payloadPurged: purged || undefined,
        });
      }
      t -= rng.int(30, 150) * 3_600_000;
    }
  }

  // ---- Outbox: every email / SMS / push the system "sent" (K2) ----
  const outbox: OutboxMessage[] = [];
  for (const orgId of [ORG.vitara, ORG.kakao]) {
    const s = settings[orgId]!;
    const lang = orgId === ORG.kakao ? 'fr' : 'en';
    const company = { name: orgId === ORG.kakao ? 'Kakao Ivoire' : 'Vitara' };
    const tpl = (id: string) => s.templates.find((x) => x.id === id);
    const pays = input.payments.filter((p) => p.orgId === orgId && (p.payableType === 'FARMER_PURCHASE' || p.payableType === 'BULK_FARMER_PURCHASE')).slice(0, 26);
    pays.forEach((p, i) => {
      const t = tpl('tpl_payment_sms');
      if (!t) return;
      const failed = p.status === 'FAILED' || i % 11 === 7;
      const m = renderMessage(t, lang, { company, amount: `${p.amount.currency} ${(p.amount.amountMinor / (p.amount.currency === 'XOF' ? 1 : 100)).toFixed(p.amount.currency === 'XOF' ? 0 : 2)}`, quantity: `${rng.int(80, 900)} kg`, commodity: orgId === ORG.kakao ? 'cacao' : 'shea', reference: p.reference });
      outbox.push({ id: `out_${orgId}_sms_${i}`, orgId, channel: 'SMS', recipient: p.payee.number, templateId: t.id, language: lang, body: m.body, status: failed ? 'FAILED' : i % 3 === 0 ? 'SENT' : 'DELIVERED', failureReason: failed ? rng.pick(['Number not reachable', 'Handset switched off for 48 h', 'Network rejected the sender ID']) : undefined, at: p.createdAt });
    });
    const office = input.memberships.filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && !input.roles.find((r) => r.id === m.roleIds[0])?.mobile).map((m) => userOf.get(m.userId)).filter(Boolean) as User[];
    for (let i = 0; i < 14; i++) {
      const u = office[i % office.length]!;
      const t = tpl(i % 4 === 3 ? 'tpl_payment_failed_email' : 'tpl_approval_email');
      if (!t) continue;
      const m = renderMessage(t, (u.language as 'en' | 'fr') ?? lang, { company, number: `PR-26-0${rng.int(1000, 1999)}`, amount: orgId === ORG.kakao ? 'XOF 1 250 000' : 'GHS 4,820.00', 'user': { name: u.name }, agent: { name: 'Yaw Darko' }, reason: 'Network timeout' });
      outbox.push({ id: `out_${orgId}_mail_${i}`, orgId, channel: 'EMAIL', recipient: u.email, userId: u.id, templateId: t.id, language: u.language, subject: m.subject, body: m.body, status: i === 9 ? 'FAILED' : 'DELIVERED', failureReason: i === 9 ? 'Mailbox full' : undefined, at: clock.iso(clock.daysAgo(rng.int(0, 13), rng.int(-6, 6))) });
    }
    const mobile = agents.filter((a) => a.orgId === orgId && a.status === 'ACTIVE');
    for (let i = 0; i < 16; i++) {
      const a = mobile[i % mobile.length]!;
      const u = userOf.get(a.userId)!;
      const t = tpl('tpl_approved_push');
      if (!t) continue;
      const m = renderMessage(t, (u.language as 'en' | 'fr') ?? lang, { number: `PR-26-0${rng.int(1000, 1999)}`, amount: orgId === ORG.kakao ? 'XOF 640 000' : 'GHS 2,300.00' });
      const dev = devices.find((d) => d.userId === a.userId && d.status === 'ACTIVE');
      const expired = dev?.push === 'EXPIRED';
      outbox.push({ id: `out_${orgId}_push_${i}`, orgId, channel: 'PUSH', recipient: u.phone, userId: u.id, templateId: t.id, language: u.language, subject: company.name, body: m.body, status: expired ? 'FAILED' : 'SENT', failureReason: expired ? 'Push token expired: the agent must open the app' : undefined, at: clock.iso(clock.daysAgo(rng.int(0, 13), rng.int(-6, 6))) });
    }
  }
  outbox.sort((a, b) => b.at.localeCompare(a.at));

  // ---- Audit: settings, people, money and data changes with before / after (K4) ----
  const audit: AuditEntry[] = [];
  const IPS: Record<string, string[]> = { [ORG.vitara]: ['41.66.201.14', '154.160.3.77', '197.251.140.9'], [ORG.kakao]: ['160.154.48.120', '102.67.12.44'] };
  const DEVS = ['Chrome 141 · macOS 15', 'Edge 141 · Windows 11', 'Safari 19 · iOS 19', 'Chrome 141 · Android 15'];
  const GPS: Record<string, { lat: number; lng: number }> = { [ORG.vitara]: { lat: 9.4034, lng: -0.8424 }, [ORG.kakao]: { lat: 6.8774, lng: -6.4502 } };
  const rows: Record<string, [string, string, string, string, unknown, unknown][]> = {
    [ORG.vitara]: [
      ['u_ama', 'settings', 'buyingRules', 'settings.updated', { buyingRules: { priceTolerancePct: 5 } }, { buyingRules: { priceTolerancePct: 8 } }],
      ['u_ama', 'settings', 'approvals', 'settings.updated', { approvals: { purchaseRequest: '2 steps' } }, { approvals: { purchaseRequest: '3 steps' } }],
      ['u_ama', 'settings', 'mobile', 'settings.updated', { mobile: { minAppVersion: '3.7.0' } }, { mobile: { minAppVersion: '3.8.0' } }],
      ['u_ama', 'settings', 'privacy', 'settings.updated', { privacy: { syncLogs: 60 } }, { privacy: { syncLogs: 90 } }],
      ['u_ama', 'settings', 'fieldTeam', 'settings.updated', { fieldTeam: { dailyLimit: 'GHS 120.00' } }, { fieldTeam: { dailyLimit: 'GHS 150.00' } }],
      ['u_ama', 'user', 'u_kojo', 'user.roleChanged', { roles: ['Sales officer'] }, { roles: ['Sales officer', 'Logistics manager'] }],
      ['u_ama', 'user', 'u_vit_ag12', 'user.deactivated', { status: 'ACTIVE' }, { status: 'DEACTIVATED' }],
      ['u_efua', 'paymentLimits', 'u_efua', 'payment.limitChanged', { daily: 'GHS 50,000.00' }, { daily: 'GHS 80,000.00' }],
      ['u_kwame', 'priceList', 'pl_shea', 'priceList.updated', { com_shea: 'GHS 5.60' }, { com_shea: 'GHS 5.80' }],
      ['u_efua', 'agent', 'u_yaw', 'wallet.updated', { wallet: 'MTN 024 *** 1234' }, { wallet: 'MTN 024 *** 9921' }],
      ['u_ama', 'apiKey', 'key_live', 'apiKey.created', undefined, { name: 'Accounting sync', scopes: ['purchases:read', 'payments:read'] }],
      ['u_ama', 'webhook', 'wh_1', 'webhook.created', undefined, { url: 'https://erp.vitara.example/hooks/treesyt', events: ['payment.completed'] }],
      ['u_salamatu', 'farmer', 'vit_f_dup', 'farmer.merged', { farmers: 2 }, { farmers: 1 }],
      ['u_kwame', 'report', 'rep_lib_purchases', 'export.downloaded', undefined, { rows: 1240, format: 'XLSX' }],
      ['u_ama', 'device', 'dev_old', 'device.signedOut', { status: 'ACTIVE' }, { status: 'SIGNED_OUT' }],
      ['u_ama', 'farmer', 'vit_f_test', 'record.deleted', { name: 'Test Farmer' }, undefined],
    ],
    [ORG.kakao]: [
      ['u_aicha', 'settings', 'buyingRules', 'settings.updated', { buyingRules: { priceTolerancePct: 3 } }, { buyingRules: { priceTolerancePct: 5 } }],
      ['u_aicha', 'settings', 'numbering', 'settings.updated', { numbering: 'AC-{yy}-{seq:5}' }, { numbering: 'ACH-{yy}-{seq:5}' }],
      ['u_jeanmarc', 'paymentLimits', 'u_jeanmarc', 'payment.limitChanged', { daily: 'XOF 5 000 000' }, { daily: 'XOF 8 000 000' }],
      ['u_aicha', 'user', 'u_lassina', 'user.roleChanged', { roles: ['Délégué'] }, { roles: ['Superviseur de zone'] }],
      ['u_serge', 'priceList', 'pl_cocoa', 'priceList.updated', { com_cocoa: 'XOF 1 800' }, { com_cocoa: 'XOF 1 850' }],
      ['u_aicha', 'report', 'rep_lib_farmers', 'export.downloaded', undefined, { rows: 640, format: 'CSV' }],
    ],
  };
  let n = 0;
  for (const [orgId, list] of Object.entries(rows)) {
    list.forEach(([actorId, entity, entityId, key, before, after], i) => {
      audit.push({
        id: `aud_s_${++n}`, orgId, actorId, entity, entityId, key, before, after, at: clock.iso(clock.daysAgo(i * 3 + rng.int(0, 2), rng.int(-4, 4))),
        ip: rng.pick(IPS[orgId]!), device: rng.pick(DEVS), gps: rng.chance(0.6) ? { lat: Number((GPS[orgId]!.lat + rng.float(-0.02, 0.02)).toFixed(4)), lng: Number((GPS[orgId]!.lng + rng.float(-0.02, 0.02)).toFixed(4)) } : undefined,
      });
    });
  }

  // ---- Report library + a few saved custom reports (K1) ----
  const savedReports: SavedReport[] = [];
  for (const orgId of [ORG.vitara, ORG.kakao]) {
    const owner = orgId === ORG.kakao ? 'u_aicha' : 'u_ama';
    for (const spec of REPORT_LIBRARY) {
      savedReports.push({
        id: `rep_${orgId}_${spec.key}`, orgId, name: spec.key, libraryKey: spec.key, entity: spec.entity, columns: spec.columns, filters: spec.filters ?? [], groupBy: spec.groupBy, measure: spec.measure, chart: spec.chart,
        sharedWithRoleIds: [], createdBy: 'system', createdAt: clock.iso(clock.daysAgo(120)), updatedAt: clock.iso(clock.daysAgo(120)),
      });
    }
    const custom: Omit<SavedReport, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = orgId === ORG.vitara
      ? [
          { name: 'Shea purchases by community — last 30 days', entity: 'purchases', columns: ['community', 'quantity', 'amount'], filters: [{ column: 'commodity', op: 'equals', value: 'com_shea' }, { column: 'date', op: 'gt', value: clock.day(clock.daysAgo(30)) }], groupBy: 'community', measure: 'quantity', chart: 'BAR', sharedWithRoleIds: [roleId(orgId, 'operationsManager'), roleId(orgId, 'financeOfficer')], schedule: { frequency: 'WEEKLY', weekday: 1, time: '07:00', roleIds: [roleId(orgId, 'operationsManager'), roleId(orgId, 'financeOfficer')], lastSentAt: clock.iso(clock.daysAgo(((clock.today.getUTCDay() + 6) % 7))) } },
          { name: 'Failed payments', entity: 'payments', columns: ['reference', 'date', 'payee', 'provider', 'amount', 'status'], filters: [{ column: 'status', op: 'equals', value: 'FAILED' }], chart: 'TABLE', sharedWithRoleIds: [roleId(orgId, 'financeOfficer')], schedule: { frequency: 'DAILY', time: '08:00', roleIds: [roleId(orgId, 'financeOfficer')], lastSentAt: clock.iso(clock.daysAgo(0, -1)) } },
          { name: 'Farmers registered per month', entity: 'farmers', columns: ['registeredAt', 'name', 'community'], filters: [], groupBy: 'registeredAt', chart: 'LINE', sharedWithRoleIds: [] },
        ]
      : [
          { name: 'Achats de cacao par délégué', entity: 'purchases', columns: ['agent', 'quantity', 'amount'], filters: [{ column: 'commodity', op: 'equals', value: 'com_cocoa' }], groupBy: 'agent', measure: 'amount', chart: 'BAR', sharedWithRoleIds: [roleId(orgId, 'operationsManager')], schedule: { frequency: 'DAILY', time: '18:00', roleIds: [roleId(orgId, 'operationsManager')], lastSentAt: clock.iso(clock.daysAgo(1, 9)) } },
        ];
    custom.forEach((c, i) => savedReports.push({ ...c, id: `rep_${orgId}_c${i}`, orgId, createdBy: owner, createdAt: clock.iso(clock.daysAgo(40 - i * 7)), updatedAt: clock.iso(clock.daysAgo(10 - i)) }));
  }

  // ---- Job runs: the last few runs of each job per company, and platform backups (K6) ----
  const jobRuns: JobRun[] = [];
  const JOB_PLAN: [string, number, string[]][] = [
    ['achievements', 7, ['plans: 1', 'agents recomputed: 18']], ['penalties', 7, ['week posted: 3 penalties']], ['allowances', 30, ['MMA: 21 lines']],
    ['scores', 1, ['agents scored: 21']], ['interest', 1, ['loans accrued: 46']], ['retention', 1, ['sync logs purged: 0', 'payloads cleared: 12']],
    ['cache', 0.25, ['widgets refreshed: 14']], ['reports', 1, ['schedules sent: 1']], ['paymentPolling', 0.1, ['payments checked: 3', 'resolved: 1']],
  ];
  let j = 0;
  for (const orgId of [ORG.vitara, ORG.kakao]) {
    for (const [key, everyDays, log] of JOB_PLAN) {
      for (let r = 0; r < 4; r++) {
        const failed = key === 'paymentPolling' && r === 1 && orgId === ORG.vitara;
        jobRuns.push({ id: `job_${++j}`, orgId, key, startedAt: iso(now - (r + 0.3) * everyDays * 86_400_000), ms: rng.int(120, 4200), status: failed ? 'FAILED' : 'SUCCESS', by: 'system', log: failed ? ['payments checked: 4', 'error: Provider timeout (MTN MoMo) — will retry on the next run'] : log });
      }
    }
  }
  for (let r = 0; r < 5; r++) jobRuns.push({ id: `job_${++j}`, orgId: ORG.treesyt, key: 'backups', startedAt: iso(now - (r + 0.4) * 86_400_000), ms: rng.int(18_000, 42_000), status: 'SUCCESS', by: 'system', log: [`snapshot: ${(212 + r * -3).toFixed(0)} MB`, 'copies: 2 regions', 'kept: 30 days'] });
  jobRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const articles: KbArticle[] = KB_ARTICLES.map(({ daysAgo, ...a }) => ({ ...a, updatedAt: clock.iso(clock.daysAgo(daysAgo)) }));

  return { devices, syncLogs: syncLogs.sort((a, b) => b.at.localeCompare(a.at)), outbox, audit, savedReports, jobRuns, articles, syncTypes: SYNC_TYPES };
}
