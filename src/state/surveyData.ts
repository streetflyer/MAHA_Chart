import { create } from 'zustand';
import type { Dataset } from '../model/datasets';
import { emptyBounds, extend, reverseRoute, type Route } from '../model/route';
import type { Linework } from '../model/dxf';

/**
 * Survey data loaded for this session. It is kept apart from the template so
 * templates stay small and reusable across jobs.
 */
interface SurveyData {
  datasets: Dataset[];
  /** The line as charted: KP 0 is its first point. */
  route: Route | null;
  /** The line as it was read from the file. */
  source: Route | null;
  reversed: boolean;
  /** Key plan background: every visible site plan drawing, merged. */
  background: Linework | null;
  addDataset(d: Dataset): void;
  updateDataset(id: string, patch: Partial<Dataset>): void;
  removeDataset(id: string): void;
  setReversed(on: boolean): void;
}

function derive(datasets: Dataset[], reversed: boolean) {
  const r = datasets.find((d) => d.kind === 'route' && d.visible);
  const source = r && r.kind === 'route' ? r.route : null;
  const site = datasets.filter((d): d is Extract<Dataset, { kind: 'linework' }> => d.kind === 'linework' && d.target === 'siteplan' && d.visible);
  let background: Linework | null = null;
  if (site.length) {
    const b = emptyBounds();
    for (const d of site) {
      extend(b, d.lw.bounds.minE, d.lw.bounds.minN);
      extend(b, d.lw.bounds.maxE, d.lw.bounds.maxN);
    }
    background = { name: site.map((d) => d.name).join(', '), lines: site.flatMap((d) => d.lw.lines), layers: site.flatMap((d) => d.lw.layers), texts: site.flatMap((d) => d.lw.texts), bounds: b };
  }
  return { datasets, source, route: source && reversed ? reverseRoute(source) : source, background };
}

export const useSurvey = create<SurveyData>((set, get) => ({
  datasets: [],
  route: null,
  source: null,
  reversed: false,
  background: null,
  addDataset: (d) => {
    // One proposed route at a time: a new one replaces the old.
    const rest = d.kind === 'route' ? get().datasets.filter((x) => x.kind !== 'route') : get().datasets;
    set(derive([...rest, d], get().reversed));
  },
  updateDataset: (id, patch) => set(derive(get().datasets.map((d) => (d.id === id ? ({ ...d, ...patch } as Dataset) : d)), get().reversed)),
  removeDataset: (id) => set(derive(get().datasets.filter((d) => d.id !== id), get().reversed)),
  setReversed: (reversed) => set({ reversed, ...derive(get().datasets, reversed) }),
}));
