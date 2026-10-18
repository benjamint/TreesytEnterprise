import type { FeeTier, Money } from '@/types';

/** Currency minor-unit table (PRD 8.8). Unknown currencies default to 2. */
export const MINOR_UNITS: Record<string, number> = { GHS: 2, XOF: 0, USD: 2, EUR: 2, KES: 2, NGN: 2, SEK: 2, GBP: 2 };

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency] ?? 2;
}

/** Convert a major-unit amount (e.g. 12.5 GHS) to integer minor units (1250). */
export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** minorUnits(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorUnits(currency);
}

export function money(amountMinor: number, currency: string): Money {
  return { amountMinor: Math.round(amountMinor), currency };
}

const fmtCache = new Map<string, Intl.NumberFormat>();

/** The only way money is formatted in the UI (PRD principle 6). */
export function formatMoney(
  minor: number,
  currency: string,
  locale = 'en-GH',
  opts: { compact?: boolean; hideCurrency?: boolean } = {},
): string {
  const digits = minorUnits(currency);
  const key = `${locale}|${currency}|${opts.compact ? 'c' : ''}|${opts.hideCurrency ? 'h' : ''}`;
  let fmt = fmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: opts.hideCurrency ? 'decimal' : 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: opts.compact ? 0 : digits,
      maximumFractionDigits: opts.compact ? 1 : digits,
      notation: opts.compact ? 'compact' : 'standard',
    });
    fmtCache.set(key, fmt);
  }
  // Normalise narrow/no-break spaces so output is stable across engines.
  return fmt.format(fromMinor(minor, currency)).replace(/[\u202f\u00a0]/g, ' ');
}

export function formatMoneyValue(m: Money, locale?: string, opts?: { compact?: boolean }): string {
  return formatMoney(m.amountMinor, m.currency, locale, opts);
}

function assertSame(a: Money, b: Money) {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
}

export function addMoney(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subMoney(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sumMoney(items: Money[], currency: string): Money {
  return money(items.reduce((s, m) => (assertSame(m, { amountMinor: 0, currency }), s + m.amountMinor), 0), currency);
}

/** Multiply a unit price by a quantity, rounding to the nearest minor unit. */
export function mulMoney(unit: Money, qty: number): Money {
  return money(Math.round(unit.amountMinor * qty), unit.currency);
}

export interface FeeQuote {
  amount: Money;
  fee: Money;
  tax: Money;
  extras: Money;
  /** What the company pays out in total. */
  total: Money;
  /** What lands in the payee's wallet. */
  received: Money;
  payer: 'company' | 'payee';
}

/**
 * Fee calculator (PRD 8.8). Picks the tier matching the amount for the provider; percent tiers
 * respect an optional cap. Tax is a percentage of the fee. When the payee pays, fees are deducted
 * from what they receive.
 */
export function calculateFees(
  amount: Money,
  tiers: FeeTier[],
  providerId: string,
  opts: { taxPct?: number; extras?: Money[] } = {},
): FeeQuote {
  const a = amount.amountMinor;
  const tier = tiers.find((t) => t.providerId === providerId && a >= t.minAmount && a <= t.maxAmount);
  let feeMinor = 0;
  if (tier) {
    feeMinor = tier.type === 'percent' ? Math.round((a * tier.value) / 100) : tier.value;
    if (tier.cap != null) feeMinor = Math.min(feeMinor, tier.cap);
  }
  const taxMinor = Math.round((feeMinor * (opts.taxPct ?? 0)) / 100);
  const extrasMinor = (opts.extras ?? []).reduce((s, e) => s + e.amountMinor, 0);
  const payer = tier?.payer ?? 'company';
  const c = amount.currency;
  const charges = feeMinor + taxMinor;
  return {
    amount,
    fee: money(feeMinor, c),
    tax: money(taxMinor, c),
    extras: money(extrasMinor, c),
    total: money(a + extrasMinor + (payer === 'company' ? charges : 0), c),
    received: money(a + extrasMinor - (payer === 'payee' ? charges : 0), c),
    payer,
  };
}
