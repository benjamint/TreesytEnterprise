import { latency } from '@/lib/utils';

/** Scheduled jobs (PRD 4.4): every job can be run on demand. Job bodies are wired in their phases. */
export type JobKey = 'achievements' | 'penalties' | 'allowances' | 'scores' | 'interest' | 'retention' | 'cache' | 'reports' | 'paymentPolling' | 'backups';
const handlers = new Map<JobKey, () => Promise<void>>();
export function registerJob(key: JobKey, run: () => Promise<void>) {
  handlers.set(key, run);
}
export async function runNow(key: JobKey): Promise<{ ok: boolean; ms: number }> {
  const t = performance.now();
  await latency();
  await handlers.get(key)?.();
  return { ok: true, ms: Math.round(performance.now() - t) };
}
