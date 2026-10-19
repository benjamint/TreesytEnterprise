import type { AggregatorPurchase, BuyingRules, Money } from '@/types';
import { minorUnits } from '@/engines/money';

/**
 * Aggregator purchase reconciliation (PRD D4): money and volume side by side.
 * Money is compared in the company currency: what was paid to the supplier against the value
 * delivered (proof kg × unit price, converted with the deal rate), plus refunds either way.
 */

/** A deal-currency amount in the company currency, using the purchase's exchange rate. */
export function toCompany(m: Money, rate: number, companyCurrency: string): Money {
  if (m.currency === companyCurrency) return m;
  const major = m.amountMinor / 10 ** minorUnits(m.currency);
  return { amountMinor: Math.round(major * rate * 10 ** minorUnits(companyCurrency)), currency: companyCurrency };
}

export interface AggResult {
  currency: string;
  /** Contract value in the company currency. */
  contract: number;
  paid: number;
  remainingToPay: number;
  delivered: number;
  goodsRefund: number;
  moneyReceived: number;
  paidToSupplier: number;
  /** Positive: the supplier owes the company. Negative: the company owes the supplier. */
  gap: number;
  tolerance: number;
  status: AggregatorPurchase['paymentStatus'];
  kg: { expected: number; loaded: number; delivered: number; goodsRefund: number; variance: number; variancePct: number };
}

export function aggResult(a: AggregatorPurchase, rules: Pick<BuyingRules, 'reconToleranceMinor' | 'reconTolerancePct'>, companyCurrency: string): AggResult {
  const conv = (m: Money) => toCompany(m, a.exchangeRate, companyCurrency).amountMinor;
  const contract = conv(a.total);
  const paid = a.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0);
  const refunds = a.refunds ?? [];
  const price = a.proof?.unitPrice ?? a.unitPrice;
  const kgValue = (kg: number) => conv({ amountMinor: Math.round(kg * price.amountMinor), currency: price.currency });
  const deliveredKg = a.proof?.kg ?? 0;
  const goodsKg = refunds.filter((r) => r.kind === 'RECEIVE' && r.method === 'GOODS').reduce((s, r) => s + (r.kg ?? 0), 0);
  const delivered = a.proof ? kgValue(deliveredKg) : 0;
  const goodsRefund = kgValue(goodsKg);
  const moneyReceived = refunds.filter((r) => r.kind === 'RECEIVE' && r.method === 'MONEY').reduce((s, r) => s + (r.amount?.amountMinor ?? 0), 0);
  const paidToSupplier = refunds.filter((r) => r.kind === 'SUPPLIER').reduce((s, r) => s + (r.amount?.amountMinor ?? 0), 0);
  const gap = paid + paidToSupplier - delivered - goodsRefund - moneyReceived;
  const tolerance = Math.max(rules.reconToleranceMinor, Math.round((Math.max(paid, contract) * rules.reconTolerancePct) / 100));
  let status: AggregatorPurchase['paymentStatus'] = 'NONE';
  if (a.reconciledAt) status = 'RECONCILED';
  else if (a.proof) status = Math.abs(gap) <= tolerance ? (refunds.length ? 'RECONCILED' : 'FULFILLED') : gap > 0 ? 'RECEIVE_REFUND' : 'REFUND_SUPPLIER';
  const totalKg = deliveredKg + goodsKg;
  return {
    currency: companyCurrency, contract, paid, remainingToPay: Math.max(0, contract - paid), delivered, goodsRefund, moneyReceived, paidToSupplier, gap, tolerance, status,
    kg: {
      expected: a.expectedKg, loaded: a.delivery?.kg ?? 0, delivered: deliveredKg, goodsRefund: goodsKg, variance: Math.round((totalKg - a.expectedKg) * 10) / 10,
      variancePct: a.expectedKg ? Math.round(((totalKg - a.expectedKg) / a.expectedKg) * 1000) / 10 : 0,
    },
  };
}
