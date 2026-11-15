import {
  matchSettings,
  settingsOf,
  settingsPatch,
} from "../model/datasetSettings";
import { useEditor } from "./store";
import { useProject } from "./project";
import { useSurvey } from "./surveyData";

/** Keep everything set on the chart now (template and every dataset's look) with the active project folder. */
export function saveFolderSettings(path: string) {
  const pr = useProject.getState();
  const t = useEditor.getState().template;
  if (t) pr.setTemplate(path, t);
  pr.setSettings(path, useSurvey.getState().datasets.map(settingsOf));
}

/** Put a folder's saved dataset settings on the datasets on the chart; returns how many were changed. */
export function applyFolderSettings(path: string, only?: Set<string>): number {
  const saved = useProject.getState().folder(path).settings ?? [];
  const sv = useSurvey.getState();
  const targets = sv.datasets.filter((d) => !only || only.has(d.id));
  const m = matchSettings(targets, saved);
  for (const d of targets) {
    const s = m.get(d.id);
    if (s) sv.updateDataset(d.id, settingsPatch(d, s));
  }
  return m.size;
}

/** Take another folder's template, import recipes and dataset settings; when the target is on the chart, apply them now. */
export function copyFolderSettings(from: string, to: string): number {
  const pr = useProject.getState();
  pr.copySettings(from, to);
  // Recipes brought over from another folder are matched by kind of data, not by file name.
  const f = pr.folder(to);
  useProject.setState({
    folders: {
      ...useProject.getState().folders,
      [to]: { ...f, recipes: f.recipes.map((r) => ({ ...r, borrowed: true })) },
    },
  });
  if (pr.active !== to) return 0;
  const t = useProject.getState().folder(to).template;
  if (t) useEditor.getState().open(t);
  return applyFolderSettings(to);
}

const lastName = (path: string) => path.split("/").filter(Boolean).pop() ?? "";

/**
 * Write the job number (kept on the root folder) and each product's chart number into the
 * templates: the chart on screen and every folder's saved template. The Drawing No. of
 * every sheet is then JOB-CH-CCC.SSS.
 */
export function syncChartNumbers() {
  const pr = useProject.getState();
  const job = pr.folder("").jobNo ?? "";
  const fieldsFor = (path: string, f: Record<string, string>) => ({
    ...f,
    JOB_NO: job,
    PRODUCT: lastName(path) || pr.name || "",
    CHART_SEQ: pr.folder(path).chartNo ?? "",
  });
  const same = (a: Record<string, string>, b: Record<string, string>) =>
    a.JOB_NO === b.JOB_NO &&
    a.PRODUCT === b.PRODUCT &&
    a.CHART_SEQ === b.CHART_SEQ;
  const folders = { ...pr.folders };
  let changed = false;
  for (const [path, st] of Object.entries(folders)) {
    if (!path || !st.template) continue;
    const f = fieldsFor(path, st.template.fields ?? {});
    if (same(f, st.template.fields ?? {})) continue;
    folders[path] = { ...st, template: { ...st.template, fields: f } };
    changed = true;
  }
  if (changed) useProject.setState({ folders });
  const ed = useEditor.getState();
  if (pr.active !== null && pr.active !== "" && ed.template) {
    const f = fieldsFor(pr.active, ed.template.fields);
    if (!same(f, ed.template.fields)) ed.commit((t) => ({ ...t, fields: f }));
  }
}
