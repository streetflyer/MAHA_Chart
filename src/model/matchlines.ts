import type { MatchlineStyle, MatchPair } from "./types";
import { pointAt, type Route } from "./route";

export const DEFAULT_MATCHLINES: MatchlineStyle = {
  on: false,
  mode: "overlap",
  prefix: "Matchline to ",
  suffix: "",
  extra: "",
  color: "#6b6b6b",
  width: 0.15,
  dash: "4 1.5 0.8 1.5",
  textSize: 2.5,
  family: "Arial",
};

export interface MatchSpec {
  /** KP in metres. */
  kp: number;
  /** Which side of the line the other chart lies on along the route: -1 lower KP, +1 higher KP. */
  side: -1 | 1;
  /** Number (from 1) of the other chart, for the label. */
  chart: number;
  /** A line drawn by the user (grid metres); unset: square to the route. */
  a?: [number, number];
  b?: [number, number];
}

/**
 * Matchlines for chart `index` given every chart's KP range (metres).
 * overlap: the end of the previous chart and the start of the next one, as they fall inside this chart.
 * profile: this chart's own start and end.
 *
 * `shown` gives the KPs each chart's plan view really shows. A chart that was panned,
 * turned or fitted to a curve can show another stretch than its own range; where a
 * matchline from the ranges would fall outside what this chart shows, the shown KPs are
 * used instead, so the line is still drawn where the two charts meet.
 */
export function matchSpecs(
  ranges: { start: number; end: number }[],
  index: number,
  mode: MatchlineStyle["mode"],
  shown?: ({ start: number; end: number } | null | undefined)[],
  /** Matchlines picked or drawn in the key plan: they win over the automatic ones. */
  pairs?: Record<string, MatchPair>,
): MatchSpec[] {
  const out: MatchSpec[] = [];
  const me = ranges[index];
  const prev = ranges[index - 1];
  const next = ranges[index + 1];
  if (!me) return out;
  const mine = shown?.[index];
  const seen = (kp: number) =>
    !mine || (kp >= mine.start - 0.5 && kp <= mine.end + 0.5);
  const pick = (kp: number, other: number | undefined) =>
    seen(kp) || other === undefined || !seen(other) ? kp : other;
  const own = (i: number) => pairs?.[String(i)];
  const before = own(index - 1);
  const after = own(index);
  if (prev && before) out.push({ ...before, side: -1, chart: index });
  else if (prev)
    out.push({
      kp:
        mode === "overlap"
          ? pick(prev.end, shown?.[index - 1]?.end)
          : pick(me.start, mine?.start),
      side: -1,
      chart: index,
    });
  if (next && after) out.push({ ...after, side: 1, chart: index + 2 });
  else if (next)
    out.push({
      kp:
        mode === "overlap"
          ? pick(next.start, shown?.[index + 1]?.start)
          : pick(me.end, mine?.end),
      side: 1,
      chart: index + 2,
    });
  return out;
}

/**
 * Drawing number of another chart. The sheet number after the last dot is replaced
 * (…CH-002.001 → …CH-002.002); without a dot, the last number is (…UMB1-CH-01 → …UMB1-CH-02).
 */
export function chartName(drawingNo: string, n: number): string {
  const no = drawingNo.trim();
  if (!no) return `Chart ${n}`;
  const dot = /^(.*\.)(\d+)$/.exec(no);
  if (dot) return dot[1] + String(n).padStart(dot[2].length, "0");
  const tail = /^(.*?)(\d+)(\D*)$/.exec(no);
  if (tail) return tail[1] + String(n).padStart(tail[2].length, "0") + tail[3];
  return `${no}.${String(n).padStart(3, "0")}`;
}

/** "Matchline to " + the other chart's drawing number; a prefix typed without its space still reads right. */
export const matchLabel = (
  st: MatchlineStyle,
  chart: number,
  drawingNo = "",
) => {
  const pre = /[A-Za-z0-9)]$/.test(st.prefix) ? `${st.prefix} ` : st.prefix;
  return `${pre}${chartName(drawingNo, chart)}${st.suffix}`;
};

/** Every boundary's matchline once (for the key plan): the line chart i draws towards chart i + 1. */
export function boundaryLines(
  ranges: { start: number; end: number }[],
  mode: MatchlineStyle["mode"],
  shown?: ({ start: number; end: number } | null | undefined)[],
  pairs?: Record<string, MatchPair>,
): (MatchSpec & { boundary: number })[] {
  const out: (MatchSpec & { boundary: number })[] = [];
  for (let i = 0; i + 1 < ranges.length; i++) {
    const m = matchSpecs(ranges, i, mode, shown, pairs).find(
      (x) => x.side === 1,
    );
    if (m) out.push({ ...m, boundary: i });
  }
  return out;
}

function inside(poly: [number, number][], e: number, n: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > n !== yj > n && e < ((xj - xi) * (n - yi)) / (yj - yi) + xi)
      c = !c;
  }
  return c;
}

/**
 * Where neighbouring chart frames overlap along the route: for each boundary i (chart i
 * and i + 1), the KP stretches (m) of the line inside both frames. These are where a
 * matchline can be picked in the key plan.
 */
export function overlapStretches(
  frames: [number, number][][],
  route: Route,
  k0: number,
): [number, number][][] {
  const step = Math.max(0.25, route.length / 4000);
  const out: [number, number][][] = [];
  for (let i = 0; i + 1 < frames.length; i++) {
    const runs: [number, number][] = [];
    let start: number | null = null;
    for (let s = 0; s <= route.length + 1e-6; s += step) {
      const c = Math.min(s, route.length);
      const [e, n] = pointAt(route, c);
      const ok = inside(frames[i], e, n) && inside(frames[i + 1], e, n);
      if (ok && start === null) start = c;
      if (!ok && start !== null) {
        runs.push([k0 + start, k0 + c - step]);
        start = null;
      }
    }
    if (start !== null) runs.push([k0 + start, k0 + route.length]);
    out.push(runs.filter(([a, b]) => b >= a));
  }
  return out;
}

/** Chainage (m from the route's start) where the segment a–b crosses the route first, or null. */
export function crossingChainage(
  route: Route,
  a: [number, number],
  b: [number, number],
): number | null {
  const en = route.en;
  let best: number | null = null;
  let bestT = Infinity;
  for (let i = 0; i + 1 < route.chain.length; i++) {
    const p: [number, number] = [en[2 * i], en[2 * i + 1]];
    const q: [number, number] = [en[2 * i + 2], en[2 * i + 3]];
    const r = [q[0] - p[0], q[1] - p[1]];
    const s = [b[0] - a[0], b[1] - a[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = [a[0] - p[0], a[1] - p[1]];
    const t = (w[0] * s[1] - w[1] * s[0]) / den; // along the route leg
    const u = (w[0] * r[1] - w[1] * r[0]) / den; // along the drawn line
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    if (u < bestT) {
      bestT = u;
      best = route.chain[i] + t * (route.chain[i + 1] - route.chain[i]);
    }
  }
  return best;
}

/** Where two chart frames overlap: the part of `subject` inside the convex `clip` (Sutherland–Hodgman). */
export function clipPolygon(
  subject: [number, number][],
  clip: [number, number][],
): [number, number][] {
  // Orientation of the clip polygon, so "inside" is the same side for either winding.
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const [x1, y1] = clip[i];
    const [x2, y2] = clip[(i + 1) % clip.length];
    area += x1 * y2 - x2 * y1;
  }
  const sgn = area >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: [number, number]) =>
      sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

/**
 * The boundary a matchline at `kp` (m) belongs to, among the two around chart `index`:
 * the one whose overlap holds it, else the nearer meeting point. Null for a single chart.
 */
export function boundaryFor(
  kp: number,
  index: number,
  ranges: { start: number; end: number }[],
  stretches?: [number, number][][],
): number | null {
  const cand = [index - 1, index].filter(
    (b) => b >= 0 && b + 1 < ranges.length,
  );
  if (!cand.length) return null;
  const inRun = cand.find((b) =>
    stretches?.[b]?.some(([s, e]) => kp >= s - 0.5 && kp <= e + 0.5),
  );
  if (inRun !== undefined) return inRun;
  const meet = (b: number) => (ranges[b].end + ranges[b + 1].start) / 2;
  return cand.reduce((x, y) =>
    Math.abs(meet(x) - kp) <= Math.abs(meet(y) - kp) ? x : y,
  );
}

/** The KP (m) nearest `kp` that lies in one of the runs (it is returned as is when no run is given). */
export function clampToRuns(kp: number, runs: [number, number][]): number {
  if (!runs.length) return kp;
  let best = kp;
  let d = Infinity;
  for (const [s, e] of runs) {
    const c = Math.min(Math.max(kp, s), e);
    if (Math.abs(c - kp) < d) {
      d = Math.abs(c - kp);
      best = c;
    }
  }
  return best;
}
