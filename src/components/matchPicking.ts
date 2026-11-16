import {
  boundaryFor,
  clampToRuns,
  crossingChainage,
  overlapStretches,
} from "../model/matchlines";
import { chartFrames, nearestChainage, type Route } from "../model/route";
import { planPanel, sheetCount, sheetRange } from "../model/scale";
import type { ChartTemplate, MatchPair } from "../model/types";
import { planStyle } from "../model/planStyle";
import { useMatchPick } from "../state/matchPick";
import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";

/** Paper mm to grid E, N for a key plan, from its data-mview attribute. */
export function keyplanToGrid(view: string) {
  const [minE, maxN, k, ax, ay] = view.split(",").map(Number);
  return (x: number, y: number): [number, number] => [
    minE + (x - ax) / k,
    maxN - (y - ay) / k,
  ];
}

const startKp = (t: ChartTemplate) =>
  (parseFloat(t.fields.START_KP ?? "0") || 0) * 1000;

const rangesOf = (t: ChartTemplate) =>
  Array.from({ length: sheetCount(t) }, (_, i) => {
    const r = sheetRange(t, i);
    return { start: r.start * 1000, end: r.end * 1000 };
  });

/** Set (or with null, clear) the matchline of boundary `b` (charts b + 1 and b + 2). */
export function withMatchPair(
  t: ChartTemplate,
  b: number | null,
  pair: MatchPair | null,
): ChartTemplate {
  const plan = planPanel(t);
  if (!plan) return t;
  const match = plan.plan?.match ?? {};
  const pairs = { ...(match.pairs ?? {}) };
  if (b === null) for (const k of Object.keys(pairs)) delete pairs[k];
  else if (pair) pairs[String(b)] = pair;
  else delete pairs[String(b)];
  return {
    ...t,
    panels: t.panels.map((p) =>
      p.id === plan.id
        ? {
            ...p,
            plan: {
              ...planStyle(p),
              // A matchline just chosen should show.
              match: { ...match, on: pair ? true : (match.on ?? false), pairs },
            },
          }
        : p,
    ),
  };
}

/** The overlaps of every pair of neighbouring charts along the line (KP runs, m). */
export function stretchesOf(t: ChartTemplate, route: Route) {
  return overlapStretches(chartFrames(t, route), route, startKp(t));
}

/** Where a click in pick mode puts the matchline of boundary `b`: KP (m), inside the overlap. */
export function pickedKp(
  t: ChartTemplate,
  route: Route,
  b: number,
  g: [number, number],
): number {
  const kp = startKp(t) + nearestChainage(route, g[0], g[1]);
  return clampToRuns(kp, stretchesOf(t, route)[b] ?? []);
}

/**
 * A line drawn from a to b (grid): the matchline it makes, and the boundary it is for
 * (around the chart on screen). Null when it doesn't cross the line.
 */
export function drawnMatch(
  t: ChartTemplate,
  route: Route,
  index: number,
  a: [number, number],
  b: [number, number],
): { boundary: number; pair: MatchPair } | null {
  const c = crossingChainage(route, a, b);
  if (c === null) return null;
  const kp = startKp(t) + c;
  const boundary = boundaryFor(kp, index, rangesOf(t), stretchesOf(t, route));
  if (boundary === null) return null;
  return { boundary, pair: { kp, a, b } };
}

/** A click on the sheet while choosing matchlines. Returns a notice, or null; false: the click was outside the key plan. */
export function matchClick(
  target: Element,
  x: number,
  y: number,
): string | null | false {
  const mp = useMatchPick.getState();
  const ed = useEditor.getState();
  const t = ed.template;
  const route = useSurvey.getState().route;
  const area = target.closest("[data-mview]");
  if (!t || !route || !area) return false;
  const g = keyplanToGrid(area.getAttribute("data-mview")!)(x, y);
  if (mp.tool === "pick") {
    const hit = target.closest("[data-mpick]");
    if (!hit) return "Click one of the green overlaps.";
    const b = Number(hit.getAttribute("data-mpick"));
    const kp = pickedKp(t, route, b, g);
    ed.commit((tt) => withMatchPair(tt, b, { kp }));
    return `Matchline of Charts ${b + 1} and ${b + 2} at KP ${(kp / 1000).toFixed(3)}.`;
  }
  if (!mp.first) {
    mp.setFirst(g);
    return null;
  }
  const m = drawnMatch(t, route, ed.sheetIndex, mp.first, g);
  mp.setFirst(null);
  if (!m) return "The line must cross the survey line next to this chart.";
  ed.commit((tt) => withMatchPair(tt, m.boundary, m.pair));
  return `Matchline of Charts ${m.boundary + 1} and ${m.boundary + 2} at KP ${(m.pair.kp / 1000).toFixed(3)}.`;
}
