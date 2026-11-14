import { pointsOf } from "../model/cpEdit";
import {
  DEFAULT_CP_LOOK,
  type CpNote,
  type CpPoint,
  type Dataset,
} from "../model/datasets";
import { useCpEdit } from "../state/cpEdit";
import { useSurvey } from "../state/surveyData";
import { askText } from "./Dialog";
import type { MenuItem } from "./ContextMenu";

type CpSet = Extract<Dataset, { kind: "cp" }>;

/** The CP dataset that edit mode works on for a panel: the first visible one. */
export function cpDatasetFor(
  panelId: string,
  panelType = "cp",
): CpSet | undefined {
  void panelId;
  void panelType;
  return useSurvey
    .getState()
    .datasets.find(
      (d): d is CpSet => d.kind === "cp" && d.visible && d.style === "ticks",
    );
}

const dataset = () => {
  const id = useCpEdit.getState().datasetId;
  return useSurvey
    .getState()
    .datasets.find((d): d is CpSet => d.id === id && d.kind === "cp");
};

/** The reading or note under a paper point. */
export function pickCp(
  x: number,
  y: number,
  tolMm: number,
): { kind: "pt" | "note"; i: number } | null {
  const ce = useCpEdit.getState();
  const ctx = ce.ctx;
  const d = dataset();
  if (!ctx || !d) return null;
  const look = { ...DEFAULT_CP_LOOK, ...d.look };
  let best: { kind: "pt" | "note"; i: number } | null = null;
  let bd = Infinity;
  pointsOf(d).forEach((pt, i) => {
    const dist = Math.hypot(ctx.toX(pt.kp) - x, ctx.layout.yOf(pt) - y);
    const reach = Math.max(tolMm, (pt.size ?? look.symbolSize) / 2 + 0.5);
    if (dist <= reach && dist < bd) {
      bd = dist;
      best = { kind: "pt", i };
    }
  });
  if (best) return best;
  (d.notes ?? []).forEach((n, i) => {
    const cap = n.size ?? d.font.size;
    const nx = ctx.toX(n.kp);
    const ny = ctx.rect.y + ctx.rect.h * n.y;
    if (
      x >= nx - 1 &&
      x <= nx + n.text.length * cap * 0.78 + 1 &&
      y >= ny - cap - 1 &&
      y <= ny + 1
    )
      best = { kind: "note", i };
  });
  return best;
}

/** Readings and notes inside a paper rectangle. */
export function pickCpInBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { pts: number[]; notes: number[] } {
  const ctx = useCpEdit.getState().ctx;
  const d = dataset();
  if (!ctx || !d) return { pts: [], notes: [] };
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [c, e] = [Math.min(y0, y1), Math.max(y0, y1)];
  const pts = pointsOf(d)
    .map((pt, i) => [i, ctx.toX(pt.kp), ctx.layout.yOf(pt)] as const)
    .filter(([, x, y]) => x >= a && x <= b && y >= c && y <= e)
    .map(([i]) => i);
  const notes = (d.notes ?? [])
    .map((n, i) => [i, ctx.toX(n.kp), ctx.rect.y + ctx.rect.h * n.y] as const)
    .filter(([, x, y]) => x >= a && x <= b && y >= c && y <= e)
    .map(([i]) => i);
  return { pts, notes };
}

const count = () => {
  const s = useCpEdit.getState();
  return s.selPts.length + s.selNotes.length;
};

/** Move the chosen readings and notes by a paper offset. */
export function moveChosen(dx: number, dy: number) {
  const ce = useCpEdit.getState();
  const ctx = ce.ctx;
  if (!ctx || !count()) return;
  const { selPts, selNotes } = ce;
  ce.change((pts, notes) => ({
    pts: pts.map((pt, i) =>
      selPts.includes(i)
        ? {
            ...pt,
            kp: ctx.kpAt(ctx.toX(pt.kp) + dx),
            y: (ctx.layout.yOf(pt) + dy - ctx.rect.y) / ctx.rect.h,
          }
        : pt,
    ),
    notes: notes.map((n, i) =>
      selNotes.includes(i)
        ? { ...n, kp: ctx.kpAt(ctx.toX(n.kp) + dx), y: n.y + dy / ctx.rect.h }
        : n,
    ),
  }));
}

export function deleteChosen() {
  const ce = useCpEdit.getState();
  const { selPts, selNotes } = ce;
  if (!count()) return;
  ce.change(
    (pts, notes) => ({
      pts: pts.filter((_, i) => !selPts.includes(i)),
      notes: notes.filter((_, i) => !selNotes.includes(i)),
    }),
    { pts: [], notes: [] },
  );
}

export function copyChosen() {
  const ce = useCpEdit.getState();
  const d = dataset();
  if (!d || !count()) return;
  const pts = pointsOf(d).filter((_, i) => ce.selPts.includes(i));
  const notes = (d.notes ?? []).filter((_, i) => ce.selNotes.includes(i));
  // Heights are kept as drawn so a pasted reading lands at the same place relative to the others.
  const ctx = ce.ctx;
  useCpEdit.setState({
    clip: {
      pts: pts.map((p) => ({
        ...p,
        y: ctx ? (ctx.layout.yOf(p) - ctx.rect.y) / ctx.rect.h : p.y,
      })),
      notes,
    },
  });
}

export function cutChosen() {
  copyChosen();
  deleteChosen();
}

/** Paste the copied items so that they centre on a paper point. */
export function pasteAtCp(x: number, y: number) {
  const ce = useCpEdit.getState();
  const ctx = ce.ctx;
  const clip = ce.clip;
  if (!ctx || !clip || (!clip.pts.length && !clip.notes.length)) return;
  const kps = [...clip.pts.map((p) => p.kp), ...clip.notes.map((n) => n.kp)];
  const ys = [
    ...clip.pts.map((p) => p.y ?? 0.5),
    ...clip.notes.map((n) => n.y),
  ];
  const dk = ctx.kpAt(x) - (Math.min(...kps) + Math.max(...kps)) / 2;
  const dyf =
    (y - ctx.rect.y) / ctx.rect.h - (Math.min(...ys) + Math.max(...ys)) / 2;
  ce.change((pts, notes) => ({
    pts: [
      ...pts,
      ...clip.pts.map((p) => ({ ...p, kp: p.kp + dk, y: (p.y ?? 0.5) + dyf })),
    ],
    notes: [
      ...notes,
      ...clip.notes.map((n) => ({ ...n, kp: n.kp + dk, y: n.y + dyf })),
    ],
  }));
  const d = dataset();
  if (d)
    ce.select(
      Array.from(
        { length: clip.pts.length },
        (_, k) => pointsOf(d).length - clip.pts.length + k,
      ),
      Array.from(
        { length: clip.notes.length },
        (_, k) => (d.notes ?? []).length - clip.notes.length + k,
      ),
    );
}

/** Nudge the chosen items by a step on paper (mm). */
export const nudgeCp = (dx: number, dy: number) => moveChosen(dx, dy);

/** A new reading at a paper point: asks for the value. */
export async function addReadingAt(x: number, y: number) {
  const ce = useCpEdit.getState();
  const ctx = ce.ctx;
  if (!ctx) return;
  const v = await askText("New CP reading (mV)", "-1050", "Add");
  const mv = parseFloat((v ?? "").replace(",", "."));
  if (!Number.isFinite(mv)) return;
  const pt: CpPoint = { kp: ctx.kpAt(x), mv, y: (y - ctx.rect.y) / ctx.rect.h };
  ce.change((pts, notes) => ({ pts: [...pts, pt], notes }));
  const d = dataset();
  if (d) ce.select([pointsOf(d).length - 1], []);
}

export async function addNoteAt(x: number, y: number) {
  const ce = useCpEdit.getState();
  const ctx = ce.ctx;
  if (!ctx) return;
  const text = await askText("New text", "", "Add");
  if (!text) return;
  const n: CpNote = { kp: ctx.kpAt(x), y: (y - ctx.rect.y) / ctx.rect.h, text };
  ce.change((pts, notes) => ({ pts, notes: [...notes, n] }));
  const d = dataset();
  if (d) ce.select([], [(d.notes ?? []).length - 1]);
}

/** Change fields of the chosen readings. */
function patchChosen(patch: Partial<CpPoint>) {
  const ce = useCpEdit.getState();
  const sel = ce.selPts;
  if (sel.length)
    ce.change((pts, notes) => ({
      pts: pts.map((p, i) => (sel.includes(i) ? { ...p, ...patch } : p)),
      notes,
    }));
}

async function editReading() {
  const ce = useCpEdit.getState();
  const d = dataset();
  if (!d || ce.selPts.length !== 1) return;
  const i = ce.selPts[0];
  const pt = pointsOf(d)[i];
  const v = await askText(
    "Edit the reading: KP in km, then mV",
    `${(pt.kp / 1000).toFixed(3)}; ${pt.mv}`,
    "OK",
  );
  if (!v) return;
  const [k, m] = v.split(/[;\s]+/).map((s) => parseFloat(s.replace(",", ".")));
  if (Number.isFinite(k) && Number.isFinite(m))
    patchChosen({ kp: k * 1000, mv: m });
}

async function editText(note: boolean) {
  const ce = useCpEdit.getState();
  const d = dataset();
  if (!d) return;
  if (note && ce.selNotes.length === 1) {
    const i = ce.selNotes[0];
    const v = await askText("Edit text", d.notes![i].text, "OK");
    if (v !== null)
      ce.change((pts, notes) => ({
        pts,
        notes: notes.map((n, j) => (j === i ? { ...n, text: v } : n)),
      }));
  } else if (!note && ce.selPts.length === 1) {
    const pt = pointsOf(d)[ce.selPts[0]];
    const v = await askText(
      "Text of the reading (empty = the value)",
      pt.text ?? "",
      "OK",
    );
    if (v !== null) patchChosen({ text: v || undefined });
  }
}

const PALETTE: [string, string][] = [
  ["Dataset colour", ""],
  ["Black", "#000000"],
  ["Red", "#e00000"],
  ["Orange", "#f08a00"],
  ["Green", "#16a34a"],
  ["Blue", "#1f3fd6"],
  ["Magenta", "#d6249f"],
];

/** Keys while editing the CP panel; true when the key was used. */
export function cpKey(e: KeyboardEvent): boolean {
  const ce = useCpEdit.getState();
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "z" && !e.shiftKey) ce.undo();
  else if (mod && (k === "y" || (k === "z" && e.shiftKey))) ce.redo();
  else if (mod && k === "c") copyChosen();
  else if (mod && k === "x") cutChosen();
  else if (mod && k === "v") {
    const r = ce.ctx?.rect;
    if (r) pasteAtCp(r.x + r.w / 2, r.y + r.h / 2);
  } else if (e.key === "Delete" || e.key === "Backspace") deleteChosen();
  else if (e.key === "Escape") {
    if (count()) ce.select([], []);
    else ce.exit();
  } else if (e.key.startsWith("Arrow") && count()) {
    const step = e.shiftKey ? 2 : 0.25;
    const v = (
      {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      } as Record<string, number[]>
    )[e.key];
    nudgeCp(v[0], v[1]);
  } else return false;
  return true;
}

/** Right-click menu of CP edit mode. */
export function cpMenu(at: { x: number; y: number }): MenuItem[] {
  const ce = useCpEdit.getState();
  const n = count();
  const oneReading = ce.selPts.length === 1 && !ce.selNotes.length;
  const oneNote = ce.selNotes.length === 1 && !ce.selPts.length;
  const items: MenuItem[] = [
    { label: "Cut", shortcut: "Ctrl+X", disabled: !n, action: cutChosen },
    { label: "Copy", shortcut: "Ctrl+C", disabled: !n, action: copyChosen },
    {
      label: "Paste here",
      shortcut: "Ctrl+V",
      disabled: !ce.clip,
      action: () => pasteAtCp(at.x, at.y),
    },
    "separator",
    { label: "Add reading here…", action: () => void addReadingAt(at.x, at.y) },
    { label: "Add text here…", action: () => void addNoteAt(at.x, at.y) },
  ];
  if (oneReading)
    items.push(
      "separator",
      { label: "Edit KP and reading…", action: () => void editReading() },
      { label: "Edit its text…", action: () => void editText(false) },
    );
  if (oneNote)
    items.push("separator", {
      label: "Edit text…",
      action: () => void editText(true),
    });
  if (ce.selPts.length) {
    items.push(
      "separator",
      {
        label: "Symbol size",
        submenu: [0.6, 0.8, 1, 1.2, 1.6, 2, 3].map(
          (s): MenuItem => ({
            label: `${s} mm`,
            action: () => patchChosen({ size: s }),
          }),
        ),
      },
      {
        label: "Colour",
        submenu: PALETTE.map(
          ([name, c]): MenuItem => ({
            label: name,
            action: () => patchChosen({ color: c || undefined }),
          }),
        ),
      },
      {
        label: "Text position",
        submenu: [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
          (h): MenuItem => ({
            label: `${h} o'clock`,
            action: () => patchChosen({ textClock: h }),
          }),
        ),
      },
    );
  }
  items.push(
    "separator",
    { label: "Delete", shortcut: "Del", disabled: !n, action: deleteChosen },
    {
      label: "Undo",
      shortcut: "Ctrl+Z",
      disabled: !ce.past.length,
      action: () => ce.undo(),
    },
    {
      label: "Redo",
      shortcut: "Ctrl+Y",
      disabled: !ce.future.length,
      action: () => ce.redo(),
    },
    "separator",
    {
      label: "Finish editing the panel",
      shortcut: "Esc",
      action: () => ce.exit(),
    },
  );
  return items;
}
