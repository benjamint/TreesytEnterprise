import { getPath } from '@/lib/utils';

/** Data-quality rules engine (PRD 8.6). Runs on create/sync and writes flags with reasons. */
export interface QualityRule {
  id: string;
  entity: 'farmer' | 'community' | 'farmerGroup';
  field: string;
  operator: 'between' | 'notEmpty' | 'notEquals' | 'notContains' | 'unique' | 'lessThanField';
  value?: unknown;
  crossField?: string;
  duplicateScope?: 'company' | 'community';
  severity: 'info' | 'warning' | 'block';
  enabled: boolean;
  note?: string;
}

export interface QualityFlag {
  ruleId: string;
  recordId: string;
  severity: QualityRule['severity'];
  params: Record<string, unknown>;
}

type Row = { id: string } & Record<string, unknown>;

export function runRule(rule: QualityRule, row: Row, all: Row[] = []): QualityFlag | null {
  if (!rule.enabled) return null;
  const v = getPath(row, rule.field);
  let bad = false;
  switch (rule.operator) {
    case 'between': {
      const [lo, hi] = rule.value as [number, number];
      bad = v != null && (Number(v) < lo || Number(v) > hi);
      break;
    }
    case 'notEmpty':
      bad = v == null || v === '';
      break;
    case 'notEquals':
      bad = String(v ?? '').toLowerCase() === String(rule.value).toLowerCase();
      break;
    case 'notContains':
      bad = Array.isArray(v) ? v.map((x) => String(x).toLowerCase()).includes(String(rule.value).toLowerCase()) : String(v ?? '').toLowerCase().includes(String(rule.value).toLowerCase());
      break;
    case 'unique': {
      if (v == null || v === '') break;
      const scopeVal = rule.duplicateScope === 'community' ? getPath(row, 'communityId') : null;
      bad = all.some((o) => o.id !== row.id && getPath(o, rule.field) === v && (scopeVal == null || getPath(o, 'communityId') === scopeVal));
      break;
    }
    case 'lessThanField': {
      const other = rule.crossField != null ? getPath(row, rule.crossField) : null;
      bad = v != null && other != null && Number(v) >= Number(other);
      break;
    }
      break;
  }
  return bad ? { ruleId: rule.id, recordId: row.id, severity: rule.severity, params: { field: rule.field, value: v } } : null;
}

export function runRules(rules: QualityRule[], rows: Row[]): QualityFlag[] {
  return rows.flatMap((r) => rules.map((rule) => runRule(rule, r, rows)).filter((f): f is QualityFlag => f !== null));
}

/** Fields computed for rules that aren't stored (a farmer's age from date of birth). */
export function withDerived(entity: QualityRule['entity'], row: Row, now = new Date()): Row {
  if (entity !== 'farmer' || !row.dateOfBirth) return row;
  const age = Math.floor((now.getTime() - new Date(String(row.dateOfBirth)).getTime()) / 31_557_600_000);
  return { ...row, age };
}

/** Run a company's enabled rules for one entity over its records (duplicates checked across all of them). */
export function checkEntity(rules: QualityRule[], entity: QualityRule['entity'], rows: Row[], now = new Date(), only?: Set<string>): QualityFlag[] {
  const own = rules.filter((r) => r.entity === entity && r.enabled);
  if (!own.length) return [];
  const derived = rows.map((r) => withDerived(entity, r, now));
  return derived.filter((r) => !only || only.has(r.id)).flatMap((r) => own.map((rule) => runRule(rule, r, derived)).filter((f): f is QualityFlag => f !== null));
}
