import { describe, expect, it } from 'vitest';
import { codeMatcher, defaultRowCodes, splitRanges } from './events';

describe('events', () => {
  it('matches codes with wildcards', () => {
    const m = codeMatcher('D.*, OT.OU');
    expect(m('D.OS')).toBe(true);
    expect(m('ot.ou')).toBe(true);
    expect(m('OT.VS')).toBe(false);
  });
  it('guesses row codes from the reference chart labels', () => {
    expect(defaultRowCodes('ANODE TYPE, SIZE, WEIGHT AND SPACING')).toBe('PP.ST, PP.ET');
    expect(defaultRowCodes('ANODES')).toBe('AN.*');
    expect(defaultRowCodes('ANOMALIES / DEBRIS /')).toContain('D.*');
    expect(defaultRowCodes('GRID KP (KM)')).toBe('');
  });
  it('pairs start and end codes', () => {
    const { points, ranges } = splitRanges([
      { kp: 0, code: 'PP.SN', value: '12in' },
      { kp: 0, code: 'OT.VS', value: 'video' },
      { kp: 0, code: 'PP.SZ', value: 'weights' },
      { kp: 120, code: 'AN.OK', value: '' },
      { kp: 21633, code: 'PP.EN', value: '' },
      { kp: 21000, code: 'OT.VE', value: '' },
    ]);
    expect(points.map((p) => p.code)).toEqual(['AN.OK']);
    const by = Object.fromEntries(ranges.map((r) => [r.code, r.end]));
    expect(by).toEqual({ 'PP.SN': 21633, 'OT.VS': 21000, 'PP.SZ': Infinity });
  });
});
