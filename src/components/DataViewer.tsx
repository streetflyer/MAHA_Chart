import { create } from "zustand";
import { useEffect, useState } from "react";
import { runlineName, type Dataset } from "../model/datasets";
import { pointsOf } from "../model/cpEdit";
import { parseDelimited, readXlsx, type Table } from "../model/tables";
import { nearestChainage } from "../model/route";
import { sheetCount, sheetRange } from "../model/scale";
import { useSurvey } from "../state/surveyData";
import { useEditor } from "../state/store";
import { EventTableView } from "./EventTableView";

/** A data window: one tab per sheet of the file, and one per dataset made from it on the chart. */
interface Viewer {
  title: string;
  /** `events`: the id of an events data set, shown with filters and tick boxes. */
  tabs: (Table & { events?: string })[];
  note?: string;
}

const useViewer = create<{ v: Viewer | null }>(() => ({ v: null }));

const km = (m: number) => (m / 1000).toFixed(3);
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "");
const MAX_ROWS = 5000;
/** Excel's binary tails (92.26000000000001) shown as typed (92.26). */
const tidy = (c: string) =>
  /^-?\d+\.\d{9,}$/.test(c) ? String(+Number(c).toFixed(8)) : c;

/** The data of a dataset as rows, first row the header. */
export function datasetTable(d: Dataset): Table {
  const name = `On the chart: ${d.name}`;
  switch (d.kind) {
    case "events":
      return {
        name,
        rows: [
          ["KP (km)", "Code", "Value"],
          ...d.records.map((r) => [km(r.kp), r.code, r.value]),
        ],
      };
    case "long":
      return {
        name,
        rows: [
          ["KP (km)", ...d.series.map((s) => s.name)],
          ...Array.from(d.kp, (k, i) => [
            km(k),
            ...d.series.map((s) => f2(s.values[i])),
          ]),
        ],
      };
    case "cp":
      return {
        name,
        rows: [
          ["KP (km)", "mV", "Text"],
          ...pointsOf(d).map((p) => [km(p.kp), String(p.mv), p.text ?? ""]),
        ],
      };
    case "trans":
      return {
        name,
        rows: [
          ["KP (km)", "Diameter (m)", "Seabed points"],
          ...d.profiles.map((p) => [
            km(p.kp),
            String(p.diameter),
            String(p.pts.length / 2),
          ]),
        ],
      };
    case "route": {
      const r = d.route;
      return {
        name,
        rows: [
          ["Point", "Easting", "Northing", "Chainage (m)"],
          ...Array.from(r.chain, (c, i) => [
            String(i + 1),
            f2(r.en[2 * i]),
            f2(r.en[2 * i + 1]),
            f2(c),
          ]),
        ],
      };
    }
    case "linework": {
      const lw = d.lw;
      return {
        name,
        rows: [
          ["Item", "Layer", "Points / text", "First easting", "First northing"],
          ...lw.lines.map((l, i) => [
            `Line ${i + 1}`,
            lw.layers[i] ?? "",
            String(l.length / 2),
            f2(l[0]),
            f2(l[1]),
          ]),
          ...lw.texts.map((t, i) => [
            `Text ${i + 1}`,
            "",
            t.text,
            f2(t.x),
            f2(t.y),
          ]),
        ],
      };
    }
    default:
      return { name, rows: [["Kind"], [String((d as Dataset).kind)]] };
  }
}

/** Datasets on the chart that were read from a file. */
export function datasetsOf(name: string): Dataset[] {
  return useSurvey
    .getState()
    .datasets.filter((d) => d.name === name || d.name === runlineName(name));
}

/** Open the window with a file's contents and, when it is charted, its data as charted. */
export async function showData(file: File | null, name: string) {
  const tabs: Viewer["tabs"] = [];
  let note: string | undefined;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (file) {
    try {
      if (ext === "xlsx")
        tabs.push(...(await readXlsx(await file.arrayBuffer())));
      else if (["dwg", "dxf"].includes(ext))
        note = "A drawing: its lines and texts are listed as charted.";
      else if (["png", "jpg", "jpeg", "gif", "bmp", "svg"].includes(ext))
        note = "An image (a logo): there is no table to show.";
      else if (ext === "xls")
        note =
          "Old .xls files cannot be read in the browser: save it as .xlsx.";
      else {
        // Very large listings (cross profiles) are read only at their start.
        const text = await file.slice(0, 4 * 1024 * 1024).text();
        tabs.push(parseDelimited(text, name));
        if (file.size > 4 * 1024 * 1024)
          note = `Only the first 4 MB of ${(file.size / 1048576).toFixed(0)} MB are shown.`;
      }
    } catch (e) {
      note = `Couldn't read the file: ${(e as Error).message}`;
    }
  } else
    note = "The file isn't open: open the project folder again to read it.";
  for (const d of datasetsOf(name))
    tabs.push(
      d.kind === "events"
        ? { name: `On the chart: ${d.name}`, rows: [], events: d.id }
        : datasetTable(d),
    );
  // The charted listing (with its filters) comes first.
  tabs.sort((a, b) => Number(!!b.events) - Number(!!a.events));
  useViewer.setState({ v: { title: name, tabs, note } });
}

/**
 * Go to the chart where a file's data lies, make it visible and select its panel.
 * Returns what happened, for a notice.
 */
export function moveToData(name: string): string {
  const ds = datasetsOf(name);
  if (!ds.length)
    return `${name} is not on the chart: chart this folder or import the file first.`;
  const ed = useEditor.getState();
  const t = ed.template;
  if (!t) return "No chart is open.";
  const sv = useSurvey.getState();
  const k0 = (parseFloat(t.fields.START_KP ?? "0") || 0) * 1000;
  const d = ds[0];
  let kp: number | null = null;
  if (d.kind === "events") kp = d.records[0]?.kp ?? null;
  else if (d.kind === "long" || d.kind === "trans")
    kp = d.kp.length ? d.kp[0] : null;
  else if (d.kind === "cp") kp = pointsOf(d)[0]?.kp ?? null;
  else if (d.kind === "route") kp = k0;
  else if (d.kind === "linework" && sv.route) {
    const b = d.lw.bounds;
    kp =
      k0 +
      nearestChainage(sv.route, (b.minE + b.maxE) / 2, (b.minN + b.maxN) / 2);
  }
  for (const x of ds) if (!x.visible) sv.updateDataset(x.id, { visible: true });
  let sheet = ed.sheetIndex;
  if (kp !== null) {
    const n = sheetCount(t);
    for (let i = 0; i < n; i++) {
      const r = sheetRange(t, i);
      if (kp / 1000 >= r.start - 1e-9 && kp / 1000 <= r.end + 1e-9) {
        sheet = i;
        break;
      }
    }
    ed.setSheet(sheet);
  }
  const panelType =
    (
      {
        long: "longProfile",
        trans: "transProfile",
        events: "events",
        cp: "cp",
        siteplan: "keyplan",
        logo: "",
      } as Record<string, string>
    )[d.target] ?? "plan";
  const panel = t.panels.find((p) => p.type === panelType);
  if (panel) ed.select({ kind: "panel", id: panel.id });
  return `${name}: Chart ${sheet + 1}${kp !== null ? `, from KP ${km(kp)}` : ""}${panel ? `, ${panel.title || panel.type} selected` : ""}.`;
}

export function DataViewerHost() {
  const v = useViewer((s) => s.v);
  const datasets = useSurvey((s) => s.datasets);
  const [tab, setTab] = useState(0);
  useEffect(() => setTab(0), [v]);
  if (!v) return null;
  const close = () => useViewer.setState({ v: null });
  const tb = v.tabs[Math.min(tab, v.tabs.length - 1)];
  const rows = tb?.rows ?? [];
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <div className="dialog data-viewer" role="dialog" aria-label={v.title}>
        <h3>{v.title}</h3>
        {v.note && <p className="hint">{v.note}</p>}
        {v.tabs.length > 1 && (
          <div className="dv-tabs">
            {v.tabs.map((t, i) => (
              <button
                type="button"
                key={i}
                className={i === tab ? "active" : ""}
                onClick={() => setTab(i)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        {tb?.events ? (
          (() => {
            const d = datasets.find((x) => x.id === tb.events);
            return d?.kind === "events" ? (
              <EventTableView d={d} onAdded={close} />
            ) : (
              <p>This data is no longer on the chart.</p>
            );
          })()
        ) : tb ? (
          <>
            <div className="dv-table">
              <table>
                <tbody>
                  {rows.slice(0, MAX_ROWS).map((r, i) => (
                    <tr key={i} className={i === 0 ? "head" : ""}>
                      <td className="dv-n">{i === 0 ? "" : i}</td>
                      {r.map((c, j) => (
                        <td key={j}>{tidy(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              {Math.max(0, rows.length - 1)} rows
              {rows.length > MAX_ROWS ? `, first ${MAX_ROWS} shown` : ""}.
            </p>
          </>
        ) : (
          !v.note && <p>No data.</p>
        )}
        <div className="dialog-actions">
          <button type="button" className="primary" autoFocus onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
