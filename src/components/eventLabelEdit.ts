import type { EventLabelEdit } from "../model/datasets";
import { useSurvey } from "../state/surveyData";
import { askText } from "./Dialog";
import type { MenuItem } from "./ContextMenu";

/** Ids look like `datasetId|CODE@kp`. */
const split = (id: string) => {
  const i = id.indexOf("|");
  return { datasetId: id.slice(0, i), key: id.slice(i + 1) };
};

const dataset = (datasetId: string) => {
  const d = useSurvey.getState().datasets.find((x) => x.id === datasetId);
  return d?.kind === "events" ? d : undefined;
};

export function eventLabelOf(id: string): EventLabelEdit {
  const { datasetId, key } = split(id);
  return dataset(datasetId)?.labelEdits?.[key] ?? {};
}

export function patchEventLabel(id: string, patch: Partial<EventLabelEdit>) {
  const { datasetId, key } = split(id);
  const d = dataset(datasetId);
  if (!d) return;
  useSurvey.getState().updateDataset(datasetId, {
    labelEdits: {
      ...d.labelEdits,
      [key]: { ...d.labelEdits?.[key], ...patch },
    },
  });
}

const SIZES = [1, 1.2, 1.5, 1.8, 2.2, 2.6, 3];

export function eventLabelMenu(id: string): MenuItem[] {
  const cur = eventLabelOf(id);
  const code = split(id).key.split("@")[0];
  return [
    {
      label: "Rename…",
      action: async () => {
        const v = await askText("Event code text", cur.text ?? code, "OK");
        if (v !== null)
          patchEventLabel(id, { text: v === code ? undefined : v });
      },
    },
    {
      label: "Size",
      submenu: SIZES.map((n) => ({
        label: `${n} mm`,
        checked: cur.size === n,
        action: () => patchEventLabel(id, { size: n }),
      })),
    },
    {
      label: "Automatic size",
      disabled: cur.size === undefined,
      action: () => patchEventLabel(id, { size: undefined }),
    },
    {
      label: "Reset position and text",
      disabled: !cur.dx && !cur.dy && cur.text === undefined,
      action: () =>
        patchEventLabel(id, { dx: undefined, dy: undefined, text: undefined }),
    },
    "separator",
    {
      label: "Hide this code",
      action: () => patchEventLabel(id, { text: "" }),
    },
  ];
}
