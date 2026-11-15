import { isRunlineOf, type KpMatch } from "../model/datasets";
import { kpMatchPatches, longExtent } from "../model/kpMatch";
import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";

/** The survey line: the newest as-built line loaded. */
function surveyLine() {
  return [...useSurvey.getState().datasets]
    .reverse()
    .find((d) => d.target === "asbuilt" && d.kind === "linework");
}

/** Cut (or carry on) the survey line, and a runline copied from it, to the longitudinal profile's KPs. */
export function applyKpMatch(mode: KpMatch) {
  const sv = useSurvey.getState();
  const sl = surveyLine();
  if (!sl) return;
  const r = kpMatchPatches(sv.datasets, sl.id, mode);
  if (!r) return;
  for (const { id, patch } of r.patches) sv.updateDataset(id, patch);
  if (r.routeStart !== null && r.routeLength !== null) {
    const ed = useEditor.getState();
    ed.setField("START_KP", (r.routeStart / 1000).toFixed(3));
    ed.setScale({ routeLength: Math.round(r.routeLength * 1000) / 1000 });
  }
}

/**
 * One setting shown in the plan view, longitudinal profile and engineering events
 * properties: the survey line's start and/or end follow the profile's first/last KP.
 */
export function KpMatchControl() {
  const datasets = useSurvey((s) => s.datasets);
  const sl = [...datasets]
    .reverse()
    .find((d) => d.target === "asbuilt" && d.kind === "linework");
  const ext = longExtent(datasets);
  const mode: KpMatch =
    (sl?.kind === "linework" ? sl.kpMatch : undefined) ?? "none";
  const route = datasets.find((d) => d.kind === "route");
  const fromSurvey = !!route && !!sl && isRunlineOf(route, sl);
  return (
    <fieldset className="plain kp-match">
      <label className="field">
        <span>Match survey line KP to the longitudinal profile</span>
        <select
          value={mode}
          disabled={!sl || !ext}
          onChange={(e) => applyKpMatch(e.target.value as KpMatch)}
        >
          <option value="none">Off (as surveyed)</option>
          <option value="start">Start KP</option>
          <option value="end">End KP</option>
          <option value="both">Start and end KP</option>
        </select>
      </label>
      <p className="hint">
        {!sl
          ? "No As Built survey line loaded."
          : !ext
            ? "No longitudinal profile loaded."
            : `Profile KP ${(ext[0] / 1000).toFixed(3)} to ${(ext[1] / 1000).toFixed(3)}. The survey line is cut there (or carried on straight if it is shorter)${fromSurvey ? ", and the runline copied from it follows." : "."}`}
      </p>
    </fieldset>
  );
}
