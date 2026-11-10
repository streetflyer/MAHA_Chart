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
  it('links freespan start and end codes, keeping the listed length and height', () => {
    const { linked, points } = splitRanges(
      [
        { kp: 3454, code: 'FS.FS', value: '', length: 22.73, height: 0.26 },
        { kp: 3477, code: 'FS.FE', value: '' },
        { kp: 5161, code: 'FS.FS', value: '' },
        { kp: 5178, code: 'FS.FE', value: '' },
        { kp: 4000, code: 'AN.OK', value: '' },
      ],
      [{ start: 'FS.FS', end: 'FS.FE', color: '#7fbfff', label: 'Freespan', lengthPos: 'top', heightPos: 'bottom' }],
    );
    expect(points).toHaveLength(1);
    expect(linked.map((l) => [l.kp, l.end, l.length, l.height])).toEqual([
      [3454, 3477, 22.73, 0.26],
      [5161, 5178, 17, undefined],
    ]);
  });
});
