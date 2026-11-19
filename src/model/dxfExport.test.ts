import { describe, expect, it } from "vitest";
import { chartBoxesToDxf } from "./dxfExport";
describe("chartBoxesToDxf", () => {
  it("writes closed ground-coordinate polylines", () => {
    const d = chartBoxesToDxf(
      [
        [
          [1000, 2000],
          [1100, 2000],
          [1100, 2050],
          [1000, 2050],
        ],
      ],
      ["A1"],
    );
    expect(d).toContain("CHART_BOXES");
    expect(d).toContain("A1");
    expect(d).toContain("2050");
    expect(d).not.toContain("-2050");
  });
});

describe("hatch lines cut to a shape", () => {
  it("keeps only the parts inside", async () => {
    const { cutToShapes } = await import("./dxfExport");
    const sq = {
      pts: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ] as [number, number][],
    };
    const parts = cutToShapes([-5, 5], [15, 5], [sq]);
    expect(parts).toHaveLength(1);
    expect(parts[0][0][0]).toBeCloseTo(0);
    expect(parts[0][1][0]).toBeCloseTo(10);
    expect(cutToShapes([-5, 20], [15, 20], [sq])).toHaveLength(0);
  });
});
