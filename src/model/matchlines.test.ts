import { describe, expect, it } from 'vitest';
import { matchSpecs, matchLabel, DEFAULT_MATCHLINES } from './matchlines';

const r = [
  { start: 0, end: 3000 },
  { start: 2900, end: 5900 },
  { start: 5800, end: 8800 },
];
describe('matchlines', () => {
  it('overlap mode marks where the neighbours begin and end', () => {
    expect(matchSpecs(r, 1, 'overlap')).toEqual([
      { kp: 3000, side: -1, chart: 1 },
      { kp: 5800, side: 1, chart: 3 },
    ]);
  });
  it('profile mode marks the chart own limits; ends have one line', () => {
    expect(matchSpecs(r, 1, 'profile').map((m) => m.kp)).toEqual([2900, 5900]);
    expect(matchSpecs(r, 0, 'profile')).toEqual([{ kp: 3000, side: 1, chart: 2 }]);
  });
  it('labels with prefix and suffix', () => {
    expect(matchLabel({ ...DEFAULT_MATCHLINES, prefix: 'Demo_AL_', suffix: 'x' }, 2)).toBe('Demo_AL_02x');
  });
});
