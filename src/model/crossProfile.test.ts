import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VW_RAW, nearestProfile, profileFromRow } from "./crossProfile";
import { fileLines, lineSplitter } from "./tables";

const text = readFileSync(
  new URL("./fixtures/xprofile3.csv", import.meta.url),
  "utf8",
);

describe("VisualWorks cross profiles", () => {
  it("streams lines and decodes each profile about the pipe", async () => {
    const split = lineSplitter(text);
    const rows: string[][] = [];
    for await (const l of fileLines(new Blob([text])))
      if (l.trim()) rows.push(split(l));
    expect(rows).toHaveLength(3);
    const p = profileFromRow(rows[0], VW_RAW, 1000)!;
    expect(p.kp).toBeCloseTo(1653);
    expect(p.diameter).toBeCloseTo(0.33);
    expect(p.pts.length).toBe(476 * 2);
    // First point: dx -4.993 from the ROV, pipe at -0.136 → 4.857 m to one side;
    // dz 1.704 below the ROV, pipe centre at 1.46 + 0.165 → 0.079 m below it.
    expect(p.pts[0]).toBeCloseTo(-4.857, 3);
    expect(p.pts[1]).toBeCloseTo(-0.079, 3);
    const list = rows.map((r) => profileFromRow(r, VW_RAW, 1000)!);
    expect(nearestProfile(list, 1654.4, 1)?.kp).toBeCloseTo(1654);
    expect(nearestProfile(list, 1700, 5)).toBeNull();
  });
});
