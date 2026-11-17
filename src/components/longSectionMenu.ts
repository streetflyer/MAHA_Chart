import { DEFAULT_LONG_OPTS } from "../model/datasets";
import { useSurvey } from "../state/surveyData";
import type { MenuItem } from "./ContextMenu";

type Side = "left" | "right" | "both";

/** Right-click menu of one cut section of a longitudinal profile: where its depth values are written. `key` is `datasetId|sectionNumber`. */
export function longSectionMenu(key: string): MenuItem[] {
  const [id, nStr] = key.split("|");
  const d = useSurvey
    .getState()
    .datasets.find((x) => x.id === id && x.kind === "long");
  if (!d || d.kind !== "long") return [];
  const o = { ...DEFAULT_LONG_OPTS, ...d.opts };
  const now: Side = o.sectionSides?.[nStr] ?? o.axisSide;
  const set = (side: Side | null) => {
    const sides = { ...o.sectionSides };
    if (side) sides[nStr] = side;
    else delete sides[nStr];
    useSurvey
      .getState()
      .updateDataset(id, { opts: { ...o, sectionSides: sides } });
  };
  const item = (label: string, side: Side): MenuItem => ({
    label,
    checked: now === side,
    action: () => set(side),
  });
  return [
    { label: `Section ${Number(nStr) + 1}: depth values`, disabled: true },
    item("On the left", "left"),
    item("On the right", "right"),
    item("On both sides", "both"),
    "separator",
    {
      label: "Same as the whole profile",
      disabled: !o.sectionSides?.[nStr],
      action: () => set(null),
    },
  ];
}
