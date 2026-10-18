import { describe, expect, it } from 'vitest';
import { convert } from '.';

describe('units engine', () => {
  it('converts mass and area', () => {
    expect(convert(2, 't', 'kg')).toBe(2000);
    expect(convert(500, 'g', 'kg')).toBe(0.5);
    expect(convert(10, 'acre', 'ha')).toBeCloseTo(4.0469, 3);
  });
  it('converts bags with a nominal weight', () => {
    expect(convert(3, 'bag', 'kg', undefined, { nominalKg: 85 })).toBe(255);
    expect(() => convert(1, 'kg', 'ha')).toThrow();
  });
});
