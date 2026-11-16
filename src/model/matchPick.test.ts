import { describe, expect, it } from "vitest";
import {
  boundaryFor,
  clampToRuns,
  clipPolygon,
  crossingChainage,
  matchSpecs,
  overlapStretches,
} from "./matchlines";
import type { Route } from "./route";
import { normaliseShortcut, shortcutOf } from "../state/prefs";
import { valueAt } from "../components/hoverText";

const line: Route = {
  en: new Float64Array([0, 0, 1000, 0]),
  chain: new Float64Array([0, 1000]),
  length: 1000,
} as unknown as Route;

const box = (a: number, b: number): [number, number][] => [
  [a, -50],
  [b, -50],
  [b, 50],
  [a, 50],
];

describe("matchlines chosen in the key plan", () => {
  it("finds the overlap of two frames", () => {
    const o = clipPolygon(box(0, 400), box(300, 700));
    const xs = o.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(300);
    expect(Math.max(...xs)).toBeCloseTo(400);
    expect(clipPolygon(box(0, 100), box(200, 300))).toHaveLength(0);
  });
  it("finds the stretch of line inside both frames", () => {
    const runs = overlapStretches([box(0, 400), box(300, 700)], line, 0);
    expect(runs[0]).toHaveLength(1);
    expect(runs[0][0][0]).toBeCloseTo(300, 0);
    expect(runs[0][0][1]).toBeCloseTo(400, 0);
    expect(clampToRuns(250, runs[0])).toBeCloseTo(runs[0][0][0]);
  });
  it("a drawn line gives the KP where it crosses", () => {
    expect(crossingChainage(line, [350, -20], [360, 20])).toBeCloseTo(355);
    expect(crossingChainage(line, [350, 10], [360, 20])).toBeNull();
  });
  it("puts a drawn line on the boundary it lies in", () => {
    const ranges = [
      { start: 0, end: 400 },
      { start: 300, end: 700 },
      { start: 600, end: 1000 },
    ];
    const runs = [[[300, 400]], [[600, 700]]] as [number, number][][];
    expect(boundaryFor(350, 1, ranges, runs)).toBe(0);
    expect(boundaryFor(650, 1, ranges, runs)).toBe(1);
    expect(boundaryFor(900, 1, ranges)).toBe(1);
    expect(boundaryFor(10, 0, [ranges[0]])).toBeNull();
  });
  it("a chosen matchline is used by both charts", () => {
    const ranges = [
      { start: 0, end: 400 },
      { start: 300, end: 700 },
      { start: 600, end: 1000 },
    ];
    const pairs = { "0": { kp: 333 }, "1": { kp: 666, a: [1, 2], b: [3, 4] } };
    expect(
      matchSpecs(ranges, 0, "overlap", undefined, pairs as never)[0].kp,
    ).toBe(333);
    const mid = matchSpecs(ranges, 1, "overlap", undefined, pairs as never);
    expect(mid.map((m) => m.kp)).toEqual([333, 666]);
    expect(mid[1].a).toEqual([1, 2]);
    expect(
      matchSpecs(ranges, 2, "overlap", undefined, pairs as never)[0].kp,
    ).toBe(666);
    // Without a choice the automatic line stays.
    expect(matchSpecs(ranges, 1, "overlap")[0].kp).toBe(400);
  });
});

describe("hover info", () => {
  it("reads and writes shortcuts", () => {
    expect(normaliseShortcut("f3")).toBe("F3");
    expect(normaliseShortcut("ctrl + i")).toBe("Ctrl+I");
    expect(normaliseShortcut("shift+alt+h")).toBe("Alt+Shift+H");
    expect(normaliseShortcut("ctrl+")).toBeNull();
    expect(
      shortcutOf({
        key: "F3",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe("F3");
    expect(
      shortcutOf({
        key: "i",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe("Ctrl+I");
  });
  it("interpolates a profile value at a KP", () => {
    const kp = new Float64Array([0, 10, 20]);
    const v = new Float64Array([1, 3, 5]);
    expect(valueAt(kp, v, 5)).toBeCloseTo(2);
    expect(valueAt(kp, v, 20)).toBeCloseTo(5);
    expect(valueAt(kp, v, 30)).toBeNaN();
  });
});
