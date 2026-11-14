import {
  DEFAULT_CP_LOOK,
  type CpLook,
  type CpNote,
  type CpPoint,
  type Dataset,
} from "./datasets";

type CpSet = Extract<Dataset, { kind: "cp" }>;

/** The readings of a CP dataset: the hand-edited list when there is one, else the imported ones. */
export const pointsOf = (d: CpSet): CpPoint[] =>
  d.pts ?? Array.from(d.kp, (kp, i) => ({ kp, mv: d.mv[i] }));

/** The dataset fields that put an edited list of readings in (kp and mv stay sorted for the rest of the app). */
export function pointsPatch(pts: CpPoint[], notes: CpNote[]): Partial<CpSet> {
  const order = pts.map((_, i) => i).sort((a, b) => pts[a].kp - pts[b].kp);
  return {
    pts,
    notes,
    kp: Float64Array.from(order, (i) => pts[i].kp),
    mv: Float64Array.from(order, (i) => pts[i].mv),
  };
}

/** Round a step up to 1, 2, 5 × 10ⁿ. */
function niceStep(raw: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

export interface CpLayout {
  look: CpLook;
  /** Paper y of a reading. */
  yOf(pt: CpPoint): number;
  /** Axis marks (mV and paper y), when readings are plotted by value. */
  ticks: { mv: number; y: number }[];
}

/** Where readings sit in their panel: one height, or the height of their value on an mV axis. */
export function cpLayout(d: CpSet, p: { y: number; h: number }): CpLayout {
  const look = { ...DEFAULT_CP_LOOK, ...d.look };
  const pts = pointsOf(d);
  const pad = 3;
  const fixed = (pt: CpPoint) => p.y + p.h * (pt.y ?? look.posY);
  if (look.yMode !== "value" || !pts.length)
    return { look, yOf: fixed, ticks: [] };
  let lo = look.yMin ?? Math.min(...pts.map((x) => x.mv));
  let hi = look.yMax ?? Math.max(...pts.map((x) => x.mv));
  if (!(hi > lo)) {
    lo -= 10;
    hi += 10;
  }
  const step = look.yStep > 0 ? look.yStep : niceStep((hi - lo) / 5);
  if (look.yMin === null) lo = Math.floor(lo / step) * step;
  if (look.yMax === null) hi = Math.ceil(hi / step) * step;
  const yv = (mv: number) =>
    p.y + pad + ((hi - mv) / (hi - lo)) * (p.h - 2 * pad);
  const ticks: { mv: number; y: number }[] = [];
  for (
    let v = Math.ceil(lo / step - 1e-9) * step;
    v <= hi + 1e-9 && ticks.length < 80;
    v += step
  )
    ticks.push({ mv: Math.round(v * 1e6) / 1e6, y: yv(v) });
  return {
    look,
    yOf: (pt) => (pt.y !== undefined ? fixed(pt) : yv(pt.mv)),
    ticks,
  };
}

/** Text of a reading: its own text, or the value with the suffix. */
export const cpLabel = (pt: CpPoint, look: CpLook) =>
  pt.text ?? `${Math.round(pt.mv * 100) / 100}${look.suffix}`;

/**
 * Anchor point, text-anchor and baseline shift of a reading placed at a clock position
 * around its symbol (12 above, 3 right, 6 below, 9 left), for text turned by `rot` degrees.
 */
export function clockText(
  clock: number,
  r: number,
  gap: number,
  cap: number,
  rot: number,
) {
  const a = (clock % 12) * 30 * (Math.PI / 180);
  const d = [Math.sin(a), -Math.cos(a)];
  const rr = (rot * Math.PI) / 180;
  const td = [Math.cos(rr), -Math.sin(rr)];
  const up = [-Math.sin(rr), -Math.cos(rr)];
  const along = td[0] * d[0] + td[1] * d[1];
  const anchor: "start" | "middle" | "end" =
    along > 0.3 ? "start" : along < -0.3 ? "end" : "middle";
  let ox = d[0] * (r + gap);
  let oy = d[1] * (r + gap);
  const side = up[0] * d[0] + up[1] * d[1];
  if (side < -0.3) {
    // The glyphs would reach back toward the symbol: put the baseline a text height further out.
    ox += d[0] * cap;
    oy += d[1] * cap;
  } else if (Math.abs(side) <= 0.3) {
    // Text beside the symbol: centre it on the symbol's height.
    ox -= (up[0] * cap) / 2;
    oy -= (up[1] * cap) / 2;
  }
  return { ox, oy, anchor };
}
