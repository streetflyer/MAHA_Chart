import type { Dataset, KpMatch } from "./datasets";
import { makeRoute, pointAt, type Route } from "./route";

/** First and last KP (m) of the visible longitudinal profiles. */
export function longExtent(datasets: Dataset[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of datasets)
    if (d.kind === "long" && d.visible && d.kp.length) {
      lo = Math.min(lo, d.kp[0], d.kp[d.kp.length - 1]);
      hi = Math.max(hi, d.kp[0], d.kp[d.kp.length - 1]);
    }
  return hi > lo ? [lo, hi] : null;
}

/**
 * The stretch of a line from chainage a to b (m from its first point). Beyond either
 * end it carries on straight along the end leg, so a line shorter than the profile reaches it.
 */
export function cutLine(r: Route, a: number, b: number): number[] {
  const out = [...pointAt(r, a)];
  for (let i = 0; i < r.chain.length; i++)
    if (r.chain[i] > a + 1e-6 && r.chain[i] < b - 1e-6)
      out.push(r.en[2 * i], r.en[2 * i + 1]);
  out.push(...pointAt(r, b));
  return out;
}

/** Chainage range kept for a match: the line starts at KP 0 as read. */
export function matchRange(
  mode: KpMatch,
  length: number,
  ext: [number, number] | null,
): [number, number] {
  if (!ext || mode === "none") return [0, length];
  return [
    mode === "start" || mode === "both" ? ext[0] : 0,
    mode === "end" || mode === "both" ? ext[1] : length,
  ];
}

const longestIndex = (lines: Float64Array[]) => {
  let best = 0;
  let bl = -1;
  lines.forEach((l, i) => {
    let s = 0;
    for (let j = 2; j < l.length; j += 2)
      s += Math.hypot(l[j] - l[j - 2], l[j + 1] - l[j - 1]);
    if (s > bl) {
      bl = s;
      best = i;
    }
  });
  return best;
};

/**
 * Apply a match to the survey line (its longest polyline) and to a runline copied from
 * it. Returns the dataset patches and the runline's new start KP (m), or null when there is
 * nothing to match.
 */
export function kpMatchPatches(
  datasets: Dataset[],
  surveyId: string,
  mode: KpMatch,
): {
  patches: { id: string; patch: Partial<Dataset> }[];
  routeStart: number | null;
  routeLength: number | null;
} | null {
  const sl = datasets.find((d) => d.id === surveyId);
  if (!sl || sl.kind !== "linework") return null;
  const full = sl.fullLines ?? sl.lw.lines;
  if (!full.length) return null;
  const ext = longExtent(datasets);
  const li = longestIndex(full);
  const line = makeRoute(sl.name, Array.from(full[li]));
  const [a, b] = matchRange(mode, line.length, ext);
  const cut =
    mode === "none" ? full[li] : new Float64Array(cutLine(line, a, b));
  const patches: { id: string; patch: Partial<Dataset> }[] = [
    {
      id: sl.id,
      patch: {
        kpMatch: mode,
        fullLines: mode === "none" ? undefined : full,
        lw: {
          ...sl.lw,
          lines: full.map((l, i) => (i === li ? cut : l)),
        },
      } as Partial<Dataset>,
    },
  ];
  let routeStart: number | null = null;
  let routeLength: number | null = null;
  const rd = datasets.find(
    (d) =>
      d.kind === "route" &&
      (d.fromSurvey === sl.id ||
        d.name === `${sl.name} (survey line as runline)`),
  );
  if (rd && rd.kind === "route") {
    const route =
      mode === "none" && rd.fullRoute
        ? rd.fullRoute
        : makeRoute(rd.route.name, Array.from(cut));
    patches.push({
      id: rd.id,
      patch: {
        route,
        fromSurvey: sl.id,
        fullRoute: mode === "none" ? undefined : (rd.fullRoute ?? rd.route),
      } as Partial<Dataset>,
    });
    routeStart = a;
    routeLength = route.length;
  }
  return { patches, routeStart, routeLength };
}
