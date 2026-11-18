import { describe, expect, it } from "vitest";
import {
  enColumns,
  eventTable,
  newPointSet,
  passes,
  plotPoints,
} from "./pointSets";
import type { Dataset } from "./datasets";

const d = {
  id: "ev",
  name: "events.csv",
  kind: "events",
  columns: ["Code", "Easting", "Northing", "Description"],
  records: [
    {
      kp: 100,
      code: "AN",
      value: "",
      cells: ["AN", "500100", "9000100", "Anode 1"],
    },
    {
      kp: 200,
      code: "DB",
      value: "",
      cells: ["DB", "500200", "9000200", "Tyre"],
    },
    { kp: 300, code: "AN", value: "", cells: ["AN", "", "", "Anode 2"] },
  ],
} as unknown as Extract<Dataset, { kind: "events" }>;

describe("point sets", () => {
  it("finds easting and northing columns", () => {
    expect(enColumns(["KP (km)", "Code", "Easting", "Northing"])).toEqual([
      2, 3,
    ]);
    expect(enColumns(["KP", "Code"])).toBeNull();
  });
  it("filters by values and number range", () => {
    const t = eventTable(d);
    const keep = t.rows.filter((r) =>
      passes(r.cells, t.cols, {
        Code: { values: ["AN"] },
        "KP (km)": { max: 0.15 },
      }),
    );
    expect(keep.map((r) => r.cells[4])).toEqual(["Anode 1"]);
  });
  it("plots from E/N, and by KP when a row has none; moves and own text apply", () => {
    const s = newPointSet("p", "events.csv");
    s.filters = { Code: { values: ["AN"] } };
    s.label.cols = ["Code", "Description"];
    s.label.before = "Found:";
    const route = {
      en: new Float64Array([500000, 9000000, 501000, 9000000]),
      chain: new Float64Array([0, 1000]),
      length: 1000,
    } as never;
    const r = plotPoints(s, d, route, 0);
    expect(r.points).toHaveLength(2);
    expect(r.byKp).toBe(1);
    expect(r.points[0]).toMatchObject({
      e: 500100,
      n: 9000100,
      text: "Found: AN Anode 1",
    });
    s.moves = { [r.points[0].key]: { de: 5, dn: -5 } };
    s.texts = { [r.points[0].key]: "Mine" };
    const r2 = plotPoints(s, d, route, 0);
    expect(r2.points[0]).toMatchObject({ e: 500105, n: 9000095, text: "Mine" });
  });
});
