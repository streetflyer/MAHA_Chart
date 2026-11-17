import { create } from "zustand";

/**
 * Moving and resizing the text of a text panel inside its box (mode "textbox", see
 * state/mode.ts). The box is kept on the panel (`bodyBox`, mm from the panel's top-left);
 * leaving the mode keeps it.
 */
interface BodyBoxEdit {
  active: boolean;
  panelId: string | null;
  enter(panelId: string): void;
  exit(): void;
}

export const useBodyBox = create<BodyBoxEdit>((set) => ({
  active: false,
  panelId: null,
  enter: (panelId) => set({ active: true, panelId }),
  exit: () => set({ active: false }),
}));

export type BoxHandle =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 6;
const MIN_H = 3;

/** The box after dragging `handle` by (dx, dy) mm, kept inside `within` (0,0,w,h). */
export function dragBox(
  b: Box,
  handle: BoxHandle,
  dx: number,
  dy: number,
  within: { w: number; h: number },
): Box {
  let { x, y, w, h } = b;
  if (handle === "move") {
    x = Math.min(Math.max(0, x + dx), within.w - w);
    y = Math.min(Math.max(0, y + dy), within.h - h);
    return { x, y, w, h };
  }
  let x0 = x;
  let y0 = y;
  let x1 = x + w;
  let y1 = y + h;
  if (handle.includes("w")) x0 = Math.min(Math.max(0, x0 + dx), x1 - MIN_W);
  if (handle.includes("e"))
    x1 = Math.max(Math.min(within.w, x1 + dx), x0 + MIN_W);
  if (handle.includes("n")) y0 = Math.min(Math.max(0, y0 + dy), y1 - MIN_H);
  if (handle.includes("s"))
    y1 = Math.max(Math.min(within.h, y1 + dy), y0 + MIN_H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
