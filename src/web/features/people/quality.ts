import type { QualityRule } from '@/engines/rules';

const fieldKey = (field: string) => `set.dq.fieldName.${field.replace('.', '_')}`;

/** What failed, in words: "Age outside 18–100", "Consent missing", "Phone already used in the company". */
export function ruleLabel(rule: QualityRule | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!rule) return '—';
  const field = t(fieldKey(rule.field), { defaultValue: rule.field });
  let value = '';
  if (rule.operator === 'between') value = (rule.value as [number, number]).join('–');
  else if (rule.operator === 'notEquals' || rule.operator === 'notContains') value = String(rule.value ?? '');
  else if (rule.operator === 'lessThanField') value = t(fieldKey(rule.crossField ?? ''), { defaultValue: rule.crossField ?? '' }).toLocaleLowerCase();
  else if (rule.operator === 'unique') value = t(`dq.scopeIn.${rule.duplicateScope ?? 'company'}`);
  return t(`dq.fail.${rule.operator}`, { field, value });
}

/** Fields an agent can correct on the phone for a rule (age is entered as an age). */
export function fixInput(field: string): 'number' | 'text' | 'phone' | 'consent' {
  if (field === 'phone') return 'phone';
  if (field === 'identity.consent') return 'consent';
  if (field === 'age' || /householdSize|numberOfChildren|population/.test(field)) return 'number';
  return 'text';
}
