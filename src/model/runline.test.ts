import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeRoute } from './route';
import { parseRlx, parseRlxp, splitAtKp0 } from './runline';

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

describe('runlines', () => {
  it('reads an .rlx with arcs, and its length matches the KPs in the file', () => {
    const r = parseRlx(fixture('f22.rlx'))!;
    expect(r.name).toBe('12in F22 WHP to F23R-A_All');
    const { line, before } = splitAtKp0(r);
    expect(before).not.toBeNull();
    const route = makeRoute(r.name, line);
    // Last KP in the file is 21.69070771 km.
    expect(route.length).toBeCloseTo(21690.7, -0.5);
  });
  it('bends arcs the right way: tangent to the straights either side', () => {
    const r = parseRlx(fixture('f22.rlx'))!;
    const dir = (i: number) => Math.atan2(r.en[2 * i + 3] - r.en[2 * i + 1], r.en[2 * i + 2] - r.en[2 * i]);
    // Into and out of the 2500 m arcs (KP 7.180–7.420 clockwise, KP 12.916–13.271 anticlockwise).
    for (const [k1, k2] of [[7180.08, 7420.06], [12916.15, 13271.39]]) {
      const a = r.kp.findIndex((k) => k >= k1 - 0.01);
      const b = r.kp.findIndex((k) => k >= k2 - 0.01);
      expect(Math.abs(dir(a) - dir(a - 1))).toBeLessThan(0.002);
      expect(Math.abs(dir(b) - dir(b - 1))).toBeLessThan(0.002);
    }
  });
  it('reads every runline in an .rlxp', () => {
    const all = parseRlxp(fixture('f27.rlxp'));
    expect(all).toHaveLength(1);
    expect(all[0].kp[all[0].kp.length - 1]).toBeCloseTo(16522.1, 0);
    expect(all[0].color).toBe('#add8e6');
  });
});
