import type { ChartTemplate } from "../model/types";
import type { PointSet } from "../model/pointSets";
import { useEditor } from "../state/store";
import { askText } from "./Dialog";
import type { MenuItem } from "./ContextMenu";
import { usePointSetDialog } from "./PointSetDialog";

/** Ids on the sheet look like `panel|set|rowKey`. */
export function splitPts(id: string) {
  const [panelId, setId, ...rest] = id.split("|");
  return { panelId, setId, key: rest.join("|") };
}

export function setOf(t: ChartTemplate | null | undefined, id: string) {
  const { panelId, setId } = splitPts(id);
  return t?.panels
    .find((p) => p.id === panelId)
    ?.pointSets?.find((s) => s.id === setId);
}

/** The template with one point set changed. */
export function withSet(
  t: ChartTemplate,
  id: string,
  fn: (s: PointSet) => PointSet | null,
): ChartTemplate {
  const { panelId, setId } = splitPts(id);
  return {
    ...t,
    panels: t.panels.map((p) =>
      p.id !== panelId
        ? p
        : {
            ...p,
            pointSets: (p.pointSets ?? []).flatMap((s) => {
              if (s.id !== setId) return [s];
              const n = fn(s);
              return n ? [n] : [];
            }),
          },
    ),
  };
}

function apply(id: string, fn: (s: PointSet) => PointSet | null) {
  const ed = useEditor.getState();
  const t = ed.template;
  if (!t) return;
  const { panelId } = splitPts(id);
  const next = withSet(t, id, fn).panels.find((p) => p.id === panelId);
  if (next) ed.updatePanel(panelId, { pointSets: next.pointSets });
}

/** Double-click a point's description: its own wording (empty: back to the columns). */
export async function editPointText(id: string) {
  const s = setOf(useEditor.getState().template, id);
  if (!s) return;
  const { key } = splitPts(id);
  const cur =
    document.querySelector(`[data-ptslabel="${CSS.escape(id)}"]`)
      ?.previousElementSibling?.textContent ?? "";
  const v = await askText("Description of this point", s.texts?.[key] ?? cur);
  if (v === null) return;
  apply(id, (x) => {
    const texts = { ...x.texts };
    if (v.trim()) texts[key] = v;
    else delete texts[key];
    return { ...x, texts };
  });
}

/** Right-click menu of a plotted point or its description. */
export function pointMenu(id: string): MenuItem[] {
  const s = setOf(useEditor.getState().template, id);
  if (!s) return [];
  const { key } = splitPts(id);
  const moved = !!(s.moves?.[key] || s.labelAt?.[key]);
  return [
    { label: `${s.name}`, disabled: true },
    { label: "Edit this description…", action: () => void editPointText(id) },
    {
      label: "Back to its own place",
      disabled: !moved,
      action: () =>
        apply(id, (x) => {
          const moves = { ...x.moves };
          const labelAt = { ...x.labelAt };
          delete moves[key];
          delete labelAt[key];
          return { ...x, moves, labelAt };
        }),
    },
    {
      label: "Hide this point",
      action: () =>
        apply(id, (x) => ({ ...x, hidden: [...(x.hidden ?? []), key] })),
    },
    {
      label: `Show the hidden points (${s.hidden?.length ?? 0})`,
      disabled: !s.hidden?.length,
      action: () => apply(id, (x) => ({ ...x, hidden: [] })),
    },
    "separator",
    {
      label: "Edit the point set (symbol, description)…",
      action: () => usePointSetDialog.getState().edit(s),
    },
    {
      label: s.keyplan ? "Hide in the key plan" : "Show in the key plan",
      action: () => apply(id, (x) => ({ ...x, keyplan: !x.keyplan })),
    },
    "separator",
    {
      label: "Remove the point set",
      action: () => apply(id, () => null),
    },
  ];
}
