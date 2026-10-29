import { planPanel, sheetCount, sheetRange } from './scale';
import type { ChartTemplate } from './types';

/** A survey line in grid coordinates (metres), with running chainage along it. */
export interface Route {
  name: string;
  /** Interleaved easting, northing. */
  en: Float64Array;
  /** Chainage in metres at each vertex, starting at 0. */
  chain: Float64Array;
  length: number;
}

export interface Bounds {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/**
 * Read a route from a .dig, .xyz or simple listing: the first two numeric columns
 * are easting and northing, unless a header names EASTING / NORTHING columns.
 */
export function parseRoute(text: string, name: string): Route | null {
  let ei = 0;
  let ni = 1;
  const en: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = line.split(/[,;\t ]+/);
    if (!cells.every((c) => NUM.test(c))) {
      const up = cells.map((c) => c.toUpperCase());
      const e = up.findIndex((c) => c.startsWith('EAST') || c === 'E' || c === 'X');
      const n = up.findIndex((c) => c.startsWith('NORTH') || c === 'N' || c === 'Y');
      if (e >= 0 && n >= 0) {
        ei = e;
        ni = n;
      }
      continue;
    }
    const e = parseFloat(cells[ei]);
    const n = parseFloat(cells[ni]);
    if (Number.isFinite(e) && Number.isFinite(n)) en.push(e, n);
  }
  if (en.length < 4) return null;
  return makeRoute(name, en);
}

export function makeRoute(name: string, en: number[]): Route {
  const pts = new Float64Array(en);
  const chain = new Float64Array(pts.length / 2);
  for (let i = 1; i < chain.length; i++) {
    chain[i] = chain[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
  }
  return { name, en: pts, chain, length: chain[chain.length - 1] };
}

/** Grid position at a chainage, clamped to the ends of the line. */
export function pointAt(r: Route, m: number): [number, number] {
  const n = r.chain.length;
  if (m <= 0) return [r.en[0], r.en[1]];
  if (m >= r.length) return [r.en[2 * n - 2], r.en[2 * n - 1]];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.chain[mid] <= m) lo = mid;
    else hi = mid;
  }
  const f = (m - r.chain[lo]) / (r.chain[hi] - r.chain[lo] || 1);
  return [r.en[2 * lo] + f * (r.en[2 * hi] - r.en[2 * lo]), r.en[2 * lo + 1] + f * (r.en[2 * hi + 1] - r.en[2 * lo + 1])];
}

export function routeBounds(r: Route): Bounds {
  const b = emptyBounds();
  for (let i = 0; i < r.en.length; i += 2) extend(b, r.en[i], r.en[i + 1]);
  return b;
}

export function emptyBounds(): Bounds {
  return { minE: Infinity, minN: Infinity, maxE: -Infinity, maxN: -Infinity };
}

export function extend(b: Bounds, e: number, n: number) {
  if (e < b.minE) b.minE = e;
  if (e > b.maxE) b.maxE = e;
  if (n < b.minN) b.minN = n;
  if (n > b.maxN) b.maxN = n;
}

/** Chainage of the point on the line nearest to (e, n). */
export function nearestChainage(r: Route, e: number, n: number): number {
  let best = Infinity;
  let at = 0;
  for (let i = 0; i + 1 < r.chain.length; i++) {
    const ax = r.en[2 * i];
    const ay = r.en[2 * i + 1];
    const dx = r.en[2 * i + 2] - ax;
    const dy = r.en[2 * i + 3] - ay;
    const l2 = dx * dx + dy * dy;
    const f = l2 > 0 ? Math.min(1, Math.max(0, ((e - ax) * dx + (n - ay) * dy) / l2)) : 0;
    const d = (ax + f * dx - e) ** 2 + (ay + f * dy - n) ** 2;
    if (d < best) {
      best = d;
      at = r.chain[i] + f * (r.chain[i + 1] - r.chain[i]);
    }
  }
  return at;
}

export function reverseRoute(r: Route): Route {
  const en: number[] = [];
  for (let i = r.en.length - 2; i >= 0; i -= 2) en.push(r.en[i], r.en[i + 1]);
  return makeRoute(r.name, en);
}

/**
 * Where a chart sits on the ground: its start point, the direction the plan view
 * runs, and its size in metres. Alignment sheets run from the chart's start KP
 * towards its end KP; North-Up sheets stay square to the grid, centred on that stretch.
 */
export interface ChartGeometry {
  /** Centre of the plan view's left edge (alignment) or its centre (North-Up). */
  origin: [number, number];
  /** Unit vector along the plan view (left to right on paper). */
  u: [number, number];
  along: number;
  across: number;
  northUp: boolean;
}

export function chartGeometry(t: ChartTemplate, r: Route, i: number): ChartGeometry | null {
  const plan = planPanel(t);
  if (!plan) return null;
  const along = (plan.w * t.scale.horizontal) / 1000;
  const across = (plan.h * t.scale.horizontal) / 1000;
  const k0 = (parseFloat(t.fields.START_KP ?? '0') || 0) * 1000;
  const { start, end } = sheetRange(t, i);
  const a = pointAt(r, start * 1000 - k0);
  const b = pointAt(r, Math.min(end * 1000 - k0, r.length));
  if (t.kind === 'northUp') return { origin: [(a[0] + b[0]) / 2 - along / 2, (a[1] + b[1]) / 2], u: [1, 0], along, across, northUp: true };
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { origin: a, u: d > 1e-6 ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [1, 0], along, across, northUp: false };
}

/** Grid metres to paper millimetres inside the plan view for one chart. */
export function gridToPlan(g: ChartGeometry, plan: { x: number; y: number; w: number; h: number }) {
  const s = plan.w / g.along;
  const [ux, uy] = g.u;
  const [ox, oy] = g.origin;
  const cy = plan.y + plan.h / 2;
  return (e: number, n: number): [number, number] => {
    const de = e - ox;
    const dn = n - oy;
    return [plan.x + s * (de * ux + dn * uy), cy - s * (-de * uy + dn * ux)];
  };
}

/** The ground footprint of each chart's plan view, as four corners in grid metres. */
export function chartFrames(t: ChartTemplate, r: Route): [number, number][][] {
  const frames: [number, number][][] = [];
  for (let i = 0; i < sheetCount(t); i++) {
    const g = chartGeometry(t, r, i);
    if (!g) break;
    const [ux, uy] = g.u;
    const [vx, vy] = [-uy, ux];
    const [ox, oy] = g.origin;
    const h = g.across / 2;
    const L = g.along;
    frames.push([
      [ox - vx * h, oy - vy * h],
      [ox + ux * L - vx * h, oy + uy * L - vy * h],
      [ox + ux * L + vx * h, oy + uy * L + vy * h],
      [ox + vx * h, oy + vy * h],
    ]);
  }
  return frames;
}

/**
 * Extent of a background, ignoring stray far-off entities (a DXF often has a few
 * objects near 0,0 that would otherwise shrink the real drawing to a dot).
 */
export function robustBounds(lines: Float64Array[]): Bounds {
  const es: number[] = [];
  const ns: number[] = [];
  let count = 0;
  for (const l of lines) count += l.length / 2;
  const stride = Math.max(1, Math.floor(count / 20000));
  let k = 0;
  for (const l of lines)
    for (let i = 0; i < l.length; i += 2, k++)
      if (k % stride === 0) {
        es.push(l[i]);
        ns.push(l[i + 1]);
      }
  if (!es.length) return emptyBounds();
  es.sort((a, b) => a - b);
  ns.sort((a, b) => a - b);
  const q = (v: number[], f: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
  return { minE: q(es, 0.01), maxE: q(es, 0.99), minN: q(ns, 0.01), maxN: q(ns, 0.99) };
}
