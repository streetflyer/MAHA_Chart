import { create } from "zustand";

/** The legend panel whose event code definitions are being written from the file's columns; null: closed. */
export const useCodeDefs = create<{
  panelId: string | null;
  open(id: string): void;
  close(): void;
}>((set) => ({
  panelId: null,
  open: (panelId) => set({ panelId }),
  close: () => set({ panelId: null }),
}));
