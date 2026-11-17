import { create } from "zustand";

type Pt = { x: number; y: number };

/**
 * The measuring arrow (toolbar "Arrow"): drag on the sheet to draw it, drag its body or ends to move it,
 * and it reads its length in metres at the chart's horizontal scale. A view aid only: it is never saved or printed.
 * `armed` is a toggle (like the ruler), not an interaction mode: with it on, a drag draws a new arrow.
 */
export interface MeasureDrag {
  kind: "new" | "a" | "b" | "move";
  start: Pt;
  a: Pt;
  b: Pt;
}

interface Measure {
  armed: boolean;
  a: Pt | null;
  b: Pt | null;
  drag: MeasureDrag | null;
  setArmed(on: boolean): void;
  set(a: Pt | null, b: Pt | null): void;
  setDrag(d: MeasureDrag | null): void;
  /** Leave the arrow mode and take the arrow away. */
  reset(): void;
}

export const useMeasure = create<Measure>((set) => ({
  armed: false,
  a: null,
  b: null,
  drag: null,
  setArmed: (armed) => set({ armed }),
  set: (a, b) => set({ a, b }),
  setDrag: (drag) => set({ drag }),
  reset: () => set({ armed: false, a: null, b: null, drag: null }),
}));

const distToSeg = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Start a drag at a paper point (tol in mm); false when the click is not for the arrow. */
export function measureDown(at: Pt, tol: number): boolean {
  const m = useMeasure.getState();
  if (m.a && m.b) {
    const kind =
      Math.hypot(at.x - m.a.x, at.y - m.a.y) <= tol * 1.5
        ? "a"
        : Math.hypot(at.x - m.b.x, at.y - m.b.y) <= tol * 1.5
          ? "b"
          : distToSeg(at, m.a, m.b) <= tol
            ? "move"
            : null;
    if (kind) {
      m.setDrag({ kind, start: at, a: m.a, b: m.b });
      return true;
    }
  }
  if (!m.armed) return false;
  m.set(at, at);
  m.setDrag({ kind: "new", start: at, a: at, b: at });
  return true;
}

/** Move the arrow with the pointer; shift holds it horizontal (or vertical). */
export function measureMove(at: Pt, shift: boolean) {
  const m = useMeasure.getState();
  const d = m.drag;
  if (!d) return;
  let p = at;
  const flat = (o: Pt) => {
    if (!shift) return p;
    return Math.abs(p.x - o.x) >= Math.abs(p.y - o.y)
      ? { x: p.x, y: o.y }
      : { x: o.x, y: p.y };
  };
  if (d.kind === "new") m.set(d.start, flat(d.start));
  else if (d.kind === "a") m.set(flat(d.b), d.b);
  else if (d.kind === "b") m.set(d.a, flat(d.a));
  else {
    const dx = at.x - d.start.x;
    const dy = at.y - d.start.y;
    m.set({ x: d.a.x + dx, y: d.a.y + dy }, { x: d.b.x + dx, y: d.b.y + dy });
  }
  p = at;
}

export function measureUp() {
  const m = useMeasure.getState();
  // A click without a drag leaves no arrow.
  if (
    m.drag?.kind === "new" &&
    m.a &&
    m.b &&
    Math.hypot(m.a.x - m.b.x, m.a.y - m.b.y) < 0.5
  )
    m.set(null, null);
  m.setDrag(null);
}
