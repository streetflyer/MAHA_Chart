/**
 * VisualWorks "Cross-Profile - RAW v10.1" exports from NaviModel: one profile per
 * line, no header. Columns (0-based): 2 KP (km), 7 pipe diameter, 8 distance from
 * ROV to pipe, 9 delta depth ROV to top of pipe (+down), 12 number of raw
 * points N, then N (dx, dz) pairs from 13 on (dz +down from the ROV).
 */

export interface CrossProfileCols {
  kp: number;
  diameter: number;
  toPipe: number;
  pipeDz: number;
  count: number;
  first: number;
}

export const VW_RAW: CrossProfileCols = {
  kp: 2,
  diameter: 7,
  toPipe: 8,
  pipeDz: 9,
  count: 12,
  first: 13,
};

export interface CrossProfile {
  /** KP in metres. */
  kp: number;
  diameter: number;
  /** Seabed points relative to the pipe centre: lateral (m, + one side) and height (m, + up). */
  pts: Float32Array;
}

/** One profile from a split row, or null if the row isn't one. */
export function profileFromRow(
  r: ArrayLike<string>,
  c: CrossProfileCols,
  kpScale: number,
): CrossProfile | null {
  const kp = Number(r[c.kp]) * kpScale;
  const n = Number(r[c.count]);
  if (!Number.isFinite(kp) || !Number.isFinite(n) || n < 0) return null;
  const diameter = Number(r[c.diameter]) || 0;
  const toPipe = Number(r[c.toPipe]) || 0;
  const pipeDz = Number(r[c.pipeDz]);
  const centre = (Number.isFinite(pipeDz) ? pipeDz : 0) + diameter / 2;
  const pts = new Float32Array(2 * n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const dx = Number(r[c.first + 2 * i]);
    const dz = Number(r[c.first + 2 * i + 1]);
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) continue;
    pts[k++] = dx - toPipe;
    pts[k++] = centre - dz;
  }
  return { kp, diameter, pts: k === pts.length ? pts : pts.slice(0, k) };
}

/** The profile nearest a KP, if one lies within `tol` metres (profiles sorted by KP). */
export function nearestProfile(
  list: CrossProfile[],
  kp: number,
  tol: number,
): CrossProfile | null {
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].kp < kp) lo = mid + 1;
    else hi = mid;
  }
  let best: CrossProfile | null = null;
  for (const i of [lo - 1, lo]) {
    const p = list[i];
    if (
      p &&
      Math.abs(p.kp - kp) <= tol &&
      (!best || Math.abs(p.kp - kp) < Math.abs(best.kp - kp))
    )
      best = p;
  }
  return best;
}
