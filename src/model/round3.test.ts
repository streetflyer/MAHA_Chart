import { describe, expect, it } from "vitest";
import { num } from "./importers";
import { dataEventCodes } from "./legendData";
import { codeMatcher } from "./events";
import type { Dataset } from "./datasets";

describe("number cells", () => {
  it("reads decimal commas, units and chainage", () => {
    expect(num("1,5")).toBe(1.5);
    expect(num("-1050 mV")).toBe(-1050);
    expect(num("12+500")).toBeCloseTo(12.5);
    expect(num("")).toBeNaN();
    expect(num("abc")).toBeNaN();
  });
});

describe("event code definitions by chart", () => {
  const ds = [
    {
      kind: "events",
      visible: true,
      records: [
        { kp: 100, code: "AN.1", value: "Anode - Type A" },
        { kp: 5000, code: "FJ.1", value: "Field Joint" },
      ],
    },
  ] as unknown as Dataset[];
  it("lists all codes, or only those inside the KP range", () => {
    expect(dataEventCodes(ds).split("\n")).toHaveLength(2);
    expect(dataEventCodes(ds, [0, 1000])).toBe("AN.1\tAnode - Type A");
  });
  it("hides codes a row already takes", () => {
    const has = codeMatcher("AN.*");
    expect(has("an.1")).toBe(true);
    expect(has("FJ.1")).toBe(false);
  });
});
