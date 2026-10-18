import type { OrgSettings } from '@/types';

/** Password rules from the company's security policy (PRD A2). Pure, so it can be tested. */
export type PasswordRule = 'minLength' | 'number' | 'symbol' | 'mixedCase';

export function passwordFailures(pw: string, policy: OrgSettings['security']['passwordPolicy']): PasswordRule[] {
  const out: PasswordRule[] = [];
  if (pw.length < policy.minLength) out.push('minLength');
  if (policy.requireNumber && !/\d/.test(pw)) out.push('number');
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(pw)) out.push('symbol');
  if (policy.requireMixedCase && !(/[a-z]/.test(pw) && /[A-Z]/.test(pw))) out.push('mixedCase');
  return out;
}

/** 0 (empty) … 4 (strong), for the sign-up strength meter. */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  return Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
}

export const DEFAULT_POLICY: OrgSettings['security']['passwordPolicy'] = { minLength: 8, requireNumber: true, requireSymbol: false, requireMixedCase: false };

/** Six-digit one-time code. */
export function oneTimeCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}
