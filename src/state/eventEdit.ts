import { create } from "zustand";

/** Editing the codes of an Engineering Events panel (double-click the panel). Session only. */
interface EventEdit {
  active: boolean;
  panelId: string | null;
  enter(panelId: string): void;
  exit(): void;
}

export const useEventEdit = create<EventEdit>((set) => ({
  active: false,
  panelId: null,
  enter: (panelId) => set({ active: true, panelId }),
  exit: () => set({ active: false, panelId: null }),
}));
