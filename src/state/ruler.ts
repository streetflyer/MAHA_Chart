import { create } from "zustand";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The ruler (F4): a red line at the same KP in every panel that has KPs, following the
 * pointer. Panels register how to read a KP from a paper point and where a KP falls on them
 * while they are drawn; the sheet draws the lines.
 */
export interface RulerSource {
  rect: Rect;
  /** KP (m) under a paper point, or null when the point means no KP. */
  kpAt(x: number, y: number): number | null;
  /** The line to draw for a KP (paper mm), or null when this panel doesn't show it. */
  at(kp: number): { x1: number; y1: number; x2: number; y2: number } | null;
}

export const rulerSources = new Map<string, RulerSource>();

interface Ruler {
  on: boolean;
  /** KP (m) the ruler stands at. */
  kp: number | null;
  /** The pointer (paper mm) and the right edge of the panel it is over, to place the KP label. */
  at: { x: number; y: number; right: number } | null;
  setOn(on: boolean): void;
  setKp(kp: number | null, at?: { x: number; y: number; right: number }): void;
}

export const useRuler = create<Ruler>((set) => ({
  on: false,
  kp: null,
  at: null,
  setOn: (on) => set(on ? { on } : { on, kp: null, at: null }),
  setKp: (kp, at) => set({ kp, at: at ?? null }),
}));

/** Move the ruler to the KP under a paper point; points outside every KP panel leave it where it is. */
export function rulerTo(x: number, y: number) {
  for (const s of rulerSources.values()) {
    const r = s.rect;
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    const kp = s.kpAt(x, y);
    if (kp !== null && Number.isFinite(kp)) {
      useRuler.getState().setKp(kp, { x, y, right: r.x + r.w });
      return;
    }
  }
}
