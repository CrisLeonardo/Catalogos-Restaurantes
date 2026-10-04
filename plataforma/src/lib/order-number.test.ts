import { describe, expect, it } from 'vitest';
import { shortOrderNumber } from './order-number';

describe('shortOrderNumber', () => {
  it('acorta el formato ORD-año-número', () => {
    expect(shortOrderNumber('ORD-2026-00057')).toBe('#57');
    expect(shortOrderNumber('ORD-2026-01234')).toBe('#1234');
    expect(shortOrderNumber('ORD-2026-00000')).toBe('#0');
  });
  it('deja igual lo que no sigue ese formato', () => {
    expect(shortOrderNumber('H-7')).toBe('H-7');
    expect(shortOrderNumber('')).toBe('');
    expect(shortOrderNumber(null)).toBe('');
  });
});
