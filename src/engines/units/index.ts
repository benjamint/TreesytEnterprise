import type { PackagingProfile, Unit } from '@/types';

/** Default units table (PRD 8.8). Companies copy and extend it in Settings → Units. */
export const DEFAULT_UNITS: Unit[] = [
  { id: 'kg', code: 'kg', kind: 'mass', toBase: 1 },
  { id: 'g', code: 'g', kind: 'mass', toBase: 0.001 },
  { id: 't', code: 't', kind: 'mass', toBase: 1000 },
  { id: 'lb', code: 'lb', kind: 'mass', toBase: 0.45359237 },
  { id: 'bag', code: 'bag', kind: 'count', toBase: 1 },
  { id: 'ha', code: 'ha', kind: 'area', toBase: 1 },
  { id: 'acre', code: 'acre', kind: 'area', toBase: 0.40468564 },
];

/**
 * Convert a quantity between units. Bags convert to mass using the packaging profile's
 * maximum fill (nominal bag weight) unless a nominal weight is passed.
 */
export function convert(
  qty: number,
  from: string,
  to: string,
  units: Unit[] = DEFAULT_UNITS,
  bag?: { nominalKg: number },
): number {
  if (from === to) return qty;
  const f = units.find((u) => u.id === from);
  const t = units.find((u) => u.id === to);
  if (!f || !t) throw new Error(`Unknown unit ${from} or ${to}`);
  if (f.kind === 'count' || t.kind === 'count') {
    if (!bag) throw new Error('Bag conversion needs a nominal bag weight');
    if (f.kind === 'count') return convert(qty * bag.nominalKg, 'kg', to, units);
    return convert(qty, from, 'kg', units) / bag.nominalKg;
  }
  if (f.kind !== t.kind) throw new Error(`Cannot convert ${f.kind} to ${t.kind}`);
  return (qty * f.toBase) / t.toBase;
}

export function nominalBagKg(p: PackagingProfile): number {
  return Math.round((p.minKg + p.maxKg) / 2);
}

export function withinBag(kg: number, p: PackagingProfile): boolean {
  return kg >= p.minKg && kg <= p.maxKg;
}
