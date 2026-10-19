import type { OrgSettings, PriceChange, PurchaseRequest } from '@/types';
import type { OpsResult } from './operations';

/**
 * Phase 7 details layered on the generated buying data, without drawing from the random stream
 * (so every earlier record stays the same): reconciliation outcomes (refunds, top-ups, write-offs),
 * request milestones, receipt signatures, bag history and price-list change history.
 */
export function enrichBuying(ops: OpsResult, settings: OrgSettings, financeUserId: string, today: Date, lang: 'en' | 'fr'): void {
  const DAY = 86_400_000;
  const H = 3_600_000;
  const iso = (t: number) => new Date(Math.min(t, today.getTime() - H)).toISOString();
  const sumOf = (xs: { amount: { amountMinor: number } }[] | undefined) => (xs ?? []).reduce((s, x) => s + x.amount.amountMinor, 0);
  const bought = new Map<string, number>();
  for (const p of ops.purchases) bought.set(p.requestId, (bought.get(p.requestId) ?? 0) + p.amount.amountMinor);
  const rules = settings.buyingRules;
  const later = ['RATE_CONFIRMED', 'PARTIAL_DISBURSEMENT', 'FULL_DISBURSEMENT', 'FUNDS_RECEIVED', 'TICKET_ACTIVATED', 'RECONCILED', 'ARCHIVED'];

  ops.requests.forEach((r: PurchaseRequest, i) => {
    const created = new Date(r.createdAt).getTime();
    if (later.includes(r.status) && r.status !== 'ARCHIVED') r.rateConfirmedAt = iso(created + 18 * H);
    const lastDisb = r.disbursements[r.disbursements.length - 1];
    if (r.fundsReceived && lastDisb) {
      r.fundsReceivedAt = iso(new Date(lastDisb.at).getTime() + 2 * H);
      r.receipt = { signature: `sig-${(i % 4) + 1}`, signedAt: r.fundsReceivedAt };
    }
    if (r.sourcingModel === 'DIRECT_PAYMENT' && ['TICKET_ACTIVATED', 'RECONCILED'].includes(r.status)) r.ticketActivatedAt = iso(created + 30 * H);
    if (r.reconciliationStatus !== 'RECONCILED') {
      // Open cash-advance requests with purchases: matched, waiting on the agent's refund.
      if (r.sourcingModel === 'CASH_ADVANCE' && r.fundsReceived && bought.get(r.id)) {
        r.autoMatched = true;
        const gap = sumOf(r.disbursements) - bought.get(r.id)!;
        r.reconciliationStatus = gap > 0 ? 'RECEIVE_REFUND' : gap < 0 ? 'REFUND_AGENT' : 'FULFILLED';
      }
      return;
    }
    const doneAt = iso(new Date(r.updatedAt).getTime() + DAY);
    r.reconciledAt = doneAt;
    if (r.sourcingModel === 'DIRECT_PAYMENT') { r.reconciledBy = financeUserId; return; }
    const given = sumOf(r.disbursements);
    const gap = given - (bought.get(r.id) ?? 0);
    const tolerance = Math.max(rules.reconToleranceMinor, Math.round((given * rules.reconTolerancePct) / 100));
    const cur = r.total.currency;
    if (Math.abs(gap) <= tolerance) {
      r.autoMatched = true;
      r.reconciledBy = 'system';
    } else if (gap > 0 && gap <= rules.writeOffLimitMinor && i % 4 === 0) {
      r.writeOffs = [{ id: `${r.id}_wo1`, amount: { amountMinor: gap, currency: cur }, reason: lang === 'fr' ? 'Perte d’humidité convenue avec l’agent' : 'Moisture loss agreed with the agent', at: doneAt, by: financeUserId }];
      r.reconciledBy = financeUserId;
    } else if (gap > 0) {
      r.autoMatched = true;
      r.refunds = [{ id: `${r.id}_rf1`, amount: { amountMinor: gap, currency: cur }, method: i % 3 === 0 ? 'MOMO_COLLECT' : 'MANUAL', at: doneAt, by: financeUserId, proof: i % 3 === 0 ? undefined : 'refund-slip.jpg' }];
      r.reconciledBy = financeUserId;
    } else {
      r.topUps = [{ id: `${r.id}_tu1`, amount: { amountMinor: -gap, currency: cur }, at: doneAt, by: financeUserId }];
      r.reconciledBy = financeUserId;
    }
  });

  // Bag history: bought → (in stock) received at the warehouse.
  const purchaseById = new Map(ops.purchases.map((p) => [p.id, p]));
  const reqById = new Map(ops.requests.map((r) => [r.id, r]));
  for (const b of ops.bags) {
    const first = purchaseById.get(b.purchaseIds[0]!)!;
    b.history = [{ at: first.createdAt, event: 'PURCHASED', ref: first.number, by: ops.agents.find((a) => a.id === first.agentId)?.userId }];
    if (b.status === 'IN_STOCK') {
      const r = reqById.get(first.requestId)!;
      const wh = ops.warehouses.find((w) => w.id === b.warehouseId);
      b.history.push({ at: iso(new Date(first.createdAt).getTime() + 3 * DAY), event: 'INBOUND', ref: r.number, by: wh?.officerUserIds[0], note: wh?.name });
    }
  }

  // Price list history: the current list replaced an older price on the first entries of each zone.
  const history: PriceChange[] = [];
  settings.priceList.forEach((p, i) => {
    if (i % 2 !== 0) return;
    const step = p.price.currency === 'XOF' ? 25 : 20;
    const from = p.price.amountMinor - step * (1 + (i % 3));
    history.push({ id: `${p.id}_ch1`, entryId: p.id, at: new Date(new Date(p.effectiveFrom).getTime()).toISOString(), by: financeUserId, fromMinor: from, toMinor: p.price.amountMinor });
    if (i % 4 === 0) history.push({ id: `${p.id}_ch0`, entryId: p.id, at: new Date(new Date(p.effectiveFrom).getTime() - 120 * DAY).toISOString(), by: financeUserId, fromMinor: from - step, toMinor: from });
  });
  settings.pricing = { ...settings.pricing, history: history.sort((a, b) => b.at.localeCompare(a.at)) };
}
