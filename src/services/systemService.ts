import type { AuditEntry, Device, KbArticle, SyncErrorCode, SyncLog } from '@/types';
import { OUTBOX_SYNC_TYPE } from '@/data/catalogs/syncTypes';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useLoanStore } from '@/stores/loanStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSystemStore } from '@/stores/systemStore';
import type { OutboxItem } from '@/stores/outboxStore';
import { ledgerOf } from './recoveryService';
import { checkStatus } from './paymentService';
import { registerJob } from './jobScheduler';

/** Sync logs, devices, retention, audit and the help centre (PRD K2–K7). */
const S = () => useSystemStore.getState();
const settingsOf = (orgId: string) => useSettingsStore.getState().settings[orgId];
const DAY = 86_400_000;

// ---------------------------------------------------------------- App versions

/** -1, 0 or 1, comparing dotted versions numerically. */
export function compareVersions(a: string, b: string) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
export const belowMinimum = (orgId: string, version: string) => !!version && compareVersions(version, settingsOf(orgId)?.mobile.minAppVersion ?? '0') < 0;

/** Active devices per app version, newest version first. */
export function versionCounts(orgId: string) {
  const m = new Map<string, number>();
  for (const d of S().devices.filter((x) => x.orgId === orgId && x.status === 'ACTIVE')) m.set(d.appVersion, (m.get(d.appVersion) ?? 0) + 1);
  return [...m.entries()].map(([version, count]) => ({ version, count, below: belowMinimum(orgId, version) })).sort((a, b) => compareVersions(b.version, a.version));
}

// ---------------------------------------------------------------- Devices (K3)

/** The demo "phone" is this browser window: one device per person. */
export const demoDeviceId = (userId: string) => `dev_demo_${userId}`;
export const DEMO_APP_VERSION = '3.9.2';

export function registerDemoDevice(userId: string, orgId: string): Device {
  const prev = S().devices.find((d) => d.id === demoDeviceId(userId));
  const d: Device = {
    id: demoDeviceId(userId), orgId, userId, model: 'Demo phone (this browser)', os: 'ANDROID', osVersion: '14', appVersion: prev?.updateRequired ? prev.appVersion : DEMO_APP_VERSION,
    push: 'ACTIVE', lastSeenAt: new Date().toISOString(), status: 'ACTIVE', updateRequired: prev?.updateRequired,
  };
  S().saveDevice(d);
  return d;
}

export function devicesOf(userId: string) {
  return S().devices.filter((d) => d.userId === userId).sort((a, b) => (a.status === b.status ? b.lastSeenAt.localeCompare(a.lastSeenAt) : a.status === 'ACTIVE' ? -1 : 1));
}

function auditDevice(d: Device, key: string, before: unknown, after: unknown, actorId: string) {
  useActivityStore.getState().addAudit({ id: uid('aud'), orgId: d.orgId, actorId, entity: 'device', entityId: d.id, key, before, after, at: new Date().toISOString() });
}

/** Ends the device's session: the phone asks for sign-in next time it opens. */
export function signOutDevice(id: string, actorId: string) {
  const d = S().devices.find((x) => x.id === id);
  if (!d || d.status === 'SIGNED_OUT') return false;
  S().saveDevice({ ...d, status: 'SIGNED_OUT', signedOutAt: new Date().toISOString(), push: 'NONE' });
  auditDevice(d, 'device.signedOut', { status: 'ACTIVE' }, { status: 'SIGNED_OUT' }, actorId);
  return true;
}

/** The phone must update before it can sync again. */
export function requireUpdate(id: string, actorId: string, on = true) {
  const d = S().devices.find((x) => x.id === id);
  if (!d) return false;
  S().saveDevice({ ...d, updateRequired: on || undefined });
  auditDevice(d, on ? 'device.updateRequired' : 'device.updateCleared', { updateRequired: !!d.updateRequired }, { updateRequired: on }, actorId);
  return true;
}

/** The phone installed the update (demo): clears the flag and moves to the current version. */
export function installUpdate(id: string) {
  const d = S().devices.find((x) => x.id === id);
  if (d) S().saveDevice({ ...d, updateRequired: undefined, appVersion: DEMO_APP_VERSION, lastSeenAt: new Date().toISOString() });
}

/** Why a phone may not sync right now. */
export function syncBlock(userId: string, orgId: string): 'signedOut' | 'updateRequired' | undefined {
  const d = S().devices.find((x) => x.id === demoDeviceId(userId));
  if (d?.status === 'SIGNED_OUT') return 'signedOut';
  if (d?.updateRequired || (d && belowMinimum(orgId, d.appVersion))) return 'updateRequired';
  return undefined;
}

// ---------------------------------------------------------------- Sync logs (K3)

const errorCodeOf = (message?: string): SyncErrorCode | undefined => {
  if (!message) return undefined;
  if (/conflict/i.test(message)) return 'CONFLICT';
  if (/duplicate|already/i.test(message)) return 'DUPLICATE';
  if (/version|update/i.test(message)) return 'VERSION';
  if (/time ?out/i.test(message)) return 'TIMEOUT';
  if (/sign|session|auth/i.test(message)) return 'AUTH';
  return 'VALIDATION';
};

/** One log per sync type in a phone sync. Called by the mobile sync layer. */
export function logSync(userId: string, orgId: string, items: OutboxItem[], results: { id: string; outcome: 'synced' | 'conflict' | 'error'; error?: string }[], ms: number) {
  const device = S().devices.find((d) => d.id === demoDeviceId(userId));
  const at = new Date().toISOString();
  const byType = new Map<string, { items: OutboxItem[]; results: typeof results }>();
  for (const it of items) {
    const k = OUTBOX_SYNC_TYPE[it.type];
    const g = byType.get(k) ?? { items: [], results: [] };
    g.items.push(it);
    const r = results.find((x) => x.id === it.id);
    if (r) g.results.push(r);
    byType.set(k, g);
  }
  const logs: SyncLog[] = [{
    id: uid('sl'), orgId, userId, deviceId: device?.id, appVersion: device?.appVersion ?? DEMO_APP_VERSION, type: 'masterData', sent: 0, created: 0, updated: 0, failed: 0, status: 'SUCCESS', ms: Math.max(200, Math.round(ms / (byType.size + 1))), at,
    request: { since: useAgentStore.getState().agents.find((a) => a.userId === userId && a.orgId === orgId)?.lastSyncAt || null, appVersion: device?.appVersion ?? DEMO_APP_VERSION }, response: { downloaded: { forms: 'latest', priceLists: 'latest', optionLists: 'latest' } },
  }];
  for (const [type, g] of byType) {
    const failed = g.results.filter((r) => r.outcome !== 'synced');
    const ok = g.items.length - failed.length;
    const edits = g.items.filter((i) => i.base).length;
    const firstErr = failed[0] && (failed[0].outcome === 'conflict' ? 'The office changed this record after it was downloaded' : failed[0].error);
    logs.push({
      id: uid('sl'), orgId, userId, deviceId: device?.id, appVersion: device?.appVersion ?? DEMO_APP_VERSION, type, sent: g.items.length, created: Math.max(0, ok - edits), updated: Math.min(ok, edits), failed: failed.length,
      status: !failed.length ? 'SUCCESS' : ok ? 'PARTIAL' : 'FAILED', ms: Math.max(200, Math.round((ms * g.items.length) / Math.max(1, items.length))), at,
      request: { appVersion: device?.appVersion ?? DEMO_APP_VERSION, type, count: g.items.length, records: g.items.slice(0, 3).map((i) => ({ localId: i.id, label: i.label, ...(typeof i.payload === 'object' && i.payload ? i.payload : {}) })) },
      response: { created: Math.max(0, ok - edits), updated: Math.min(ok, edits), failed: failed.map((f) => ({ localId: f.id, message: f.outcome === 'conflict' ? 'conflict' : f.error })) },
      error: firstErr, errorCode: failed[0] ? (failed[0].outcome === 'conflict' ? 'CONFLICT' : errorCodeOf(failed[0].error)) : undefined,
    });
  }
  S().addSyncLogs(logs);
  if (device) S().saveDevice({ ...device, lastSeenAt: at });
  return logs;
}

/** A blocked sync (version or signed-out) is logged too, so the office sees why the phone is quiet. */
export function logBlockedSync(userId: string, orgId: string, reason: 'signedOut' | 'updateRequired', pending: number) {
  const device = S().devices.find((d) => d.id === demoDeviceId(userId));
  const log: SyncLog = {
    id: uid('sl'), orgId, userId, deviceId: device?.id, appVersion: device?.appVersion ?? DEMO_APP_VERSION, type: 'masterData', sent: pending, created: 0, updated: 0, failed: pending, status: 'FAILED', ms: 180, at: new Date().toISOString(),
    request: { appVersion: device?.appVersion }, response: { error: reason },
    error: reason === 'updateRequired' ? 'App version below the company minimum' : 'Session expired: sign in again with the PIN', errorCode: reason === 'updateRequired' ? 'VERSION' : 'AUTH',
  };
  S().addSyncLogs([log]);
  return log;
}

/** Field names whose values are personal and masked without `farmers.viewSensitive`. */
const SENSITIVE = /^(firstName|lastName|name|farmerName|phone|farmerPhone|idNumber|gps|lat|lng|dateOfBirth|wallet|number|payee|verifiedName)$/i;

export function maskPersonal(v: unknown, key = ''): unknown {
  if (Array.isArray(v)) return v.map((x) => maskPersonal(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SENSITIVE.test(k) ? mask(x) : maskPersonal(x, k)]));
  return SENSITIVE.test(key) ? mask(v) : v;
}
function mask(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'object') return '•••';
  const s = String(v);
  return s.length <= 3 ? '•••' : `${s.slice(0, 2)}${'•'.repeat(Math.min(8, s.length - 3))}${s.slice(-1)}`;
}

/** What the office should tell the agent for each kind of sync error. */
export const RETRY_GUIDANCE: Record<SyncErrorCode, string> = {
  DUPLICATE: 'sync.guide.DUPLICATE', VALIDATION: 'sync.guide.VALIDATION', CONFLICT: 'sync.guide.CONFLICT', TIMEOUT: 'sync.guide.TIMEOUT', VERSION: 'sync.guide.VERSION', AUTH: 'sync.guide.AUTH',
};

// ---------------------------------------------------------------- Retention (K3, Data & privacy)

export function retentionSummary(orgId: string, at = new Date()) {
  const days = settingsOf(orgId)?.privacy.retentionDays ?? { syncLogs: 90, payloads: 30, audio: 365, photos: 730, activity: 2555 };
  const logs = S().syncLogs.filter((l) => l.orgId === orgId);
  const cutoff = at.getTime() - days.syncLogs * DAY;
  const payloadCutoff = at.getTime() - days.payloads * DAY;
  const due = days.syncLogs ? logs.filter((l) => new Date(l.at).getTime() < cutoff).length : 0;
  const payloadsDue = days.payloads ? logs.filter((l) => !l.payloadPurged && new Date(l.at).getTime() < payloadCutoff).length : 0;
  const oldest = logs.reduce<string | undefined>((m, l) => (!m || l.at < m ? l.at : m), undefined);
  // The nightly purge runs at 03:00; the next one that removes something is the first after the oldest log ages out.
  const ageOut = oldest && days.syncLogs ? new Date(new Date(oldest).getTime() + days.syncLogs * DAY) : undefined;
  const nextNight = new Date(at); nextNight.setUTCHours(3, 0, 0, 0); if (nextNight <= at) nextNight.setUTCDate(nextNight.getUTCDate() + 1);
  const nextPurge = due || payloadsDue ? nextNight : ageOut && ageOut > nextNight ? new Date(Date.UTC(ageOut.getUTCFullYear(), ageOut.getUTCMonth(), ageOut.getUTCDate() + (ageOut.getUTCHours() >= 3 ? 1 : 0), 3)) : nextNight;
  return { days, total: logs.length, due, payloadsDue, oldest, nextPurge: nextPurge.toISOString() };
}

export function purgeSyncLogs(orgId: string, at = new Date()) {
  const { days } = retentionSummary(orgId, at);
  const logs = S().syncLogs.filter((l) => l.orgId === orgId);
  const remove = new Set(days.syncLogs ? logs.filter((l) => new Date(l.at).getTime() < at.getTime() - days.syncLogs * DAY).map((l) => l.id) : []);
  S().purgeSyncLogs(remove);
  const payloadCutoff = at.getTime() - days.payloads * DAY;
  let cleared = 0;
  if (days.payloads) {
    useSystemStore.setState((st) => ({
      syncLogs: st.syncLogs.map((l) => (l.orgId === orgId && !l.payloadPurged && new Date(l.at).getTime() < payloadCutoff ? (cleared++, { ...l, request: null, response: null, payloadPurged: true }) : l)),
    }));
  }
  return { removed: remove.size, cleared };
}

// ---------------------------------------------------------------- Audit (K4)

export interface DiffLine { path: string; before?: unknown; after?: unknown }

/** Flat list of the fields that changed between before and after. */
export function diff(before: unknown, after: unknown, path = ''): DiffLine[] {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(before) || isObj(after)) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    return [...new Set([...Object.keys(b), ...Object.keys(a)])].flatMap((k) => diff(b[k], a[k], path ? `${path}.${k}` : k));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path: path || '—', before, after }];
}

export interface AuditQuery { orgId?: string; actorId?: string; entity?: string; key?: string; from?: string; to?: string; q?: string }
export function queryAudit(q: AuditQuery): AuditEntry[] {
  const users = new Map(useAccessStore.getState().users.map((u) => [u.id, u.name.toLowerCase()]));
  return useActivityStore.getState().audit.filter((e) =>
    (!q.orgId || e.orgId === q.orgId) && (!q.actorId || e.actorId === q.actorId) && (!q.entity || e.entity === q.entity) && (!q.key || e.key === q.key)
    && (!q.from || e.at.slice(0, 10) >= q.from) && (!q.to || e.at.slice(0, 10) <= q.to)
    && (!q.q || `${e.entityId} ${e.key} ${users.get(e.actorId) ?? ''} ${JSON.stringify(e.after ?? '')}`.toLowerCase().includes(q.q.toLowerCase())),
  ).sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------- Notifications (K2)

export type InboxFilter = 'ALL' | 'UNREAD' | 'APPROVAL' | 'PAYMENT' | 'SYNC' | 'ALERT';
/** A user's inbox, newest first, grouped by day. */
export function inboxGroups(orgId: string, userId: string, filter: InboxFilter = 'ALL') {
  const list = useNotificationStore.getState().notifications
    .filter((n) => n.orgId === orgId && n.userId === userId && (filter === 'ALL' || (filter === 'UNREAD' ? !n.read : n.kind === filter)))
    .sort((a, b) => b.at.localeCompare(a.at));
  const groups = new Map<string, typeof list>();
  for (const n of list) { const d = n.at.slice(0, 10); groups.set(d, [...(groups.get(d) ?? []), n]); }
  return [...groups.entries()].map(([day, items]) => ({ day, items }));
}

/** Try a failed message again (simulated: it goes through this time). */
export function resendMessage(id: string) {
  const m = useNotificationStore.getState().outbox.find((x) => x.id === id);
  if (!m || m.status !== 'FAILED') return undefined;
  const again = { ...m, id: uid('out'), status: (m.channel === 'PUSH' ? 'SENT' : 'DELIVERED') as 'SENT' | 'DELIVERED', failureReason: undefined, at: new Date().toISOString() };
  useNotificationStore.getState().send(again);
  return again;
}

// ---------------------------------------------------------------- Help centre (K7)

/** Articles a company sees: the global ones and its own, in the viewer's language when written. */
export function articlesFor(orgId: string) {
  return S().articles.filter((a) => !a.orgId || a.orgId === orgId);
}
export const articleTitle = (a: KbArticle, lang: 'en' | 'fr') => a.title[lang] ?? a.title.en ?? a.title.fr ?? a.slug;
export const articleBody = (a: KbArticle, lang: 'en' | 'fr') => a.body[lang] ?? a.body.en ?? a.body.fr ?? '';

export function searchArticles(orgId: string, q: string, lang: 'en' | 'fr') {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = articlesFor(orgId);
  if (!words.length) return list;
  return list
    .map((a) => {
      const title = articleTitle(a, lang).toLowerCase();
      const body = articleBody(a, lang).toLowerCase();
      const tags = a.tags.join(' ').toLowerCase();
      const score = words.reduce((s, w) => s + (title.includes(w) ? 5 : 0) + (tags.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
      return { a, score, all: words.every((w) => title.includes(w) || body.includes(w) || tags.includes(w)) };
    })
    .filter((x) => x.all)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

export function saveArticle(orgId: string, actorId: string, input: { id?: string; title: string; body: string; category: string; tags: string[]; lang: 'en' | 'fr' }) {
  const prev = input.id ? S().articles.find((a) => a.id === input.id) : undefined;
  if (prev && !prev.orgId) throw new Error('globalReadOnly');
  const a: KbArticle = {
    id: prev?.id ?? uid('kb'), orgId, slug: prev?.slug ?? input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: { ...prev?.title, [input.lang]: input.title }, body: { ...prev?.body, [input.lang]: input.body }, category: input.category, tags: input.tags,
    updatedAt: new Date().toISOString(), updatedBy: actorId,
  };
  S().saveArticle(a);
  return a;
}

// ---------------------------------------------------------------- Job bodies (K6)

const orgList = (orgId?: string) => (orgId ? [orgId] : Object.keys(useSettingsStore.getState().settings));

registerJob('interest', async ({ orgId }) => {
  const out: string[] = [];
  for (const o of orgList(orgId)) {
    const loans = useLoanStore.getState().loans.filter((l) => l.orgId === o && l.status === 'ACTIVE');
    const interest = loans.reduce((s, l) => s + ledgerOf(l).interestCharged, 0);
    out.push(`loans accrued: ${loans.length}`, `interest to date (minor units): ${Math.round(interest)}`);
  }
  return out;
});

registerJob('retention', async ({ orgId }) => {
  const out: string[] = [];
  for (const o of orgList(orgId)) {
    const r = purgeSyncLogs(o);
    out.push(`sync logs purged: ${r.removed}`, `payloads cleared: ${r.cleared}`);
  }
  return out;
});

registerJob('cache', async ({ orgId }) => {
  const layouts = useDashboardStore.getState();
  const n = Object.keys((layouts as unknown as { layouts?: Record<string, unknown> }).layouts ?? {}).length;
  return [`dashboards refreshed${orgId ? '' : ' (all companies)'}: ${n || 1}`];
});

registerJob('paymentPolling', async ({ orgId }) => {
  const open = usePaymentStore.getState().payments.filter((p) => (!orgId || p.orgId === orgId) && (p.status === 'UNKNOWN' || p.status === 'PROCESSING'));
  let resolved = 0;
  for (const p of open) {
    const after = await checkStatus(p.id, 'system');
    if (after.status !== 'UNKNOWN' && after.status !== 'PROCESSING') resolved++;
  }
  return [`payments checked: ${open.length}`, `resolved: ${resolved}`];
});

registerJob('backups', async () => {
  const size = Object.keys(localStorage).filter((k) => k.startsWith('treesyt-demo:')).reduce((s, k) => s + (localStorage.getItem(k)?.length ?? 0), 0);
  return [`snapshot: ${Math.max(1, Math.round(size / 1024))} KB (demo data)`, 'copies: 2 regions', 'kept: 30 days'];
});
