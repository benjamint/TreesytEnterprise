import { describe, expect, it } from 'vitest';
import { emailDomain, oneTimeCode, passwordFailures, passwordStrength } from './authPolicy';

describe('auth policy', () => {
  it('checks the company password policy', () => {
    const kakao = { minLength: 10, requireNumber: true, requireSymbol: true, requireMixedCase: true };
    expect(passwordFailures('demo1234', kakao)).toEqual(['minLength', 'symbol', 'mixedCase']);
    expect(passwordFailures('Cacao-2026!x', kakao)).toEqual([]);
    expect(passwordFailures('abc', { minLength: 8, requireNumber: true, requireSymbol: false, requireMixedCase: false })).toEqual(['minLength', 'number']);
  });
  it('scores strength and makes codes', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('Shea-Butter-2026')).toBe(4);
    expect(oneTimeCode()).toMatch(/^\d{6}$/);
    expect(emailDomain('Ama.Mensah@Vitara.example')).toBe('vitara.example');
  });
});
