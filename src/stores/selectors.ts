import type { Purchase, PurchaseRequest } from '@/types';

/** Unreconciled cash an agent holds: money received on open requests minus what they bought. */
export function agentCashHeld(agentId: string, requests: PurchaseRequest[], purchases: Purchase[]): number {
  let held = 0;
  for (const r of requests) {
    if (r.agentId !== agentId || !r.fundsReceived || r.reconciliationStatus === 'RECONCILED') continue;
    const given = r.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
    const bought = purchases.filter((p) => p.requestId === r.id).reduce((s, p) => s + p.amount.amountMinor, 0);
    held += given - bought;
  }
  return held;
}
