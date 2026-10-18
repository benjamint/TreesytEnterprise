import { getPath } from '@/lib/utils';

/** Metric engine (PRD 8.5): one definition drives plans, scores, commissions, dashboards and AI. */
export interface MetricDefinition {
  key: string;
  label: string;
  sourceEntity: string;
  filter?: { field: string; op: 'equals' | 'in' | 'gt' | 'lt'; value: unknown }[];
  aggregate: 'count' | 'sum' | 'distinct';
  field?: string;
  unit: string;
  attribution: 'plannedCommunities' | 'anywhere';
  dateField: string;
}

export interface MetricScope {
  from?: string;
  to?: string;
  agentId?: string;
  agentField?: string;
  plannedCommunityIds?: string[];
  communityField?: string;
}

type Row = Record<string, unknown>;

function passes(row: Row, f: NonNullable<MetricDefinition['filter']>[number]): boolean {
  const v = getPath(row, f.field);
  switch (f.op) {
    case 'equals': return v === f.value;
    case 'in': return Array.isArray(f.value) && f.value.includes(v);
    case 'gt': return Number(v) > Number(f.value);
    case 'lt': return Number(v) < Number(f.value);
  }
}

/** Rows counted by a metric — used for "drill into the records counted". */
export function metricRows(def: MetricDefinition, rows: Row[], scope: MetricScope = {}): Row[] {
  return rows.filter((r) => {
    const d = String(getPath(r, def.dateField) ?? '');
    if (scope.from && d < scope.from) return false;
    if (scope.to && d > scope.to) return false;
    if (scope.agentId && getPath(r, scope.agentField ?? 'agentId') !== scope.agentId) return false;
    if (def.attribution === 'plannedCommunities' && scope.plannedCommunityIds) {
      if (!scope.plannedCommunityIds.includes(String(getPath(r, scope.communityField ?? 'communityId')))) return false;
    }
    return (def.filter ?? []).every((f) => passes(r, f));
  });
}

export function computeMetric(def: MetricDefinition, rows: Row[], scope: MetricScope = {}): number {
  const counted = metricRows(def, rows, scope);
  if (def.aggregate === 'count') return counted.length;
  if (def.aggregate === 'distinct') return new Set(counted.map((r) => getPath(r, def.field ?? 'id'))).size;
  return counted.reduce((s, r) => s + Number(getPath(r, def.field ?? '') ?? 0), 0);
}
