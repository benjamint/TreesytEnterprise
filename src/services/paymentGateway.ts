import { latency } from '@/lib/utils';

/**
 * Simulated mobile-money provider (PRD 4.4): name lookup, transfer and a status callback after 2–5 s,
 * with a 1-in-12 failure and a 1-in-40 "unknown". The full pay flow arrives in phase 8.
 */
export async function lookupName(number: string, knownName?: string): Promise<{ name: string; match: boolean }> {
  await latency();
  return { name: (knownName ?? 'KOFI ADDO').toUpperCase(), match: !!knownName && !number.endsWith('0') };
}

export async function transfer(): Promise<{ status: 'SUCCESSFUL' | 'FAILED' | 'UNKNOWN'; providerRef: string }> {
  await latency(2000, 5000);
  const r = Math.random();
  const status = r < 1 / 40 ? 'UNKNOWN' : r < 1 / 40 + 1 / 12 ? 'FAILED' : 'SUCCESSFUL';
  return { status, providerRef: `TX${Date.now().toString(36).toUpperCase()}` };
}
