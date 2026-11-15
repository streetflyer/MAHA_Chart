import { describe, expect, it } from "vitest";
import { cutLine, matchRange } from "./kpMatch";
import { makeRoute } from "./route";

describe("KP match", () => {
  const r = makeRoute("l", [0, 0, 100, 0, 100, 100]);
  it("cuts a line to a chainage range", () => {
    const c = makeRoute("c", cutLine(r, 10, 150));
    expect(c.length).toBeCloseTo(140);
    expect(c.en[0]).toBeCloseTo(10);
    expect(c.en[c.en.length - 1]).toBeCloseTo(50);
  });
  it("carries a short line on straight", () => {
    const c = makeRoute("c", cutLine(r, 0, 210));
    expect(c.length).toBeCloseTo(210);
    expect(c.en[c.en.length - 1]).toBeCloseTo(110);
  });
  it("picks the ends to match", () => {
    expect(matchRange("end", 200, [5, 190])).toEqual([0, 190]);
    expect(matchRange("both", 200, [5, 190])).toEqual([5, 190]);
    expect(matchRange("none", 200, [5, 190])).toEqual([0, 200]);
  });
});
