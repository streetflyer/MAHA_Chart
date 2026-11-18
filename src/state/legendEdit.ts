import { create } from "zustand";

/** Editing a legend's words and symbols (double-click Chart information). Session only. */
export const useLegendEdit = create<{
  active: boolean;
  panelId: string | null;
  enter(panelId: string): void;
  exit(): void;
}>((set) => ({
  active: false,
  panelId: null,
  enter: (panelId) => set({ active: true, panelId }),
  exit: () => set({ active: false, panelId: null }),
}));
