import { describe, expect, it } from 'vitest';
import { computeScore, weightsValid, type ScoreModel } from '.';

describe('scoring engine', () => {
  it('scores the Vitara community template parts', () => {
    const m: ScoreModel = {
      id: 'c', entity: 'community', period: 'year', version: 1,
      components: [
        { id: 'vsla', name: 'VSLA', metric: 'hasVsla', rule: 'boolean', weight: 5 },
        { id: 'buy', name: 'Purchases', metric: 'kg', rule: 'linear-to-target', target: 8700, weight: 35 },
        { id: 'train', name: 'Training', metric: 'workshops', rule: 'linear-to-target', target: 4, weight: 15 },
        { id: 'minutes', name: 'Minutes', metric: 'minutes', rule: 'manual', weight: 45 },
      ],
    };
    expect(weightsValid(m)).toBe(true);
    const s = computeScore(m, { hasVsla: 1, kg: 4350, workshops: 8 });
    expect(s.total).toBe(5 + 17.5 + 15);
    expect(s.parts.find((p) => p.componentId === 'minutes')?.needsReview).toBe(true);
  });
});
