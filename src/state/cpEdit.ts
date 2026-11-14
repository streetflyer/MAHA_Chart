import { create } from "zustand";
import type { CpNote, CpPoint } from "../model/datasets";
import { pointsOf, pointsPatch, type CpLayout } from "../model/cpEdit";
import { useSurvey } from "./surveyData";

/** What the CP panel tells the editor about how it is drawn right now. */
export interface CpContext {
  panelId: string;
  datasetId: string;
  rect: { x: number; y: number; w: number; h: number };
  toX(kp: number): number;
  /** KP (m) at a paper x. */
  kpAt(x: number): number;
  layout: CpLayout;
}

interface Snap {
  pts: CpPoint[];
  notes: CpNote[];
}

interface CpEdit {
  active: boolean;
  panelId: string | null;
  datasetId: string | null;
  selPts: number[];
  selNotes: number[];
  /** Offset in paper mm of the chosen items while they are dragged. */
  preview: { dx: number; dy: number } | null;
  ctx: CpContext | null;
  clip: Snap | null;
  past: Snap[];
  future: Snap[];
  enter(panelId: string, datasetId: string): void;
  exit(): void;
  setCtx(c: CpContext | null): void;
  setPreview(p: { dx: number; dy: number } | null): void;
  select(pts: number[], notes: number[]): void;
  /** Change the readings and notes, remembering how they were. */
  change(
    f: (pts: CpPoint[], notes: CpNote[]) => Snap,
    sel?: { pts: number[]; notes: number[] },
  ): void;
  undo(): void;
  redo(): void;
}

const current = (
  id: string | null,
): { pts: CpPoint[]; notes: CpNote[] } | null => {
  const d = useSurvey.getState().datasets.find((x) => x.id === id);
  return d?.kind === "cp" ? { pts: pointsOf(d), notes: d.notes ?? [] } : null;
};
const put = (id: string, s: Snap) =>
  useSurvey.getState().updateDataset(id, pointsPatch(s.pts, s.notes));

export const useCpEdit = create<CpEdit>((set, get) => ({
  active: false,
  panelId: null,
  datasetId: null,
  selPts: [],
  selNotes: [],
  preview: null,
  ctx: null,
  clip: null,
  past: [],
  future: [],
  enter: (panelId, datasetId) =>
    set({
      active: true,
      panelId,
      datasetId,
      selPts: [],
      selNotes: [],
      preview: null,
      past: [],
      future: [],
    }),
  exit: () =>
    set({
      active: false,
      panelId: null,
      datasetId: null,
      selPts: [],
      selNotes: [],
      preview: null,
      ctx: null,
    }),
  setCtx: (ctx) => set({ ctx }),
  setPreview: (preview) => set({ preview }),
  select: (selPts, selNotes) => set({ selPts, selNotes }),
  change: (f, sel) => {
    const { datasetId } = get();
    const cur = current(datasetId);
    if (!cur || !datasetId) return;
    const next = f(cur.pts, cur.notes);
    put(datasetId, next);
    set((s) => ({
      past: [...s.past.slice(-49), cur],
      future: [],
      selPts: sel?.pts ?? s.selPts,
      selNotes: sel?.notes ?? s.selNotes,
    }));
  },
  undo: () => {
    const { past, datasetId } = get();
    const snap = past[past.length - 1];
    const cur = current(datasetId);
    if (!snap || !cur || !datasetId) return;
    put(datasetId, snap);
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [cur, ...s.future],
      selPts: [],
      selNotes: [],
    }));
  },
  redo: () => {
    const { future, datasetId } = get();
    const snap = future[0];
    const cur = current(datasetId);
    if (!snap || !cur || !datasetId) return;
    put(datasetId, snap);
    set((s) => ({
      future: s.future.slice(1),
      past: [...s.past, cur],
      selPts: [],
      selNotes: [],
    }));
  },
}));
