import { create } from 'zustand';
import type { Linework } from '../model/dxf';
import { useSurvey } from './surveyData';

type Pt = [number, number];

/** What the plan view tells the editor about how it is drawn right now. */
export interface PlanContext {
  panelId: string;
  /** Grid metres to paper millimetres. */
  project(e: number, n: number): Pt;
  /** Paper millimetres per grid metre. */
  mmPerM: number;
  /** Direction of the paper's x axis in the grid, degrees anticlockwise from east. */
  uAngle: number;
  rect: { x: number; y: number; w: number; h: number };
}

/** A gesture in progress, drawn live before it is applied to the drawing. */
export type Preview =
  | { kind: 'move'; dE: number; dN: number }
  | { kind: 'rotate'; cE: number; cN: number; angle: number }
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number };

interface Snapshot {
  /** The drawings' linework before the change, by dataset id. */
  lw: Record<string, Linework>;
}

interface DrawingEdit {
  active: boolean;
  panelId: string | null;
  /** Chosen objects by dataset id. */
  selected: Record<string, number[]>;
  ctx: PlanContext | null;
  preview: Preview | null;
  past: Snapshot[];
  future: Snapshot[];
  enter(panelId: string): void;
  exit(): void;
  setContext(c: PlanContext | null): void;
  setPreview(p: Preview | null): void;
  select(sel: Record<string, number[]>): void;
  /** Apply a change to the chosen drawings, remembering how they were. */
  change(ids: string[], f: (lw: Linework, id: string) => Linework, keepSelection?: boolean): void;
  undo(): void;
  redo(): void;
}

const survey = () => useSurvey.getState();

function lineworkOf(id: string): Linework | null {
  const d = survey().datasets.find((x) => x.id === id);
  return d?.kind === 'linework' ? d.lw : null;
}

export const useDrawingEdit = create<DrawingEdit>((set, get) => ({
  active: false,
  panelId: null,
  selected: {},
  ctx: null,
  preview: null,
  past: [],
  future: [],
  enter: (panelId) => set({ active: true, panelId, selected: {}, preview: null, past: [], future: [] }),
  exit: () => set({ active: false, panelId: null, selected: {}, preview: null }),
  setContext: (ctx) => set({ ctx }),
  setPreview: (preview) => set({ preview }),
  select: (selected) => set({ selected }),
  change: (ids, f, keepSelection = true) => {
    const before: Record<string, Linework> = {};
    for (const id of ids) {
      const lw = lineworkOf(id);
      if (!lw) continue;
      before[id] = lw;
      survey().updateDataset(id, { lw: f(lw, id) });
    }
    if (!Object.keys(before).length) return;
    set((s) => ({ past: [...s.past.slice(-49), { lw: before }], future: [], selected: keepSelection ? s.selected : {} }));
  },
  undo: () => {
    const { past } = get();
    const snap = past[past.length - 1];
    if (!snap) return;
    const now: Record<string, Linework> = {};
    for (const [id, lw] of Object.entries(snap.lw)) {
      const cur = lineworkOf(id);
      if (cur) now[id] = cur;
      survey().updateDataset(id, { lw });
    }
    set((s) => ({ past: s.past.slice(0, -1), future: [{ lw: now }, ...s.future] }));
  },
  redo: () => {
    const { future } = get();
    const snap = future[0];
    if (!snap) return;
    const now: Record<string, Linework> = {};
    for (const [id, lw] of Object.entries(snap.lw)) {
      const cur = lineworkOf(id);
      if (cur) now[id] = cur;
      survey().updateDataset(id, { lw });
    }
    set((s) => ({ future: s.future.slice(1), past: [...s.past, { lw: now }] }));
  },
}));
