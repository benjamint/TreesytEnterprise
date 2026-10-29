import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { SYNC_TYPES } from '@/data/catalogs/syncTypes';
import { REPORT_LIBRARY } from '@/data/reports/library';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useFormStore } from '@/stores/formStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLandStore } from '@/stores/landStore';
import { useLoanStore } from '@/stores/loanStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useSystemStore } from '@/stores/systemStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { JOBS, nextRun, runNow } from './jobScheduler';
import { copyReport, deleteReport, exportFile, LARGE_EXPORT_ROWS, reportsFor, runReport, saveReport, scheduleDue, startExport, columnsOf } from './reportService';
import {
  articlesFor, belowMinimum, compareVersions, demoDeviceId, diff, inboxGroups, maskPersonal, purgeSyncLogs, queryAudit, registerDemoDevice, requireUpdate, resendMessage,
  retentionSummary, saveArticle, searchArticles, signOutDevice, syncBlock, versionCounts,
} from './systemService';
import { registerSyncHandler, saveOrQueue, syncOutbox } from './mobileSync';
import './teamService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }), status: async () => ({ status: 'SUCCESSFUL' }) }));

const NOW = new Date('2026-10-18T10:00:00Z');
let seed: ReturnType<typeof buildSeed>;
function load() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const s = buildSeed(NOW);
  seed = s;
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useGroupStore.setState({ groups: s.groups, groupMemberships: s.groupMemberships, seeded: true } as never);
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, aggregatorExpenses: s.aggregatorExpenses, seeded: true });
  usePaymentStore.setState({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [], seeded: true });
  useSupportStore.setState({ providers: s.providers, requests: s.supportRequests, windows: s.recoveryWindows, recoveries: s.recoveryRequests, repayments: s.repayments, refunds: s.loanRefunds, legacy: s.legacyAllocations, seeded: true });
  useLoanStore.setState({ loans: s.loans, seeded: true } as never);
  useFormStore.setState({ forms: s.forms, optionLists: s.optionLists, responses: s.responses, seeded: true });
  useLandStore.setState({ plots: s.plots, trees: s.trees, nurseries: s.nurseries, lots: s.seedlingLots, allocations: s.seedlingAllocations, lossZones: s.lossZones, eudrLots: s.eudrLots, statements: s.statements, projects: s.carbonProjects, seeded: true });
  useTrainingStore.setState({ topics: s.trainingTopics, workshops: s.workshops, seeded: true });
  useWarehouseStore.setState({ warehouses: s.warehouses, inbounds: s.inbounds, discrepancies: s.discrepancies, agentRepayments: s.agentRepayments, movements: s.movements, transfers: s.transfers, stockCounts: s.stockCounts, warehouseExpenses: s.warehouseExpenses, seeded: true } as never);
  useFieldStore.setState({ plans: s.weeklyPlans, budgets: s.budgets, retirements: s.retirements, carryForwards: s.carryForwards, penaltyRuns: s.penaltyRuns, achievements: [], allowanceRuns: s.allowanceRuns, commissions: s.commissionPeriods, reports: s.agentReports, geofences: [], seeded: true } as never);
  useActivityStore.setState({ audit: s.audit, activity: [], seeded: true });
  useNotificationStore.setState({ notifications: s.notifications, outbox: s.outbox, seeded: true });
  useSystemStore.setState({ syncLogs: s.syncLogs, devices: s.devices, reports: s.savedReports, exports: [], jobRuns: s.jobRuns, articles: s.articles, seeded: true } as never);
}
afterAll(() => { vi.useRealTimers(); });

describe('Phase 17 seed', () => {
  beforeAll(load);

  it('lists 44 sync types and logs syncs of many of them', () => {
    expect(SYNC_TYPES).toHaveLength(44);
    expect(new Set(SYNC_TYPES).size).toBe(44);
    const used = new Set(seed.syncLogs.map((l) => l.type));
    expect(used.size).toBeGreaterThan(25);
    expect(seed.syncLogs.some((l) => l.status === 'PARTIAL')).toBe(true);
    expect(seed.syncLogs.some((l) => l.status === 'FAILED' && l.errorCode)).toBe(true);
    // Payloads older than the payload retention are already cleared.
    const old = seed.syncLogs.filter((l) => l.orgId === ORG.vitara && new Date(l.at) < new Date(NOW.getTime() - 31 * 86_400_000));
    expect(old.length).toBeGreaterThan(0);
    expect(old.every((l) => l.payloadPurged && l.request === null)).toBe(true);
  });

  it('gives every active agent a device; some are on an app below the minimum', () => {
    const active = seed.agents.filter((a) => a.status !== 'INVITED');
    expect(active.every((a) => seed.devices.some((d) => d.userId === a.userId && d.orgId === a.orgId && d.status === 'ACTIVE'))).toBe(true);
    expect(seed.devices.some((d) => d.status === 'SIGNED_OUT')).toBe(true);
    expect(versionCounts(ORG.vitara).some((v) => v.below)).toBe(true);
  });

  it('has outbox messages on every channel with delivered and failed ones', () => {
    for (const ch of ['EMAIL', 'SMS', 'PUSH'] as const) expect(seed.outbox.some((m) => m.channel === ch)).toBe(true);
    expect(seed.outbox.some((m) => m.status === 'FAILED' && m.failureReason)).toBe(true);
    expect(seed.outbox.some((m) => m.status === 'DELIVERED')).toBe(true);
  });

  it('has an agent who works for two companies, with a company picker on the phone', () => {
    const ms = seed.memberships.filter((m) => m.userId === 'u_vit_ag4');
    expect(ms.map((m) => m.orgId).sort()).toEqual([ORG.kakao, ORG.vitara].sort());
    expect(seed.agents.filter((a) => a.userId === 'u_vit_ag4').map((a) => a.orgId).sort()).toEqual([ORG.kakao, ORG.vitara].sort());
  });

  it('reproduces 17 library reports per supplier company and keeps names out of the seed', () => {
    expect(REPORT_LIBRARY).toHaveLength(17);
    expect(seed.savedReports.filter((r) => r.orgId === ORG.vitara && r.libraryKey)).toHaveLength(17);
    expect(seed.savedReports.filter((r) => r.orgId === ORG.kakao && r.libraryKey)).toHaveLength(17);
  });
});

describe('K1 reports', () => {
  beforeAll(load);

  it('every library report runs and returns its columns', () => {
    for (const spec of REPORT_LIBRARY) {
      const res = runReport({ orgId: ORG.vitara, entity: spec.entity, columns: spec.columns, filters: [], groupBy: spec.groupBy, measure: spec.measure });
      expect(res.columns.map((c) => c.key)).toEqual(spec.columns);
      if (spec.groupBy) expect(res.groups?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('farmer columns include the live profile form fields', () => {
    const cols = columnsOf(ORG.vitara, 'farmers', 'en');
    expect(cols.some((c) => c.key.startsWith('form.'))).toBe(true);
  });

  it('filters and groups: sourcing by agent sums quantity', () => {
    const shea = runReport({ orgId: ORG.vitara, entity: 'purchases', columns: ['agent', 'quantity'], filters: [{ column: 'commodity', op: 'equals', value: 'com_shea' }], groupBy: 'agent', measure: 'quantity' });
    const all = useBuyingStore.getState().purchases.filter((p) => p.orgId === ORG.vitara && p.commodityId === 'com_shea');
    expect(shea.total).toBe(all.length);
    expect(Math.round(shea.groups!.reduce((s, g) => s + g.value, 0))).toBe(Math.round(all.reduce((s, p) => s + p.quantity, 0)));
    const recent = runReport({ orgId: ORG.vitara, entity: 'purchases', columns: ['number'], filters: [{ column: 'date', op: 'between', value: '2026-10-01', value2: '2026-10-18' }] });
    expect(recent.rows.every((r) => String(r.date) >= '2026-10-01' && String(r.date) <= '2026-10-18')).toBe(true);
  });

  it('groups a date column by month', () => {
    const r = runReport({ orgId: ORG.vitara, entity: 'farmers', columns: ['name'], filters: [], groupBy: 'registeredAt' });
    expect(r.groups!.every((g) => /^\d{4}-\d{2}$/.test(g.key))).toBe(true);
  });

  it('company isolation: Kakao Ivoire reports never return Vitara rows', () => {
    const r = runReport({ orgId: ORG.kakao, entity: 'payments', columns: ['reference'], filters: [] });
    const ids = new Set(usePaymentStore.getState().payments.filter((p) => p.orgId === ORG.vitara).map((p) => p.id));
    expect(r.rows.some((x) => ids.has(String(x.id)))).toBe(false);
  });

  it('library reports are read-only; copies can be saved, shared and deleted', () => {
    const lib = useSystemStore.getState().reports.find((r) => r.orgId === ORG.vitara && r.libraryKey === 'payments')!;
    expect(() => saveReport(ORG.vitara, 'u_kwame', { ...lib }, lib.id)).toThrow('libraryReadOnly');
    expect(deleteReport(lib.id)).toBe(false);
    const copy = copyReport(lib.id, 'My payments', 'u_kwame');
    expect(copy.libraryKey).toBeUndefined();
    expect(reportsFor(ORG.vitara, 'u_efua', []).some((r) => r.id === copy.id)).toBe(false);
    saveReport(ORG.vitara, 'u_kwame', { ...copy, sharedWithRoleIds: ['vitara_financeOfficer'] }, copy.id);
    expect(reportsFor(ORG.vitara, 'u_efua', ['vitara_financeOfficer']).some((r) => r.id === copy.id)).toBe(true);
    expect(deleteReport(copy.id)).toBe(true);
  });

  it('large exports run as a job whose link expires after 24 hours', () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(NOW);
    const rows = Array.from({ length: LARGE_EXPORT_ROWS + 50 }, (_, i) => [i, `Row ${i}`]);
    const small = startExport({ orgId: ORG.vitara, userId: 'u_kwame', name: 'Small', format: 'CSV', header: ['#', 'Name'], rows: rows.slice(0, 10) });
    expect(small.file).toBeInstanceOf(Blob);
    const big = startExport({ orgId: ORG.vitara, userId: 'u_kwame', name: 'Big', format: 'XLSX', header: ['#', 'Name'], rows });
    expect(big.job?.status).toBe('RUNNING');
    vi.advanceTimersByTime(10_000);
    const job = useSystemStore.getState().exports.find((e) => e.id === big.job!.id)!;
    expect(job.status).toBe('READY');
    expect(exportFile(job.id)).toBeInstanceOf(Blob);
    expect(exportFile(job.id, new Date(NOW.getTime() + 25 * 3_600_000))).toBe('expired');
    expect(useActivityStore.getState().audit.some((a) => a.key === 'export.downloaded' && a.actorId === 'u_kwame')).toBe(true);
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  it('schedules are due once per slot and email the roles', async () => {
    const r = useSystemStore.getState().reports.find((x) => x.orgId === ORG.vitara && x.schedule?.frequency === 'DAILY')!;
    expect(scheduleDue({ ...r.schedule!, lastSentAt: undefined }, 'Africa/Accra', NOW)).toBe(true);
    expect(scheduleDue({ ...r.schedule!, lastSentAt: NOW.toISOString() }, 'Africa/Accra', NOW)).toBe(false);
    useSystemStore.getState().saveReport({ ...r, schedule: { ...r.schedule!, lastSentAt: undefined } });
    const before = useNotificationStore.getState().outbox.length;
    const res = await runNow('reports', { orgId: ORG.vitara, by: 'u_ama' });
    expect(res.ok).toBe(true);
    expect(useNotificationStore.getState().outbox.length).toBeGreaterThan(before);
  });
});

describe('K3 sync logs and devices', () => {
  beforeAll(load);

  it('masks personal fields in payloads', () => {
    const m = maskPersonal({ records: [{ firstName: 'Abena', phone: '+233245551234', quantity: 120, gps: { lat: 10.1, lng: -2.5 } }] }) as { records: Record<string, unknown>[] };
    expect(m.records[0]!.firstName).not.toBe('Abena');
    expect(String(m.records[0]!.phone)).toContain('•');
    expect(m.records[0]!.quantity).toBe(120);
    expect(m.records[0]!.gps).toBe('•••');
  });

  it('a phone sync writes one log per type and moves the device last-seen', async () => {
    useMobileSessionStore.setState({ userId: 'u_yaw', orgId: ORG.vitara, online: false } as never);
    registerDemoDevice('u_yaw', ORG.vitara);
    registerSyncHandler('other', { apply: () => undefined });
    registerSyncHandler('farmer', { apply: () => { throw new Error('Farmer phone number already registered'); } });
    await saveOrQueue({ orgId: ORG.vitara, userId: 'u_yaw', type: 'other', label: 'Note', payload: { a: 1 } });
    await saveOrQueue({ orgId: ORG.vitara, userId: 'u_yaw', type: 'farmer', label: 'Farmer', payload: { firstName: 'Ama' } });
    useMobileSessionStore.setState({ online: true } as never);
    const before = useSystemStore.getState().syncLogs.length;
    vi.useRealTimers();
    await syncOutbox('u_yaw');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const logs = useSystemStore.getState().syncLogs.slice(0, useSystemStore.getState().syncLogs.length - before);
    // The download, the queued note (logged as master data) and the farmer.
    expect(logs.map((l) => l.type).sort()).toEqual(['farmers', 'masterData', 'masterData']);
    const farmers = logs.find((l) => l.type === 'farmers')!;
    expect(farmers.status).toBe('FAILED');
    expect(farmers.errorCode).toBe('DUPLICATE');
    useOutboxStore.setState({ items: [] });
  });

  it('require update and sign out block the next sync', async () => {
    const id = demoDeviceId('u_yaw');
    requireUpdate(id, 'u_ama');
    expect(syncBlock('u_yaw', ORG.vitara)).toBe('updateRequired');
    await expect(syncOutbox('u_yaw')).rejects.toThrow('updateRequired');
    expect(useSystemStore.getState().syncLogs[0]!.errorCode).toBe('VERSION');
    requireUpdate(id, 'u_ama', false);
    expect(syncBlock('u_yaw', ORG.vitara)).toBeUndefined();
    expect(signOutDevice(id, 'u_ama')).toBe(true);
    expect(syncBlock('u_yaw', ORG.vitara)).toBe('signedOut');
    expect(useActivityStore.getState().audit.some((a) => a.key === 'device.signedOut' && a.entityId === id)).toBe(true);
    registerDemoDevice('u_yaw', ORG.vitara);
    expect(syncBlock('u_yaw', ORG.vitara)).toBeUndefined();
  });

  it('compares versions against the company minimum', () => {
    expect(compareVersions('3.10.0', '3.9.2')).toBe(1);
    expect(compareVersions('3.8.0', '3.8')).toBe(0);
    expect(belowMinimum(ORG.vitara, '3.7.4')).toBe(true);
    expect(belowMinimum(ORG.vitara, '3.9.2')).toBe(false);
  });

  it('retention: logs past the company limit are purged on the next run', async () => {
    const later = new Date(NOW.getTime() + 10 * 86_400_000);
    const sum = retentionSummary(ORG.vitara, later);
    expect(sum.days.syncLogs).toBe(90);
    expect(sum.due).toBeGreaterThan(0);
    const r = purgeSyncLogs(ORG.vitara, later);
    expect(r.removed).toBe(sum.due);
    expect(retentionSummary(ORG.vitara, later).due).toBe(0);
    expect(new Date(retentionSummary(ORG.vitara, later).nextPurge).getTime()).toBeGreaterThan(later.getTime());
  });
});

describe('K2 notifications, K4 audit, K6 jobs, K7 help', () => {
  beforeAll(load);

  it('inbox groups by day and filters by kind', () => {
    const groups = inboxGroups(ORG.vitara, 'u_efua');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g, i) => i === 0 || g.day < groups[i - 1]!.day)).toBe(true);
    expect(inboxGroups(ORG.vitara, 'u_efua', 'PAYMENT').flatMap((g) => g.items).every((n) => n.kind === 'PAYMENT')).toBe(true);
  });

  it('a failed message can be sent again', () => {
    const failed = useNotificationStore.getState().outbox.find((m) => m.status === 'FAILED')!;
    const again = resendMessage(failed.id)!;
    expect(again.status === 'DELIVERED' || again.status === 'SENT').toBe(true);
    expect(resendMessage(again.id)).toBeUndefined();
  });

  it('audit diff lists only changed fields; queries stay inside the company', () => {
    expect(diff({ a: 1, b: { c: 2, d: 3 } }, { a: 1, b: { c: 5, d: 3 }, e: 'x' })).toEqual([{ path: 'b.c', before: 2, after: 5 }, { path: 'e', before: undefined, after: 'x' }]);
    const vit = queryAudit({ orgId: ORG.vitara });
    expect(vit.length).toBeGreaterThan(10);
    expect(vit.every((e) => e.orgId === ORG.vitara)).toBe(true);
    expect(vit.some((e) => e.ip && e.device)).toBe(true);
    expect(queryAudit({ orgId: ORG.vitara, key: 'settings.updated' }).every((e) => e.key === 'settings.updated')).toBe(true);
  });

  it('every job has a next run in the company time zone and records its runs', async () => {
    for (const j of JOBS) expect(nextRun(j.schedule, 'Africa/Abidjan', NOW).getTime()).toBeGreaterThan(NOW.getTime());
    // Weekly Monday 06:00 in Abidjan (UTC+0), from Sunday 18 Oct → Monday 19 Oct 06:00Z.
    expect(nextRun({ every: 'WEEKLY', weekday: 1, time: '06:00' }, 'Africa/Abidjan', NOW).toISOString()).toBe('2026-10-19T06:00:00.000Z');
    expect(nextRun({ every: 'MONTHLY', day: 1, time: '07:00' }, 'Africa/Accra', NOW).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    for (const key of ['retention', 'interest', 'cache', 'scores'] as const) {
      const r = await runNow(key, { orgId: ORG.vitara, by: 'u_ama' });
      expect(r.ok).toBe(true);
      expect(r.log.length).toBeGreaterThan(0);
    }
    expect(useSystemStore.getState().jobRuns[0]!.by).toBe('u_ama');
  });

  it('help: companies see global articles plus their own; search ranks titles first', () => {
    const vit = articlesFor(ORG.vitara);
    expect(vit.some((a) => !a.orgId)).toBe(true);
    expect(vit.some((a) => a.orgId === ORG.vitara)).toBe(true);
    expect(vit.some((a) => a.orgId === ORG.kakao)).toBe(false);
    expect(searchArticles(ORG.vitara, 'mobile money', 'en')[0]!.id).toBe('kb_payments');
    expect(searchArticles(ORG.kakao, 'cacao', 'fr').some((a) => a.id === 'kb_ki_campagne')).toBe(true);
    const a = saveArticle(ORG.vitara, 'u_ama', { title: 'Market day', body: '# Hello', category: 'buying', tags: ['market'], lang: 'en' });
    expect(articlesFor(ORG.vitara).some((x) => x.id === a.id)).toBe(true);
    expect(() => saveArticle(ORG.vitara, 'u_ama', { id: 'kb_start', title: 'x', body: 'y', category: 'basics', tags: [], lang: 'en' })).toThrow('globalReadOnly');
  });
});
