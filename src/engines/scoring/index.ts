/** Scoring engine (PRD 8.4). Components with boolean / linear-to-target / bands / manual rules. */
export interface ScoreComponent {
  id: string;
  name: string;
  metric: string;
  rule: 'boolean' | 'linear-to-target' | 'bands' | 'manual';
  target?: number;
  weight: number;
  bands?: { min: number; max: number; points: number }[];
}

export interface ScoreModel {
  id: string;
  entity: 'community' | 'farmer' | 'farmerGroup' | 'agent' | 'manager';
  agentTypeId?: string;
  period: 'year' | 'season' | 'quarter' | 'allTime';
  version: number;
  components: ScoreComponent[];
}

export interface ScoreBreakdown {
  total: number;
  parts: { componentId: string; value: number | null; points: number; weight: number; needsReview: boolean }[];
}

export function weightsValid(model: ScoreModel): boolean {
  return Math.round(model.components.reduce((s, c) => s + c.weight, 0)) === 100;
}

/** Points for one component (0..weight). Manual components without a value create a review task. */
export function componentPoints(c: ScoreComponent, value: number | null | undefined): number {
  if (value == null) return 0;
  switch (c.rule) {
    case 'boolean':
      return value ? c.weight : 0;
    case 'linear-to-target':
      return c.target ? Math.min(1, Math.max(0, value / c.target)) * c.weight : 0;
    case 'bands': {
      const band = (c.bands ?? []).find((b) => value >= b.min && value <= b.max);
      return band ? Math.min(c.weight, band.points) : 0;
    }
    case 'manual':
      return Math.min(c.weight, Math.max(0, value));
  }
}

/** Recalculation replaces old values (never adds to them). */
export function computeScore(model: ScoreModel, values: Record<string, number | null | undefined>): ScoreBreakdown {
  const parts = model.components.map((c) => {
    const v = values[c.metric];
    return { componentId: c.id, value: v ?? null, points: Math.round(componentPoints(c, v) * 100) / 100, weight: c.weight, needsReview: c.rule === 'manual' && v == null };
  });
  return { total: Math.round(parts.reduce((s, p) => s + p.points, 0) * 10) / 10, parts };
}
