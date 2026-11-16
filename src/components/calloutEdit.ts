import { create } from "zustand";
import { newCallout, rowsOf } from "../model/callout";
import { newId } from "../model/ids";
import { planStyle } from "../model/planStyle";
import type { Callout, CalloutRow, ChartTemplate } from "../model/types";
import { useEditor } from "../state/store";
import { askText } from "./Dialog";
import type { MenuItem } from "./ContextMenu";
import { planProjection } from "./Callouts";

/** Ids look like `panelId|calloutId` (and `|part` on the drawn elements). */
export const splitCallout = (id: string) => {
  const [panelId, cid, part] = id.split("|");
  return { panelId, cid, part };
};

export function calloutsOf(t: ChartTemplate, panelId: string): Callout[] {
  const p = t.panels.find((x) => x.id === panelId);
  return (p && planStyle(p).callouts) ?? [];
}

/** The template with one plan view's callouts changed. */
export function withCallouts(
  t: ChartTemplate,
  panelId: string,
  fn: (cs: Callout[]) => Callout[],
): ChartTemplate {
  return {
    ...t,
    panels: t.panels.map((p) =>
      p.id === panelId
        ? {
            ...p,
            plan: {
              ...planStyle(p),
              callouts: fn(planStyle(p).callouts ?? []),
            },
          }
        : p,
    ),
  };
}

export function patchCallout(
  panelId: string,
  cid: string,
  patch: Partial<Callout>,
) {
  useEditor
    .getState()
    .commit((t) =>
      withCallouts(t, panelId, (cs) =>
        cs.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
      ),
    );
}

/** A new text box pointing at a paper point of the plan view (or its middle). */
export function addCallout(panelId: string, at?: { x: number; y: number }) {
  const s = useEditor.getState();
  const p = s.template?.panels.find((x) => x.id === panelId);
  const pj = planProjection.get(panelId);
  if (!p || !pj) return false;
  const x = at?.x ?? p.x + p.w * 0.45;
  const y = at?.y ?? p.y + p.h * 0.6;
  const [e, n] = pj.unproject(x, y);
  const c = {
    ...newCallout(Math.round(e * 10) / 10, Math.round(n * 10) / 10),
    chart: s.sheetIndex,
  };
  // Keep the new box inside the panel.
  if (y + c.dy < p.y + 2) c.dy = 6;
  if (x + c.dx + c.w > p.x + p.w - 2) c.dx = -c.w - 12;
  s.commit((t) => withCallouts(t, panelId, (cs) => [...cs, c]));
  return true;
}

/** "581247.7, 9823853.0" (or with spaces / semicolons) → [E, N]. */
export function parseEN(v: string): [number, number] | null {
  const m = v.replace(/(\d) (?=\d{3}\b)/g, "$1").match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 2) return null;
  return [Number(m[0]), Number(m[1])];
}

export function calloutMenu(id: string): MenuItem[] {
  const { panelId, cid } = splitCallout(id);
  const t = useEditor.getState().template;
  const c = t && calloutsOf(t, panelId).find((x) => x.id === cid);
  if (!c) return [];
  return [
    {
      label: "Edit title…",
      action: async () => {
        const v = await askText(
          "Title (use \\n for a new line)",
          c.title.replace(/\n/g, "\\n"),
          "OK",
        );
        if (v !== null)
          patchCallout(panelId, cid, { title: v.replace(/\\n/g, "\n") });
      },
    },
    {
      label: "Point to coordinates…",
      action: async () => {
        const v = await askText(
          "Easting, Northing",
          `${c.e.toFixed(1)}, ${c.n.toFixed(1)}`,
          "OK",
        );
        const en = v && parseEN(v);
        if (en) patchCallout(panelId, cid, { e: en[0], n: en[1] });
      },
    },
    {
      label: "Heading…",
      action: async () => {
        const v = await askText(
          "Heading (e.g. 213.0°G; empty hides it)",
          c.heading,
          "OK",
        );
        if (v !== null) patchCallout(panelId, cid, { heading: v });
      },
    },
    {
      label: c.showEN ? "Hide easting / northing" : "Show easting / northing",
      action: () => patchCallout(panelId, cid, { showEN: !c.showEN }),
    },
    { label: "More settings in the Properties panel", disabled: true },
    "separator",
    {
      label: "Delete text box",
      action: () =>
        useEditor
          .getState()
          .commit((tt) =>
            withCallouts(tt, panelId, (cs) => cs.filter((x) => x.id !== cid)),
          ),
    },
  ];
}

/** The text box last clicked: its settings open and scroll into view in the Properties panel. */
export const useCalloutFocus = create<{ id: string | null; n: number }>(() => ({
  id: null,
  n: 0,
}));

function findCallout(panelId: string, cid: string) {
  const t = useEditor.getState().template;
  return t ? calloutsOf(t, panelId).find((x) => x.id === cid) : undefined;
}

/** Change a box's lines (turning an older box's switches into its own list first). */
export function patchRows(
  panelId: string,
  cid: string,
  fn: (rows: CalloutRow[]) => CalloutRow[],
) {
  const c = findCallout(panelId, cid);
  if (c) patchCallout(panelId, cid, { rows: fn(rowsOf(c)) });
}

export const newRow = (kind: CalloutRow["kind"] = "text"): CalloutRow => ({
  id: newId(),
  label: kind === "e" ? "Easting" : kind === "n" ? "Northing" : "Heading",
  kind,
  value: "",
  suffix: kind === "text" ? "°G" : "m",
});

/** Double-click on a box: the title band edits the title, a line edits that line. */
export async function editCalloutPart(id: string) {
  const { panelId, cid, part } = splitCallout(id);
  const c = findCallout(panelId, cid);
  if (!c) return;
  if (part?.startsWith("row:")) {
    const rid = part.slice(4);
    const r = rowsOf(c).find((x) => x.id === rid);
    if (!r) return;
    if (r.kind === "e" || r.kind === "n") {
      const v = await askText(
        `${r.label} the arrow points at (m)`,
        (r.kind === "e" ? c.e : c.n).toFixed(1),
        "OK",
      );
      const x = v === null ? NaN : Number(v.replace(/[\s,]/g, ""));
      if (Number.isFinite(x))
        patchCallout(panelId, cid, r.kind === "e" ? { e: x } : { n: x });
      return;
    }
    const v = await askText(
      `${r.label}${r.suffix ? ` (${r.suffix})` : ""}`,
      r.value,
      "OK",
    );
    if (v !== null)
      patchRows(panelId, cid, (rows) =>
        rows.map((x) => (x.id === rid ? { ...x, value: v } : x)),
      );
    return;
  }
  const v = await askText(
    "Title (use \\n for a new line)",
    c.title.replace(/\n/g, "\\n"),
    "OK",
  );
  if (v !== null)
    patchCallout(panelId, cid, { title: v.replace(/\\n/g, "\n") });
}
