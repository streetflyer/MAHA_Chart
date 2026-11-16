import { withMatchPair } from "../components/matchPicking";
import { exitMode } from "./mode";
import { useEditor } from "./store";
import { useProject } from "./project";
import { useSurvey } from "./surveyData";

/**
 * What is on the chart is what the user put there: taking data off the chart also
 * forgets how it was read, so nothing comes back by itself when a folder is opened
 * again, "Check imported data" is pressed or the project is saved.
 */

/** A dataset made from a file: named after it, or after it and a note ("name (survey line as runline)"). */
export const isDataOf = (datasetName: string, file: string) =>
  datasetName === file || datasetName.startsWith(`${file} `);

/** Does the chart hold data read from this file? */
export const fileOnChart = (file: string) =>
  useSurvey.getState().datasets.some((d) => isDataOf(d.name, file));

/** Take a file's data off the chart (the file stays in the folder) and keep it from being offered as new. */
export function takeOffChart(path: string, file: string) {
  const sv = useSurvey.getState();
  if (useProject.getState().active === path)
    for (const d of sv.datasets.filter((x) => isDataOf(x.name, file)))
      useSurvey.getState().removeDataset(d.id);
  useProject.getState().setOff(path, file, true);
}

/** A file was added or imported again: it counts as new data. */
export const putBackOnList = (path: string, file: string) =>
  useProject.getState().setOff(path, file, false);

/** One dataset was removed in the data list: when its file has nothing left on the chart, forget the file's recipe. */
export function datasetRemoved(path: string | null, datasetName: string) {
  if (path === null) return;
  const f = useProject.getState().folder(path);
  for (const r of f.recipes)
    if (isDataOf(datasetName, r.file) && !fileOnChart(r.file))
      useProject.getState().setOff(path, r.file, true);
}

/** Files of a folder that Check imported data offers: not on the chart, not taken off on purpose. */
export function newFiles<T extends { name: string }>(
  path: string,
  files: T[],
): T[] {
  const off = new Set(useProject.getState().folder(path).off ?? []);
  return files.filter((f) => !off.has(f.name) && !fileOnChart(f.name));
}

/** Empty the chart: every dataset and the line, and what was read from the folder's files. The layout stays. */
export function clearChartData() {
  exitMode();
  const pr = useProject.getState();
  useSurvey.getState().clear();
  if (pr.active !== null) pr.forgetAll(pr.active);
  const ed = useEditor.getState();
  if (ed.template) {
    // Charts placed by hand and matchlines picked belong to the line that is gone.
    ed.commit((t) =>
      withMatchPair(
        { ...t, scale: { ...t.scale, sheets: undefined, routeLength: 0 } },
        null,
        null,
      ),
    );
    ed.setSheet(0);
  }
}
