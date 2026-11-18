import type { Dataset, EventRecord } from "./datasets";
import { pointAt, type Route } from "./route";

export type MarkerShape = "circle" | "x" | "plus" | "triangle" | "square";

export const MARKER_SHAPES: [MarkerShape, string][] = [
  ["circle", "Circle"],
  ["x", "X"],
  ["plus", "+"],
  ["triangle", "Triangle"],
  ["square", "Square"],
];

/** An Excel-style filter on one column: the values kept, a number range, or both. */
export interface ColFilter {
  values?: string[];
  min?: number;
  max?: number;
}

/** Events from a listing plotted as symbols in the plan view (and the key plan). */
export interface PointSet {
  id: string;
  name: string;
  /** The events data set it comes from, by file name: a re-imported file updates the points. */
  source: string;
  /** Kept rows: those passing every column filter, less the ones unticked by hand. */
  filters: Record<string, ColFilter>;
  skip: string[];
  shape: MarkerShape;
  /** Symbol size on paper, mm. */
  size: number;
  color: string;
  width: number;
  fill: "none" | "solid" | "hatch";
  fillColor?: string;
  /** Description: the chosen columns (in this order) between the user's own text. */
  label: {
    show: boolean;
    cols: string[];
    before: string;
    after: string;
    sep: string;
    size: number;
    color: string;
  };
  keyplan: boolean;
  /** Points moved by hand (grid metres) and labels moved by hand (paper mm from the point). */
  moves?: Record<string, { de: number; dn: number }>;
  labelAt?: Record<string, { dx: number; dy: number }>;
  /** Own wording of one point's description. */
  texts?: Record<string, string>;
  hidden?: string[];
}

export function newPointSet(id: string, source: string): PointSet {
  return {
    id,
    name: "Events",
    source,
    filters: {},
    skip: [],
    shape: "circle",
    size: 2,
    color: "#e00000",
    width: 0.25,
    fill: "none",
    label: {
      show: true,
      cols: [],
      before: "",
      after: "",
      sep: " ",
      size: 1.6,
      color: "#000000",
    },
    keyplan: true,
  };
}

export interface EventTable {
  cols: string[];
  rows: { key: string; cells: string[]; rec: EventRecord }[];
}

const km = (m: number) => (m / 1000).toFixed(3);

/** An events data set as a table: KP first, then the file's own columns. Keys stay the same after a re-import. */
export function eventTable(
  d: Extract<Dataset, { kind: "events" }>,
): EventTable {
  const cols = [
    "KP (km)",
    ...(d.columns?.length ? d.columns : ["Code", "Value"]),
  ];
  const seen = new Map<string, number>();
  const rows = d.records.map((rec) => {
    const base = `${rec.code}@${rec.kp.toFixed(2)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const cells = [
      km(rec.kp),
      ...(d.columns?.length ? (rec.cells ?? []) : [rec.code, rec.value]),
    ];
    return { key: n ? `${base}#${n}` : base, cells, rec };
  });
  return { cols, rows };
}

export const asNumber = (s: string) => {
  const v = Number(String(s).replace(/,/g, "").trim());
  return s.trim() !== "" && Number.isFinite(v) ? v : null;
};

/** Does a row pass every column filter? */
export function passes(
  cells: string[],
  cols: string[],
  filters: Record<string, ColFilter>,
): boolean {
  for (const [col, f] of Object.entries(filters)) {
    const i = cols.indexOf(col);
    if (i < 0) continue;
    const c = (cells[i] ?? "").trim();
    if (f.values && !f.values.includes(c)) return false;
    if (f.min !== undefined || f.max !== undefined) {
      const v = asNumber(c);
      if (v === null) return false;
      if (f.min !== undefined && v < f.min) return false;
      if (f.max !== undefined && v > f.max) return false;
    }
  }
  return true;
}

/** The file's Easting and Northing columns, if it has them. */
export function enColumns(cols: string[]): [number, number] | null {
  const find = (re: RegExp) => cols.findIndex((c) => re.test(c.trim()));
  const e = find(/^(easting|east|e|x)(\b|[\s_(.[])/i);
  const n = find(/^(northing|north|n|y)(\b|[\s_(.[])/i);
  return e >= 0 && n >= 0 ? [e, n] : null;
}

export interface PlotPoint {
  key: string;
  e: number;
  n: number;
  text: string;
}

export function labelOf(set: PointSet, cols: string[], cells: string[]) {
  const parts = set.label.cols
    .map((c) => cols.indexOf(c))
    .filter((i) => i >= 0)
    .map((i) => (cells[i] ?? "").trim())
    .filter(Boolean);
  return [set.label.before, parts.join(set.label.sep), set.label.after]
    .filter((x) => x && x.trim())
    .join(set.label.sep === "\n" ? "\n" : " ");
}

/**
 * Where the set's points are, in grid metres. Rows without Easting/Northing go on the survey
 * line at their KP (`byKp` says how many did); `k0` is the KP of the line's start, metres.
 */
export function plotPoints(
  set: PointSet,
  d: Extract<Dataset, { kind: "events" }> | undefined,
  route: Route | null,
  k0: number,
): { points: PlotPoint[]; byKp: number } {
  if (!d) return { points: [], byKp: 0 };
  const { cols, rows } = eventTable(d);
  const en = enColumns(cols);
  const skip = new Set([...set.skip, ...(set.hidden ?? [])]);
  const points: PlotPoint[] = [];
  let byKp = 0;
  for (const r of rows) {
    if (skip.has(r.key) || !passes(r.cells, cols, set.filters)) continue;
    let e = NaN;
    let n = NaN;
    if (en) {
      e = asNumber(r.cells[en[0]] ?? "") ?? NaN;
      n = asNumber(r.cells[en[1]] ?? "") ?? NaN;
    }
    if (!Number.isFinite(e) || !Number.isFinite(n)) {
      if (!route) continue;
      const c = r.rec.kp - k0;
      if (c < 0 || c > route.length) continue;
      [e, n] = pointAt(route, c);
      byKp++;
    }
    const mv = set.moves?.[r.key];
    points.push({
      key: r.key,
      e: e + (mv?.de ?? 0),
      n: n + (mv?.dn ?? 0),
      text: set.texts?.[r.key] ?? labelOf(set, cols, r.cells),
    });
  }
  return { points, byKp };
}
