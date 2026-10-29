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
 * Called after the plan view width changed. Depending on the lock, either the
 * scale or the KP range per sheet absorbs the change.
 */
export function syncScaleToPlan(t: ChartTemplate): ChartTemplate {
  const plan = planPanel(t);
  if (!plan) return t;
  const scale = { ...t.scale };
  if (scale.lock === 'kp') {
    scale.horizontal = roundScale(scaleForWidth(plan.w, scale.kpPerSheet));
  } else {
    scale.kpPerSheet = round(kpForWidth(plan.w, scale.horizontal), 3);
  }
  return alignKpPanels({ ...t, scale });
}

/**
 * Called after the user typed a new horizontal scale. With the KP range locked the
 * plan view (and every KP-aligned panel) is resized; otherwise the KP range follows.
 */
export function setHorizontalScale(t: ChartTemplate, value: number): ChartTemplate {
  if (!(value > 0)) return t;
  const plan = planPanel(t);
  const scale = { ...t.scale, horizontal: value };
  if (!plan) return { ...t, scale };
  if (scale.lock === 'kp') {
    const maxW = t.paper.width - plan.x - t.paper.frameInset;
    const w = Math.min(widthForScale(scale.kpPerSheet, value), maxW);
    // If the paper can't fit the requested width, keep the scale and shorten the KP range instead.
    if (w < widthForScale(scale.kpPerSheet, value)) scale.kpPerSheet = round(kpForWidth(w, value), 3);
    const panels = t.panels.map((p) => (p.id === plan.id ? { ...p, w } : p));
    return alignKpPanels({ ...t, scale, panels });
  }
  scale.kpPerSheet = round(kpForWidth(plan.w, value), 3);
  return { ...t, scale };
}

export function setKpPerSheet(t: ChartTemplate, metres: number): ChartTemplate {
  if (!(metres > 0)) return t;
  const plan = planPanel(t);
  const scale = { ...t.scale, kpPerSheet: metres };
  if (plan) scale.horizontal = roundScale(scaleForWidth(plan.w, metres));
  return { ...t, scale };
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
