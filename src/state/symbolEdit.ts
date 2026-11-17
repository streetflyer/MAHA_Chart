import { create } from "zustand";

/** The legend symbol being edited in the symbol window (panel and item id); null: closed. */
export const useSymbolEdit = create<{
  target: { panelId: string; itemId: string } | null;
  open(panelId: string, itemId: string): void;
  close(): void;
}>((set) => ({
  target: null,
  open: (panelId, itemId) => set({ target: { panelId, itemId } }),
  close: () => set({ target: null }),
}));
