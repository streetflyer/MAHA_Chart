import { create } from "zustand";

type Rect = { x: number; y: number; w: number; h: number };

/** What a panel says about a point on it (paper mm), one line each. */
export type InfoAt = (x: number, y: number) => string[];

/**
 * Panels that can tell what lies under the pointer register here while they are drawn
 * (plan view, key plan, KP panels). The sheet asks them when hover info is on.
 */
export const hoverSources = new Map<string, { rect: Rect; info: InfoAt }>();

export function infoAt(x: number, y: number): string[] {
  for (const s of hoverSources.values()) {
    const r = s.rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      const lines = s.info(x, y);
      if (lines.length) return lines;
    }
  }
  return [];
}

/** The tooltip on screen now. */
export const useHoverTip = create<{
  tip: { x: number; y: number; lines: string[] } | null;
}>(() => ({ tip: null }));
