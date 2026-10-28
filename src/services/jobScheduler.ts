import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { JobRun, ModuleKey } from '@/types';
import { latency, uid } from '@/lib/utils';
import { useSystemStore } from '@/stores/systemStore';

/** Scheduled jobs (PRD 4.4, K6): each has a schedule in the company time zone and can be run on demand. */
export type JobKey = 'achievements' | 'penalties' | 'allowances' | 'scores' | 'interest' | 'retention' | 'cache' | 'reports' | 'paymentPolling' | 'backups' | 'recoveryReminders';

export type JobSchedule =
  | { every: 'MINUTES'; minutes: number }
  | { every: 'HOURLY'; minute: number }
  | { every: 'DAILY'; time: string }
  | { every: 'WEEKLY'; weekday: number; time: string }
  | { every: 'MONTHLY'; day: number; time: string };

export interface JobDef { key: JobKey; schedule: JobSchedule; module?: ModuleKey; platformOnly?: boolean }

export const JOBS: JobDef[] = [
  { key: 'achievements', schedule: { every: 'WEEKLY', weekday: 0, time: '22:00' }, module: 'fieldTeam' },
  { key: 'penalties', schedule: { every: 'WEEKLY', weekday: 1, time: '06:00' }, module: 'fieldTeam' },
  { key: 'allowances', schedule: { every: 'MONTHLY', day: 1, time: '07:00' }, module: 'allowances' },
  { key: 'scores', schedule: { every: 'DAILY', time: '02:00' }, module: 'fieldTeam' },
  { key: 'interest', schedule: { every: 'DAILY', time: '01:00' }, module: 'recovery' },
  { key: 'recoveryReminders', schedule: { every: 'DAILY', time: '08:00' }, module: 'recovery' },
  { key: 'retention', schedule: { every: 'DAILY', time: '03:00' } },
  { key: 'cache', schedule: { every: 'MINUTES', minutes: 15 }, module: 'dashboard' },
  { key: 'reports', schedule: { every: 'HOURLY', minute: 0 }, module: 'reports' },
  { key: 'paymentPolling', schedule: { every: 'MINUTES', minutes: 5 }, module: 'payments' },
  { key: 'backups', schedule: { every: 'DAILY', time: '00:30' }, platformOnly: true },
];

export interface JobContext { orgId?: string; by: string }
type Handler = (ctx: JobContext) => Promise<string[] | void>;
const handlers = new Map<JobKey, Handler>();
export function registerJob(key: JobKey, run: Handler) {
  handlers.set(key, run);
}

/** Next run after `from`, computed in the company's time zone. */
export function nextRun(s: JobSchedule, timeZone: string, from = new Date()): Date {
  if (s.every === 'MINUTES') {
    const step = s.minutes * 60_000;
    return new Date(Math.floor(from.getTime() / step) * step + step);
  }
  if (s.every === 'HOURLY') {
    const d = new Date(from);
    d.setUTCMinutes(s.minute, 0, 0);
    return d > from ? d : new Date(d.getTime() + 3_600_000);
  }
  const at = (day: string) => fromZonedTime(`${day}T${s.time}:00`, timeZone);
  for (let i = 0; i < 62; i++) {
    const probe = new Date(from.getTime() + i * 86_400_000);
    const day = formatInTimeZone(probe, timeZone, 'yyyy-MM-dd');
    const weekday = Number(formatInTimeZone(probe, timeZone, 'i')) % 7;
    const dom = Number(formatInTimeZone(probe, timeZone, 'd'));
    const ok = s.every === 'DAILY' || (s.every === 'WEEKLY' && weekday === s.weekday) || (s.every === 'MONTHLY' && dom === s.day);
    if (ok && at(day) > from) return at(day);
  }
  return new Date(from.getTime() + 86_400_000);
}

/** Runs a job now and records the run with its log. */
export async function runNow(key: JobKey, ctx: JobContext = { by: 'system' }): Promise<{ ok: boolean; ms: number; log: string[]; run: JobRun }> {
  const t = performance.now();
  const startedAt = new Date().toISOString();
  let log: string[] = [];
  let ok = true;
  await latency();
  try {
    log = (await handlers.get(key)?.(ctx)) ?? [];
  } catch (e) {
    ok = false;
    log = [`error: ${(e as Error).message}`];
  }
  const ms = Math.round(performance.now() - t);
  const run: JobRun = { id: uid('job'), orgId: ctx.orgId, key, startedAt, ms, status: ok ? 'SUCCESS' : 'FAILED', by: ctx.by, log };
  useSystemStore.getState().addJobRun(run);
  return { ok, ms, log, run };
}
