import { create } from "zustand";

/** The profile move in progress (Shift+drag on a KP panel): the chart, the shift (mm) so far, and the snap lines shown. Committed to the template on release. */
export const useKpShift = create<{
  chart: number | null;
  shift: number;
  guides: number[];
  set(chart: number | null, shift: number, guides?: number[]): void;
}>((set) => ({
  chart: null,
  shift: 0,
  guides: [],
  set: (chart, shift, guides = []) => set({ chart, shift, guides }),
}));

/** Snap a shift to the stops (mm) when within `tol`; returns the shift and the stops it landed on. */
export function snapShift(
  shift: number,
  stops: { shift: number; x: number }[],
  tol: number,
): { shift: number; guides: number[] } {
  let best: { shift: number; x: number } | null = null;
  for (const s of stops)
    if (
      Math.abs(shift - s.shift) <= tol &&
      (!best || Math.abs(shift - s.shift) < Math.abs(shift - best.shift))
    )
      best = s;
  return best ? { shift: best.shift, guides: [best.x] } : { shift, guides: [] };
}
