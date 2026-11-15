import { describe, expect, it } from "vitest";
import {
  matchSpecs,
  matchLabel,
  chartName,
  DEFAULT_MATCHLINES,
} from "./matchlines";

const r = [
  { start: 0, end: 3000 },
  { start: 2900, end: 5900 },
  { start: 5800, end: 8800 },
];
describe("matchlines", () => {
  it("overlap mode marks where the neighbours begin and end", () => {
    expect(matchSpecs(r, 1, "overlap")).toEqual([
      { kp: 3000, side: -1, chart: 1 },
      { kp: 5800, side: 1, chart: 3 },
    ]);
  });
  it("profile mode marks the chart own limits; ends have one line", () => {
    expect(matchSpecs(r, 1, "profile").map((m) => m.kp)).toEqual([2900, 5900]);
    expect(matchSpecs(r, 0, "profile")).toEqual([
      { kp: 3000, side: 1, chart: 2 },
    ]);
  });
  it("labels with prefix and suffix", () => {
    expect(
      matchLabel(
        { ...DEFAULT_MATCHLINES, prefix: "Demo_AL_", suffix: "x" },
        2,
        "AB.001",
      ),
    ).toBe("Demo_AL_AB.002x");
    expect(
      matchLabel(DEFAULT_MATCHLINES, 2, "33DJ100138-T1201-CH-002.001"),
    ).toBe("Matchline to 33DJ100138-T1201-CH-002.002");
    expect(chartName("", 3)).toBe("Chart 3");
    expect(chartName("X-CH-01", 3)).toBe("X-CH-03");
    expect(chartName("33DJ100160-T1201-UMB1-CH-01", 2)).toBe(
      "33DJ100160-T1201-UMB1-CH-02",
    );
  });
});

import { drawingNoOf } from "./tokens";
import { alignmentSheetA1 } from "./builtinTemplates";
describe("drawing number", () => {
  it("builds JOB-CH-CCC.SSS from the job, the folder's chart number and the chart", () => {
    const t = alignmentSheetA1();
    t.fields = { JOB_NO: "33DJ100160-LCV", PRODUCT: "UMB2", CHART_SEQ: "2" };
    expect(drawingNoOf(t, 0)).toBe("33DJ100160-LCV-CH-002.001");
    expect(drawingNoOf(t, 2)).toBe("33DJ100160-LCV-CH-002.003");
  });
});

import { matchSpecs } from "./matchlines";
describe("matchlines on panned charts", () => {
  // FJ1: chart 2 was panned, so its own range (-43..83) is not what its plan view shows (86..169).
  const ranges = [
    { start: 0, end: 124 },
    { start: -43, end: 83 },
    { start: 171, end: 297 },
  ];
  const shown = [
    { start: 0, end: 117 },
    { start: 86, end: 169 },
    { start: 168, end: 289 },
  ];
  it("uses the shown KPs where the range's KP is not on the chart", () => {
    expect(matchSpecs(ranges, 0, "overlap", shown).map((m) => m.kp)).toEqual([
      86,
    ]);
    expect(matchSpecs(ranges, 2, "overlap", shown).map((m) => m.kp)).toEqual([
      169,
    ]);
    expect(matchSpecs(ranges, 1, "overlap", shown).map((m) => m.kp)).toEqual([
      124, 168,
    ]);
  });
  it("keeps the range's KP when the chart shows it", () => {
    const even = [
      { start: 0, end: 1000 },
      { start: 900, end: 1900 },
    ];
    expect(matchSpecs(even, 0, "overlap", even).map((m) => m.kp)).toEqual([
      900,
    ]);
    expect(matchSpecs(even, 0, "overlap").map((m) => m.kp)).toEqual([900]);
  });
});
