import type { Linework } from "./dxf";
import type { LegendShape } from "./types";

type Project = (e: number, n: number) => [number, number];

// Only a drawing of an absurd size is thinned: circles and arcs keep every point they have.
const MAX_POINTS = 400000;

/**
 * The chosen objects of a drawing as a legend symbol: their lines as they look in the plan
 * view (paper orientation), centred on 0 and scaled so the longer side is 1. Lines keep the
 * colour they have in the drawing (`colourOf`).
 */
export function shapeFrom(
  sources: {
    lw: Linework;
    groups: ReadonlySet<number>;
    colourOf: (i: number) => string;
    widthOf?: (i: number) => number;
  }[],
  project: Project,
): LegendShape | null {
  const lines: number[][] = [];
  const colors: string[] = [];
  const widths: number[] = [];
  let total = 0;
  for (const { lw, groups, colourOf, widthOf } of sources)
    lw.lines.forEach((l, i) => {
      if (!groups.has(lw.groups[i]) || l.length < 4) return;
      const pts: number[] = [];
      for (let k = 0; k < l.length; k += 2)
        pts.push(...project(l[k], l[k + 1]));
      lines.push(pts);
      colors.push(colourOf(i));
      widths.push(widthOf ? widthOf(i) : 0.03);
      total += pts.length / 2;
    });
  if (!lines.length) return null;
  // Very dense objects are thinned so the legend stays light.
  const step = Math.max(1, Math.ceil(total / MAX_POINTS));
  const thin = lines.map((pts) => {
    if (step === 1 || pts.length <= 8) return pts;
    const out: number[] = [];
    const n = pts.length / 2;
    for (let j = 0; j < n; j += step) out.push(pts[2 * j], pts[2 * j + 1]);
    if ((n - 1) % step) out.push(pts[2 * n - 2], pts[2 * n - 1]);
    return out;
  });
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const pts of thin)
    for (let k = 0; k < pts.length; k += 2) {
      x0 = Math.min(x0, pts[k]);
      x1 = Math.max(x1, pts[k]);
      y0 = Math.min(y0, pts[k + 1]);
      y1 = Math.max(y1, pts[k + 1]);
    }
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    lines: thin.map((pts) =>
      pts.map(
        (v, k) => Math.round(((v - (k % 2 ? cy : cx)) / span) * 1e4) / 1e4,
      ),
    ),
    colors,
    widths,
  };
}

/** A shape's lines placed on the sheet: centre, size (mm) and turn (degrees clockwise on paper). */
export function placeShape(
  shape: LegendShape,
  cx: number,
  cy: number,
  size: number,
  rot: number,
): number[][] {
  const a = (rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return shape.lines.map((pts) => {
    const out: number[] = [];
    for (let k = 0; k < pts.length; k += 2) {
      const x = pts[k] * size;
      const y = pts[k + 1] * size;
      out.push(cx + x * c - y * s, cy + x * s + y * c);
    }
    return out;
  });
}
