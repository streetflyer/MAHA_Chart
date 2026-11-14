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
