/** Tiny colour helpers for company branding overrides (PRD 6.1 "Company branding override"). */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(a[i]! * (1 - t) + b[i]! * t)) as [number, number, number];
}

export const channels = (c: [number, number, number]) => c.join(' ');

/** Brand token triple (brand, hover, soft) for light or dark mode from one primary colour. */
export function brandTokens(primary: string, dark: boolean) {
  const base = hexToRgb(primary);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  if (!dark) return { brand: base, hover: mix(base, black, 0.18), soft: mix(base, white, 0.9) };
  const light = mix(base, white, 0.38);
  return { brand: light, hover: mix(base, white, 0.5), soft: mix(base, [10, 20, 16], 0.8) };
}
