import { getPath } from '@/lib/utils';

/** Data-quality rules engine (PRD 8.6). Runs on create/sync and writes flags with reasons. */
export interface QualityRule {
  id: string;
  entity: 'farmer' | 'community' | 'farmerGroup';
  field: string;
  operator: 'between' | 'notEmpty' | 'notEquals' | 'unique' | 'lessThanField';
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
    case 'unique': {
      if (v == null || v === '') break;
      const scopeVal = rule.duplicateScope === 'community' ? getPath(row, 'communityId') : null;
      bad = all.some((o) => o.id !== row.id && getPath(o, rule.field) === v && (scopeVal == null || getPath(o, 'communityId') === scopeVal));
      break;
    }
    case 'lessThanField':
      bad = rule.crossField != null && Number(v) >= Number(getPath(row, rule.crossField));
      break;
  }
  return bad ? { ruleId: rule.id, recordId: row.id, severity: rule.severity, params: { field: rule.field, value: v } } : null;
}

export function runRules(rules: QualityRule[], rows: Row[]): QualityFlag[] {
  return rows.flatMap((r) => rules.map((rule) => runRule(rule, r, rows)).filter((f): f is QualityFlag => f !== null));
}
