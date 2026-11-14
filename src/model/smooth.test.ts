import { describe, expect, it } from "vitest";
import { smoothLocal } from "./smooth";

describe("smoothLocal", () => {
  it("is off at 0 and flattens a spike", () => {
    const v = Float64Array.from([1, 1, 1, 5, 1, 1, 1]);
    expect(smoothLocal(v, 0)).toBe(v);
    const s = smoothLocal(v, 2);
    expect(s[3]).toBeLessThan(3);
    expect(s[3]).toBeGreaterThan(1);
  });
  it("keeps a straight slope and skips gaps", () => {
    const v = Float64Array.from([0, 1, 2, NaN, 4, 5, 6]);
    const s = smoothLocal(v, 2);
    expect(s[3]).toBeNaN();
    expect(s[1]).toBeCloseTo(1, 0);
  });
});
