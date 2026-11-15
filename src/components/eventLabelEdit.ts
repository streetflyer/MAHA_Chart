import type { EventLabelEdit } from "../model/datasets";
import { useSurvey } from "../state/surveyData";
import { askText } from "./Dialog";
import { useEventEdit } from "../state/eventEdit";
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

/** Remember the codes of an events dataset as they are now, so the next change can be undone. */
export function snapshotEventLabels(id: string) {
  const { datasetId } = split(id);
  const d = dataset(datasetId);
  if (!d) return;
  useEventEdit.setState((s) => ({
    history: [...s.history.slice(-99), { datasetId, edits: d.labelEdits }],
  }));
}

export function undoEventLabels(): boolean {
  const h = useEventEdit.getState().history;
  const last = h[h.length - 1];
  if (!last) return false;
  useEventEdit.setState({ history: h.slice(0, -1) });
  useSurvey
    .getState()
    .updateDataset(last.datasetId, { labelEdits: last.edits });
  return true;
}

/** Put every code of the dataset back to its automatic place (text and size stay). */
export function resetEventPositions(datasetId: string) {
  const d = dataset(datasetId);
  if (!d?.labelEdits) return;
  snapshotEventLabels(`${datasetId}|x`);
  const next: Record<string, EventLabelEdit> = {};
  for (const [k, v] of Object.entries(d.labelEdits)) {
    const { dx: _dx, dy: _dy, ...rest } = v;
    if (Object.keys(rest).length) next[k] = rest;
  }
  useSurvey.getState().updateDataset(datasetId, { labelEdits: next });
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
        if (v !== null) {
          snapshotEventLabels(id);
          patchEventLabel(id, { text: v === code ? undefined : v });
        }
      },
    },
    {
      label: "Size",
      submenu: SIZES.map((n) => ({
        label: `${n} mm`,
        checked: cur.size === n,
        action: () => {
          snapshotEventLabels(id);
          patchEventLabel(id, { size: n });
        },
      })),
    },
    {
      label: "Automatic size",
      disabled: cur.size === undefined,
      action: () => {
        snapshotEventLabels(id);
        patchEventLabel(id, { size: undefined });
      },
    },
    {
      label: "Reset position and text",
      disabled: !cur.dx && !cur.dy && cur.text === undefined,
      action: () => {
        snapshotEventLabels(id);
        patchEventLabel(id, { dx: undefined, dy: undefined, text: undefined });
      },
    },
    "separator",
    {
      label: "Hide this code",
      action: () => {
        snapshotEventLabels(id);
        patchEventLabel(id, { text: "" });
      },
    },
  ];
}
