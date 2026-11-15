import { scaleTokens, sheetCount, sheetRange } from "./scale";
import type { ChartTemplate } from "./types";

/** Newest revision that has a revision code, used for the title block's Rev box. */
export function currentRevision(t: ChartTemplate): string {
  const tb = t.panels.find((p) => p.type === "titleBlock");
  return tb?.revisions?.find((r) => r.rev.trim())?.rev ?? "";
}

/**
 * The drawing number of a sheet. With a job number and a product name set it is built as
 * JOB-PRODUCT-CCC.SSS (chart number typed by the user, then the sheet's own sequence);
 * otherwise it is the typed CHART_NO.
 */
export function drawingNoOf(t: ChartTemplate, sheetIndex = 0): string {
  const f = t.fields;
  const job = (f.JOB_NO ?? "").trim();
  const prod = (f.PRODUCT ?? "").trim();
  if (!job || !prod) return f.CHART_NO ?? "";
  const seq = String(parseInt(f.CHART_SEQ ?? "1", 10) || 1).padStart(3, "0");
  return `${job}-${prod}-${seq}.${String(sheetIndex + 1).padStart(3, "0")}`;
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
