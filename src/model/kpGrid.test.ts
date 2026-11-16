import { describe, expect, it } from "vitest";
import { extraGridKps, withGridLine } from "./kpGrid";
import type { Dataset } from "./datasets";
import type { Panel } from "./types";

const panel = (extra: Partial<Panel> = {}) =>
  ({ id: "p", type: "longProfile", ...extra }) as Panel;
const long = {
  kind: "long",
  kp: new Float64Array([2500, 2600, 2700]),
} as unknown as Dataset;

describe("vertical grid lines of a profile", () => {
  it("starts at the KP where the plan view's line starts", () => {
    expect(extraGridKps(panel(), [long], [2580, 2900])).toEqual([2580]);
    expect(
      extraGridKps(panel({ kpStartLine: false }), [long], [2580, 2900]),
    ).toEqual([]);
  });
  it("adds the ends of the data inside the plan view, and a KP", () => {
    const p = panel({
      kpGrid: [{ at: "left" }, { at: "right" }, { at: "kp", kp: 2650 }],
    });
    expect(extraGridKps(p, [long], [2580, 2900])).toEqual([2580, 2650, 2700]);
  });
  it("leaves out a KP the plan view does not show, and repeats", () => {
    const p = panel({ kpGrid: [{ at: "kp", kp: 5000 }] });
    expect(extraGridKps(p, [long], [2580, 2900])).toEqual([2580]);
    const once = withGridLine(panel(), { at: "left" });
    expect(withGridLine(panel({ kpGrid: once }), { at: "left" })).toHaveLength(
      1,
    );
  });
});
