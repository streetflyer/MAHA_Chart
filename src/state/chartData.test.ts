import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChartData,
  datasetRemoved,
  fileOnChart,
  isDataOf,
  newFiles,
  putBackOnList,
  takeOffChart,
} from "./chartData";
import { useProject } from "./project";
import { useSurvey } from "./surveyData";
import { useEditor } from "./store";
import { alignmentSheetA1 } from "../model/builtinTemplates";
import type { Dataset } from "../model/datasets";

const ds = (id: string, name: string) =>
  ({
    id,
    name,
    target: "long",
    visible: true,
    color: "#000",
    kind: "long",
    kp: new Float64Array([0, 10]),
    series: [],
  }) as unknown as Dataset;

const recipe = (file: string) =>
  ({ file, target: "long", mapping: {}, style: {} }) as never;

describe("data on the chart is what the user put there", () => {
  beforeEach(() => {
    useEditor.getState().open(alignmentSheetA1());
    useSurvey.getState().load([ds("a", "a.csv"), ds("b", "b.csv")], false);
    useProject.setState({
      active: "F",
      charts: {},
      folders: { F: { recipes: [recipe("a.csv"), recipe("b.csv")] } },
    });
  });
  it("names a file's data", () => {
    expect(isDataOf("a.csv (survey line as runline)", "a.csv")).toBe(true);
    expect(isDataOf("ab.csv", "a.csv")).toBe(false);
  });
  it("taking a file off forgets its recipe and does not offer it as new", () => {
    takeOffChart("F", "a.csv");
    expect(fileOnChart("a.csv")).toBe(false);
    expect(
      useProject
        .getState()
        .folder("F")
        .recipes.map((r) => r.file),
    ).toEqual(["b.csv"]);
    const files = [{ name: "a.csv" }, { name: "b.csv" }, { name: "c.csv" }];
    expect(newFiles("F", files).map((f) => f.name)).toEqual(["c.csv"]);
    putBackOnList("F", "a.csv");
    expect(newFiles("F", files).map((f) => f.name)).toEqual(["a.csv", "c.csv"]);
  });
  it("removing a dataset in the list forgets its file once nothing is left", () => {
    useSurvey.getState().removeDataset("b");
    datasetRemoved("F", "b.csv");
    expect(useProject.getState().folder("F").off).toContain("b.csv");
  });
  it("clearing empties the chart, the recipes and the hand-placed charts", () => {
    useEditor
      .getState()
      .commit((t) => ({ ...t, scale: { ...t.scale, sheets: [{ start: 5 }] } }));
    clearChartData();
    expect(useSurvey.getState().datasets).toHaveLength(0);
    expect(useProject.getState().folder("F").recipes).toHaveLength(0);
    expect(useEditor.getState().template!.scale.sheets).toBeUndefined();
    expect(useEditor.getState().template!.scale.routeLength).toBe(0);
  });
});
