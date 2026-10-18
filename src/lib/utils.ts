import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let counter = 0;
/** Short unique id for records created at runtime. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Simulated network latency for store actions (PRD 3: 300–800 ms). */
export function latency(min = 300, max = 800): Promise<void> {
  const ms = import.meta.env.MODE === 'test' ? 0 : min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), obj);
}
