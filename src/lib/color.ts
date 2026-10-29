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

/** WCAG relative luminance and contrast ratio. */
export function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: [number, number, number], b: [number, number, number]) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
/** White text when it reads at AA on the colour, otherwise near-black (PRD 15: contrast AA). */
export function textOn(bg: [number, number, number] | string): [number, number, number] {
  const c = typeof bg === 'string' ? hexToRgb(bg) : bg;
  return contrast(c, [255, 255, 255]) >= 4.5 ? [255, 255, 255] : [10, 20, 16];
}

/** Background and text for a coloured chip (avatars): darkens a mid-tone colour until white text reaches AA. */
export function readablePair(bg: string): { bg: string; fg: string } {
  let c = hexToRgb(bg);
  const white: [number, number, number] = [255, 255, 255];
  if (contrast(c, [10, 20, 16]) >= 4.5) return { bg, fg: 'rgb(10 20 16)' };
  for (let i = 0; i < 8 && contrast(c, white) < 4.5; i++) c = mix(c, [0, 0, 0], 0.08);
  return { bg: `rgb(${c.join(' ')})`, fg: '#fff' };
}
