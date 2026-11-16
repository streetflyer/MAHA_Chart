import { create } from "zustand";

/**
 * Adjusting the key plan's view (mode "keyview", see state/mode.ts): the wheel zooms the map
 * around the pointer and a drag on the map moves it. Chart frames keep their own drags.
 * The view itself lives on the panel (keyplan.view) so it is saved and printed; leaving the
 * mode keeps it. `rotating` is true while a chart's rotation handle is being dragged, so the
 * handle stays on screen.
 */
interface KeyplanView {
  active: boolean;
  panelId: string | null;
  rotating: boolean;
  enter(panelId: string): void;
  exit(): void;
  setRotating(v: boolean): void;
}

export const useKeyplanView = create<KeyplanView>((set) => ({
  active: false,
  panelId: null,
  rotating: false,
  enter: (panelId) => set({ active: true, panelId }),
  exit: () => set({ active: false }),
  setRotating: (rotating) => set({ rotating }),
}));

/** What the key plan shows: the map's centre (grid E, N) and its width in metres. */
export interface KeyView {
  cE: number;
  cN: number;
  w: number;
}

/** Zoom about a grid point: that point keeps its place on screen. `factor` < 1 zooms in. */
export function zoomAbout(
  v: KeyView,
  e: number,
  n: number,
  factor: number,
): KeyView {
  const w = Math.min(Math.max(v.w * factor, 5), 1e7);
  const f = w / v.w;
  return { cE: e - (e - v.cE) * f, cN: n - (n - v.cN) * f, w };
}

/** Move the map by a distance in metres. */
export const panView = (v: KeyView, dE: number, dN: number): KeyView => ({
  ...v,
  cE: v.cE + dE,
  cN: v.cN + dN,
});

/** The view that just holds a box (grid metres) with a margin, for a panel of this width/height ratio. */
export function viewFitting(
  b: { minE: number; maxE: number; minN: number; maxN: number },
  aspect: number,
): KeyView {
  const padE = (b.maxE - b.minE) * 0.06 + 1;
  const padN = (b.maxN - b.minN) * 0.06 + 1;
  let w = b.maxE - b.minE + 2 * padE;
  const h = b.maxN - b.minN + 2 * padN;
  if (w / h < aspect) w = h * aspect;
  return { cE: (b.minE + b.maxE) / 2, cN: (b.minN + b.maxN) / 2, w };
}
