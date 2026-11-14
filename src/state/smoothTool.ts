import { create } from "zustand";
import { smoothRange } from "../model/smooth";
import { useSurvey } from "./surveyData";

/** What the long profile tells the editor about how it is drawn, so the pointer can find its node. */
export interface SmoothContext {
  panelId: string;
  rect: { x: number; y: number; w: number; h: number };
  /** KP (m) at a paper x. */
  kpAt(x: number): number;
}

interface SmoothTool {
  active: boolean;
  datasetId: string | null;
  /** Nodes each side of the helper line's centre. */
  n: number;
  /** Node under the pointer, or null. */
  hover: number | null;
  ctx: SmoothContext | null;
  /** Earlier TOP values, newest last, per dataset. */
  history: Record<string, (Float64Array | undefined)[]>;
  start(datasetId: string): void;
  stop(): void;
  setN(n: number): void;
  setCtx(c: SmoothContext | null): void;
  setHover(i: number | null): void;
  /** Smooth nodes a..b of the dataset's TOP. */
  apply(datasetId: string, a: number, b: number): void;
  undo(datasetId: string): void;
  reset(datasetId: string): void;
}

export const useSmoothTool = create<SmoothTool>((set, get) => ({
  active: false,
  datasetId: null,
  n: 21,
  hover: null,
  ctx: null,
  history: {},
  start: (datasetId) => set({ active: true, datasetId, hover: null }),
  stop: () => set({ active: false, hover: null, ctx: null }),
  setN: (n) => set({ n: Math.max(1, Math.round(n)) }),
  setCtx: (ctx) => set({ ctx }),
  setHover: (hover) => (get().hover !== hover ? set({ hover }) : undefined),
  apply: (id, a, b) => {
    const d = useSurvey.getState().datasets.find((x) => x.id === id);
    if (d?.kind !== "long" || d.top === undefined) return;
    const cur = d.topEdit ?? d.series[d.top].values;
    const topEdit = smoothRange(cur, a, b, get().n);
    set({
      history: {
        ...get().history,
        [id]: [...(get().history[id] ?? []), d.topEdit],
      },
    });
    useSurvey.getState().updateDataset(id, { topEdit });
  },
  undo: (id) => {
    const h = get().history[id] ?? [];
    if (!h.length) return;
    set({ history: { ...get().history, [id]: h.slice(0, -1) } });
    useSurvey.getState().updateDataset(id, { topEdit: h[h.length - 1] });
  },
  reset: (id) => {
    set({ history: { ...get().history, [id]: [] } });
    useSurvey.getState().updateDataset(id, { topEdit: undefined });
  },
}));
