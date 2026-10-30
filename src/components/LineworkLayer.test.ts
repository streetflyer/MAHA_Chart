import { describe, expect, it } from 'vitest';
import { textHeightMm } from './LineworkLayer';
import type { Dataset } from '../model/datasets';

const set = (textMode: 'auto' | 'drawn' | 'fixed', textScale = 100) =>
  ({ textMode, textScale, textHeight: 2 }) as Extract<Dataset, { kind: 'linework' }>;

describe('DXF text height on paper', () => {
  // 8 m text: 8 mm at 1:1000, 1.6 mm at 1:5000, 0.8 mm at 1:10000, 0.16 mm at 1:50000.
  it('follows the map scale as drawn', () => {
    expect(textHeightMm(set('drawn'), 8, 1)).toBeCloseTo(8);
    expect(textHeightMm(set('drawn'), 8, 0.1)).toBeCloseTo(0.8);
  });
  it('keeps auto text readable', () => {
    expect(textHeightMm(set('auto'), 8, 1)).toBe(3);
    expect(textHeightMm(set('auto'), 8, 0.2)).toBeCloseTo(1.6);
    expect(textHeightMm(set('auto'), 8, 0.1)).toBe(1.2);
    expect(textHeightMm(set('auto'), 8, 0.02)).toBe(0);
  });
  it('applies the scale percentage and fixed height', () => {
    expect(textHeightMm(set('auto', 50), 8, 0.2)).toBeCloseTo(0.8);
    expect(textHeightMm(set('fixed'), 8, 1)).toBe(2);
  });
});
