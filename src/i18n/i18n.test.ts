import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';

function keys(obj: unknown, prefix = ''): string[] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations', () => {
  it('French has every English key and vice versa', () => {
    const e = new Set(keys(en));
    const f = new Set(keys(fr));
    expect([...e].filter((k) => !f.has(k))).toEqual([]);
    expect([...f].filter((k) => !e.has(k))).toEqual([]);
  });
});
