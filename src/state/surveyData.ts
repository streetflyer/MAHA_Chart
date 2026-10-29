import { create } from 'zustand';
import type { Linework } from '../model/dxf';
import type { Route } from '../model/route';

/**
 * Survey data loaded for this session. It is kept apart from the template so
 * templates stay small and reusable across jobs.
 */
interface SurveyData {
  route: Route | null;
  background: Linework | null;
  setRoute(r: Route | null): void;
  setBackground(b: Linework | null): void;
}

export const useSurvey = create<SurveyData>((set) => ({
  route: null,
  background: null,
  setRoute: (route) => set({ route }),
  setBackground: (background) => set({ background }),
}));
