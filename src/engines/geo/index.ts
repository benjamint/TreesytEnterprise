/**
 * Plot geometry (PRD I4): area on a local projection, ring checks, self-intersection, overlaps and
 * coordinate precision. Coordinates are [lat, lng]; rings are open (the first point is not repeated).
 */

export type LatLng = [number, number];

/** Shoelace area on a local equirectangular projection, in hectares (2 decimals). */
export function polygonAreaHa(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const lat0 = (points.reduce((s, p) => s + p[0], 0) / points.length) * (Math.PI / 180);
  const xy = points.map(([la, lo]) => [lo * 111_320 * Math.cos(lat0), la * 110_540] as const);
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i]!; const [x2, y2] = xy[(i + 1) % xy.length]!; a += x1 * y2 - x2 * y1; }
  return Math.round((Math.abs(a) / 2 / 10_000) * 100) / 100;
}

export const HA_PER_ACRE = 0.404686;

export function centroid(points: LatLng[]): LatLng {
  if (!points.length) return [0, 0];
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

/** Decimal places written in a coordinate (6+ needed for EUDR, about 0.1 m). */
export function decimalsOf(n: number): number {
  const s = String(n);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

const orient = (a: LatLng, b: LatLng, c: LatLng) => Math.sign((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]));

/** Proper crossing of segments ab and cd (touching at shared endpoints does not count). */
export function segmentsCross(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function selfIntersects(points: LatLng[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i]!, b = points[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
      if (segmentsCross(a, b, points[j]!, points[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

export function pointInPolygon(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!; const [yj, xj] = ring[j]!;
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Two rings overlap when an edge crosses or one has a vertex inside the other. */
export function polygonsOverlap(a: LatLng[], b: LatLng[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const box = (r: LatLng[]) => [Math.min(...r.map((p) => p[0])), Math.max(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[1]))];
  const [a0, a1, a2, a3] = box(a), [b0, b1, b2, b3] = box(b);
  if (a1! < b0! || b1! < a0! || a3! < b2! || b3! < a2!) return false;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segmentsCross(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true;
  return a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a));
}

/** Fraction of ring `a` inside ring `b`, sampled on a grid (simulated overlay). */
export function overlapShare(a: LatLng[], b: LatLng[], grid = 12): number {
  if (!polygonsOverlap(a, b)) return 0;
  const la = a.map((p) => p[0]), lo = a.map((p) => p[1]);
  const [minLa, maxLa, minLo, maxLo] = [Math.min(...la), Math.max(...la), Math.min(...lo), Math.max(...lo)];
  let inA = 0, both = 0;
  for (let i = 0; i <= grid; i++) for (let j = 0; j <= grid; j++) {
    const p: LatLng = [minLa + ((maxLa - minLa) * i) / grid, minLo + ((maxLo - minLo) * j) / grid];
    if (!pointInPolygon(p, a)) continue;
    inA++;
    if (pointInPolygon(p, b)) both++;
  }
  return inA ? both / inA : 0;
}

export interface GeometryCheck { closed: boolean; selfIntersects: boolean; decimals: number; precisionOk: boolean; needsPolygon: boolean; overlaps: string[]; ok: boolean }

/** Validation shown on the plot and on the phone while mapping. */
export function validateGeometry(
  g: { polygon: LatLng[]; point?: LatLng; declaredAreaHa?: number },
  rules: { minDecimals: number; polygonOverHa: number },
  others: { id: string; polygon: LatLng[] }[] = [],
): GeometryCheck {
  const isPoint = g.polygon.length === 0;
  const coords = isPoint ? (g.point ? [g.point] : []) : g.polygon;
  const decimals = coords.length ? Math.min(...coords.flatMap((p) => [decimalsOf(p[0]), decimalsOf(p[1])])) : 0;
  const closed = isPoint || g.polygon.length >= 3;
  const si = !isPoint && selfIntersects(g.polygon);
  const area = isPoint ? g.declaredAreaHa ?? 0 : polygonAreaHa(g.polygon);
  const needsPolygon = isPoint && area > rules.polygonOverHa;
  const overlaps = isPoint ? [] : others.filter((o) => polygonsOverlap(g.polygon, o.polygon)).map((o) => o.id);
  const precisionOk = decimals >= rules.minDecimals;
  return { closed, selfIntersects: si, decimals, precisionOk, needsPolygon, overlaps, ok: closed && !si && precisionOk && !needsPolygon && overlaps.length === 0 };
}

/** Round coordinates to n decimals (GPS on phones reports 6–7). */
export const roundTo = (p: LatLng, n = 6): LatLng => [Number(p[0].toFixed(n)), Number(p[1].toFixed(n))];

/**
 * Simulated boundary walk: points along a loop around `base`, like a phone recording every few
 * metres. Deterministic for a given seed so a demo can be replayed.
 */
export function walkBoundary(base: { lat: number; lng: number }, opts: { points?: number; radius?: number; seed?: number } = {}): LatLng[] {
  const n = opts.points ?? 12;
  const r = opts.radius ?? 0.0011;
  let s = opts.seed ?? 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s % 10_000) / 10_000; };
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.82 + rnd() * 0.3;
    return gpsReading([base.lat + Math.sin(a) * r * k, base.lng + Math.cos(a) * r * 1.25 * k]);
  });
}

/** A coordinate as a phone reports it: 7 decimals, never with trailing zeros dropped below 6. */
export function gpsReading(p: LatLng): LatLng {
  const fix = (v: number) => { let x = Number(v.toFixed(7)); while (decimalsOf(x) < 7) x = Number((x + 1e-7).toFixed(7)); return x; };
  return [fix(p[0]), fix(p[1])];
}

/**
 * Where a farmer's new farm lies from the village centre in the demo: the phone's simulated walk
 * starts here (M9 "Map a plot"), and the seeded forest-loss layer has an area just there for the
 * EUDR journey.
 */
export const NEW_FARM_OFFSET: LatLng = [0.0062, 0.0048];
