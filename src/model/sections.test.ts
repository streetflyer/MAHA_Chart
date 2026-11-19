import { describe, expect, it } from "vitest";
import { alignmentSheetA1 } from "./builtinTemplates";
import {
  boxOf,
  boxesOverlap,
  makeRoute,
  sectionBoxes,
  sectionLengths,
  sectionPlaces,
  sectionsEnd,
} from "./route";
import { editSheet, planPanel } from "./scale";

// An L-shaped line: 2 km east, then 2 km north.
const route = makeRoute("L", [0, 0, 2000, 0, 2000, 2000]);

function sectioned(n: number) {
  const t0 = alignmentSheetA1();
  const t = {
    ...t0,
    fields: { ...t0.fields, START_KP: "0" },
    scale: { ...t0.scale, routeLength: route.length },
  };
  const div = Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);
  return editSheet(t, 0, { sections: { div } });
}

describe("chart fitted to a curve by sections", () => {
  it("cuts the box into equal sections that add up to the chart length", () => {
    const t = sectioned(3);
    const plan = planPanel(t)!;
    const along = (plan.w * t.scale.horizontal) / 1000;
    const lens = sectionLengths(t, [1 / 3, 2 / 3]);
    expect(lens).toHaveLength(3);
    lens.forEach((l) => expect(l).toBeCloseTo(along / 3));
  });
  it("places each section's start on the line, sections keep their shape", () => {
    const t = sectioned(3);
    const sp = sectionPlaces(t, route, 0)!;
    expect(sp.place).toHaveLength(3);
    expect(sp.place[0].e).toBeCloseTo(0);
    expect(sp.place[0].n).toBeCloseTo(0);
    const boxes = sectionBoxes(t, route, 0)!;
    const plan = planPanel(t)!;
    const h = (plan.h * t.scale.horizontal) / 1000;
    for (const [j, b] of boxes.entries()) {
      expect(Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1])).toBeCloseTo(
        sp.lengths[j],
      );
      expect(Math.hypot(b[3][0] - b[0][0], b[3][1] - b[0][1])).toBeCloseTo(h);
    }
  });
  it("neighbouring sections stay attached", () => {
    const boxes = sectionBoxes(sectioned(4), route, 0)!;
    for (let j = 1; j < boxes.length; j++)
      expect(boxesOverlap(boxes[j - 1], boxes[j])).toBe(true);
  });
  it("tells overlapping boxes from separate ones", () => {
    const a = boxOf({ e: 0, n: 0, a: 0 }, 100, 20);
    expect(boxesOverlap(a, boxOf({ e: 90, n: 0, a: 0.5 }, 100, 20))).toBe(true);
    expect(boxesOverlap(a, boxOf({ e: 200, n: 0, a: 0 }, 100, 20))).toBe(false);
  });
  it("gives the KP where the last section ends", () => {
    const t = sectioned(2);
    const end = sectionsEnd(t, route, 0)!;
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThanOrEqual(route.length + 1);
  });
});

describe("deleting a chart", () => {
  it("stays deleted even when the line runs on past the last chart", async () => {
    const { deleteSheet, sheetCount, insertSheet } = await import("./scale");
    const t0 = alignmentSheetA1();
    const t = {
      ...t0,
      fields: { ...t0.fields, START_KP: "0" },
      scale: { ...t0.scale, routeLength: t0.scale.kpPerSheet * 1.5 },
    };
    expect(sheetCount(t)).toBe(2);
    const one = deleteSheet(t, 1);
    expect(sheetCount(one)).toBe(1);
    expect(sheetCount(insertSheet(one, 0))).toBe(2);
  });
});
