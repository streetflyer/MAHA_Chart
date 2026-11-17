/** Where each cut section of a longitudinal profile sits on paper, for the right-click menu (set while the panel draws). */
export interface LongSections {
  panelId: string;
  datasetId: string;
  y: number;
  h: number;
  parts: { xa: number; xb: number }[];
}

export const longSections = new Map<string, LongSections>();

/** The section under a paper point: dataset id and section number. */
export function longSectionAt(
  x: number,
  y: number,
): { datasetId: string; n: number; panelId: string } | null {
  for (const s of longSections.values())
    if (y >= s.y && y <= s.y + s.h) {
      const n = s.parts.findIndex((q) => x >= q.xa && x <= q.xb);
      if (n >= 0) return { datasetId: s.datasetId, n, panelId: s.panelId };
    }
  return null;
}
