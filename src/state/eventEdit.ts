import { create } from "zustand";
import type { EventLabelEdit } from "../model/datasets";

/** Editing the codes of an Engineering Events panel (double-click the panel). Session only. */
interface EventEdit {
  active: boolean;
  panelId: string | null;
  /** Earlier states of code positions, newest last (one entry per move or menu change). */
  history: {
    datasetId: string;
    edits: Record<string, EventLabelEdit> | undefined;
  }[];
  enter(panelId: string): void;
  exit(): void;
}

export const useEventEdit = create<EventEdit>((set) => ({
  active: false,
  panelId: null,
  history: [],
  enter: (panelId) => set({ active: true, panelId, history: [] }),
  exit: () => set({ active: false, panelId: null, history: [] }),
}));
