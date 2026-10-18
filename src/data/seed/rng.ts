/** Deterministic PRNG (mulberry32) so the demo data is identical on every reset. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of items) {
      if ((r -= w) <= 0) return v;
    }
    return items[items.length - 1]![0];
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle([...arr]).slice(0, n);
  }
}

const DAY = 86_400_000;

/** Anchor all seeded dates to the day the demo is seeded, so "upcoming" and "overdue" stay meaningful. */
export function makeClock(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));
  return {
    today,
    daysAgo: (d: number, hourJitter = 0) => new Date(today.getTime() - d * DAY + hourJitter * 3_600_000),
    iso: (d: Date) => d.toISOString(),
    day: (d: Date) => d.toISOString().slice(0, 10),
  };
}
export type Clock = ReturnType<typeof makeClock>;

export const pad = (n: number, w: number) => String(n).padStart(w, '0');
