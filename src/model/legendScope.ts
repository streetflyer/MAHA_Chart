import type { LegendChartEdit, LegendItem, Panel } from "./types";

/** The legend items as drawn on one chart: its own changes applied, its hidden items left out. */
export function applyChartEdits<T extends LegendItem>(
  items: T[],
  edits: Record<string, LegendChartEdit> | undefined,
): T[] {
  if (!edits) return items;
  return items
    .filter((i) => !edits[i.id]?.hidden)
    .map((i) => {
      const e = edits[i.id];
      if (!e) return i;
      const out = { ...i } as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(e))
        if (v !== undefined && k !== "hidden") out[k] = v;
      return out as unknown as T;
    });
}

/** A change to one item on one chart only; undefined values clear what was set. */
export function chartEditPatch(
  p: Panel,
  chart: number,
  itemId: string,
  patch: LegendChartEdit,
): Pick<Panel, "legendChart"> {
  const all = p.legendChart ?? {};
  const mine = all[chart] ?? {};
  const next: Record<string, unknown> = { ...mine[itemId], ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  const items = { ...mine, [itemId]: next as LegendChartEdit };
  if (!Object.keys(next).length) delete items[itemId];
  return { legendChart: { ...all, [chart]: items } };
}

/** Back to the all-charts version of an item on one chart. */
export function clearChartEdit(
  p: Panel,
  chart: number,
  itemId: string,
): Pick<Panel, "legendChart"> {
  const all = p.legendChart ?? {};
  const items = { ...all[chart] };
  delete items[itemId];
  return { legendChart: { ...all, [chart]: items } };
}

/** Does this item differ on this chart? */
export const hasChartEdit = (p: Panel, chart: number, itemId: string) =>
  !!p.legendChart?.[chart]?.[itemId];
