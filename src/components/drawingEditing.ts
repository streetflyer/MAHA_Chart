import {
  boundsOfGroups,
  deleteGroups,
  groupBoxes,
  moveGroups,
  nearestGroup,
  type Box,
} from "../model/drawingOps";
import { lineworkFor } from "../model/datasets";
import type { DxfText } from "../model/dxf";
import { useDrawingEdit, type PlanContext } from "../state/drawingEdit";
import { useSurvey } from "../state/surveyData";
import { layerShown, placeText, type LineworkSet } from "./LineworkLayer";
import { copyTexts, pasteTextsAt } from "./drawingMenu";
import { approxTextWidth, fontSize } from "./svgText";

type Pt = [number, number];

/** The drawings shown in the plan view. */
export const planSets = (): LineworkSet[] =>
  lineworkFor(useSurvey.getState().datasets, "plan");

/** A grid point near the drawings, so paper↔grid maps don't lose precision to the large coordinates. */
function anchorOf(sets: LineworkSet[]): Pt {
  const b = sets[0]?.lw.bounds;
  return b ? [(b.minE + b.maxE) / 2, (b.minN + b.maxN) / 2] : [0, 0];
}

/** Paper millimetres in the plan view back to grid metres. */
export function toGrid(
  ctx: PlanContext,
  sets: LineworkSet[],
): (x: number, y: number) => Pt {
  const [ae, an] = anchorOf(sets);
  const a = ctx.project(ae, an);
  const bx = ctx.project(ae + 1, an);
  const by = ctx.project(ae, an + 1);
  const m = [bx[0] - a[0], bx[1] - a[1], by[0] - a[0], by[1] - a[1]];
  const det = m[0] * m[3] - m[2] * m[1] || 1;
  return (x, y) => {
    const dx = x - a[0];
    const dy = y - a[1];
    return [
      ae + (m[3] * dx - m[2] * dy) / det,
      an + (-m[1] * dx + m[0] * dy) / det,
    ];
  };
}

/** Is the text under this paper point? 0 when inside its box, else null. */
function textHitAt(
  d: LineworkSet,
  t: DxfText,
  ctx: PlanContext,
  px: number,
  py: number,
): number | null {
  const pl = placeText(d, t, ctx.project, ctx.mmPerM, ctx.uAngle);
  if (!pl) return null;
  const rad = (-pl.ang * Math.PI) / 180;
  const dx = px - pl.x;
  const dy = py - pl.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  const lines = t.text.split("\n");
  const w = Math.max(...lines.map((l) => approxTextWidth(l, pl.cap)));
  const x0 = pl.anchor === "middle" ? -w / 2 : pl.anchor === "end" ? -w : 0;
  const pad = pl.cap * 0.3;
  const h = pl.cap + (lines.length - 1) * fontSize(pl.cap) * 1.2;
  return lx >= x0 - pad &&
    lx <= x0 + w + pad &&
    ly >= -pl.cap - pad &&
    ly <= h - pl.cap + pad
    ? 0
    : null;
}

/** The object under a paper point, as {dataset, group}. */
export function pickObject(
  ctx: PlanContext,
  px: number,
  py: number,
  tolMm: number,
): { id: string; group: number } | null {
  const sets = planSets();
  const grid = toGrid(ctx, sets);
  const [e, n] = grid(px, py);
  const tol = tolMm / ctx.mmPerM;
  let best: { id: string; group: number } | null = null;
  // Later drawings sit on top, so they are asked first.
  for (const d of [...sets].reverse()) {
    const g = nearestGroup(
      d.lw,
      e,
      n,
      tol,
      (layer) => layerShown(d, layer),
      (t) => textHitAt(d, t, ctx, px, py),
    );
    if (g !== null) {
      best = { id: d.id, group: g };
      break;
    }
  }
  return best;
}

/** Objects inside (or, when `crossing`, touching) a paper rectangle. */
export function pickInBox(
  ctx: PlanContext,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  crossing: boolean,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  for (const d of planSets()) {
    const ids: number[] = [];
    const visible = new Set<number>();
    d.lw.layers.forEach(
      (l, i) => layerShown(d, l) && visible.add(d.lw.groups[i]),
    );
    for (const t of d.lw.texts)
      if (layerShown(d, t.layer)) visible.add(t.group);
    for (const [g, b] of groupBoxes(d.lw)) {
      if (!visible.has(g)) continue;
      const px = [
        ctx.project(b.minE, b.minN),
        ctx.project(b.maxE, b.minN),
        ctx.project(b.minE, b.maxN),
        ctx.project(b.maxE, b.maxN),
      ];
      const bx0 = Math.min(...px.map((p) => p[0]));
      const bx1 = Math.max(...px.map((p) => p[0]));
      const by0 = Math.min(...px.map((p) => p[1]));
      const by1 = Math.max(...px.map((p) => p[1]));
      const inside = bx0 >= minX && bx1 <= maxX && by0 >= minY && by1 <= maxY;
      const touches = bx1 >= minX && bx0 <= maxX && by1 >= minY && by0 <= maxY;
      if (crossing ? touches : inside) ids.push(g);
    }
    if (ids.length) out[d.id] = ids;
  }
  return out;
}

/** Box (grid metres) around everything chosen, across all drawings. */
export function selectionBox(selected: Record<string, number[]>): Box | null {
  let b: Box | null = null;
  for (const d of planSets()) {
    const g = selected[d.id];
    if (!g?.length) continue;
    const x = boundsOfGroups(d.lw, new Set(g));
    if (!x) continue;
    b = b
      ? {
          minE: Math.min(b.minE, x.minE),
          maxE: Math.max(b.maxE, x.maxE),
          minN: Math.min(b.minN, x.minN),
          maxN: Math.max(b.maxN, x.maxN),
        }
      : x;
  }
  return b;
}

/** Where the rotate handle sits on paper: above the middle of the chosen objects. */
export function rotateHandle(
  ctx: PlanContext,
  selected: Record<string, number[]>,
): {
  x: number;
  y: number;
  cx: number;
  cy: number;
  cE: number;
  cN: number;
} | null {
  const b = selectionBox(selected);
  if (!b) return null;
  const cE = (b.minE + b.maxE) / 2;
  const cN = (b.minN + b.maxN) / 2;
  const corners = [
    ctx.project(b.minE, b.minN),
    ctx.project(b.maxE, b.minN),
    ctx.project(b.minE, b.maxN),
    ctx.project(b.maxE, b.maxN),
  ];
  const [cx, cy] = ctx.project(cE, cN);
  const top = Math.min(...corners.map((c) => c[1]));
  // Kept inside the plan view so it can always be reached, even when the objects run off its edge.
  const r = ctx.rect;
  return {
    x: Math.min(r.x + r.w - 3, Math.max(r.x + 3, cx)),
    y: Math.min(r.y + r.h - 3, Math.max(r.y + 3, top - 6)),
    cx,
    cy,
    cE,
    cN,
  };
}

export const selectionCount = (sel: Record<string, number[]>) =>
  Object.values(sel).reduce((n, g) => n + g.length, 0);

/** Anything chosen that is a text? Its datasets and groups. */
export function selectedTexts(
  sel: Record<string, number[]>,
): { d: LineworkSet; texts: DxfText[] }[] {
  const out: { d: LineworkSet; texts: DxfText[] }[] = [];
  for (const d of planSets()) {
    const g = new Set(sel[d.id] ?? []);
    if (!g.size) continue;
    const texts = d.lw.texts.filter((t) => g.has(t.group));
    if (texts.length) out.push({ d, texts });
  }
  return out;
}

/** True while the plan view is in drawing-edit mode. */
export const editing = () => useDrawingEdit.getState().active;

/** Delete the chosen objects. */
export function deleteSelected() {
  const de = useDrawingEdit.getState();
  const ids = Object.keys(de.selected).filter((id) => de.selected[id].length);
  if (ids.length)
    de.change(
      ids,
      (lw, id) => deleteGroups(lw, new Set(de.selected[id])),
      false,
    );
}

/** Move the chosen objects by a step on paper (mm, paper axes). */
export function nudgeSelected(dxMm: number, dyMm: number) {
  const de = useDrawingEdit.getState();
  if (!de.ctx) return;
  const grid = toGrid(de.ctx, planSets());
  const g0 = grid(0, 0);
  const g1 = grid(dxMm, dyMm);
  const ids = Object.keys(de.selected).filter((id) => de.selected[id].length);
  if (ids.length)
    de.change(ids, (lw, id) =>
      moveGroups(lw, new Set(de.selected[id]), g1[0] - g0[0], g1[1] - g0[1]),
    );
}

/** Keys while editing the drawing. True when the key was used. */
export function drawingKey(e: KeyboardEvent): boolean {
  const de = useDrawingEdit.getState();
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "z" && !e.shiftKey) de.undo();
  else if (mod && k === "c") copyTexts();
  else if (mod && k === "v") {
    const r = de.ctx?.rect;
    if (r) pasteTextsAt({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  } else if (mod && (k === "y" || (k === "z" && e.shiftKey))) de.redo();
  else if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
  else if (e.key === "Escape") {
    if (selectionCount(de.selected)) de.select({});
    else de.exit();
  } else if (e.key.startsWith("Arrow") && selectionCount(de.selected)) {
    const step = e.shiftKey ? 5 : 0.5;
    const d = (
      {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      } as Record<string, number[]>
    )[e.key];
    nudgeSelected(d[0], d[1]);
  } else return false;
  return true;
}
