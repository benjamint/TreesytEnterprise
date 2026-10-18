import { describe, expect, it } from 'vitest';
import { addMoney, calculateFees, formatMoney, fromMinor, money, mulMoney, sumMoney, toMinor } from '.';
import type { FeeTier } from '@/types';

describe('money engine', () => {
  it('converts using the minor-unit table', () => {
    expect(toMinor(12.5, 'GHS')).toBe(1250);
    expect(toMinor(2800, 'XOF')).toBe(2800);
    expect(fromMinor(1250, 'GHS')).toBe(12.5);
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30);
  });

  it('formats GHS with 2 decimals and XOF with none', () => {
    expect(formatMoney(1240000, 'GHS', 'en-GH')).toBe('GHS 12,400.00');
    const xof = formatMoney(2000000, 'XOF', 'fr-CI');
    expect(xof).toContain('2 000 000');
    expect(xof).toContain('XOF');
    expect(xof).not.toContain(',');
  });

  it('adds and refuses mixed currencies', () => {
    expect(addMoney(money(100, 'GHS'), money(50, 'GHS')).amountMinor).toBe(150);
    expect(() => addMoney(money(100, 'GHS'), money(50, 'XOF'))).toThrow();
    expect(sumMoney([money(1, 'EUR'), money(2, 'EUR')], 'EUR').amountMinor).toBe(3);
  });

  it('multiplies unit prices with rounding', () => {
    expect(mulMoney(money(555, 'GHS'), 1.5).amountMinor).toBe(833);
  });

  it('calculates fees from tiers with caps, tax and payer', () => {
    const tiers: FeeTier[] = [
      { id: 't1', providerId: 'mtn', minAmount: 0, maxAmount: 100000, type: 'percent', value: 1, payer: 'company' },
      { id: 't2', providerId: 'mtn', minAmount: 100001, maxAmount: 10 ** 12, type: 'percent', value: 1, cap: 1500, payer: 'company' },
      { id: 't3', providerId: 'wave', minAmount: 0, maxAmount: 10 ** 12, type: 'flat', value: 100, payer: 'payee' },
    ];
    const small = calculateFees(money(50000, 'GHS'), tiers, 'mtn', { taxPct: 10 });
    expect(small.fee.amountMinor).toBe(500);
    expect(small.tax.amountMinor).toBe(50);
    expect(small.total.amountMinor).toBe(50550);

    const capped = calculateFees(money(1000000, 'GHS'), tiers, 'mtn');
    expect(capped.fee.amountMinor).toBe(1500);

    const payee = calculateFees(money(5000, 'XOF'), tiers, 'wave', { extras: [money(500, 'XOF')] });
    expect(payee.total.amountMinor).toBe(5500);
    expect(payee.received.amountMinor).toBe(5400);
  });
});
