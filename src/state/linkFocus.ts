import { create } from "zustand";

/** The linked event symbol clicked on the sheet (`datasetId|linkNumber`): the properties panel scrolls to its settings. `n` makes a repeated click count. */
export const useLinkFocus = create<{
  id: string | null;
  n: number;
  focus(id: string): void;
}>((set, get) => ({
  id: null,
  n: 0,
  focus: (id) => set({ id, n: get().n + 1 }),
}));
