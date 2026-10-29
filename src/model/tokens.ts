import { scaleTokens, sheetCount, sheetRange } from './scale';
import type { ChartTemplate } from './types';

/** Newest revision that has a revision code, used for the title block's Rev box. */
export function currentRevision(t: ChartTemplate): string {
  const tb = t.panels.find((p) => p.type === 'titleBlock');
  return tb?.revisions?.find((r) => r.rev.trim())?.rev ?? '';
}

/**
 * Everything text can reference as {KEY}: scale values, the user's fields and the
 * values of the sheet being shown. Sheet 0 is the first sheet of the route.
 */
export function templateTokens(t: ChartTemplate, sheetIndex = 0): Record<string, string> {
  const n = sheetCount(t);
  const { start, end } = sheetRange(t, sheetIndex);
  return {
    ...scaleTokens(t),
    PLOT_SIZE: `ISO ${t.paper.size}`,
    ...t.fields,
    REV: currentRevision(t),
    SHEET: String(sheetIndex + 1),
    NUM_CHARTS: String(n).padStart(2, '0'),
    KP_START: start.toFixed(3),
    KP_END: end.toFixed(3),
  };
}
