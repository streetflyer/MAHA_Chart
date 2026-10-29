import { scaleTokens } from './scale';
import type { ChartTemplate } from './types';

/**
 * Everything text can reference as {KEY}: scale values, the user's fields and the
 * KP range of the sheet being shown. Sheet 0 is the first sheet of the route.
 */
export function templateTokens(t: ChartTemplate, sheetIndex = 0): Record<string, string> {
  const start = parseFloat(t.fields.START_KP ?? '0') || 0;
  const step = (t.scale.kpPerSheet - t.scale.overlap) / 1000;
  const kpStart = start + sheetIndex * step;
  const kpEnd = kpStart + t.scale.kpPerSheet / 1000;
  return {
    ...scaleTokens(t),
    ...t.fields,
    KP_START: kpStart.toFixed(3),
    KP_END: kpEnd.toFixed(3),
  };
}
