import type { Panel } from './types';

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export const MIN_PANEL = 5;
/** Edges closer than this (mm) are treated as the same divider. */
const COINCIDENT_TOL = 0.3;

export function edgePos(p: Panel, e: Edge): number {
  switch (e) {
    case 'left':
      return p.x;
    case 'right':
      return p.x + p.w;
    case 'top':
      return p.y;
    case 'bottom':
      return p.y + p.h;
  }
}

const isVertical = (e: Edge) => e === 'left' || e === 'right';

/** Extent of an edge along its own direction, e.g. a left edge spans [y, y + h]. */
function span(p: Panel, e: Edge): [number, number] {
  return isVertical(e) ? [p.y, p.y + p.h] : [p.x, p.x + p.w];
}

/** Strict overlap: the edges share a real length, not just a corner. */
function overlapsStrict(a: [number, number], b: [number, number]): boolean {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > COINCIDENT_TOL;
}

/**
 * Every (panel, edge) that should move together with the dragged edge. Only true
 * dividers link: an edge two panels share, and a container's edge with the edges
 * of its sections. Panels separated by a gap (the left column and Chart
 * Information) stay independent.
 */
export function linkedEdges(panels: Panel[], id: string, edge: Edge): Array<[string, Edge]> {
  const byId = new Map(panels.map((p) => [p.id, p]));
  const seen = new Set<string>([`${id}:${edge}`]);
  const out: Array<[string, Edge]> = [[id, edge]];
  const queue: Array<[string, Edge]> = [[id, edge]];
  while (queue.length) {
    const [qid, qe] = queue.shift()!;
    const q = byId.get(qid)!;
    const pos = edgePos(q, qe);
    const sp = span(q, qe);
    for (const r of panels) {
      if (r.id === qid || r.locked) continue;
      for (const re of (isVertical(qe) ? ['left', 'right'] : ['top', 'bottom']) as Edge[]) {
        const key = `${r.id}:${re}`;
        if (seen.has(key)) continue;
        const rp = edgePos(r, re);
        const rs = span(r, re);
        const coincident = Math.abs(rp - pos) < COINCIDENT_TOL && overlapsStrict(sp, rs);
        // A container's edge and its sections' edges move together.
        const family = (r.parentId === qid || q.parentId === r.id) && re === qe && Math.abs(rp - pos) < COINCIDENT_TOL;
        if (coincident || family) {
          seen.add(key);
          out.push([r.id, re]);
          queue.push([r.id, re]);
        }
      }
    }
  }
  return out;
}

function applyEdge(p: Panel, e: Edge, delta: number): Panel {
  switch (e) {
    case 'left':
      return { ...p, x: p.x + delta, w: p.w - delta };
    case 'right':
      return { ...p, w: p.w + delta };
    case 'top':
      return { ...p, y: p.y + delta, h: p.h - delta };
    case 'bottom':
      return { ...p, h: p.h + delta };
  }
}

/** Clamp delta so no affected panel shrinks below MIN_PANEL. */
function clampDelta(panels: Panel[], edges: Array<[string, Edge]>, delta: number): number {
  const byPanel = new Map<string, Set<Edge>>();
  for (const [id, e] of edges) {
    if (!byPanel.has(id)) byPanel.set(id, new Set());
    byPanel.get(id)!.add(e);
  }
  let lo = -Infinity;
  let hi = Infinity;
  for (const [id, es] of byPanel) {
    const p = panels.find((x) => x.id === id)!;
    if (es.has('left') && !es.has('right')) hi = Math.min(hi, p.w - MIN_PANEL);
    if (es.has('right') && !es.has('left')) lo = Math.max(lo, MIN_PANEL - p.w);
    if (es.has('top') && !es.has('bottom')) hi = Math.min(hi, p.h - MIN_PANEL);
    if (es.has('bottom') && !es.has('top')) lo = Math.max(lo, MIN_PANEL - p.h);
  }
  return Math.max(lo, Math.min(hi, delta));
}

/**
 * Move one edge of a panel to a new position. With linked=true (the default)
 * neighbours sharing that divider follow; hold Alt in the UI to pass linked=false.
 */
export function resizeEdge(panels: Panel[], id: string, edge: Edge, newPos: number, linked = true): Panel[] {
  const p = panels.find((x) => x.id === id);
  if (!p) return panels;
  const edges = linked ? linkedEdges(panels, id, edge) : ([[id, edge]] as Array<[string, Edge]>);
  const delta = clampDelta(panels, edges, newPos - edgePos(p, edge));
  if (delta === 0) return panels;
  const moves = new Map<string, Edge[]>();
  for (const [pid, e] of edges) moves.set(pid, [...(moves.get(pid) ?? []), e]);
  return panels.map((x) => (moves.has(x.id) ? moves.get(x.id)!.reduce((acc, e) => applyEdge(acc, e, delta), x) : x));
}

/** All descendants of a panel (sections inside Chart Information, for example). */
export function descendants(panels: Panel[], id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const p of panels) {
      if (p.parentId === pid) {
        out.push(p.id);
        walk(p.id);
      }
    }
  };
  walk(id);
  return out;
}

export function movePanels(panels: Panel[], ids: string[], dx: number, dy: number): Panel[] {
  const all = new Set(ids.flatMap((id) => [id, ...descendants(panels, id)]));
  return panels.map((p) => (all.has(p.id) && !p.locked ? { ...p, x: p.x + dx, y: p.y + dy } : p));
}

/** Split a panel in two with a shared divider. The new half copies the original's type and settings. */
export function splitPanel(panels: Panel[], id: string, direction: 'horizontal' | 'vertical', newId: string): Panel[] {
  const p = panels.find((x) => x.id === id);
  if (!p) return panels;
  let a: Panel;
  let b: Panel;
  if (direction === 'vertical') {
    const w = p.w / 2;
    a = { ...p, w };
    b = { ...p, id: newId, x: p.x + w, w, title: `${p.title} 2`, kpAligned: false };
  } else {
    const h = p.h / 2;
    a = { ...p, h };
    b = { ...p, id: newId, y: p.y + h, h, title: `${p.title} 2`, kpAligned: false };
  }
  return panels.flatMap((x) => (x.id === id ? [a, b] : [x]));
}

/**
 * Snap a value to the nearest candidate within tol. Returns the snapped value and
 * the candidate it snapped to, so the UI can draw a guide line.
 */
export function snap(value: number, candidates: number[], tol: number): { value: number; guide?: number } {
  let best: number | undefined;
  let bestD = tol;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best === undefined ? { value } : { value: best, guide: best };
}
