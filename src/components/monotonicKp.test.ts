import { describe, expect, it } from 'vitest';
import { monotonicKp } from './KpPanels';

describe('KP across a chart only increases', () => {
  // The line comes in from the right (KP 0-1000), turns, and runs left to right through the chart.
  const raw = (kp: number) => (kp < 1000 ? 2000 - kp : kp);
  const toX = monotonicKp(1500, 3000, 0, 2906, 1500, raw);
  it('leaves out the stretch of line that curls back into the frame', () => {
    expect(toX(500)).toBe(-1e6);
    expect(toX(1200)).toBeCloseTo(1200);
  });
  it('stops at the end of the line', () => {
    expect(toX(2906)).toBeCloseTo(2906);
    expect(toX(2950)).toBe(1e6);
  });
  it('never goes back inside the chart', () => {
    const wobble = (kp: number) => kp + (kp > 2000 && kp < 2100 ? -(kp - 2000) * 1.5 : 0);
    const f = monotonicKp(1500, 3000, 0, 3000, 1500, wobble);
    let last = -Infinity;
    for (let kp = 1500; kp <= 3000; kp += 10) {
      expect(f(kp)).toBeGreaterThanOrEqual(last - 1e-9);
      last = f(kp);
    }
  });
});
