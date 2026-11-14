import { DEFAULT_MATCHLINES } from "../model/matchlines";
import { planStyle } from "../model/planStyle";
import type { MatchLabel, PlanStyle } from "../model/types";
import { useEditor } from "../state/store";
import { askText } from "./Dialog";
import type { MenuItem } from "./ContextMenu";

/**
 * Plan view items that are not drawing objects but can be edited like text:
 * the matchline labels and the north arrow. Ids look like `panel|north` or `panel|chart-neighbour`.
 */
const SIZES = [1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
const PALETTE: [string, string][] = [
  ["Black", "#000000"],
  ["Dark grey", "#555555"],
  ["Red", "#e00000"],
  ["Green", "#16a34a"],
  ["Blue", "#1f3fd6"],
  ["Magenta", "#d6249f"],
];

const split = (id: string) => {
  const [panelId, key] = id.split("|");
  return { panelId, key };
};

function patchPlan(panelId: string, fn: (st: PlanStyle) => Partial<PlanStyle>) {
  const s = useEditor.getState();
  const p = s.template?.panels.find((x) => x.id === panelId);
  if (!p) return;
  s.updatePanel(panelId, { plan: { ...planStyle(p), ...fn(planStyle(p)) } });
}

/** Change one matchline label's own settings (text, place, size, colour, hidden). */
export function patchMatchLabel(id: string, patch: Partial<MatchLabel>) {
  const { panelId, key } = split(id);
  patchPlan(panelId, (st) => ({
    match: {
      ...st.match,
      labels: {
        ...st.match?.labels,
        [key]: { ...st.match?.labels?.[key], ...patch },
      },
    },
  }));
}

export function matchLabelOf(id: string): MatchLabel {
  const { panelId, key } = split(id);
  const p = useEditor.getState().template?.panels.find((x) => x.id === panelId);
  return (p && planStyle(p).match?.labels?.[key]) || {};
}

function pickColour(current: string, apply: (c: string) => void) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(current) ? current : "#000000";
  input.onchange = () => apply(input.value);
  input.click();
}

/** Ask for new text for a matchline label or the north arrow. */
export async function editPlanItemText(id: string) {
  const { panelId, key } = split(id);
  if (key === "north") {
    const p = useEditor.getState().template?.panels.find((x) => x.id === panelId);
    const v = await askText("North arrow text", (p && planStyle(p).northText) ?? "N");
    if (v !== null) patchPlan(panelId, () => ({ northText: v }));
    return;
  }
  const cur = matchLabelOf(id);
  const v = await askText("Matchline text", cur.text ?? "", "OK");
  if (v !== null) patchMatchLabel(id, { text: v.trim() ? v : undefined });
}

export function planItemMenu(id: string): MenuItem[] {
  const { panelId, key } = split(id);
  if (key === "north") {
    const p = useEditor.getState().template?.panels.find((x) => x.id === panelId);
    const st = p && planStyle(p);
    return [
      { label: "Edit text…", action: () => void editPlanItemText(id) },
      {
        label: "Size",
        submenu: [10, 14, 18, 22, 28, 36].map((n) => ({
          label: `${n} mm`,
          checked: st?.northSize === n,
          action: () => patchPlan(panelId, () => ({ northSize: n })),
        })),
      },
      {
        label: "Colour",
        submenu: [
          ...PALETTE.map(([label, c]): MenuItem => ({
            label,
            checked: st?.northColor === c,
            action: () => patchPlan(panelId, () => ({ northColor: c })),
          })),
          {
            label: "More colours…",
            action: () =>
              pickColour(st?.northColor ?? "#000000", (c) =>
                patchPlan(panelId, () => ({ northColor: c })),
              ),
          },
        ],
      },
      "separator",
      {
        label: "Delete north arrow",
        action: () => patchPlan(panelId, () => ({ showNorth: false })),
      },
    ];
  }
  const cur = matchLabelOf(id);
  const p = useEditor.getState().template?.panels.find((x) => x.id === panelId);
  const base = { ...DEFAULT_MATCHLINES, ...(p && planStyle(p).match) };
  const size = cur.size ?? base.textSize;
  const colour = cur.color ?? base.color;
  return [
    { label: "Edit text…", action: () => void editPlanItemText(id) },
    {
      label: "Reset text",
      disabled: cur.text === undefined,
      action: () => patchMatchLabel(id, { text: undefined }),
    },
    {
      label: "Size",
      submenu: SIZES.map((n) => ({
        label: `${n} mm`,
        checked: size === n,
        action: () => patchMatchLabel(id, { size: n }),
      })),
    },
    {
      label: "Colour",
      submenu: [
        ...PALETTE.map(([label, c]): MenuItem => ({
          label,
          checked: colour === c,
          action: () => patchMatchLabel(id, { color: c }),
        })),
        {
          label: "More colours…",
          action: () =>
            pickColour(colour, (c) => patchMatchLabel(id, { color: c })),
        },
      ],
    },
    {
      label: "Flip text 180°",
      checked: cur.flip ?? base.flip ?? false,
      action: () => patchMatchLabel(id, { flip: !(cur.flip ?? base.flip) }),
    },
    {
      label: "Reset position",
      disabled: !cur.dx && !cur.dy,
      action: () => patchMatchLabel(id, { dx: undefined, dy: undefined }),
    },
    "separator",
    {
      label: "Delete label",
      action: () => patchMatchLabel(id, { hidden: true }),
    },
  ];
}

/** Bring back every deleted matchline label of a plan view. */
export function restoreMatchLabels(panelId: string) {
  patchPlan(panelId, (st) => ({
    match: {
      ...st.match,
      labels: Object.fromEntries(
        Object.entries(st.match?.labels ?? {}).map(([k, v]) => [
          k,
          { ...v, hidden: false },
        ]),
      ),
    },
  }));
}
