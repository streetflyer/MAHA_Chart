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
