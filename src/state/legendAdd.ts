import { create } from "zustand";
import type { LegendShape } from "../model/types";

/** The "Add to existing legend" window: the objects chosen in the drawing (as a shape) waiting for the legend items they join; null: closed. */
export const useLegendAdd = create<{
  shape: LegendShape | null;
  name: string;
  chart: number;
  open(shape: LegendShape, name: string, chart: number): void;
  close(): void;
}>((set) => ({
  shape: null,
  name: "",
  chart: 0,
  open: (shape, name, chart) => set({ shape, name, chart }),
  close: () => set({ shape: null }),
}));
