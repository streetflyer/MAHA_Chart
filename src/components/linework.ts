import type { Bounds, Route } from '../model/route';

/** True when a polyline's extent overlaps the box. */
export function touches(l: Float64Array, b: Bounds): boolean {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (let i = 0; i < l.length; i += 2) {
    const e = l[i];
    const n = l[i + 1];
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
  }
  return maxE >= b.minE && minE <= b.maxE && maxN >= b.minN && minN <= b.maxN;
}

type Project = (e: number, n: number) => [number, number];

/** One SVG path for many polylines, dropping vertices closer than `tol` paper mm. */
export function linesPath(lines: Iterable<Float64Array>, area: Bounds, project: Project, tol: number): string {
  const parts: string[] = [];
  for (const l of lines) {
    if (!touches(l, area)) continue;
    parts.push(polyPath(l, project, tol));
  }
  return parts.join('');
}

export function routePath(r: Route, project: Project, tol: number): string {
  return polyPath(r.en, project, tol);
}

function polyPath(l: Float64Array, project: Project, tol: number): string {
  let [x, y] = project(l[0], l[1]);
  let s = `M${x.toFixed(2)} ${y.toFixed(2)}`;
  let lx = x;
  let ly = y;
  for (let i = 2; i < l.length; i += 2) {
    [x, y] = project(l[i], l[i + 1]);
    if (i < l.length - 2 && Math.abs(x - lx) < tol && Math.abs(y - ly) < tol) continue;
    s += `L${x.toFixed(2)} ${y.toFixed(2)}`;
    lx = x;
    ly = y;
  }
  return s;
}
