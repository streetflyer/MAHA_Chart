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

/**
 * The ground footprint of each chart's plan view, as four corners in grid metres.
 * Alignment sheets turn the frame to run from the chart's start KP to its end KP;
 * North-Up sheets keep it square to the grid, centred on that stretch of line.
 */
export function chartFrames(t: ChartTemplate, r: Route): [number, number][][] {
  const plan = planPanel(t);
  if (!plan) return [];
  const along = (plan.w * t.scale.horizontal) / 1000;
  const across = (plan.h * t.scale.horizontal) / 1000;
  const k0 = sheetRange(t, 0).start;
  const frames: [number, number][][] = [];
  for (let i = 0; i < sheetCount(t); i++) {
    const { start, end } = sheetRange(t, i);
    const a = pointAt(r, (start - k0) * 1000);
    const b = pointAt(r, Math.min((end - k0) * 1000, r.length));
    let ux = 1;
    let uy = 0;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (t.kind !== 'northUp' && d > 1e-6) {
      ux = (b[0] - a[0]) / d;
      uy = (b[1] - a[1]) / d;
    }
    // Centre on the chart's start, then step half a sheet along the line direction.
    const cx = t.kind === 'northUp' ? (a[0] + b[0]) / 2 : a[0] + (ux * along) / 2;
    const cy = t.kind === 'northUp' ? (a[1] + b[1]) / 2 : a[1] + (uy * along) / 2;
    const vx = -uy;
    const vy = ux;
    const hx = along / 2;
    const hy = across / 2;
    frames.push([
      [cx - ux * hx - vx * hy, cy - uy * hx - vy * hy],
      [cx + ux * hx - vx * hy, cy + uy * hx - vy * hy],
      [cx + ux * hx + vx * hy, cy + uy * hx + vy * hy],
      [cx - ux * hx + vx * hy, cy - uy * hx + vy * hy],
    ]);
  }
  return frames;
}
