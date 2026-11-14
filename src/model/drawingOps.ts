import type { DxfText, Linework } from './dxf';

/**
 * Editing a drawing's objects, the way AutoCAD does: an object is a whole
 * drawing entity (a block insert is one object). Every operation returns a new
 * Linework and shares the arrays it didn't touch, so undo just keeps the old one.
 */

export type GroupSet = ReadonlySet<number>;

/** Move objects by (dE, dN) grid metres. */
export function moveGroups(lw: Linework, groups: GroupSet, dE: number, dN: number): Linework {
  return mapGroups(lw, groups, (e, n) => [e + dE, n + dN], 0);
}

/** Turn objects about (cE, cN) by `angle` radians anticlockwise. */
export function rotateGroups(lw: Linework, groups: GroupSet, cE: number, cN: number, angle: number): Linework {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return mapGroups(lw, groups, (e, n) => [cE + (e - cE) * c - (n - cN) * s, cN + (e - cE) * s + (n - cN) * c], (angle * 180) / Math.PI);
}

function mapGroups(lw: Linework, groups: GroupSet, f: (e: number, n: number) => [number, number], dRot: number): Linework {
  const lines = lw.lines.map((l, i) => {
    if (!groups.has(lw.groups[i])) return l;
    const out = new Float64Array(l.length);
    for (let k = 0; k < l.length; k += 2) [out[k], out[k + 1]] = f(l[k], l[k + 1]);
    return out;
  });
  const texts = lw.texts.map((t) => {
    if (!groups.has(t.group)) return t;
    const [x, y] = f(t.x, t.y);
    return { ...t, x, y, rot: t.rot + dRot };
  });
  return { ...lw, lines, texts };
}

/** Remove objects. */
export function deleteGroups(lw: Linework, groups: GroupSet): Linework {
  const keep = lw.lines.map((_, i) => !groups.has(lw.groups[i]));
  const texts = lw.texts.filter((t) => !groups.has(t.group));
  const pick = <T,>(a: T[]) => a.filter((_, i) => keep[i]);
  const layers = pick(lw.layers);
  const count = new Map<string, number>();
  for (const l of layers) count.set(l, (count.get(l) ?? 0) + 1);
  for (const t of texts) count.set(t.layer, (count.get(t.layer) ?? 0) + 1);
  return {
    ...lw,
    lines: pick(lw.lines),
    layers,
    colors: pick(lw.colors),
    groups: pick(lw.groups),
    texts,
    layerInfo: lw.layerInfo.map((l) => ({ ...l, count: count.get(l.name) ?? 0 })),
  };
}

/** Change the look or content of the texts among the objects. `scale` multiplies their height. */
export function editTexts(lw: Linework, groups: GroupSet, patch: Partial<Pick<DxfText, 'text' | 'rot' | 'color' | 'font' | 'bold' | 'italic'>> & { scale?: number }): Linework {
  const { scale, ...rest } = patch;
  return {
    ...lw,
    texts: lw.texts.map((t) => (groups.has(t.group) ? { ...t, ...rest, h: scale ? t.h * scale : t.h } : t)),
  };
}

export interface Box {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

/** Bounding box of each object (grid metres), for box selection. */
export function groupBoxes(lw: Linework): Map<number, Box> {
  const out = new Map<number, Box>();
  const grow = (g: number, e: number, n: number) => {
    const b = out.get(g);
    if (!b) out.set(g, { minE: e, maxE: e, minN: n, maxN: n });
    else {
      if (e < b.minE) b.minE = e;
      if (e > b.maxE) b.maxE = e;
      if (n < b.minN) b.minN = n;
      if (n > b.maxN) b.maxN = n;
    }
  };
  lw.lines.forEach((l, i) => {
    for (let k = 0; k < l.length; k += 2) grow(lw.groups[i], l[k], l[k + 1]);
  });
  for (const t of lw.texts) grow(t.group, t.x, t.y);
  return out;
}

/** Box around the chosen objects. */
export function boundsOfGroups(lw: Linework, groups: GroupSet): Box | null {
  let b: Box | null = null;
  for (const [g, x] of groupBoxes(lw)) {
    if (!groups.has(g)) continue;
    b = b ? { minE: Math.min(b.minE, x.minE), maxE: Math.max(b.maxE, x.maxE), minN: Math.min(b.minN, x.minN), maxN: Math.max(b.maxN, x.maxN) } : { ...x };
  }
  return b;
}

/** Distance from (px, py) to the segment a–b. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The object nearest to a grid point within `tol` metres. `visible(i)` says
 * whether line i is drawn; `textHit` gives a distance for a text (0 when inside), or null.
 */
export function nearestGroup(lw: Linework, e: number, n: number, tol: number, visible: (layer: string) => boolean, textHit: (t: DxfText) => number | null): number | null {
  let best = Infinity;
  let bestGroup: number | null = null;
  for (let i = 0; i < lw.lines.length; i++) {
    if (!visible(lw.layers[i])) continue;
    const l = lw.lines[i];
    // Skip lines whose extent is farther than the tolerance (cheap box test first).
    let hit = false;
    for (let k = 0; k + 3 < l.length; k += 2) {
      const d = distToSegment(e, n, l[k], l[k + 1], l[k + 2], l[k + 3]);
      if (d < best && d <= tol) {
        best = d;
        hit = true;
      }
    }
    if (l.length === 2 && Math.hypot(e - l[0], n - l[1]) <= tol) hit = true;
    if (hit) bestGroup = lw.groups[i];
  }
  for (const t of lw.texts) {
    if (!visible(t.layer)) continue;
    const d = textHit(t);
    // A text under the pointer wins over a line near it.
    if (d !== null && d - tol * 0.5 < best) {
      best = d - tol * 0.5;
      bestGroup = t.group;
    }
  }
  return bestGroup;
}
