import type { Dataset, ImportTarget } from "./datasets";

/** Everything the user set on an imported dataset (not its data): saved with the project folder and used again. */
export interface DatasetSettings {
  name: string;
  target: ImportTarget;
  kind: Dataset["kind"];
  /** Fields to put back on the dataset. */
  patch: Record<string, unknown>;
  /** Long profile series look, by series name. */
  series?: { name: string; color: string; width?: number }[];
}

const pick = (d: object, keys: string[]) =>
  Object.fromEntries(
    keys
      .filter((k) => (d as Record<string, unknown>)[k] !== undefined)
      .map((k) => [k, structuredClone((d as Record<string, unknown>)[k])]),
  );

const KEYS: Record<Dataset["kind"], string[]> = {
  route: ["color", "width"],
  linework: [
    "color",
    "width",
    "textMode",
    "textScale",
    "textHeight",
    "both",
    "drawingColours",
    "layers",
    "textFamily",
    "textBold",
    "textItalic",
    "textColor",
    "textRotation",
    "textUpright",
  ],
  long: ["fill", "opts"],
  trans: ["color", "pipeColor", "pipeFill", "every", "pipeRound"],
  events: ["font", "labels", "layout", "links"],
  cp: ["color", "symbol", "font", "look", "style"],
};

export function settingsOf(d: Dataset): DatasetSettings {
  return {
    name: d.name,
    target: d.target,
    kind: d.kind,
    patch: { visible: d.visible, ...pick(d, KEYS[d.kind]) },
    series:
      d.kind === "long"
        ? d.series.map((s) => ({
            name: s.name,
            color: s.color,
            width: s.width,
          }))
        : undefined,
  };
}

/** The changes that put saved settings back on a dataset. */
export function settingsPatch(
  d: Dataset,
  s: DatasetSettings,
): Partial<Dataset> {
  const patch: Record<string, unknown> = { ...s.patch };
  if (d.kind === "long" && s.series) {
    patch.series = d.series.map((x) => {
      const m = s.series!.find((y) => y.name === x.name);
      return m ? { ...x, color: m.color, width: m.width } : x;
    });
  }
  return patch as Partial<Dataset>;
}

/** Which saved settings go with each dataset: same file name first, then the first unused one of the same kind and target. */
export function matchSettings(
  datasets: Dataset[],
  saved: DatasetSettings[],
): Map<string, DatasetSettings> {
  const out = new Map<string, DatasetSettings>();
  const used = new Set<DatasetSettings>();
  for (const d of datasets) {
    const s = saved.find(
      (x) => !used.has(x) && x.name === d.name && x.kind === d.kind,
    );
    if (s) {
      out.set(d.id, s);
      used.add(s);
    }
  }
  for (const d of datasets) {
    if (out.has(d.id)) continue;
    const s = saved.find(
      (x) => !used.has(x) && x.kind === d.kind && x.target === d.target,
    );
    if (s) {
      out.set(d.id, s);
      used.add(s);
    }
  }
  return out;
}
