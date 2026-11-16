import { create } from "zustand";

/** How a matchline is chosen in the key plan. */
export type MatchTool = "pick" | "draw";

/**
 * Choosing matchlines in the key plan (mode "matchline", see state/mode.ts).
 * pick: the overlaps of this chart with its neighbours are shown green; a click in one
 * sets the matchline of those two charts there, square to the line.
 * draw: two clicks draw the matchline where the user wants it.
 */
interface MatchPick {
  active: boolean;
  tool: MatchTool;
  /** The key plan panel the clicks go to. */
  panelId: string | null;
  /** First point of a line being drawn (grid E, N). */
  first: [number, number] | null;
  /** Pointer position (grid E, N) for the preview. */
  hover: [number, number] | null;
  enter(panelId: string, tool: MatchTool): void;
  exit(): void;
  setFirst(p: [number, number] | null): void;
  setHover(p: [number, number] | null): void;
}

export const useMatchPick = create<MatchPick>((set, get) => ({
  active: false,
  tool: "pick",
  panelId: null,
  first: null,
  hover: null,
  enter: (panelId, tool) =>
    set({ active: true, panelId, tool, first: null, hover: null }),
  exit: () => set({ active: false, first: null, hover: null }),
  setFirst: (first) => set({ first }),
  setHover: (hover) => {
    const h = get().hover;
    if (h === hover || (h && hover && h[0] === hover[0] && h[1] === hover[1]))
      return;
    set({ hover });
  },
}));
