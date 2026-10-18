/** Simulated QR / bag scanning (PRD 4.4): returns the next code in a queue, or a missing/replaced scenario. */
let queue: string[] = [];
export function loadScanQueue(codes: string[]) {
  queue = [...codes];
}
export function scanNext(): { code: string | null; scenario: 'OK' | 'MISSING' | 'REPLACED' } {
  const code = queue.shift() ?? null;
  if (!code) return { code: null, scenario: 'MISSING' };
  return { code, scenario: 'OK' };
}
