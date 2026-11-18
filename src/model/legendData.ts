import type { PointSet } from "./pointSets";
import { isBurialLink, linkLook } from "./events";
import type { Dataset } from "./datasets";
import type {
  CodeDefSpec,
  LegendGroup,
  LegendItem,
  LegendStyle,
} from "./types";
import type { EventRecord } from "./datasets";

export const DEFAULT_LEGEND_STYLE: LegendStyle = {
  family: "Arial",
  size: 1.45,
  color: "#555555",
  headSize: 1.9,
  headColor: "#555555",
  codeColor: "#000000",
  codeSize: 1.4,
};

/** A legend line built from a dataset; `key` stays the same across sessions for the same kind of data. */
export interface DataLegendItem extends LegendItem {
  key: string;
  /** The dataset whose colour this item shows (editing the colour edits the data). */
  datasetId?: string;
  /** Which colour of the dataset it shows. */
  colorOf?: "color" | "pipe" | `link:${number}` | `series:${number}`;
}

const SERIES_NAMES: Record<string, string> = {
  MEANADJ: "Mean Adjacent Seabed",
  MEANADJSEABED: "Mean Adjacent Seabed",
  MEANSEABED: "Mean Seabed",
  MEANADJACENTSEABED: "Mean Adjacent Seabed",
};
const plainName = (file: string) =>
  file.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");

/** Legend items for everything imported, in the colours it is drawn with. */
export function dataLegend(
  datasets: Dataset[],
  kpColor: string,
  /** Height of a row in the engineering events panel, mm: linked event symbols are drawn in the same proportions. */
  rowH = 8,
): DataLegendItem[] {
  const out: DataLegendItem[] = [];
  const add = (it: Omit<DataLegendItem, "id">) =>
    out.push({ ...it, id: `data:${it.key}` });
  const vis = datasets.filter((d) => d.visible);
  const route = vis.find((d) => d.kind === "route");
  if (route) {
    add({
      key: "kp",
      group: "plan",
      symbol: "kpMarker",
      label: "KP Marker - Grid",
      color: kpColor,
      symbolText: "1.000",
    });
    add({
      key: "route",
      group: "plan",
      symbol: "line",
      label: "Proposed Pipeline Route (Designed Route)",
      color: route.color,
      datasetId: route.id,
      colorOf: "color",
    });
  }
  for (const d of vis.filter((x) => x.target === "asbuilt"))
    add({
      key: `asbuilt:${d.name}`,
      group: "plan",
      symbol: "line",
      label: "As-Built Pipeline",
      color: d.color,
      datasetId: d.id,
      colorOf: "color",
    });
  for (const d of vis.filter((x) => x.target === "plan"))
    add({
      key: `plan:${d.name}`,
      group: "plan",
      symbol: "thinLine",
      label: plainName(d.name),
      color: d.color,
      datasetId: d.id,
      colorOf: "color",
    });
  for (const d of vis) {
    if (d.kind === "long") {
      const pipe =
        d.top !== undefined
          ? d.series[d.top]
          : d.bop !== undefined
            ? d.series[d.bop]
            : undefined;
      if (pipe)
        add({
          key: "long:pipe",
          group: "long",
          symbol: "pipeBand",
          label: "Top and Bottom of Product",
          color: pipe.color,
          fill: d.fill,
          datasetId: d.id,
          colorOf: "pipe",
        });
      d.series.forEach((s, i) => {
        if (i === d.top || i === d.bop) return;
        const k = s.name.toUpperCase().replace(/[^A-Z]/g, "");
        add({
          key: `long:${k}`,
          group: "long",
          symbol: "thinLine",
          label: SERIES_NAMES[k] ?? s.name,
          color: s.color,
          datasetId: d.id,
          colorOf: `series:${i}`,
        });
      });
    }
    if (d.kind === "trans")
      add({
        key: "trans",
        group: "trans",
        symbol: "seabedProfile",
        label:
          "Seabed Profile Aligned with Top of Product Marker Viewed in Ascending KP direction",
        color: d.color,
        fill: d.pipeFill,
        outline: d.pipeColor,
        datasetId: d.id,
        colorOf: "color",
      });
    if (d.kind === "cp")
      add({
        key: "cp",
        group: "cp",
        symbol: "cpStab",
        label: "Cathodic Protection Reading",
        color: d.color,
        cpSymbol: d.symbol,
        symbolText: "-1050mV",
        datasetId: d.id,
        colorOf: "color",
      });
    if (d.kind === "events")
      d.links.forEach((l, i) => {
        if (!l.start || !l.end) return;
        if (!out.some((x) => x.key === `link:${l.start}`))
          add({
            key: `link:${l.start}`,
            group: "status",
            symbol: isBurialLink(l) ? "burial" : "freespan",
            label: l.label,
            color: l.color,
            symbolText: "Length (m)",
            datasetId: d.id,
            colorOf: `link:${i}`,
            ...(() => {
              const k = linkLook(l);
              return {
                boldPos: k.boldPos,
                boldColor: k.boldColor,
                boldDash: k.dashed,
                lineColor: l.lineColor ?? d.font?.color,
                ...(() => {
                  // The symbol keeps the proportions the row gives it: bars and light bar as fractions of the end lines.
                  const lineH = Math.max(0.5, rowH * (l.lineExtent ?? 0.8));
                  const bh = l.barHeight ?? Math.min(rowH * 0.28, 2.2);
                  return {
                    hatchFrac:
                      l.hatchSize === undefined
                        ? undefined
                        : Math.min(1, Math.max(0, l.hatchSize / lineH)),
                    boldShift: l.boldOffset ? l.boldOffset / lineH : undefined,
                    boldFrac: Math.min(1, bh / lineH),
                  };
                })(),
              };
            })(),
          });
      });
  }
  return out;
}

/** The columns a definition can be written from: the file's own, then code, group, subgroup and value. */
export function definitionSources(
  datasets: Dataset[],
): { id: string; name: string; sample: string }[] {
  const evs = datasets.filter(
    (d): d is Extract<Dataset, { kind: "events" }> =>
      d.kind === "events" && d.visible,
  );
  const out: { id: string; name: string; sample: string }[] = [];
  const first = (f: (r: EventRecord) => string) => {
    for (const d of evs)
      for (const r of d.records) {
        const v = f(r);
        if (v) return v;
      }
    return "";
  };
  const width = Math.max(0, ...evs.map((d) => d.columns?.length ?? 0));
  const cols: { id: string; name: string; sample: string }[] = [];
  for (let i = 0; i < width; i++) {
    const name =
      evs.map((d) => d.columns?.[i]).find(Boolean) ?? `Column ${i + 1}`;
    cols.push({ id: `c:${i}`, name, sample: first((r) => r.cells?.[i] ?? "") });
  }
  // The listing's EventGroup and EventSubGroup columns come first, under their own names.
  const key = (n: string) => n.toLowerCase().replace(/[^a-z]/g, "");
  const named = (...names: string[]) =>
    cols.find((c) => names.includes(key(c.name)));
  const grp = named("eventgroup", "group");
  const sub = named("eventsubgroup", "subgroup");
  for (const c of [grp, sub])
    if (c) out.push({ ...c, name: `${c.name} (from the file)` });
  out.push(...cols.filter((c) => c !== grp && c !== sub));
  out.push(
    { id: "code", name: "Event code", sample: first((r) => r.code) },
    {
      id: "group",
      name: "Code group (before the dot)",
      sample: first((r) => partOf(r.code, "group")),
    },
    {
      id: "sub",
      name: "Code subgroup (after the dot)",
      sample: first((r) => partOf(r.code, "sub")),
    },
    {
      id: "value",
      name: "Value / description column",
      sample: first((r) => r.value),
    },
  );
  return out;
}

function partOf(code: string, which: "group" | "sub"): string {
  const i = code.indexOf(".");
  if (i < 0) return which === "group" ? code : "";
  return which === "group" ? code.slice(0, i) : code.slice(i + 1);
}

/** One event's definition written from the user's parts; empty parts are left out. */
export function writeDefinition(r: EventRecord, spec: CodeDefSpec): string {
  const bits = spec.parts
    .map((p) => {
      if (p.startsWith("c:")) return r.cells?.[Number(p.slice(2))] ?? "";
      if (p.startsWith("t:")) return p.slice(2);
      if (p === "code") return r.code;
      if (p === "group" || p === "sub") return partOf(r.code, p);
      return r.value;
    })
    .map((b) => b.trim())
    .filter(Boolean);
  if (!bits.length) return "";
  return `${spec.prefix}${bits.join(spec.connector)}${spec.suffix}`;
}

/** "CODE<Tab>Description" lines for the codes in the imported events (those within a KP range in metres, when given). */
export function dataEventCodes(
  datasets: Dataset[],
  range?: [number, number],
  shown?: (code: string) => boolean,
  spec?: CodeDefSpec,
): string {
  // The wording of a code comes from all the events, so a chart whose own readings of it are
  // long free text still shows the same definition as the properties panel; the range and the
  // row filter only pick which codes are listed.
  const desc = new Map<string, Map<string, number>>();
  const listed = new Set<string>();
  for (const d of datasets)
    if (d.kind === "events" && d.visible)
      for (const r of d.records) {
        const c = r.code.toUpperCase();
        if (!desc.has(c)) desc.set(c, new Map());
        const v = spec?.parts.length
          ? writeDefinition(r, spec)
          : r.value.trim();
        // Descriptions like "Pipeline Feature - Flange" define a code; free text (pipe specs, dates, 0) doesn't.
        if (
          v &&
          (spec?.parts.length || (v.length <= 48 && !/^-?[\d.]+$/.test(v)))
        )
          desc.get(c)!.set(v, (desc.get(c)!.get(v) ?? 0) + 1);
        if (range && (r.kp < range[0] || r.kp > range[1])) continue;
        if (shown && !shown(r.code)) continue;
        listed.add(c);
      }
  return [...desc.entries()]
    .filter(([c]) => listed.has(c))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, m]) => {
      const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      return `${c}\t${best}`;
    })
    .join("\n");
}

/** Definition lines with the user's wording and hidden codes applied. */
export function editCodeLines(
  text: string,
  edits: Record<string, string> = {},
  hidden: string[] = [],
): string {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const [c] = l.split("\t");
      const code = c.trim().toUpperCase();
      return {
        code,
        line: edits[code] !== undefined ? `${c}\t${edits[code]}` : l,
      };
    })
    .filter((x) => !hidden.includes(x.code))
    .map((x) => x.line)
    .join("\n");
}

export const groupsWithData = (items: DataLegendItem[]) =>
  new Set<LegendGroup>(items.map((i) => i.group));

/** One legend line per point set of the plan view, drawn with its symbol. */
export function pointSetLegend(plan: { pointSets?: PointSet[] } | undefined) {
  return (plan?.pointSets ?? []).map(
    (s): DataLegendItem => ({
      id: `data:pts:${s.id}`,
      key: `pts:${s.id}`,
      group: "plan",
      symbol: "marker",
      label: s.name,
      color: s.color,
      markerShape: s.shape,
      markerFill: s.fill,
      fill: s.fillColor,
      size: s.size,
      lineWidth: s.width,
    }),
  );
}
