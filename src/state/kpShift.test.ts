import { describe, expect, it } from "vitest";
import { snapShift } from "./kpShift";

describe("snapShift", () => {
  const stops = [
    { shift: 10, x: 50 },
    { shift: 40, x: 90 },
  ];
  it("sticks to a stop within the tolerance", () => {
    expect(snapShift(11, stops, 2)).toEqual({ shift: 10, guides: [50] });
    expect(snapShift(39.5, stops, 2)).toEqual({ shift: 40, guides: [90] });
  });
  it("leaves a shift that is far from every stop", () => {
    expect(snapShift(25, stops, 2)).toEqual({ shift: 25, guides: [] });
  });
});
