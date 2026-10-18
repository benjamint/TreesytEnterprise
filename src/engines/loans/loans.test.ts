import { describe, expect, it } from 'vitest';
import type { LoanTerms } from '@/types';
import { buildLedger, quote, toLedgerEntries, VITARA_LOAN_TERMS } from '.';

const GHS = (n: number) => ({ amountMinor: n, currency: 'GHS' });
const window = { start: '2026-06-01', end: '2026-11-30' };

describe('loan engine', () => {
  it('charges no interest inside the recovery window', () => {
    const l = buildLedger(GHS(100_000), VITARA_LOAN_TERMS, window, [], '2026-11-15');
    expect(l.balance).toBe(100_000);
    expect(l.overdue).toBe(false);
    expect(l.rows).toHaveLength(1);
  });

  it('compounds 5% monthly after the window ends (rounding up)', () => {
    const l = buildLedger(GHS(100_000), VITARA_LOAN_TERMS, window, [], '2027-01-31');
    expect(l.rows.filter((r) => r.event === 'INTEREST').map((r) => r.charge)).toEqual([5_000, 5_250]);
    expect(l.balance).toBe(110_250);
    expect(l.overdue).toBe(true);
  });

  it('applies the 15% cash penalty once and pays penalty → interest → principal', () => {
    const l = buildLedger(GHS(100_000), VITARA_LOAN_TERMS, window, [{ date: '2027-02-05', amountMinor: 50_000, mode: 'CASH' }], '2027-02-10');
    expect(l.penaltyCharged).toBe(16_538); // 15% of 110,250 rounded up
    expect(l.penalty).toBe(0);
    expect(l.interest).toBe(0);
    expect(l.principal).toBe(100_000 - (50_000 - 16_538 - 10_250));
    expect(l.balance).toBe(76_788);

    const again = buildLedger(GHS(100_000), VITARA_LOAN_TERMS, window, [
      { date: '2027-02-05', amountMinor: 50_000, mode: 'CASH' },
      { date: '2027-02-06', amountMinor: 1_000, mode: 'CASH' },
    ], '2027-02-10');
    expect(again.penaltyCharged).toBe(16_538);
  });

  it('does not penalise produce repayments', () => {
    const l = buildLedger(GHS(100_000), VITARA_LOAN_TERMS, window, [{ date: '2026-10-01', amountMinor: 40_000, mode: 'PRODUCE' }], '2026-11-01');
    expect(l.penaltyCharged).toBe(0);
    expect(l.balance).toBe(60_000);
  });

  it('settles within tolerance and reports overpayment', () => {
    const tol = buildLedger(GHS(100_000), VITARA_LOAN_TERMS, window, [{ date: '2026-10-01', amountMinor: 99_999, mode: 'PRODUCE' }], '2027-03-01');
    expect(tol.settled).toBe(true);
    expect(tol.balance).toBe(0);
    expect(tol.interestCharged).toBe(0);

    const over = buildLedger(GHS(100_000), VITARA_LOAN_TERMS, window, [{ date: '2026-10-01', amountMinor: 120_000, mode: 'PRODUCE' }], '2027-03-01');
    expect(over.overpaid).toBe(20_000);
  });

  it('quotes cash (with penalty) vs produce (with volume)', () => {
    const cash = quote(GHS(100_000), VITARA_LOAN_TERMS, window, [], '2027-01-31', 'cash');
    expect(cash.penaltyIncluded).toBe(16_538);
    expect(cash.amount.amountMinor).toBe(126_788);
    const produce = quote(GHS(100_000), VITARA_LOAN_TERMS, window, [], '2027-01-31', 'produce', GHS(500));
    expect(produce.amount.amountMinor).toBe(110_250);
    expect(produce.volumeKg).toBe(220.5);
  });

  it('supports simple interest with no penalty (Kakao Ivoire) and a cycle cap', () => {
    const terms: LoanTerms = { ...VITARA_LOAN_TERMS, interestType: 'simple', rate: 0.02, penalty: { type: 'none', trigger: 'onCashRepayment', rate: 0 }, rounding: 'nearest', maxCycles: 2 };
    const XOF = { amountMinor: 100_000, currency: 'XOF' };
    const l = buildLedger(XOF, terms, window, [{ date: '2027-03-15', amountMinor: 10_000, mode: 'CASH' }], '2027-06-01');
    expect(l.interestCharged).toBe(4_000);
    expect(l.penaltyCharged).toBe(0);
    expect(l.balance).toBe(94_000);
    expect(toLedgerEntries(l.rows, 'XOF').at(-1)).toMatchObject({ type: 'REPAYMENT', balanceAfter: { amountMinor: 94_000 } });
  });
});
