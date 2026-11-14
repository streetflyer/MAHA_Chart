import { create } from "zustand";
import { newId } from "../model/ids";
import type { VideoRow } from "../model/video";

/** The video log: when each product's video started and ended. Kept with the saved project. */
interface VideoState {
  rows: VideoRow[];
  /** A picture of the source table, kept to read from while rows are typed in. */
  image: { name: string; url: string } | null;
  setRows(rows: VideoRow[]): void;
  addRows(rows: VideoRow[]): void;
  update(id: string, patch: Partial<VideoRow>): void;
  remove(id: string): void;
  add(): void;
  setImage(i: VideoState["image"]): void;
}

export const useVideo = create<VideoState>((set, get) => ({
  rows: [],
  image: null,
  setRows: (rows) => set({ rows }),
  addRows: (rows) => set({ rows: [...get().rows, ...rows] }),
  update: (id, patch) =>
    set({ rows: get().rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }),
  remove: (id) => set({ rows: get().rows.filter((r) => r.id !== id) }),
  add: () =>
    set({
      rows: [
        ...get().rows,
        { id: newId("v"), product: "", start: "", end: "", remarks: "" },
      ],
    }),
  setImage: (image) => set({ image }),
}));
