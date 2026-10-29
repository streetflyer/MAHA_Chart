import type { ChartTemplate } from './types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 3;
const STEP = 2;

function hits(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Find empty space on the sheet for a new panel. Tries the requested size first,
 * then smaller sizes, scanning top-left to bottom-right inside the frame. A
 * preferred point (where the user right-clicked) wins when the panel fits there.
 * `headroom` reserves space above the panel for a title drawn above it.
 */
export function findFreeSpot(t: ChartTemplate, w: number, h: number, at?: { x: number; y: number }, headroom = 0): Rect {
  const inset = t.paper.frameInset + GAP;
  const bounds = { x0: inset, y0: inset, x1: t.paper.width - inset, y1: t.paper.height - inset };
  const obstacles: Rect[] = t.panels
    .filter((p) => !p.parentId)
    .map((p) => {
      const above = p.titlePosition === 'above' ? 7 : 0;
      return { x: p.x - GAP, y: p.y - above - GAP, w: p.w + 2 * GAP, h: p.h + above + 2 * GAP };
    });
  const free = (r: Rect) =>
    r.x >= bounds.x0 &&
    r.y - headroom >= bounds.y0 &&
    r.x + r.w <= bounds.x1 &&
    r.y + r.h <= bounds.y1 &&
    !obstacles.some((o) => hits({ x: r.x, y: r.y - headroom, w: r.w, h: r.h + headroom }, o));

  let cw = w;
  let ch = h;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (at) {
      const r = { x: at.x, y: at.y, w: cw, h: ch };
      if (free(r)) return r;
    }
    for (let y = bounds.y0 + headroom; y + ch <= bounds.y1; y += STEP) {
      for (let x = bounds.x0; x + cw <= bounds.x1; x += STEP) {
        const r = { x, y, w: cw, h: ch };
        if (free(r)) return r;
      }
    }
    cw = Math.max(20, cw * 0.75);
    ch = Math.max(12, ch * 0.75);
  }
  // The sheet is full: place it offset from the centre so it is visible and can be moved.
  return { x: (t.paper.width - w) / 2 + 10, y: (t.paper.height - h) / 2 + 10, w, h };
}
