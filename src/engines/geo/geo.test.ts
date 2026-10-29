import { describe, expect, it } from 'vitest';
import { decimalsOf, overlapShare, pointInPolygon, polygonAreaHa, polygonsOverlap, selfIntersects, validateGeometry, walkBoundary, type LatLng } from '.';

// A 100 m × 100 m square near Wa (about 1 ha).
const sq = (lat: number, lng: number, d = 0.0009): LatLng[] => [[lat, lng], [lat, lng + d], [lat + d, lng + d], [lat + d, lng]];

describe('geo engine', () => {
  it('computes area in hectares', () => {
    expect(polygonAreaHa(sq(10.06, -2.5))).toBeCloseTo(0.99, 1);
    expect(polygonAreaHa([[1, 1], [1, 2]])).toBe(0);
  });

  it('counts decimal places', () => {
    expect(decimalsOf(10.123456)).toBe(6);
    expect(decimalsOf(10.1)).toBe(1);
    expect(decimalsOf(10)).toBe(0);
  });

  it('detects a bow-tie ring', () => {
    expect(selfIntersects(sq(10, -2))).toBe(false);
    expect(selfIntersects([[0, 0], [0, 1], [1, 0], [1, 1]])).toBe(true);
  });

  it('finds overlaps and point-in-polygon', () => {
    expect(pointInPolygon([10.0004, -2.4996], sq(10, -2.5))).toBe(true);
    expect(polygonsOverlap(sq(10, -2.5), sq(10.0004, -2.4996))).toBe(true);
    expect(polygonsOverlap(sq(10, -2.5), sq(10.01, -2.49))).toBe(false);
    expect(overlapShare(sq(10, -2.5), sq(10, -2.5, 0.002))).toBeCloseTo(1, 1);
  });

  it('validates a plot against the EUDR rules', () => {
    const rules = { minDecimals: 6, polygonOverHa: 4 };
    const good = walkBoundary({ lat: 6.12, lng: -6.6 });
    const v = validateGeometry({ polygon: good }, rules);
    expect(v).toMatchObject({ closed: true, selfIntersects: false, precisionOk: true, ok: true });
    expect(validateGeometry({ polygon: sq(6.1, -6.6) }, rules).precisionOk).toBe(false);
    expect(validateGeometry({ polygon: [], point: [6.123456, -6.654321], declaredAreaHa: 5 }, rules).needsPolygon).toBe(true);
    expect(validateGeometry({ polygon: good }, rules, [{ id: 'p2', polygon: good }]).overlaps).toEqual(['p2']);
  });
});
