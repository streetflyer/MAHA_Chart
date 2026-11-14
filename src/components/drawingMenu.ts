import { FONT_FAMILIES } from "../model/datasets";
import { addTexts, editTexts } from "../model/drawingOps";
import type { DxfText } from "../model/dxf";
import { useDrawingEdit, type TextFormat } from "../state/drawingEdit";
import { askText } from "./Dialog";
import type { MenuItem } from "./ContextMenu";
import {
  deleteSelected,
  planSets,
  selectedTexts,
  toGrid,
} from "./drawingEditing";

const PALETTE: [string, string][] = [
  ["Black", "#000000"],
  ["Dark grey", "#555555"],
  ["Red", "#e00000"],
  ["Orange", "#f08a00"],
  ["Green", "#16a34a"],
  ["Blue", "#1f3fd6"],
  ["Magenta", "#d6249f"],
  ["Cyan", "#00a8c8"],
  ["White", "#ffffff"],
];

const ids = () => {
  const { selected } = useDrawingEdit.getState();
  return Object.keys(selected).filter((id) => selected[id].length);
};

/** Apply a change to the chosen texts. */
function patchTexts(patch: Parameters<typeof editTexts>[2]) {
  const de = useDrawingEdit.getState();
  const texts = selectedTexts(de.selected);
  de.change(
    texts.map((x) => x.d.id),
    (lw, id) => editTexts(lw, new Set(de.selected[id]), patch),
  );
}

/** Copy the chosen texts. */
export function copyTexts() {
  const de = useDrawingEdit.getState();
  const all = selectedTexts(de.selected).flatMap((x) => x.texts);
  if (all.length) de.setTextClip(all.map(({ group: _g, ...t }) => t));
}

/** Paste the copied texts so that they centre on a paper point. */
export function pasteTextsAt(at: { x: number; y: number }) {
  const de = useDrawingEdit.getState();
  if (!de.textClip?.length || !de.ctx) return;
  const sets = planSets();
  const target = selectedTexts(de.selected)[0]?.d ?? sets[sets.length - 1];
  if (!target) return;
  const [e, n] = toGrid(de.ctx, sets)(at.x, at.y);
  const cE = de.textClip.reduce((a, t) => a + t.x, 0) / de.textClip.length;
  const cN = de.textClip.reduce((a, t) => a + t.y, 0) / de.textClip.length;
  const add = de.textClip.map((t) => ({
    ...t,
    x: t.x - cE + e,
    y: t.y - cN + n,
  }));
  let groups: number[] = [];
  de.change([target.id], (lw) => {
    const r = addTexts(lw, add);
    groups = r.groups;
    return r.lw;
  });
  de.select({ [target.id]: groups });
}

/** A new text where the menu was opened. */
export async function addTextAt(at: { x: number; y: number }) {
  const de = useDrawingEdit.getState();
  if (!de.ctx) return;
  const text = await askText("New text", "", "Add");
  if (!text) return;
  const sets = planSets();
  const target = selectedTexts(de.selected)[0]?.d ?? sets[sets.length - 1];
  if (!target) return;
  const [e, n] = toGrid(de.ctx, sets)(at.x, at.y);
  const f = de.format;
  const t: Omit<DxfText, "group"> = {
    x: e,
    y: n,
    h: f?.h ?? 2.5 / de.ctx.mmPerM,
    rot: de.ctx.uAngle,
    text,
    align: "start",
    layer: "TEXT",
    color: f?.color ?? "#000000",
    font: f?.font,
    bold: f?.bold,
    italic: f?.italic,
  };
  let groups: number[] = [];
  de.change([target.id], (lw) => {
    const r = addTexts(lw, [t]);
    groups = r.groups;
    return r.lw;
  });
  de.select({ [target.id]: groups });
}

function copyFormat() {
  const de = useDrawingEdit.getState();
  const t = selectedTexts(de.selected)[0]?.texts[0];
  if (t)
    de.setFormat({
      h: t.h,
      color: t.color,
      font: t.font,
      bold: t.bold,
      italic: t.italic,
      rot: t.rot,
    });
}

/** Give the chosen texts the copied look: font, style, colour and height. */
function pasteFormat(f: TextFormat) {
  const de = useDrawingEdit.getState();
  const texts = selectedTexts(de.selected);
  de.change(
    texts.map((x) => x.d.id),
    (lw, id) => {
      const g = new Set(de.selected[id]);
      return {
        ...lw,
        texts: lw.texts.map((t) =>
          g.has(t.group)
            ? {
                ...t,
                h: f.h,
                color: f.color,
                font: f.font,
                bold: f.bold,
                italic: f.italic,
              }
            : t,
        ),
      };
    },
  );
}

function moreColours(current: string) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(current) ? current : "#000000";
  input.onchange = () => patchTexts({ color: input.value });
  input.click();
}

/** Right-click menu of drawing-edit mode: text copy/paste, new text, Word-like font menu, copy format. */
export function drawingMenu(at: { x: number; y: number }): MenuItem[] {
  const de = useDrawingEdit.getState();
  const texts = selectedTexts(de.selected);
  const all = texts.flatMap((x) => x.texts);
  const one = all.length === 1 ? all[0] : null;
  const first = all[0];
  const hasText = all.length > 0;
  const nothing = ids().length === 0;
  const items: MenuItem[] = [
    {
      label: "Copy text",
      shortcut: "Ctrl+C",
      disabled: !hasText,
      action: copyTexts,
    },
    {
      label: "Paste text",
      shortcut: "Ctrl+V",
      disabled: !de.textClip?.length,
      action: () => pasteTextsAt(at),
    },
    { label: "Add new text here…", action: () => void addTextAt(at) },
    "separator",
  ];
  if (hasText) {
    items.push(
      one
        ? {
            label: "Edit text…",
            action: async () => {
              const v = await askText("Edit text", one.text, "OK");
              if (v !== null && v !== one.text) patchTexts({ text: v });
            },
          }
        : { label: `${all.length} texts chosen`, disabled: true },
      {
        label: "Font",
        submenu: [
          {
            label: "Sheet font",
            checked: !first.font,
            action: () => patchTexts({ font: "" }),
          },
          ...FONT_FAMILIES.map(
            (f): MenuItem => ({
              label: f,
              checked: first.font === f,
              action: () => patchTexts({ font: f }),
            }),
          ),
        ],
      },
      {
        label: "Bold",
        checked: !!first.bold,
        action: () => patchTexts({ bold: !first.bold }),
      },
      {
        label: "Italic",
        checked: !!first.italic,
        action: () => patchTexts({ italic: !first.italic }),
      },
      {
        label: "Size",
        submenu: [50, 75, 90, 110, 125, 150, 200].map(
          (p): MenuItem => ({
            label: `${p}%`,
            action: () => patchTexts({ scale: p / 100 }),
          }),
        ),
      },
      {
        label: "Colour",
        submenu: [
          ...PALETTE.map(
            ([name, c]): MenuItem => ({
              label: name,
              checked: first.color.toLowerCase() === c,
              action: () => patchTexts({ color: c }),
            }),
          ),
          "separator",
          { label: "More colours…", action: () => moreColours(first.color) },
        ],
      },
      {
        label: "Turn text…",
        action: async () => {
          const v = await askText(
            "Turn text to (degrees anticlockwise from the grid east)",
            String(Math.round(first.rot * 100) / 100),
            "Turn",
          );
          const a = parseFloat((v ?? "").replace(",", "."));
          if (Number.isFinite(a)) patchTexts({ rot: a });
        },
      },
      "separator",
      { label: "Copy format", disabled: !hasText, action: copyFormat },
    );
  }
  items.push(
    {
      label: "Paste format",
      disabled: !hasText || !de.format,
      action: () => de.format && pasteFormat(de.format),
    },
    "separator",
    {
      label: "Delete",
      shortcut: "Del",
      disabled: nothing,
      action: deleteSelected,
    },
    {
      label: "Undo",
      shortcut: "Ctrl+Z",
      disabled: !de.past.length,
      action: () => de.undo(),
    },
    {
      label: "Redo",
      shortcut: "Ctrl+Y",
      disabled: !de.future.length,
      action: () => de.redo(),
    },
    "separator",
    {
      label: "Finish editing the drawing",
      shortcut: "Esc",
      action: () => de.exit(),
    },
  );
  return items;
}
