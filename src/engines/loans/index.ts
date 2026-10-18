import { addDays, addMonths, isAfter, parseISO } from 'date-fns';
import type { LedgerEntry, LoanTerms, Money } from '@/types';

/**
 * Loan engine (PRD 8.9). Builds a farmer's loan ledger from principal, terms, the recovery window
 * and repayments, and quotes the settlement amount at any date. All amounts in minor units.
 */

export interface LoanRepayment {
  date: string;
  amountMinor: number;
  mode: 'CASH' | 'PRODUCE';
}

export interface LedgerRow {
  date: string;
  event: 'PRINCIPAL' | 'INTEREST' | 'PENALTY' | 'REPAYMENT' | 'SETTLED';
  charge: number;
  payment: number;
  /** Outstanding components after this row. */
  principal: number;
  interest: number;
  penalty: number;
  balance: number;
  note?: string;
}

export interface Ledger {
  rows: LedgerRow[];
  principal: number;
  interest: number;
  penalty: number;
  balance: number;
  /** Amount paid beyond the balance — owed back to the farmer. */
  overpaid: number;
  interestCharged: number;
  penaltyCharged: number;
  repaid: number;
  penaltyApplied: boolean;
  settled: boolean;
  /** Repayment is due after the window ends. */
  overdue: boolean;
}

/** Vitara template: 5% monthly compound after window end, 15% one-time cash penalty. */
export const VITARA_LOAN_TERMS: LoanTerms = {
  interestType: 'compound',
  period: 'monthly',
  rate: 0.05,
  graceStarts: 'windowEnd',
  penalty: { type: 'one-time-percent', trigger: 'onCashRepayment', rate: 0.15 },
  waterfall: ['penalty', 'interest', 'principal'],
  settlementTolerance: 1,
  rounding: 'up',
  maxCycles: 24,
};

const toDate = (d: string | Date) => (typeof d === 'string' ? parseISO(d) : d);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function round(v: number, mode: LoanTerms['rounding']): number {
  // Guard against float noise (e.g. 5250.0000001) before rounding up.
  const clean = Math.round(v * 1e6) / 1e6;
  return mode === 'up' ? Math.ceil(clean) : Math.round(clean);
}

export function buildLedger(
  principal: Money,
  terms: LoanTerms,
  window: { start: string; end: string },
  repayments: LoanRepayment[],
  asOf: string | Date,
  opts: { disbursedAt?: string } = {},
): Ledger {
  const asOfDate = toDate(asOf);
  const disbursedAt = opts.disbursedAt ?? window.start;
  let P = principal.amountMinor;
  let I = 0;
  let N = 0;
  let overpaid = 0;
  let interestCharged = 0;
  let penaltyCharged = 0;
  let repaid = 0;
  let penaltyApplied = false;
  let settled = false;
  const rows: LedgerRow[] = [];
  const push = (date: string, event: LedgerRow['event'], charge: number, payment: number, note?: string) =>
    rows.push({ date, event, charge, payment, principal: P, interest: I, penalty: N, balance: P + I + N - overpaid, note });

  push(iso(toDate(disbursedAt)), 'PRINCIPAL', P, 0);

  type Ev = { date: Date; kind: 'accrual' | 'late' | 'repayment'; r?: LoanRepayment };
  const events: Ev[] = [];
  const graceStart = toDate(terms.graceStarts === 'windowEnd' ? window.end : disbursedAt);
  if (terms.interestType !== 'none') {
    for (let k = 1; k <= terms.maxCycles; k++) {
      const d = terms.period === 'monthly' ? addMonths(graceStart, k) : addDays(graceStart, k);
      if (isAfter(d, asOfDate)) break;
      events.push({ date: d, kind: 'accrual' });
    }
  }
  const windowEnd = toDate(window.end);
  if (terms.penalty.trigger === 'onLate' && terms.penalty.type !== 'none' && !isAfter(windowEnd, asOfDate)) {
    events.push({ date: windowEnd, kind: 'late' });
  }
  for (const r of repayments) {
    if (!isAfter(toDate(r.date), asOfDate)) events.push({ date: toDate(r.date), kind: 'repayment', r });
  }
  const order = { late: 0, accrual: 1, repayment: 2 } as const;
  events.sort((a, b) => a.date.getTime() - b.date.getTime() || order[a.kind] - order[b.kind]);

  const applyPenalty = (date: Date, base: number) => {
    const amt = terms.penalty.type === 'flat' ? terms.penalty.rate : round(base * terms.penalty.rate, terms.rounding);
    if (amt <= 0) return;
    N += amt;
    penaltyCharged += amt;
    penaltyApplied = true;
    push(iso(date), 'PENALTY', amt, 0);
  };

  for (const ev of events) {
    if (settled && ev.kind !== 'repayment') continue;
    if (ev.kind === 'accrual') {
      if (P + I <= 0) continue;
      const base = terms.interestType === 'compound' ? P + I : P;
      const amt = round(base * terms.rate, terms.rounding);
      I += amt;
      interestCharged += amt;
      push(iso(ev.date), 'INTEREST', amt, 0);
    } else if (ev.kind === 'late') {
      if (P + I > 0) applyPenalty(ev.date, P + I);
    } else if (ev.r) {
      const r = ev.r;
      if (r.mode === 'CASH' && terms.penalty.type === 'one-time-percent' && terms.penalty.trigger === 'onCashRepayment' && !penaltyApplied && P + I > 0) {
        applyPenalty(ev.date, P + I);
      }
      let left = r.amountMinor;
      repaid += left;
      for (const part of terms.waterfall) {
        if (part === 'penalty') { const x = Math.min(left, N); N -= x; left -= x; }
        if (part === 'interest') { const x = Math.min(left, I); I -= x; left -= x; }
        if (part === 'principal') { const x = Math.min(left, P); P -= x; left -= x; }
      }
      overpaid += left;
      push(iso(ev.date), 'REPAYMENT', 0, r.amountMinor, r.mode);
      const bal = P + I + N;
      if (!settled && bal <= terms.settlementTolerance) {
        if (bal > 0) {
          P = 0; I = 0; N = 0;
          push(iso(ev.date), 'SETTLED', 0, 0, 'withinTolerance');
        }
        settled = true;
      }
    }
  }

  const balance = P + I + N;
  return {
    rows,
    principal: P,
    interest: I,
    penalty: N,
    balance,
    overpaid,
    interestCharged,
    penaltyCharged,
    repaid,
    penaltyApplied,
    settled: settled || balance <= 0,
    overdue: balance > 0 && isAfter(asOfDate, windowEnd),
  };
}

export interface SettlementQuote {
  amount: Money;
  penaltyIncluded: number;
  volumeKg?: number;
}

/** What the farmer must pay to settle at `asOf`, in cash or in produce. */
export function quote(
  principal: Money,
  terms: LoanTerms,
  window: { start: string; end: string },
  repayments: LoanRepayment[],
  asOf: string | Date,
  mode: 'cash' | 'produce',
  pricePerKg?: Money,
): SettlementQuote {
  const l = buildLedger(principal, terms, window, repayments, asOf);
  let penalty = 0;
  if (mode === 'cash' && terms.penalty.type === 'one-time-percent' && terms.penalty.trigger === 'onCashRepayment' && !l.penaltyApplied && l.balance > 0) {
    penalty = round((l.principal + l.interest) * terms.penalty.rate, terms.rounding);
  }
  const amountMinor = Math.max(0, l.balance + penalty);
  const out: SettlementQuote = { amount: { amountMinor, currency: principal.currency }, penaltyIncluded: penalty };
  if (mode === 'produce' && pricePerKg && pricePerKg.amountMinor > 0) {
    out.volumeKg = Math.ceil((amountMinor / pricePerKg.amountMinor) * 10) / 10;
  }
  return out;
}

/** Convert ledger rows to the stored LedgerEntry shape (PRD 11). */
export function toLedgerEntries(rows: LedgerRow[], currency: string): LedgerEntry[] {
  return rows
    .filter((r) => r.event !== 'SETTLED')
    .map((r) => ({
      date: r.date,
      type: r.event === 'REPAYMENT' ? 'REPAYMENT' : (r.event as LedgerEntry['type']),
      amount: { amountMinor: r.charge || r.payment, currency },
      balanceAfter: { amountMinor: r.balance, currency },
      note: r.note,
    }));
}
