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
    expect(chartName("33DJ100160-T1201-UMB1-CH-01", 2)).toBe("33DJ100160-T1201-UMB1-CH-02");
  });
});
