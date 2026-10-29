import { parseDxfLinework } from '../model/dxf';
import { parseRoute } from '../model/route';
import { useEditor } from '../state/store';
import { useSurvey } from '../state/surveyData';

const ROUTE_EXT = /\.(dig|xyz|txt|csv)$/i;

/**
 * Early part of data import: a route file sets the survey line (and so the number
 * of charts), a DXF becomes the key plan background. Returns what was not handled.
 */
export async function importSurveyFiles(files: File[], notice: (m: string) => void): Promise<File[]> {
  const left: File[] = [];
  const done: string[] = [];
  for (const f of files) {
    if (/\.dxf$/i.test(f.name)) {
      const lw = parseDxfLinework(await f.text(), f.name);
      if (!lw) {
        notice(`${f.name}: no lines, polylines or arcs found in its ENTITIES section (binary DXF is not supported).`);
        continue;
      }
      useSurvey.getState().setBackground(lw);
      done.push(`${f.name} as key plan background (${lw.lines.length} lines)`);
    } else if (ROUTE_EXT.test(f.name)) {
      const r = parseRoute(await f.text(), f.name);
      if (!r) {
        left.push(f);
        continue;
      }
      useSurvey.getState().setRoute(r);
      useEditor.getState().setScale({ routeLength: Math.round(r.length * 1000) / 1000, sheetShift: undefined });
      done.push(`${f.name} as the survey line (${(r.length / 1000).toFixed(3)} km)`);
    } else left.push(f);
  }
  if (done.length) notice(`Loaded ${done.join('; ')}.`);
  return left;
}
