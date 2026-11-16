import { describe, expect, it } from "vitest";
import type { Linework } from "./dxf";
import { placeShape, shapeFrom } from "./legendShape";

const lw = {
  lines: [
    new Float64Array([0, 0, 10, 0, 10, 5]),
    new Float64Array([100, 100, 110, 100]),
  ],
  groups: [1, 2],
  layers: ["a", "a"],
  colors: ["#ff0000", "#00ff00"],
  texts: [],
} as unknown as Linework;

describe("legend symbol from a drawing object", () => {
  it("keeps only the chosen object, centred, longer side 1", () => {
    const s = shapeFrom(
      [{ lw, groups: new Set([1]), colourOf: (i) => lw.colors[i] }],
      (e, n) => [e, -n],
    )!;
    expect(s.lines).toHaveLength(1);
    expect(s.colors).toEqual(["#ff0000"]);
    const xs = s.lines[0].filter((_, k) => k % 2 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 3);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 3);
  });
  it("returns nothing when no line is chosen", () => {
    expect(
      shapeFrom([{ lw, groups: new Set([9]), colourOf: () => "" }], (e, n) => [
        e,
        n,
      ]),
    ).toBeNull();
  });
  it("sizes and turns the symbol on the sheet", () => {
    const shape = { lines: [[-0.5, 0, 0.5, 0]], colors: [""] };
    const [l] = placeShape(shape, 10, 20, 8, 90);
    expect(l[0]).toBeCloseTo(10, 5);
    expect(l[1]).toBeCloseTo(16, 5);
    expect(l[2]).toBeCloseTo(10, 5);
    expect(l[3]).toBeCloseTo(24, 5);
  });
});
