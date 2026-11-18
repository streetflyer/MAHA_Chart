import { create } from "zustand";
import type { Scope } from "./scope";

/**
 * The legend symbol being edited in the symbol window (panel and item id); null: closed.
 * `scope`: picked in the right-click menu; unset follows the All charts / This chart switch.
 */
export const useSymbolEdit = create<{
  target: { panelId: string; itemId: string; scope?: Scope } | null;
  open(panelId: string, itemId: string, scope?: Scope): void;
  close(): void;
}>((set) => ({
  target: null,
  open: (panelId, itemId, scope) => set({ target: { panelId, itemId, scope } }),
  close: () => set({ target: null }),
}));
