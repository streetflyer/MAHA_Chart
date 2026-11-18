import { describe, expect, it } from "vitest";
import { applyChartEdits, chartEditPatch, clearChartEdit } from "./legendScope";
import type { LegendItem, Panel } from "./types";

const it1: LegendItem = {
  id: "a",
  group: "plan",
  symbol: "line",
  label: "Pipe",
  color: "#000",
};
const p = { id: "lg" } as Panel;

describe("legend changes for one chart", () => {
  it("applies wording and hides only on that chart", () => {
    const q = { ...p, ...chartEditPatch(p, 1, "a", { label: "Other" }) };
    expect(applyChartEdits([it1], q.legendChart![1])[0].label).toBe("Other");
    expect(applyChartEdits([it1], q.legendChart![0])[0].label).toBe("Pipe");
    const h = { ...q, ...chartEditPatch(q, 1, "a", { hidden: true }) };
    expect(applyChartEdits([it1], h.legendChart![1])).toHaveLength(0);
    const back = { ...h, ...clearChartEdit(h, 1, "a") };
    expect(applyChartEdits([it1], back.legendChart![1])[0].label).toBe("Pipe");
  });
});
