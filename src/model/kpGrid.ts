import type { Dataset } from "./datasets";
import type { Panel, PanelKpLine } from "./types";

/** KP range (m) of a dataset's readings, or null when it has none. */
export function dataKpExtent(d: Dataset): [number, number] | null {
  let kps: ArrayLike<number> | null = null;
  if (d.kind === "long" || d.kind === "trans") kps = d.kp;
  else if (d.kind === "events") kps = d.records.map((r) => r.kp);
  else if (d.kind === "cp") kps = d.kp;
  if (!kps || !kps.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < kps.length; i++) {
    const v = kps[i];
    if (Number.isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * The KPs (m) of the extra vertical grid lines of a profile panel on one chart:
 * the line at the left edge where the plan view's line starts, and the ones the user
 * added. `seen` is the stretch of line the plan view shows (null: no line).
 */
export function extraGridKps(
  p: Panel,
  data: Dataset[],
  seen: [number, number] | null,
): number[] {
  const out: number[] = [];
  const profile = p.type === "longProfile" || p.type === "transProfile";
  if (profile && p.kpStartLine !== false && seen) out.push(seen[0]);
  // Where the data of this chart lies: the readings inside the plan view's stretch.
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of data) {
    const e = dataKpExtent(d);
    if (!e) continue;
    lo = Math.min(lo, seen ? Math.max(e[0], seen[0]) : e[0]);
    hi = Math.max(hi, seen ? Math.min(e[1], seen[1]) : e[1]);
  }
  for (const g of p.kpGrid ?? []) {
    if (g.at === "left" && lo <= hi) out.push(lo);
    else if (g.at === "right" && lo <= hi) out.push(hi);
    else if (g.at === "kp" && g.kp !== undefined) {
      if (!seen || (g.kp >= seen[0] - 0.5 && g.kp <= seen[1] + 0.5))
        out.push(g.kp);
    }
  }
  // One line per KP.
  return out
    .sort((a, b) => a - b)
    .filter((k, i, a) => i === 0 || k - a[i - 1] > 0.05);
}

/** Add a grid line to a panel (the same one is not added twice). */
export function withGridLine(p: Panel, line: PanelKpLine): PanelKpLine[] {
  const have = p.kpGrid ?? [];
  const same = (a: PanelKpLine) =>
    a.at === line.at && (a.at !== "kp" || Math.abs(a.kp! - line.kp!) < 0.05);
  return have.some(same) ? have : [...have, line];
}
