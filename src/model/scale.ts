import type { SheetFrame } from './types';
import type { ChartTemplate, Panel } from './types';

/** Horizontal scale and KP per sheet are tied together by the plan view width: kp(m) = width(mm) x scale / 1000. */
export function planPanel(t: ChartTemplate): Panel | undefined {
  return t.panels.find((p) => p.type === 'plan');
}

export function kpForWidth(widthMm: number, scale: number): number {
  return (widthMm * scale) / 1000;
}

export function scaleForWidth(widthMm: number, kpMetres: number): number {
  return (kpMetres * 1000) / widthMm;
}

export function widthForScale(kpMetres: number, scale: number): number {
  return (kpMetres * 1000) / scale;
}

/** Make every KP-aligned panel share the plan view's horizontal extent. */
export function alignKpPanels(t: ChartTemplate): ChartTemplate {
  const plan = planPanel(t);
  if (!plan) return t;
  return {
    ...t,
    panels: t.panels.map((p) => (p.kpAligned && p.id !== plan.id ? { ...p, x: plan.x, w: plan.w } : p)),
  };
}

/**
 * The plan view works like an AutoCAD paper-space viewport: its size on paper is
 * fixed by the layout, and the scale only decides how much route fits inside it.
 * So KP per sheet is always derived from width and scale; nothing here resizes a panel.
 */
export function syncScaleToPlan(t: ChartTemplate): ChartTemplate {
  const plan = planPanel(t);
  if (!plan) return t;
  const kp = round(kpForWidth(plan.w, t.scale.horizontal), 3);
  const aligned = alignKpPanels(t);
  return kp === t.scale.kpPerSheet ? aligned : { ...aligned, scale: { ...t.scale, kpPerSheet: kp } };
}

export function setHorizontalScale(t: ChartTemplate, value: number): ChartTemplate {
  if (!(value > 0)) return t;
  return syncScaleToPlan({ ...t, scale: { ...t.scale, horizontal: value } });
}

/** Typing a KP length per sheet picks the scale that fits it into the plan view. */
export function setKpPerSheet(t: ChartTemplate, metres: number): ChartTemplate {
  if (!(metres > 0)) return t;
  const plan = planPanel(t);
  if (!plan) return { ...t, scale: { ...t.scale, kpPerSheet: metres } };
  return syncScaleToPlan({ ...t, scale: { ...t.scale, horizontal: roundScale(scaleForWidth(plan.w, metres)) } });
}

/**
 * Number of sheets needed to cover the whole survey line. Each sheet starts where
 * the previous one ended, less any overlap the user asked for.
 */
export function sheetCount(t: ChartTemplate): number {
  const { routeLength, kpPerSheet } = t.scale;
  const list = t.scale.sheets;
  if (!(kpPerSheet > 0)) return Math.max(1, list?.length ?? 1);
  if (!list?.length && !(routeLength > 0)) return 1;
  // Keep adding charts until the end of the line is covered.
  const end = startKp(t) * 1000 + Math.max(routeLength, 0);
  let n = Math.max(1, list?.length ?? 1);
  while (n < 500 && sheetRange(t, n - 1).end * 1000 < end - 1e-6) n++;
  return n;
}

const startKp = (t: ChartTemplate) => parseFloat(t.fields.START_KP ?? '0') || 0;
const sheetStep = (t: ChartTemplate) => Math.max(t.scale.kpPerSheet - t.scale.overlap, t.scale.kpPerSheet * 0.05);

/** KP range of one sheet, in kilometres. */
export function sheetRange(t: ChartTemplate, index: number): { start: number; end: number } {
  const list = t.scale.sheets;
  let start: number;
  if (list?.length) {
    const last = list.length - 1;
    start = index <= last ? list[index].start : list[last].start + (index - last) * sheetStep(t);
  } else start = startKp(t) * 1000 + index * sheetStep(t);
  return { start: start / 1000, end: (start + t.scale.kpPerSheet) / 1000 };
}

export function sheetRotation(t: ChartTemplate, index: number): number {
  return t.scale.sheets?.[index]?.rotation ?? 0;
}

/** Every chart as an explicit frame, ready to be edited by hand. */
export function materializeSheets(t: ChartTemplate): SheetFrame[] {
  return Array.from({ length: sheetCount(t) }, (_, i) => ({ start: sheetRange(t, i).start * 1000, rotation: sheetRotation(t, i) }));
}

/** Change one chart (materializing the even layout first). */
export function editSheet(t: ChartTemplate, index: number, patch: Partial<SheetFrame>): ChartTemplate {
  const sheets = materializeSheets(t);
  if (!sheets[index]) return t;
  sheets[index] = { ...sheets[index], ...patch };
  return { ...t, scale: { ...t.scale, sheets } };
}

/** Add a chart after `index`, halfway along, for a sharp turn that needs an extra frame. */
export function insertSheet(t: ChartTemplate, index: number): ChartTemplate {
  const sheets = materializeSheets(t);
  const a = sheets[index];
  const b = sheets[index + 1];
  const start = b ? (a.start + b.start) / 2 : a.start + sheetStep(t);
  sheets.splice(index + 1, 0, { start, rotation: 0 });
  return { ...t, scale: { ...t.scale, sheets } };
}

export function deleteSheet(t: ChartTemplate, index: number): ChartTemplate {
  const sheets = materializeSheets(t);
  if (sheets.length <= 1) return t;
  sheets.splice(index, 1);
  return { ...t, scale: { ...t.scale, sheets } };
}

/** Keep typed-in scales tidy without snapping away a deliberate value. */
function roundScale(s: number): number {
  return s >= 100 ? Math.round(s) : round(s, 2);
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** A "nice" scale bar: picks a round ground length that fits the available paper length. */
export function niceScaleBar(scale: number, maxPaperMm: number): { metres: number; divisions: number; paperMm: number } {
  const maxMetres = (maxPaperMm * scale) / 1000;
  const pow = 10 ** Math.floor(Math.log10(maxMetres));
  const candidates = [5, 4, 2.5, 2, 1].map((m) => m * pow);
  const metres = candidates.find((c) => c <= maxMetres) ?? pow;
  const lead = metres / pow;
  const divisions = lead === 2.5 || lead === 5 ? 5 : lead === 4 || lead === 2 ? 4 : 5;
  return { metres, divisions, paperMm: (metres * 1000) / scale };
}

export function formatScale(s: number): string {
  return `1:${Math.round(s).toLocaleString('en-US')}`;
}

/** Values available to text as {TOKEN}. Template fields override nothing here; they are merged on top. */
export function scaleTokens(t: ChartTemplate): Record<string, string> {
  const s = t.scale;
  return {
    H_SCALE: formatScale(s.horizontal),
    V_SCALE_LONG: formatScale(s.verticalLong),
    V_SCALE_TRANS: formatScale(s.verticalTrans),
    L_SCALE_TRANS: formatScale(s.lateralTrans),
    KP_PER_SHEET: (s.kpPerSheet / 1000).toFixed(3),
    PAPER: t.paper.size,
  };
}

export function resolveTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{([A-Z0-9_#]+)\}/g, (m, key: string) => (key in values ? values[key] : m));
}
