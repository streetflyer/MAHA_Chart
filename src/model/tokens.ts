import { scaleTokens, sheetCount, sheetRange } from "./scale";
import type { ChartTemplate } from "./types";

/** Newest revision that has a revision code, used for the title block's Rev box. */
export function currentRevision(t: ChartTemplate): string {
  const tb = t.panels.find((p) => p.type === "titleBlock");
  return tb?.revisions?.find((r) => r.rev.trim())?.rev ?? "";
}

/** Typing in the Rev box renames the newest revision of the history (or starts one). */
export function setCurrentRevision(
  t: ChartTemplate,
  rev: string,
): ChartTemplate {
  return {
    ...t,
    panels: t.panels.map((p) => {
      if (p.type !== "titleBlock") return p;
      const rows = p.revisions ?? [];
      const i = rows.findIndex((r) => r.rev.trim());
      const j =
        i >= 0 ? i : rows.findIndex((r) => !(r.rev || r.date || r.desc));
      if (j < 0) return p;
      const out = [...rows];
      const row = { ...out[j], rev };
      if (i >= 0) out[j] = row;
      else {
        out.splice(j, 1);
        out.unshift(row);
      }
      return { ...p, revisions: out };
    }),
  };
}

/** The Survey Date box: typed by the user, else the days of the video timing list. */
export function surveyDateOf(t: ChartTemplate, auto: string): string {
  if (t.fields.SURVEY_DATE_MANUAL === "1") return t.fields.SURVEY_DATE ?? "";
  return auto || (t.fields.SURVEY_DATE ?? "");
}

/**
 * The drawing number of a sheet. With a job number and a product name set it is built as
 * JOB-CH-CCC.SSS (chart number typed by the user, then the sheet's own sequence);
 * otherwise it is the typed CHART_NO.
 */
export function drawingNoOf(t: ChartTemplate, sheetIndex = 0): string {
  const f = t.fields;
  const job = (f.JOB_NO ?? "").trim();
  if (!job) return f.CHART_NO ?? "";
  const seq = String(parseInt(f.CHART_SEQ ?? "1", 10) || 1).padStart(3, "0");
  return `${job}-CH-${seq}.${String(sheetIndex + 1).padStart(3, "0")}`;
}

/**
 * Everything text can reference as {KEY}: scale values, the user's fields and the
 * values of the sheet being shown. Sheet 0 is the first sheet of the route.
 */
export function templateTokens(
  t: ChartTemplate,
  sheetIndex = 0,
): Record<string, string> {
  const n = sheetCount(t);
  const { start, end } = sheetRange(t, sheetIndex);
  return {
    ...scaleTokens(t),
    PLOT_SIZE: `ISO ${t.paper.size}`,
    ...t.fields,
    CHART_NO: drawingNoOf(t, sheetIndex),
    REV: currentRevision(t),
    SHEET: String(sheetIndex + 1),
    NUM_CHARTS: String(n).padStart(2, "0"),
    KP_START: start.toFixed(3),
    KP_END: end.toFixed(3),
  };
}
