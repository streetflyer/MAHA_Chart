import { describe, expect, it } from "vitest";
import { alignmentSheetA1 } from "./builtinTemplates";
import { chartBody, setChartBody, setChartField } from "./chartText";
import { templateTokens } from "./tokens";
import { chartSegments, fitSegments, makeRoute } from "./route";
import { fitSheet, sheetRange } from "./scale";

describe("text for one chart only", () => {
  it("a field set for one chart wins on that chart only", () => {
    let t = alignmentSheetA1();
    t = setChartField(t, 1, "TITLE", "Chart two", true);
    expect(templateTokens(t, 1).TITLE).toBe("Chart two");
    expect(templateTokens(t, 0).TITLE).toBe(t.fields.TITLE);
    // Typed again for every chart: chart 2 follows it.
    t = setChartField(t, 1, "TITLE", "All", false);
    expect(templateTokens(t, 1).TITLE).toBe("All");
    expect(t.chartText).toBeUndefined();
  });
  it("a panel's text set for one chart", () => {
    let t = alignmentSheetA1();
    const p = t.panels.find((x) => x.id === "s_title")!;
    t = setChartBody(t, 2, p.id, "Only 3", true);
    expect(chartBody(t, 2, p)).toBe("Only 3");
    expect(chartBody(t, 0, p)).toBe(p.body);
  });
});

describe("fit to curved line", () => {
  // A line that runs east, then turns north.
  const r = makeRoute("l", [0, 0, 400, 0, 400, 400]);
  it("splits the chart into straight segments that fill the plan view", () => {
    const t0 = alignmentSheetA1();
    const t = {
      ...t0,
      scale: { ...t0.scale, horizontal: 1000, routeLength: 800 },
    };
    const fit = fitSegments(t, r, 0)!;
    expect(fit.segments.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(fit.segments[0] - 400)).toBeLessThan(20);
    const tt = fitSheet(t, 0, fit.segments, fit.end, fit.start);
    const segs = chartSegments(tt, r, 0)!;
    expect(segs.length).toBe(fit.segments.length + 1);
    // The first segment runs east, the second north.
    expect(segs[0].geo.u[0]).toBeCloseTo(1);
    expect(segs[1].geo.u[1]).toBeCloseTo(1);
    // The next chart starts where this one ends.
    expect(sheetRange(tt, 1).start * 1000).toBeCloseTo(fit.end);
  });
});
