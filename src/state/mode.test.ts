import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  conflicts,
  currentMode,
  enterMode,
  exitMode,
  installModeMachine,
  modeOf,
  modeStillValid,
  type ModeTargets,
} from "./mode";
import { useCpEdit } from "./cpEdit";
import { useDrawingEdit } from "./drawingEdit";
import { useEventEdit } from "./eventEdit";
import { useSmoothTool } from "./smoothTool";
import { useMatchPick } from "./matchPick";
import { useSurvey } from "./surveyData";
import { useEditor } from "./store";
import { alignmentSheetA1 } from "../model/builtinTemplates";
import type { Dataset } from "../model/datasets";

const off = {
  drawing: false,
  cp: false,
  events: false,
  smooth: false,
  matchline: false,
  keyview: false,
};
const none: ModeTargets = {
  drawingPanel: null,
  cpPanel: null,
  cpDataset: null,
  eventsPanel: null,
  smoothDataset: null,
  matchPanel: null,
  keyviewPanel: null,
};

describe("mode machine: rules", () => {
  it("reads the mode from the flags", () => {
    expect(modeOf(off)).toBe("idle");
    expect(modeOf({ ...off, cp: true })).toBe("cp");
    expect(modeOf({ ...off, smooth: true })).toBe("smooth");
  });
  it("names the modes to leave when another is entered", () => {
    expect(conflicts({ ...off, cp: true, smooth: true }, "cp")).toEqual([
      "smooth",
    ]);
    expect(conflicts({ ...off, drawing: true }, "drawing")).toEqual([]);
  });
  it("a mode needs its panel and its data", () => {
    const world = {
      panels: ["p_cp"],
      datasets: [{ id: "d1", kind: "cp" as const, visible: true }],
    };
    const t = { ...none, cpPanel: "p_cp", cpDataset: "d1" };
    expect(modeStillValid("cp", t, world)).toBe(true);
    expect(modeStillValid("cp", t, { ...world, datasets: [] })).toBe(false);
    expect(modeStillValid("cp", t, { ...world, panels: [] })).toBe(false);
    expect(
      modeStillValid("smooth", { ...none, smoothDataset: "d1" }, world),
    ).toBe(false);
  });
  it("the key plan view needs its panel", () => {
    const t = { ...none, keyviewPanel: "p_key" };
    expect(
      modeStillValid("keyview", t, { panels: ["p_key"], datasets: [] }),
    ).toBe(true);
    expect(modeStillValid("keyview", t, { panels: [], datasets: [] })).toBe(
      false,
    );
    expect(modeOf({ ...off, keyview: true })).toBe("keyview");
  });

  it("choosing matchlines needs the key plan and a line", () => {
    const t = { ...none, matchPanel: "p_key" };
    const route = { id: "r", kind: "route" as const, visible: false };
    expect(
      modeStillValid("matchline", t, { panels: ["p_key"], datasets: [route] }),
    ).toBe(true);
    expect(
      modeStillValid("matchline", t, { panels: ["p_key"], datasets: [] }),
    ).toBe(false);
    expect(modeOf({ ...off, matchline: true })).toBe("matchline");
  });
});

describe("mode machine: on the stores", () => {
  const cp = {
    id: "cp1",
    name: "cp.csv",
    target: "cp",
    visible: true,
    color: "#000",
    kind: "cp",
    kp: new Float64Array([0, 10]),
    mv: new Float64Array([-1000, -1010]),
    style: "ticks",
    font: { family: "Arial", size: 2, color: "#000" },
    symbol: "circle",
  } as unknown as Dataset;
  const long = {
    id: "long1",
    name: "long.csv",
    target: "long",
    visible: true,
    color: "#000",
    kind: "long",
    kp: new Float64Array([0, 10]),
    series: [],
  } as unknown as Dataset;
  beforeAll(() => installModeMachine());
  beforeEach(() => {
    exitMode();
    useEditor.getState().open(alignmentSheetA1());
    useSurvey.getState().load([cp, long], false);
  });
  const cpPanel = () =>
    useEditor.getState().template!.panels.find((p) => p.type === "cp")!.id;

  it("only one mode is on at a time", () => {
    enterMode("smooth", { datasetId: "long1" });
    expect(currentMode()).toBe("smooth");
    enterMode("cp", { panelId: cpPanel(), datasetId: "cp1" });
    expect(currentMode()).toBe("cp");
    expect(useSmoothTool.getState().active).toBe(false);
    // Entering through a store directly is kept exclusive too.
    useEventEdit.getState().enter("anything");
    expect(useCpEdit.getState().active).toBe(false);
    expect(currentMode()).toBe("events");
    enterMode("matchline", { panelId: "p_key", tool: "draw" });
    expect(currentMode()).toBe("matchline");
    expect(useMatchPick.getState().tool).toBe("draw");
    expect(useEventEdit.getState().active).toBe(false);
  });
  it("a mode ends when its data is removed", () => {
    enterMode("cp", { panelId: cpPanel(), datasetId: "cp1" });
    useSurvey.getState().removeDataset("cp1");
    expect(currentMode()).toBe("idle");
    enterMode("smooth", { datasetId: "long1" });
    useSurvey.getState().clear();
    expect(currentMode()).toBe("idle");
  });
  it("a mode ends when the chart is closed", () => {
    enterMode("cp", { panelId: cpPanel(), datasetId: "cp1" });
    useEditor.getState().close();
    expect(currentMode()).toBe("idle");
    expect(useDrawingEdit.getState().active).toBe(false);
  });
});
