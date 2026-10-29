import { create } from 'zustand';
import type { Linework } from '../model/dxf';
import { reverseRoute, type Route } from '../model/route';

/**
 * Survey data loaded for this session. It is kept apart from the template so
 * templates stay small and reusable across jobs.
 */
interface SurveyData {
  /** The line as charted: KP 0 is its first point. */
  route: Route | null;
  /** The line as it was read from the file. */
  source: Route | null;
  reversed: boolean;
  background: Linework | null;
  setRoute(r: Route | null): void;
  setReversed(on: boolean): void;
  setBackground(b: Linework | null): void;
}

export const useSurvey = create<SurveyData>((set, get) => ({
  route: null,
  source: null,
  reversed: false,
  background: null,
  setRoute: (r) => set({ source: r, route: r && get().reversed ? reverseRoute(r) : r }),
  setReversed: (reversed) => {
    const src = get().source;
    set({ reversed, route: src && reversed ? reverseRoute(src) : src });
  },
  setBackground: (background) => set({ background }),
}));
