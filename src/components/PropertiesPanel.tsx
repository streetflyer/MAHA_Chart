import { KpMatchControl } from "./KpMatchControl";
import { drawingNoOf } from "../model/tokens";
import { pointsOf, pointsPatch } from "../model/cpEdit";
import type { CpPoint } from "../model/datasets";
import { DEFAULT_MATCHLINES } from "../model/matchlines";
import {
  SCALE_BAR_STYLES,
  scaleBarStyleOf,
  type Callout,
  type CalloutRow,
  type MatchlineStyle,
  type ScaleBarStyle,
} from "../model/types";
import { ColourBox } from "./ColourBox";
import { useEffect, useRef, useState } from "react";
import { newId } from "../model/ids";
import { PAPER_SIZES } from "../model/paper";
import { formatScale, planPanel, sheetCount } from "../model/scale";
import type {
  ChartTemplate,
  EventRow,
  Panel,
  PaperSizeName,
  TextItem,
} from "../model/types";
import {
  LEGEND_GROUPS,
  LEGEND_PRESETS,
  LEGEND_SYMBOLS,
} from "../model/presets";
import type {
  ImageItem,
  KeyplanStyle,
  PlanStyle,
  LegendGroup,
  LegendItem,
  LegendSymbol,
  TextStyle,
} from "../model/types";
import { PANEL_DEFAULTS } from "../state/panelDefaults";
import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";
import {
  DEFAULT_FONT,
  TARGETS,
  targetInfo,
  type DataFont,
  type Dataset,
} from "../model/datasets";
import {
  codeMatcher,
  defaultRowCodes,
  isKpRow,
  isVideoRow,
  rowCodes,
} from "../model/events";
import { canWriteBack, smoothedFile } from "../model/writeBack";
import { useSmoothTool } from "../state/smoothTool";
import { downloadBlob } from "../state/workspace";
import { useVideo } from "../state/video";
import { autoVideoText, productKeys } from "../model/video";
import { canWrite, subHandle, useProject } from "../state/project";
import { useImport } from "./ImportDialog";
import { askCodes } from "./Dialog";
import {
  DraftNumber,
  FontControls,
  LinksEditor,
  StyleControls,
  applyStyle,
  styleOf,
} from "./DataStyleControls";
import {
  DEFAULT_LEGEND_STYLE,
  dataLegend,
  type DataLegendItem,
  dataEventCodes,
} from "../model/legendData";
import { useLegendItems } from "./PanelContent";
import { keyplanStyle } from "./Keyplan";
import { datasetRemoved } from "../state/chartData";
import { withMatchPair } from "./matchPicking";
import { useMatchPick } from "../state/matchPick";
import { enterMode, exitMode } from "../state/mode";
import { planStyle } from "./PlanView";
import { DrawingEditPanel, DrawingLook } from "./DrawingProps";
import { BarShape } from "./scaleBars";
import {
  addCallout,
  newRow,
  patchCallout,
  patchRows,
  useCalloutFocus,
  withCallouts,
} from "./calloutEdit";
import { rowsOf } from "../model/callout";

/** Text/number box that commits on Enter or blur, so typing doesn't create one undo step per key. */
function Field({
  label,
  value,
  onCommit,
  type = "text",
  step,
  suffix,
  multiline,
}: {
  label: string;
  value: string | number;
  onCommit(v: string): void;
  type?: "text" | "number";
  step?: number;
  suffix?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft !== String(value)) onCommit(draft);
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          rows={5}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <span className="input-wrap">
          <input
            type={type}
            step={step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setDraft(String(value));
            }}
          />
          {suffix && <em>{suffix}</em>}
        </span>
      )}
    </label>
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (s: string) => parseFloat(s.replace(",", "."));

export function PropertiesPanel() {
  const template = useEditor((s) => s.template)!;
  const selection = useEditor((s) => s.selection);
  if (selection.length > 1) {
    return (
      <aside className="props">
        <h3>{selection.length} items selected</h3>
        <p className="muted">
          Drag to move them together. Delete, copy or duplicate from the
          right-click menu.
        </p>
      </aside>
    );
  }
  const sel = selection[0];
  if (sel?.kind === "panel") {
    const p = template.panels.find((x) => x.id === sel.id);
    if (p) return <PanelProps p={p} />;
  }
  if (sel?.kind === "text") {
    const t = template.texts.find((x) => x.id === sel.id);
    if (t) return <TextProps t={t} />;
  }
  if (sel?.kind === "image") {
    const im = (template.images ?? []).find((x) => x.id === sel.id);
    if (im) return <ImageProps im={im} />;
  }
  return <TemplateProps t={template} />;
}

function TemplateProps({ t }: { t: ChartTemplate }) {
  const s = useEditor.getState();
  const [newKey, setNewKey] = useState("");
  return (
    <aside className="props">
      <h3>Template</h3>
      <Field
        label="Name"
        value={t.name}
        onCommit={(v) => s.renameTemplate(v)}
      />
      <DataList />
      <label className="field">
        <span>Chart type</span>
        <select
          value={t.kind}
          onChange={(e) =>
            s.commit((tt) => ({
              ...tt,
              kind: e.target.value as ChartTemplate["kind"],
            }))
          }
        >
          <option value="alignment">Alignment sheet</option>
          <option value="northUp">North-Up</option>
        </select>
      </label>

      <label className="field">
        <span>Font for all sheet text</span>
        <select
          value={t.fontFamily ?? "Arial"}
          onChange={(e) =>
            s.commit((tt) => ({ ...tt, fontFamily: e.target.value }))
          }
        >
          {FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>

      <h4>Paper</h4>
      <div className="row2">
        <label className="field">
          <span>Size</span>
          <select
            value={t.paper.size}
            onChange={(e) =>
              s.setPaper(e.target.value as PaperSizeName, t.paper.orientation, [
                t.paper.width,
                t.paper.height,
              ])
            }
          >
            {Object.keys(PAPER_SIZES).map((k) => (
              <option key={k}>{k}</option>
            ))}
            <option value="Custom">Custom</option>
          </select>
        </label>
        <label className="field">
          <span>Orientation</span>
          <select
            value={t.paper.orientation}
            onChange={(e) =>
              s.setPaper(
                t.paper.size,
                e.target.value as "landscape" | "portrait",
                [t.paper.width, t.paper.height],
              )
            }
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
      </div>
      {t.paper.size === "Custom" && (
        <div className="row2">
          <Field
            label="Width"
            type="number"
            suffix="mm"
            value={r2(t.paper.width)}
            onCommit={(v) =>
              num(v) > 0 &&
              s.setPaper("Custom", t.paper.orientation, [
                num(v),
                t.paper.height,
              ])
            }
          />
          <Field
            label="Height"
            type="number"
            suffix="mm"
            value={r2(t.paper.height)}
            onCommit={(v) =>
              num(v) > 0 &&
              s.setPaper("Custom", t.paper.orientation, [t.paper.width, num(v)])
            }
          />
        </div>
      )}
      <Field
        label="Frame inset"
        type="number"
        suffix="mm"
        value={r2(t.paper.frameInset)}
        onCommit={(v) =>
          num(v) >= 0 &&
          s.commit((tt) => ({
            ...tt,
            paper: { ...tt.paper, frameInset: num(v) },
          }))
        }
      />

      <ScaleFields t={t} />

      <h4>Fields</h4>
      <p className="muted">
        Use these in any text as {"{KEY}"}. KP_START, KP_END and the scales fill
        in automatically.
      </p>
      {Object.entries(t.fields).map(([k, v]) => (
        <div className="field-row" key={k}>
          <Field
            label={k}
            value={v}
            multiline={v.includes("\n") || v.length > 60}
            onCommit={(nv) => s.setField(k, nv)}
          />
          <button
            className="icon"
            title={`Remove ${k}`}
            onClick={() =>
              s.commit((tt) => {
                const fields = { ...tt.fields };
                delete fields[k];
                return { ...tt, fields };
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      <div className="add-field">
        <input
          placeholder="NEW_FIELD"
          value={newKey}
          onChange={(e) =>
            setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))
          }
        />
        <button
          disabled={!newKey || newKey in t.fields}
          onClick={() => {
            s.setField(newKey, "");
            setNewKey("");
          }}
        >
          Add field
        </button>
      </div>
    </aside>
  );
}

export function ScaleFields({ t }: { t: ChartTemplate }) {
  const s = useEditor.getState();
  return (
    <>
      <h4>Scale</h4>
      <div className="row2">
        <Field
          label="Horizontal 1:"
          type="number"
          value={t.scale.horizontal}
          onCommit={(v) => s.setHorizontalScale(num(v))}
        />
        <Field
          label="KP per sheet"
          type="number"
          step={0.001}
          suffix="km"
          value={(t.scale.kpPerSheet / 1000).toFixed(3)}
          onCommit={(v) => s.setKpPerSheet(num(v) * 1000)}
        />
      </div>
      <p className="muted">
        The plan view keeps its size on paper; the scale sets how much route
        fits in it.
      </p>
      <div className="row2">
        <Field
          label="Route length"
          type="number"
          step={0.001}
          suffix="km"
          value={(t.scale.routeLength / 1000).toFixed(3)}
          onCommit={(v) =>
            num(v) > 0 && s.setScale({ routeLength: num(v) * 1000 })
          }
        />
        <label className="field">
          <span>Charts needed</span>
          <span className="readout">{sheetCount(t)}</span>
        </label>
      </div>
      <div className="row2">
        <Field
          label="Long. vertical 1:"
          type="number"
          value={t.scale.verticalLong}
          onCommit={(v) => num(v) > 0 && s.setScale({ verticalLong: num(v) })}
        />
        <Field
          label="Trans. vertical 1:"
          type="number"
          value={t.scale.verticalTrans}
          onCommit={(v) => num(v) > 0 && s.setScale({ verticalTrans: num(v) })}
        />
      </div>
      <div className="row2">
        <Field
          label="Trans. lateral 1:"
          type="number"
          value={t.scale.lateralTrans}
          onCommit={(v) => num(v) > 0 && s.setScale({ lateralTrans: num(v) })}
        />
        <Field
          label="Sheet overlap"
          type="number"
          suffix="m"
          value={t.scale.overlap}
          onCommit={(v) => num(v) >= 0 && s.setScale({ overlap: num(v) })}
        />
      </div>
      <Field
        label="Start KP"
        type="number"
        step={0.001}
        suffix="km"
        value={t.fields.START_KP ?? "0.000"}
        onCommit={(v) => s.setField("START_KP", (num(v) || 0).toFixed(3))}
      />
    </>
  );
}

function PanelProps({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const template = useEditor((st) => st.template)!;
  const set = (patch: Partial<Panel>) => s.updatePanel(p.id, patch);
  const parent = p.parentId
    ? template.panels.find((x) => x.id === p.parentId)
    : undefined;
  // A click on the sheet shows the top of the settings; a click on a text box scrolls to its own section instead.
  const selection = useEditor((st) => st.selection);
  const top = useRef<HTMLElement>(null);
  useEffect(() => {
    const toTop = () => {
      if (Date.now() - useCalloutFocus.getState().n < 1500) return;
      top.current?.closest(".props-wrap")?.scrollTo({ top: 0 });
    };
    toTop();
    // A click on the sheet that keeps this panel selected also goes back to the top.
    const up = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("svg.sheet"))
        setTimeout(toTop, 60);
    };
    document.addEventListener("pointerup", up);
    return () => document.removeEventListener("pointerup", up);
  }, [selection]);
  return (
    <aside className="props" ref={top}>
      <h3>{PANEL_DEFAULTS[p.type].label}</h3>
      {p.type === "plan" && <DrawingEditPanel panelId={p.id} when="active" />}
      {parent && <p className="muted">Section of {parent.title}</p>}
      <Field
        label="Title"
        value={p.title}
        onCommit={(v) => set({ title: v })}
      />
      <label className="field">
        <span>Title position</span>
        <select
          value={p.titlePosition}
          onChange={(e) =>
            set({ titlePosition: e.target.value as Panel["titlePosition"] })
          }
        >
          <option value="above">Above the panel</option>
          <option value="inside">Inside, top-left</option>
          <option value="none">Hidden</option>
        </select>
      </label>
      <div className="row2">
        <Field
          label="X"
          type="number"
          suffix="mm"
          value={r2(p.x)}
          onCommit={(v) => set({ x: num(v) })}
        />
        <Field
          label="Y"
          type="number"
          suffix="mm"
          value={r2(p.y)}
          onCommit={(v) => set({ y: num(v) })}
        />
      </div>
      <div className="row2">
        <Field
          label="Width"
          type="number"
          suffix="mm"
          value={r2(p.w)}
          onCommit={(v) => num(v) >= 5 && set({ w: num(v) })}
        />
        <Field
          label="Height"
          type="number"
          suffix="mm"
          value={r2(p.h)}
          onCommit={(v) => num(v) >= 5 && set({ h: num(v) })}
        />
      </div>
      {p.type === "plan" && <ScaleFields t={template} />}
      {(p.type === "plan" ||
        p.type === "longProfile" ||
        p.type === "events") && <KpMatchControl />}
      {p.type !== "plan" &&
        ["longProfile", "transProfile", "events", "cp"].includes(p.type) && (
          <label className="check">
            <input
              type="checkbox"
              checked={!!p.kpAligned}
              onChange={(e) => set({ kpAligned: e.target.checked })}
            />{" "}
            Align with plan view KP range
          </label>
        )}
      {["longProfile", "transProfile", "cp"].includes(p.type) && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={p.kpLines !== false}
              onChange={(e) => set({ kpLines: e.target.checked })}
            />{" "}
            Show the KP lines
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.kpLabels !== false}
              onChange={(e) => set({ kpLabels: e.target.checked })}
            />{" "}
            Show the KP values
          </label>
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={!!p.locked}
          onChange={(e) => set({ locked: e.target.checked })}
        />{" "}
        Locked
      </label>
      <label className="field">
        <span>Fill colour</span>
        <span className="input-wrap">
          <ColourBox
            value={p.fill ?? "#ffffff"}
            onChange={(c) => set({ fill: c })}
          />
          {p.fill && (
            <button className="link" onClick={() => set({ fill: undefined })}>
              Clear
            </button>
          )}
        </span>
      </label>
      {p.body !== undefined && (
        <BodyEditor
          label={p.body2 !== undefined ? "Left column" : "Text"}
          value={p.body}
          type={p.type}
          onCommit={(v) => set({ body: v })}
        />
      )}
      {p.body2 !== undefined && (
        <BodyEditor
          label="Right column"
          value={p.body2}
          type={p.type}
          onCommit={(v) => set({ body2: v })}
        />
      )}
      {p.body !== undefined && p.body2 === undefined && p.type !== "text" && (
        <button onClick={() => set({ body2: "" })}>
          Add a second text column
        </button>
      )}
      {p.body !== undefined && (
        <p className="muted">
          Use a Tab between a label and its value to line values up, e.g.
          "Ellipsoid⇥: WGS84".
        </p>
      )}
      {p.body !== undefined && <FontEditor p={p} />}
      {[
        "chartInfo",
        "notes",
        "equipment",
        "geodetic",
        "scale",
        "titleBlock",
        "text",
        "keyplan",
      ].includes(p.type) && (
        <FontPick
          value={p.fontFamily}
          sheetFont={template.fontFamily}
          note={
            p.type === "chartInfo"
              ? "Also applies to every section inside."
              : undefined
          }
          onChange={(f) => {
            if (p.type === "chartInfo")
              s.commit((t) => ({
                ...t,
                panels: t.panels.map((x) =>
                  x.id === p.id || x.parentId === p.id
                    ? { ...x, fontFamily: f }
                    : x,
                ),
                texts: t.texts.map((x) =>
                  x.panelId === p.id ||
                  t.panels.some(
                    (q) => q.id === x.panelId && q.parentId === p.id,
                  )
                    ? { ...x, fontFamily: f }
                    : x,
                ),
              }));
            else set({ fontFamily: f });
          }}
        />
      )}
      {p.type === "scale" && (
        <ScaleBarPicker
          value={scaleBarStyleOf(p.scaleBarStyle)}
          onChange={(v) => set({ scaleBarStyle: v })}
        />
      )}
      {p.type === "legend" && <LegendEditor p={p} />}
      {p.type === "plan" && <DrawingEditPanel panelId={p.id} when="idle" />}
      <DataList panelType={p.type} />
      {p.type === "keyplan" && <KeyplanEditor p={p} />}
      {p.type === "plan" && <CalloutEditor p={p} />}
      {p.type === "plan" && <PlanStyleEditor p={p} />}
      {p.type === "titleBlock" && (
        <p className="muted">
          Double-click any cell on the sheet to edit it. The description column
          offers the review statuses or your own text.
        </p>
      )}
      {p.rows && <RowsEditor p={p} />}
    </aside>
  );
}

type UserTime = NonNullable<EventRow["userTimes"]>[number];

/** User defined timing lines of a video row: start / end KP (km) and the text on each. */
function UserTimes({
  list,
  onChange,
}: {
  list: UserTime[];
  onChange(l: UserTime[]): void;
}) {
  const set = (id: string, c: Partial<UserTime>) =>
    onChange(list.map((x) => (x.id === id ? { ...x, ...c } : x)));
  const km = (m: number) => Math.round(m) / 1000;
  return (
    <div className="user-times">
      {list.map((u, i) => (
        <div key={u.id} className="user-time">
          <label className="field">
            <span>Start KP</span>
            <DraftNumber
              step={0.1}
              value={km(u.k0)}
              onCommit={(v) => set(u.id, { k0: v * 1000 })}
            />
          </label>
          <label className="field">
            <span>End KP</span>
            <DraftNumber
              step={0.1}
              value={km(u.k1)}
              onCommit={(v) => set(u.id, { k1: v * 1000 })}
            />
          </label>
          <button
            type="button"
            className="icon"
            title="Delete this line"
            onClick={() => onChange(list.filter((x) => x.id !== u.id))}
          >
            ×
          </button>
          <input
            key={`${u.id}:${u.text}`}
            placeholder={`Text for line ${i + 1}, e.g. 12/06/2025 01:19 AM to 01:32 AM`}
            defaultValue={u.text}
            onBlur={(e) =>
              e.target.value !== u.text && set(u.id, { text: e.target.value })
            }
            onKeyDown={(e) =>
              e.key === "Enter" && (e.target as HTMLInputElement).blur()
            }
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const k0 = list.length ? list[list.length - 1].k1 : 0;
          onChange([...list, { id: newId("ut"), k0, k1: k0 + 500, text: "" }]);
        }}
      >
        + Add line
      </button>
    </div>
  );
}

/** Font, size, colour and style of a row's title and of its text along the row: for every row (default) or just this one. */
function RowTextLook({ p, r }: { p: Panel; r: EventRow }) {
  const [scope, setScope] = useState<"all" | "row">(
    r.font || r.titleFont ? "row" : "all",
  );
  const datasets = useSurvey((x) => x.datasets);
  const ev = datasets.find((d) => d.kind === "events" && d.visible);
  const base = ev?.kind === "events" ? ev.font : DEFAULT_FONT;
  const title: DataFont = {
    family: p.fontFamily ?? "Arial",
    size: 1.8,
    color: "#111111",
    ...p.rowTitleFont,
    ...r.titleFont,
  };
  const text: DataFont = { ...base, ...p.rowFont, ...r.font };
  const ed = useEditor.getState();
  const set = (which: "titleFont" | "font", f: DataFont) => {
    const rows = p.rows ?? [];
    if (scope === "row")
      return ed.updatePanel(p.id, {
        rows: rows.map((x) => (x.id === r.id ? { ...x, [which]: f } : x)),
      });
    // Same for all rows: the panel takes it and the rows' own settings go.
    ed.updatePanel(p.id, {
      [which === "font" ? "rowFont" : "rowTitleFont"]: f,
      rows: rows.map((x) => ({ ...x, [which]: undefined })),
    });
  };
  return (
    <details className="row-text">
      <summary>Text look</summary>
      <label className="field">
        <span>Apply</span>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "all" | "row")}
        >
          <option value="all">Make the same for all rows</option>
          <option value="row">Only for this row</option>
        </select>
      </label>
      <h5>Row title</h5>
      <FontControls font={title} onChange={(f) => set("titleFont", f)} />
      <h5>Text along the row (codes, values, video)</h5>
      <FontControls font={text} onChange={(f) => set("font", f)} />
    </details>
  );
}

/** "Label⇥: value" lines as pairs; null when the text is not such a list. */
export function pairsOf(body: string): [string, string][] | null {
  const lines = body.split("\n").filter((l) => l.trim());
  if (!lines.length || !lines.every((l) => l.includes("\t"))) return null;
  return lines.map((l) => {
    const [a, ...rest] = l.split("\t");
    return [a, rest.join(" ").replace(/^\s*:\s?/, "")];
  });
}
export const pairsText = (rows: [string, string][]) =>
  rows.map(([a, b]) => `${a}\t: ${b}`).join("\n");

/** A panel's text: a list of items (label and value, with add / remove) when it is one, else plain text. */
function BodyEditor({
  label,
  value,
  type,
  onCommit,
}: {
  label: string;
  value: string;
  type: Panel["type"];
  onCommit(v: string): void;
}) {
  const [plain, setPlain] = useState(false);
  const rows = pairsOf(value);
  if (!rows || plain)
    return (
      <>
        <Field label={label} multiline value={value} onCommit={onCommit} />
        {rows && (
          <button
            type="button"
            className="link"
            onClick={() => setPlain(false)}
          >
            Edit as a list of items
          </button>
        )}
      </>
    );
  const [left, right] =
    type === "equipment" ? ["System type", "System name"] : ["Item", "Value"];
  const put = (next: [string, string][]) => onCommit(pairsText(next));
  return (
    <div className="pair-list">
      <div className="pair-head">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      {rows.map(([a, b], i) => (
        <div key={`${i}:${a}:${b}`} className="pair-row">
          {[a, b].map((v, k) => (
            <input
              key={k}
              defaultValue={v}
              title={k ? right : left}
              onBlur={(e) => {
                if (e.target.value === v) return;
                const next = rows.map((r) => [...r] as [string, string]);
                next[i][k] = e.target.value;
                put(next);
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
            />
          ))}
          <button
            type="button"
            className="icon"
            title="Move up"
            disabled={i === 0}
            onClick={() => put(swap(rows, i, i - 1))}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon"
            title="Remove this item"
            onClick={() => put(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="pair-actions">
        <button type="button" onClick={() => put([...rows, ["New item", ""]])}>
          + Add item
        </button>
        <button type="button" className="link" onClick={() => setPlain(true)}>
          Edit as plain text
        </button>
      </div>
    </div>
  );
}

function RowsEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const rows = p.rows ?? [];
  const setRows = (next: Panel["rows"]) => s.updatePanel(p.id, { rows: next });
  const patch = (id: string, change: Partial<EventRow>) =>
    setRows(rows.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const datasets = useSurvey((x) => x.datasets);
  const videoRows = useVideo((x) => x.rows);
  const sheetIndex = useEditor((x) => x.sheetIndex);
  const rowH = p.h / Math.max(1, rows.length);
  const legendCodes = useEditor(
    (x) => x.template?.panels.find((q) => q.type === "legend")?.eventCodes,
  );
  /** Open the list of codes in the imported events that this row does not take yet. */
  const addCodes = async (r: EventRow) => {
    const notes = new Map(
      (legendCodes ?? "")
        .split("\n")
        .map((l) => l.split("\t"))
        .filter((a) => a[0])
        .map((a) => [a[0].trim().toUpperCase(), (a[1] ?? "").trim()] as const),
    );
    const count = new Map<string, number>();
    for (const d of datasets)
      if (d.kind === "events")
        for (const e of d.records)
          count.set(
            e.code.toUpperCase(),
            (count.get(e.code.toUpperCase()) ?? 0) + 1,
          );
    const has = codeMatcher(rowCodes(r));
    const items = [...count.keys()]
      .filter((c) => !has(c))
      .sort()
      .map((c) => ({
        code: c,
        note: `${notes.get(c) ?? ""}${notes.get(c) ? " · " : ""}${count.get(c)} in the data`,
      }));
    const got = await askCodes(
      "Add events codes",
      `Codes found in the imported events that "${r.label}" does not show yet.`,
      items,
    );
    if (got?.length)
      patch(r.id, { codes: [rowCodes(r), ...got].filter(Boolean).join(", ") });
  };
  return (
    <>
      <h4>Rows</h4>
      <Field
        label="Label column width"
        type="number"
        suffix="mm"
        value={r2(p.labelWidth ?? 30)}
        onCommit={(v) =>
          num(v) > 0 && s.updatePanel(p.id, { labelWidth: num(v) })
        }
      />
      <ol className="rows">
        {rows.map((r, i) => (
          <li key={r.id} className="row-card">
            <input
              defaultValue={r.label}
              onBlur={(e) =>
                e.target.value !== r.label &&
                setRows(
                  rows.map((x) =>
                    x.id === r.id ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
            />
            <button
              className="icon"
              title="Move up"
              disabled={i === 0}
              onClick={() => setRows(swap(rows, i, i - 1))}
            >
              ↑
            </button>
            <button
              className="icon"
              title="Move down"
              disabled={i === rows.length - 1}
              onClick={() => setRows(swap(rows, i, i + 1))}
            >
              ↓
            </button>
            <button
              className="icon"
              title="Delete row"
              onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
            >
              ×
            </button>
            {p.type === "events" && !isKpRow(r) && (
              <div className="row-extra">
                <label
                  className="check"
                  title="Print the video start and end of the product, from the Video timing list in the left panel"
                >
                  <input
                    type="checkbox"
                    checked={!!isVideoRow(r)}
                    onChange={(e) => patch(r.id, { video: e.target.checked })}
                  />
                  Video timing
                </label>
                {isVideoRow(r) && (
                  <select
                    value={r.videoSource ?? "events"}
                    title="Survey sessions read from the time stamps of the events file, or the Video timing list"
                    onChange={(e) =>
                      patch(r.id, {
                        videoSource: e.target.value as EventRow["videoSource"],
                      })
                    }
                  >
                    <option value="events">
                      Sessions from the event times
                    </option>
                    <option value="timing">Video timing list</option>
                    <option value="user">User defined timing</option>
                  </select>
                )}
                {isVideoRow(r) && r.videoSource === "user" && (
                  <UserTimes
                    list={r.userTimes ?? []}
                    onChange={(userTimes) => patch(r.id, { userTimes })}
                  />
                )}
                {isVideoRow(r) && (r.videoSource ?? "events") === "events" && (
                  <label
                    className="field"
                    title="A pause in the event log longer than this starts a new session"
                  >
                    <span>New session after a pause of</span>
                    <span className="with-suffix">
                      <DraftNumber
                        min={1}
                        step={10}
                        value={r.sessionGap ?? 60}
                        onCommit={(v) =>
                          v > 0 && patch(r.id, { sessionGap: v })
                        }
                      />
                      <span className="suffix">min</span>
                    </span>
                  </label>
                )}
                {isVideoRow(r) && r.videoSource === "timing" && (
                  <select
                    value={r.videoProduct ?? ""}
                    title="Which product's video this row shows"
                    onChange={(e) =>
                      patch(r.id, { videoProduct: e.target.value || undefined })
                    }
                  >
                    <option value="">
                      Product named in the drawing number
                    </option>
                    {productKeys(videoRows).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                )}
                {!isVideoRow(r) && (
                  <label
                    className="check"
                    title="Show only the text typed here in this row, no imported events"
                  >
                    <input
                      type="checkbox"
                      checked={!!r.textOnly}
                      onChange={(e) =>
                        patch(r.id, { textOnly: e.target.checked })
                      }
                    />
                    Text only
                  </label>
                )}
                {(r.textOnly || isVideoRow(r)) && (
                  <select
                    value={r.textAlign ?? "middle"}
                    title="Where the text sits in the row"
                    onChange={(e) =>
                      patch(r.id, {
                        textAlign: e.target.value as EventRow["textAlign"],
                      })
                    }
                  >
                    <option value="start">Left</option>
                    <option value="middle">Centre</option>
                    <option value="end">Right</option>
                  </select>
                )}
                {(r.textOnly || isVideoRow(r)) && (
                  <div className="row-stripe">
                    <label
                      className="check"
                      title="Zebra stripe: a band behind the text along the row"
                    >
                      <input
                        type="checkbox"
                        checked={r.stripe ?? !!isVideoRow(r)}
                        onChange={(e) =>
                          patch(r.id, { stripe: e.target.checked })
                        }
                      />
                      Stripe
                    </label>
                    {(r.stripe ?? !!isVideoRow(r)) && (
                      <>
                        <label className="field colour-field">
                          <span>Stripe colour</span>
                          <ColourBox
                            value={r.stripeColor ?? "#d9d9d9"}
                            onChange={(c) => patch(r.id, { stripeColor: c })}
                          />
                        </label>
                        <label className="field">
                          <span>Stripe opacity</span>
                          <span className="with-suffix">
                            <DraftNumber
                              step={5}
                              min={0}
                              title="Opacity, %"
                              value={Math.round((r.stripeOpacity ?? 1) * 100)}
                              onCommit={(v) =>
                                patch(r.id, {
                                  stripeOpacity: Math.min(100, v) / 100,
                                })
                              }
                            />
                            <span className="suffix">%</span>
                          </span>
                        </label>
                        <label className="field">
                          <span>Stripe width</span>
                          <span className="with-suffix">
                            <DraftNumber
                              step={0.1}
                              min={0}
                              title="0 is a line in the middle of the row"
                              value={
                                r.stripeWidth ??
                                Math.round(Math.max(0, rowH - 2) * 10) / 10
                              }
                              onCommit={(v) =>
                                patch(r.id, {
                                  stripeWidth: Math.round(v * 10) / 10,
                                })
                              }
                            />
                            <span className="suffix">mm</span>
                          </span>
                        </label>
                      </>
                    )}
                  </div>
                )}
                {!r.textOnly && !isVideoRow(r) && (
                  <button type="button" onClick={() => addCodes(r)}>
                    Add Events Code…
                  </button>
                )}
                {isVideoRow(r) ? (
                  r.videoSource === "user" ? null : (
                    <VideoTextEditor
                      key={`${r.id}:${sheetIndex}:${r.videoText ?? ""}:${r.videoTexts?.[sheetIndex] ?? ""}`}
                      r={r}
                      sheetIndex={sheetIndex}
                      onChange={(c) => patch(r.id, c)}
                    />
                  )
                ) : r.textOnly ? (
                  <textarea
                    key={`${r.id}:t:${r.text ?? ""}`}
                    rows={2}
                    placeholder="Text for this row"
                    defaultValue={r.text ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.text ?? "") &&
                      patch(r.id, { text: e.target.value })
                    }
                  />
                ) : (
                  <input
                    key={`${r.id}:${rowCodes(r)}`}
                    className="row-codes"
                    title="Event codes drawn in this row, comma separated; * matches anything (D.*)"
                    placeholder="Event codes, e.g. AN.*"
                    defaultValue={rowCodes(r)}
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase();
                      if (v !== rowCodes(r))
                        patch(r.id, {
                          codes: v === defaultRowCodes(r.label) ? undefined : v,
                        });
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.target as HTMLInputElement).blur()
                    }
                  />
                )}
              </div>
            )}
            {p.type === "events" && <RowTextLook p={p} r={r} />}
          </li>
        ))}
      </ol>
      <button
        onClick={() => setRows([...rows, { id: newId("r"), label: "NEW ROW" }])}
      >
        Add row
      </button>
    </>
  );
}

/** The text of a video row: automatic from the Video timing list, or typed over it for this chart or all. */
function VideoTextEditor({
  r,
  sheetIndex,
  onChange,
}: {
  r: EventRow;
  sheetIndex: number;
  onChange(c: Partial<EventRow>): void;
}) {
  const video = useVideo((x) => x.rows);
  const joinHours = useVideo((x) => x.joinHours);
  const drawingNo = useEditor((x) =>
    x.template ? drawingNoOf(x.template, x.sheetIndex) : "",
  );
  const folder = useProject((x) => x.active ?? "");
  const auto = autoVideoText(video, {
    product: r.videoProduct,
    drawingNo,
    folder,
    joinHours,
  });
  const own = r.videoTexts?.[sheetIndex];
  const shown = own ?? r.videoText ?? auto;
  const [scope, setScope] = useState<"chart" | "all">("chart");
  const typed = own !== undefined || r.videoText !== undefined;
  return (
    <div className="video-text">
      <textarea
        rows={3}
        title="The video text of this row. Edit it to override the automatic text."
        defaultValue={shown}
        onBlur={(e) => {
          const v = e.target.value;
          if (v === shown) return;
          if (scope === "all")
            onChange({
              videoText: v === auto ? undefined : v,
              videoTexts: undefined,
            });
          else
            onChange({
              videoTexts: { ...r.videoTexts, [sheetIndex]: v },
            });
        }}
      />
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value as "chart" | "all")}
        title="Where an edit of the text applies"
      >
        <option value="chart">Edit this chart ({sheetIndex + 1}) only</option>
        <option value="all">Edit for all charts</option>
      </select>
      {typed && (
        <button
          type="button"
          onClick={() =>
            onChange({ videoText: undefined, videoTexts: undefined })
          }
        >
          Back to automatic text
        </button>
      )}
    </div>
  );
}

/** Local smooth of the TOP depth, and writing the smoothed depths back to the source file. */
function LongSmooth({ d }: { d: Extract<Dataset, { kind: "long" }> }) {
  const tool = useSmoothTool();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const mine = tool.active && tool.datasetId === d.id;
  const edited = !!d.topEdit;
  /** Nodes whose x is on screen now, inside the profile panel. */
  const inView = (): [number, number] | null => {
    const { ctx, view } = tool;
    if (!ctx || !view) return null;
    const x0 = Math.max(ctx.rect.x, view.x);
    const x1 = Math.min(ctx.rect.x + ctx.rect.w, view.x + view.w);
    if (x1 <= x0) return null;
    const k0 = ctx.kpAt(x0);
    const k1 = ctx.kpAt(x1);
    let a = 0;
    while (a < d.kp.length && d.kp[a] < k0) a++;
    let b = d.kp.length - 1;
    while (b > 0 && d.kp[b] > k1) b--;
    return b >= a ? [a, b] : null;
  };
  return (
    <div className="long-smooth">
      <b>Local smooth of the TOP depth</b>
      <label className="field">
        <span>Window</span>
        <span className="with-suffix">
          <DraftNumber
            step={1}
            min={1}
            value={tool.n}
            onCommit={(v) => tool.setN(v)}
            title="Nodes each side of the helper line's centre that are averaged into each node. BOP follows TOP."
          />
          <span className="suffix">nodes each side</span>
        </span>
      </label>
      <button
        type="button"
        className={mine ? "primary" : undefined}
        onClick={() => (mine ? tool.stop() : tool.start(d.id))}
        title="A green helper line follows the TOP line under the pointer, with the window's length each side of it. Click to smooth only along the helper line. Esc ends."
      >
        {mine ? "Stop smoothing (Esc)" : "Smooth with the helper line…"}
      </button>
      <div className="row2">
        <button
          type="button"
          onClick={() => {
            const r = inView();
            if (!r) return setNote("The profile is not in view.");
            tool.apply(d.id, r[0], r[1]);
            setNote(`Smoothed ${r[1] - r[0] + 1} nodes in view.`);
          }}
          title="Smooth only the pipe shown on screen now (zoom in to choose the stretch)"
        >
          Smooth what is in view
        </button>
        <button
          type="button"
          onClick={() => {
            tool.apply(d.id, 0, d.kp.length - 1);
          }}
          title="Smooth the whole line"
        >
          Smooth the whole line
        </button>
      </div>
      <div className="row2">
        <button
          type="button"
          disabled={!tool.history[d.id]?.length}
          onClick={() => tool.undo(d.id)}
        >
          Undo last smooth
        </button>
        <button
          type="button"
          disabled={!edited}
          onClick={() => tool.reset(d.id)}
          title="Back to the depths as imported"
        >
          Back to imported
        </button>
      </div>
      <button
        type="button"
        disabled={busy || !canWriteBack(d)}
        title={
          canWriteBack(d)
            ? "Write the smoothed TOP (and BOP) back into the imported file (the original is kept as *_Raw)"
            : "This profile was not read from a file that is still known: import the file again"
        }
        onClick={async () => {
          setBusy(true);
          try {
            const r = await smoothedFile(d);
            const pr = useProject.getState();
            let done = false;
            if (
              pr.handle &&
              pr.active !== null &&
              (await canWrite(pr.handle))
            ) {
              try {
                const dir = await subHandle(pr.handle, pr.active);
                // Back up the untouched file once; never overwrite an earlier backup.
                let have = true;
                try {
                  await dir.getFileHandle(r.rawName);
                } catch {
                  have = false;
                }
                if (!have) {
                  const w = await (
                    await dir.getFileHandle(r.rawName, { create: true })
                  ).createWritable();
                  await w.write(r.raw);
                  await w.close();
                }
                const w = await (
                  await dir.getFileHandle(r.name, { create: true })
                ).createWritable();
                await w.write(r.blob);
                await w.close();
                done = true;
                setNote(
                  `Saved ${r.name} in the project folder (${r.changed} cells changed). The original is kept as ${r.rawName}.`,
                );
              } catch {
                /* fall back to downloads */
              }
            }
            if (!done) {
              downloadBlob(r.raw, r.rawName);
              downloadBlob(r.blob, r.name);
              setNote(
                `Downloaded ${r.rawName} (the original) and ${r.name} (smoothed, ${r.changed} cells changed). Put them in the file's folder and replace the old file.`,
              );
            }
          } catch (e) {
            setNote((e as Error).message);
          }
          setBusy(false);
        }}
      >
        Save to the file (original kept as _Raw)
      </button>
      {note && <p className="hint">{note}</p>}
    </div>
  );
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const out = [...a];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function TextProps({ t }: { t: TextItem }) {
  const s = useEditor.getState();
  const set = (patch: Partial<TextItem>) => s.updateText(t.id, patch);
  const template = useEditor((st) => st.template)!;
  const parent = t.panelId
    ? template.panels.find((p) => p.id === t.panelId)
    : undefined;
  return (
    <aside className="props">
      <h3>Text</h3>
      {parent && (
        <p className="muted">Attached to {parent.title}; moves with it.</p>
      )}
      <Field label="Text" value={t.text} onCommit={(v) => set({ text: v })} />
      <FontPick
        value={t.fontFamily}
        sheetFont={template.fontFamily}
        onChange={(f) => set({ fontFamily: f })}
      />
      <p className="muted">
        Tokens such as {"{H_SCALE}"} (now{" "}
        {formatScale(template.scale.horizontal)}), {"{KP_START}"}, {"{KP_END}"}{" "}
        or any field update by themselves.
      </p>
      <div className="row2">
        <Field
          label="Height"
          type="number"
          step={0.1}
          suffix="mm"
          value={r2(t.size)}
          onCommit={(v) => num(v) > 0 && set({ size: num(v) })}
        />
        <Field
          label="Rotation"
          type="number"
          suffix="°"
          value={t.rotation ?? 0}
          onCommit={(v) => set({ rotation: num(v) || 0 })}
        />
      </div>
      <div className="row2">
        <Field
          label="X"
          type="number"
          suffix="mm"
          value={r2(t.x)}
          onCommit={(v) => set({ x: num(v) })}
        />
        <Field
          label="Y"
          type="number"
          suffix="mm"
          value={r2(t.y)}
          onCommit={(v) => set({ y: num(v) })}
        />
      </div>
      <label className="field">
        <span>Alignment</span>
        <select
          value={t.anchor}
          onChange={(e) =>
            set({ anchor: e.target.value as TextItem["anchor"] })
          }
        >
          <option value="start">Left</option>
          <option value="middle">Centre</option>
          <option value="end">Right</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!t.bold}
          onChange={(e) => set({ bold: e.target.checked })}
        />{" "}
        Bold
      </label>
    </aside>
  );
}

function BarPreview({ id }: { id: ScaleBarStyle }) {
  return (
    <svg className="bar-preview" viewBox="-1 -1.6 52 3.2">
      <BarShape style={id} x0={0} yb={0} seg={10} n={5} h={2} />
    </svg>
  );
}

/** A drop-down of the scale bar styles, each with its name, a note and a picture of the bar. */
function ScaleBarPicker({
  value,
  onChange,
}: {
  value: ScaleBarStyle;
  onChange(v: ScaleBarStyle): void;
}) {
  const [open, setOpen] = useState(false);
  const cur = SCALE_BAR_STYLES.find((x) => x.id === value)!;
  return (
    <div className="field bar-picker">
      <span>Scale bar style</span>
      <button
        type="button"
        className="bar-picker-btn"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{cur.label} ▾</span>
        <BarPreview id={value} />
      </button>
      {open && (
        <ul className="bar-picker-list" onMouseLeave={() => setOpen(false)}>
          {SCALE_BAR_STYLES.map((o) => (
            <li
              key={o.id}
              className={o.id === value ? "on" : undefined}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <b>{o.label}</b>
              <small>{o.note}</small>
              <BarPreview id={o.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FontPick({
  value,
  sheetFont,
  note,
  onChange,
}: {
  value?: string;
  sheetFont?: string;
  note?: string;
  onChange(f: string | undefined): void;
}) {
  return (
    <label className="field">
      <span>Font</span>
      <select
        value={value ?? ""}
        style={{ fontFamily: value }}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Sheet font ({sheetFont ?? "Arial"})</option>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
      {note && <span className="muted">{note}</span>}
    </label>
  );
}

const FONTS = [
  "Arial",
  "Arial Narrow",
  "Helvetica",
  "Calibri",
  "Segoe UI",
  "Tahoma",
  "Verdana",
  "Times New Roman",
  "Courier New",
];

function FontEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const f: TextStyle = p.font ?? { size: 1.8 };
  const set = (patch: Partial<TextStyle>) =>
    s.updatePanel(p.id, { font: { ...f, ...patch } });
  return (
    <>
      <h4>Text style</h4>
      <div className="row2">
        <Field
          label="Text height"
          type="number"
          step={0.1}
          suffix="mm"
          value={r2(f.size)}
          onCommit={(v) => num(v) > 0 && set({ size: num(v) })}
        />
        <label className="field">
          <span>Alignment</span>
          <select
            value={f.align ?? "start"}
            onChange={(e) =>
              set({ align: e.target.value as TextStyle["align"] })
            }
          >
            <option value="start">Left</option>
            <option value="middle">Centre</option>
            <option value="end">Right</option>
          </select>
        </label>
      </div>
      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={!!f.bold}
            onChange={(e) => set({ bold: e.target.checked })}
          />{" "}
          Bold
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!f.italic}
            onChange={(e) => set({ italic: e.target.checked })}
          />{" "}
          Italic
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!f.vcenter}
            onChange={(e) => set({ vcenter: e.target.checked })}
          />{" "}
          Centre vertically
        </label>
      </div>
      <label className="field">
        <span>Text colour</span>
        <span className="input-wrap">
          <ColourBox
            value={p.textColor ?? "#111111"}
            onChange={(c) => s.updatePanel(p.id, { textColor: c })}
          />
          {p.textColor && (
            <button
              className="link"
              onClick={() => s.updatePanel(p.id, { textColor: undefined })}
            >
              Default
            </button>
          )}
        </span>
      </label>
      <button
        title="Copy this text height and style to every text section"
        onClick={() =>
          s.commit((t) => ({
            ...t,
            panels: t.panels.map((x) =>
              x.body !== undefined && x.id !== p.id
                ? {
                    ...x,
                    font: {
                      ...(x.font ?? { size: 1.8 }),
                      size: f.size,
                      bold: f.bold,
                      italic: f.italic,
                    },
                  }
                : x,
            ),
          }))
        }
      >
        Apply height and style to all text sections
      </button>
    </>
  );
}

/** Colour picked on a data legend line: it is the data's colour, so change it there. */
function setDataColour(it: DataLegendItem, color: string) {
  const sv = useSurvey.getState();
  const d = sv.datasets.find((x) => x.id === it.datasetId);
  if (!d || !it.colorOf) return;
  if (it.colorOf === "color") return sv.updateDataset(d.id, { color });
  if (d.kind === "long") {
    const pick = (i: number) =>
      it.colorOf === "pipe"
        ? i === d.top || i === d.bop
        : it.colorOf === `series:${i}`;
    return sv.updateDataset(d.id, {
      series: d.series.map((x, i) => (pick(i) ? { ...x, color } : x)),
    });
  }
  if (d.kind === "events" && it.colorOf.startsWith("link:")) {
    const n = Number(it.colorOf.slice(5));
    sv.updateDataset(d.id, {
      links: d.links.map((l, i) => (i === n ? { ...l, color } : l)),
    });
  }
}

/** Every event code definition read from the events, each one editable and able to be hidden. */
function CodeDefsEditor({
  all,
  edits,
  hidden,
  onChange,
}: {
  all: string;
  edits: Record<string, string>;
  hidden: string[];
  onChange(edits: Record<string, string>, hidden: string[]): void;
}) {
  const rows = all
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const [c, ...rest] = l.split("\t");
      return { code: c.trim().toUpperCase(), read: rest.join(" ") };
    });
  if (!rows.length) return null;
  return (
    <>
      <p className="hint">
        {rows.length} codes in the imported events. Change the wording here or
        double-click a definition on the sheet; untick to leave one out.
      </p>
      <ul className="code-defs">
        {rows.map(({ code, read }) => {
          const own = edits[code];
          return (
            <li key={code}>
              <input
                type="checkbox"
                title="Show in the legend"
                checked={!hidden.includes(code)}
                onChange={(e) =>
                  onChange(
                    edits,
                    e.target.checked
                      ? hidden.filter((h) => h !== code)
                      : [...hidden, code],
                  )
                }
              />
              <span className="code">{code}</span>
              <input
                key={`${code}:${own ?? read}`}
                defaultValue={own ?? read}
                title={own !== undefined ? `From the file: ${read}` : undefined}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v === (own ?? read)) return;
                  const next = { ...edits };
                  if (v === read) delete next[code];
                  else next[code] = v;
                  onChange(next, hidden);
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.target as HTMLInputElement).blur()
                }
              />
              {own !== undefined && (
                <button
                  type="button"
                  className="link"
                  title={`Back to the file's wording: ${read}`}
                  onClick={() => {
                    const next = { ...edits };
                    delete next[code];
                    onChange(next, hidden);
                  }}
                >
                  ↺
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function LegendEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const items = p.legend ?? [];
  const setItems = (legend: LegendItem[]) => s.updatePanel(p.id, { legend });
  const update = (id: string, patch: Partial<LegendItem>) =>
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const [preset, setPreset] = useState("0");
  const { data } = useLegendItems(p);
  const datasets = useSurvey((x) => x.datasets);
  const ld = p.legendData ?? { on: true, overrides: {} };
  const fromEvents =
    ld.on && datasets.some((d) => d.kind === "events" && d.visible);
  const setLd = (patch: Partial<typeof ld>) =>
    s.updatePanel(p.id, { legendData: { ...ld, ...patch } });
  const ls = { ...DEFAULT_LEGEND_STYLE, ...p.legendStyle };
  const setLs = (patch: Partial<typeof ls>) =>
    s.updatePanel(p.id, { legendStyle: { ...ls, ...patch } });
  return (
    <>
      <h4>Legend text</h4>
      <FontControls
        font={{
          family: ls.family,
          size: ls.size,
          color: ls.color,
          bold: ls.bold,
          italic: ls.italic,
        }}
        onChange={(f) =>
          setLs({
            family: f.family,
            size: f.size,
            color: f.color,
            bold: f.bold,
            italic: f.italic,
          })
        }
      />
      <div className="style-row">
        <Field
          label="Heading height"
          type="number"
          step={0.1}
          suffix="mm"
          value={ls.headSize}
          onCommit={(v) => num(v) > 0 && setLs({ headSize: num(v) })}
        />
        <label className="field colour-field">
          <span>Heading colour</span>
          <ColourBox
            value={ls.headColor}
            onChange={(c) => setLs({ headColor: c })}
          />
        </label>
      </div>

      <h4>Headings</h4>
      <p className="hint">
        Change the wording of a heading; empty goes back to the standard one.
      </p>
      {(
        [
          ...Object.keys(LEGEND_GROUPS).filter((g) => g !== "status"),
          "codes",
        ] as (LegendGroup | "codes")[]
      ).map((g) => (
        <label className="field" key={g}>
          <span>
            {g === "codes" ? "EVENT CODE DEFINITIONS:" : LEGEND_GROUPS[g]}
          </span>
          <input
            key={ls.headings?.[g] ?? ""}
            defaultValue={ls.headings?.[g] ?? ""}
            placeholder={
              g === "codes" ? "EVENT CODE DEFINITIONS:" : LEGEND_GROUPS[g]
            }
            onBlur={(e) =>
              e.target.value !== (ls.headings?.[g] ?? "") &&
              setLs({ headings: { ...ls.headings, [g]: e.target.value } })
            }
            onKeyDown={(e) =>
              e.key === "Enter" && (e.target as HTMLInputElement).blur()
            }
          />
        </label>
      ))}
      <h4>Event code definitions</h4>
      <label className="field">
        <span>Show</span>
        <select
          value={ls.codeScope ?? "all"}
          onChange={(e) =>
            setLs({ codeScope: e.target.value as "all" | "chart" })
          }
        >
          <option value="all">Codes of the events on all charts</option>
          <option value="chart">
            Only codes on this chart (shown in the engineering events)
          </option>
        </select>
      </label>
      {fromEvents ? (
        <CodeDefsEditor
          all={dataEventCodes(datasets)}
          edits={ls.codeEdits ?? {}}
          hidden={ls.codeHidden ?? []}
          onChange={(codeEdits, codeHidden) => setLs({ codeEdits, codeHidden })}
        />
      ) : (
        <Field
          label="Event code definitions (code, Tab, description)"
          multiline
          value={p.eventCodes ?? ""}
          onCommit={(v) => s.updatePanel(p.id, { eventCodes: v })}
        />
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={ls.sameCodeSize !== false}
          onChange={(e) => setLs({ sameCodeSize: e.target.checked })}
        />
        Same text height as the legend text
      </label>
      <FontControls
        font={{
          family: ls.codeFamily || ls.family,
          size: ls.sameCodeSize !== false ? ls.size : ls.codeSize,
          color: ls.codeColor,
          bold: ls.codeBold,
          italic: ls.codeItalic,
        }}
        onChange={(f) =>
          setLs({
            codeFamily: f.family,
            codeColor: f.color,
            codeBold: f.bold,
            codeItalic: f.italic,
            ...(ls.sameCodeSize === false ? { codeSize: f.size } : {}),
          })
        }
      />
      {ls.sameCodeSize !== false && (
        <p className="hint">
          Untick “Same text height” to give the definitions their own height.
        </p>
      )}

      <h4>From imported data</h4>
      <label className="check">
        <input
          type="checkbox"
          checked={ld.on}
          onChange={(e) => setLd({ on: e.target.checked })}
        />
        Build the legend from the imported data, in the colours it is drawn with
      </label>
      {ld.on && data.length === 0 && (
        <p className="hint">Import data and its legend lines appear here.</p>
      )}
      {ld.on && (
        <ul className="legend-list">
          {dataLegend(datasets, "#e00000").map((it) => {
            const o = ld.overrides[it.key] ?? {};
            const setO = (patch: { label?: string; hidden?: boolean }) =>
              setLd({
                overrides: { ...ld.overrides, [it.key]: { ...o, ...patch } },
              });
            return (
              <li key={it.key}>
                <div className="legend-row">
                  <input
                    type="checkbox"
                    checked={!o.hidden}
                    title="Show in the legend"
                    onChange={(e) => setO({ hidden: !e.target.checked })}
                  />
                  {it.datasetId && (
                    <ColourBox
                      value={it.color}
                      title="Colour (changes the data too)"
                      onChange={(c) => setDataColour(it, c)}
                    />
                  )}
                  <input
                    defaultValue={o.label ?? it.label}
                    key={o.label ?? it.label}
                    onBlur={(e) =>
                      e.target.value !== (o.label ?? it.label) &&
                      setO({ label: e.target.value })
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.target as HTMLInputElement).blur()
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <h4>Legend items</h4>
      <p className="muted">
        {ld.on
          ? "Your own items. Preset items in a group that has imported data step aside for the data lines."
          : "Items drawn in the legend."}
      </p>
      <ul className="legend-list">
        {items.map((it, i) => (
          <li key={it.id}>
            <div className="legend-row">
              <ColourBox
                value={it.color}
                title="Colour"
                onChange={(c) => update(it.id, { color: c })}
              />
              <input
                defaultValue={it.label}
                key={it.label}
                onBlur={(e) =>
                  e.target.value !== it.label &&
                  update(it.id, { label: e.target.value })
                }
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.target as HTMLInputElement).blur()
                }
              />
              <button
                className="icon"
                title="Move up"
                disabled={i === 0}
                onClick={() => setItems(swap(items, i, i - 1))}
              >
                ↑
              </button>
              <button
                className="icon"
                title="Remove"
                onClick={() => setItems(items.filter((x) => x.id !== it.id))}
              >
                ×
              </button>
            </div>
            <div className="legend-row sub">
              <select
                value={it.group}
                onChange={(e) =>
                  update(it.id, { group: e.target.value as LegendGroup })
                }
              >
                {Object.entries(LEGEND_GROUPS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.toLowerCase()}
                  </option>
                ))}
              </select>
              <select
                value={it.symbol}
                onChange={(e) =>
                  update(it.id, { symbol: e.target.value as LegendSymbol })
                }
              >
                {Object.entries(LEGEND_SYMBOLS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
      <div className="add-field">
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {LEGEND_PRESETS.map((pr, i) => (
            <option key={i} value={i}>
              {LEGEND_GROUPS[pr.group].toLowerCase()}: {pr.label}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            setItems([
              ...items,
              {
                ...LEGEND_PRESETS[Number(preset)],
                id: newId("lg"),
                custom: true,
              },
            ])
          }
        >
          Add preset
        </button>
      </div>
      <button
        onClick={() =>
          setItems([
            ...items,
            {
              id: newId("lg"),
              group: "plan",
              symbol: "line",
              label: "New legend item",
              color: "#111111",
              custom: true,
            },
          ])
        }
      >
        Add your own item
      </button>
    </>
  );
}

function ImageProps({ im }: { im: ImageItem }) {
  const s = useEditor.getState();
  const set = (patch: Partial<ImageItem>) => s.updateImage(im.id, patch);
  const ratio = im.h / im.w;
  return (
    <aside className="props">
      <h3>Image</h3>
      {im.name && <p className="muted">{im.name}</p>}
      <p className="muted">
        Drag to move. Drag a corner to resize in proportion (Shift to stretch),
        or a side handle to stretch one way.
      </p>
      <div className="row2">
        <Field
          label="Width"
          type="number"
          suffix="mm"
          value={r2(im.w)}
          onCommit={(v) => num(v) > 1 && set({ w: num(v), h: num(v) * ratio })}
        />
        <Field
          label="Height"
          type="number"
          suffix="mm"
          value={r2(im.h)}
          onCommit={(v) => num(v) > 1 && set({ h: num(v), w: num(v) / ratio })}
        />
      </div>
      <div className="row2">
        <Field
          label="X"
          type="number"
          suffix="mm"
          value={r2(im.x)}
          onCommit={(v) => set({ x: num(v) })}
        />
        <Field
          label="Y"
          type="number"
          suffix="mm"
          value={r2(im.y)}
          onCommit={(v) => set({ y: num(v) })}
        />
      </div>
    </aside>
  );
}

function KeyplanEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const st = keyplanStyle(p);
  const set = (patch: Partial<KeyplanStyle>) =>
    s.updatePanel(p.id, { keyplan: { ...st, ...patch } });
  const colour = (
    label: string,
    key:
      | "background"
      | "dxfColor"
      | "routeColor"
      | "boundaryColor"
      | "currentColor"
      | "gridColor",
  ) => (
    <label className="field">
      <span>{label}</span>
      <ColourBox value={st[key]} onChange={(c) => set({ [key]: c })} />
    </label>
  );
  return (
    <>
      <h4>Key plan</h4>
      <div className="row2">{colour("Background", "background")}</div>
      <div className="row2">
        {colour("Survey line", "routeColor")}
        {colour("Chart boundaries", "boundaryColor")}
      </div>
      <div className="row2">
        {colour("This chart", "currentColor")}
        {colour("Grid", "gridColor")}
      </div>
      <Field
        label="Grid spacing (0 = auto)"
        type="number"
        step={100}
        suffix="m"
        value={st.gridSpacing}
        onCommit={(v) => num(v) >= 0 && set({ gridSpacing: num(v) })}
      />
      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={st.showGrid}
            onChange={(e) => set({ showGrid: e.target.checked })}
          />{" "}
          Easting / northing grid
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={st.showNorthArrow}
            onChange={(e) => set({ showNorthArrow: e.target.checked })}
          />{" "}
          North arrow
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={st.showBoundaries}
            onChange={(e) => set({ showBoundaries: e.target.checked })}
          />{" "}
          Chart boundaries
        </label>
        <label
          className="check"
          title="Draw every chart's matchlines across the line in the key plan"
        >
          <input
            type="checkbox"
            checked={!!st.showMatchlines}
            onChange={(e) => set({ showMatchlines: e.target.checked })}
          />{" "}
          Matchlines
        </label>
      </div>
      <KeyplanMatchTools p={p} />
    </>
  );
}

/** Choose matchlines in the key plan: pick an overlap, draw a line, or go back to the automatic ones. */
function KeyplanMatchTools({ p }: { p: Panel }) {
  const mp = useMatchPick();
  const t = useEditor((s) => s.template);
  const plan = t ? planPanel(t) : undefined;
  const pairs = plan ? planStyle(plan).match?.pairs : undefined;
  const count = Object.keys(pairs ?? {}).length;
  const on = (tool: "pick" | "draw") =>
    mp.active && mp.panelId === p.id && mp.tool === tool;
  const toggle = (tool: "pick" | "draw") =>
    on(tool) ? exitMode() : enterMode("matchline", { panelId: p.id, tool });
  return (
    <>
      <h4>Matchlines</h4>
      <div className="btn-row">
        <button
          type="button"
          className={on("pick") ? "active" : ""}
          aria-pressed={on("pick")}
          data-match-tool="pick"
          onClick={() => toggle("pick")}
          title="Show where this chart overlaps its neighbours in green; click in a green overlap to put the matchline of those two charts there"
        >
          Pick matchline in the key plan
        </button>
        <button
          type="button"
          className={on("draw") ? "active" : ""}
          aria-pressed={on("draw")}
          data-match-tool="draw"
          onClick={() => toggle("draw")}
          title="Click two points in the key plan, across the survey line, to draw the matchline where you want it"
        >
          Draw a matchline
        </button>
      </div>
      {count > 0 && (
        <div className="btn-row">
          <span className="hint">
            {count} matchline{count > 1 ? "s" : ""} chosen in the key plan.
          </span>
          <button
            type="button"
            onClick={() =>
              useEditor.getState().commit((tt) => withMatchPair(tt, null, null))
            }
            title="Forget the matchlines picked or drawn in the key plan and use the automatic ones"
          >
            Reset
          </button>
        </div>
      )}
      <p className="hint">
        A chosen matchline is used by both charts it joins. Matchlines show in
        the plan view when "Show matchlines" is on there (choosing one turns it
        on).
      </p>
    </>
  );
}

function MatchlineControls({
  st,
  onChange,
}: {
  st: MatchlineStyle;
  onChange(p: Partial<MatchlineStyle>): void;
}) {
  const txt = (label: string, key: "prefix" | "suffix" | "extra") => (
    <Field
      label={label}
      value={st[key]}
      onCommit={(v) => onChange({ [key]: v })}
    />
  );
  return (
    <>
      <label
        className="check"
        title="Draw a line across the plan view wherever it meets the next or previous chart"
      >
        <input
          type="checkbox"
          checked={st.on}
          onChange={(e) => onChange({ on: e.target.checked })}
        />{" "}
        Show matchlines
      </label>
      {st.on && (
        <>
          <label className="field">
            <span>Lines at</span>
            <select
              value={st.mode}
              onChange={(e) =>
                onChange({ mode: e.target.value as MatchlineStyle["mode"] })
              }
            >
              <option value="overlap">
                Overlap: where the neighbouring charts begin and end
              </option>
              <option value="profile">
                Profile limits: this chart's own start and end KP
              </option>
            </select>
          </label>
          <div className="row2">
            {txt("Label prefix", "prefix")}
            {txt("Label suffix", "suffix")}
          </div>
          {txt("Extra text (other side)", "extra")}
          <label
            className="check"
            title="Turn the label text 180°. Single labels: right-click them"
          >
            <input
              type="checkbox"
              checked={!!st.flip}
              onChange={(e) => onChange({ flip: e.target.checked })}
            />{" "}
            Flip the text (180°)
          </label>
          <div className="row2">
            <label className="field colour-field">
              <span>Colour</span>
              <ColourBox
                value={st.color}
                onChange={(c) => onChange({ color: c })}
              />
            </label>
            <Field
              label="Width"
              type="number"
              step={1}
              suffix="mm"
              value={st.width}
              onCommit={(v) => num(v) > 0 && onChange({ width: num(v) })}
            />
          </div>
          <div className="row2">
            <Field
              label="Text height"
              type="number"
              step={0.1}
              suffix="mm"
              value={st.textSize}
              onCommit={(v) => num(v) > 0 && onChange({ textSize: num(v) })}
            />
            <label className="field">
              <span>Line style</span>
              <select
                value={st.dash}
                onChange={(e) => onChange({ dash: e.target.value })}
              >
                <option value="">Continuous</option>
                <option value="4 1.5 0.8 1.5">Dash-dot</option>
                <option value="4 2">Dashed</option>
                <option value="0.8 1.2">Dotted</option>
              </select>
            </label>
          </div>
        </>
      )}
    </>
  );
}

/** Text boxes with an arrow in the plan view. */
function CalloutEditor({ p }: { p: Panel }) {
  const list = planStyle(p).callouts ?? [];
  const [note, setNote] = useState("");
  return (
    <>
      <h4>Text boxes</h4>
      <button
        type="button"
        onClick={() =>
          setNote(
            addCallout(p.id)
              ? ""
              : "Load the route or a drawing first: a text box points at map coordinates.",
          )
        }
      >
        Add text box
      </button>
      {note && <p className="hint">{note}</p>}
      {list.map((c, i) => (
        <CalloutFields key={c.id} panelId={p.id} c={c} n={i + 1} />
      ))}
      {list.length > 0 && (
        <p className="hint">
          Drag the box to move it with its arrow; Shift+drag moves the box only
          (the arrow stays on its point). Drag the arrow tip to point elsewhere,
          the corner to resize. Right-click a box for more.
        </p>
      )}
    </>
  );
}

function CalloutFields({
  panelId,
  c,
  n,
}: {
  panelId: string;
  c: Callout;
  n: number;
}) {
  const [open, setOpen] = useState(false);
  const focus = useCalloutFocus();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus.id !== c.id || Date.now() - focus.n > 1500) return;
    setOpen(true);
    requestAnimationFrame(() =>
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [focus, c.id]);
  const set = (patch: Partial<Callout>) => patchCallout(panelId, c.id, patch);
  const rows = rowsOf(c);
  const setRows = (fn: (r: CalloutRow[]) => CalloutRow[]) =>
    patchRows(panelId, c.id, fn);
  const setRow = (id: string, patch: Partial<CalloutRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div
      ref={ref}
      className={`callout-fields${focus.id === c.id ? " focused" : ""}`}
    >
      <div className="style-row">
        <button
          type="button"
          className="link"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "▾" : "▸"} {n}. {c.title.split("\n").join(" ")}
        </button>
        <button
          type="button"
          className="link"
          title="Delete this text box"
          onClick={() =>
            useEditor
              .getState()
              .commit((t) =>
                withCallouts(t, panelId, (cs) =>
                  cs.filter((x) => x.id !== c.id),
                ),
              )
          }
        >
          ×
        </button>
      </div>
      {open && (
        <>
          <label className="field">
            <span>Title</span>
            <textarea
              rows={2}
              value={c.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          <div className="row2">
            <Field
              label="Arrow easting"
              type="number"
              suffix="m"
              value={c.e}
              onCommit={(v) => Number.isFinite(num(v)) && set({ e: num(v) })}
            />
            <Field
              label="Arrow northing"
              type="number"
              suffix="m"
              value={c.n}
              onCommit={(v) => Number.isFinite(num(v)) && set({ n: num(v) })}
            />
          </div>
          <h5>Lines</h5>
          <div className="callout-rows">
            {rows.map((r, i) => (
              <div key={r.id} className="callout-row">
                <input
                  title="Label"
                  value={r.label}
                  onChange={(e) => setRow(r.id, { label: e.target.value })}
                />
                {r.kind === "text" ? (
                  <input
                    title="Value"
                    value={r.value}
                    placeholder="value"
                    onChange={(e) => setRow(r.id, { value: e.target.value })}
                  />
                ) : (
                  <span className="muted" title="Follows the arrow point">
                    {(r.kind === "e" ? c.e : c.n).toFixed(1)}
                  </span>
                )}
                <input
                  className="suffix-in"
                  title="Suffix after the value"
                  value={r.suffix}
                  list="callout-suffixes"
                  onChange={(e) => setRow(r.id, { suffix: e.target.value })}
                />
                <button
                  type="button"
                  className="link"
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => setRows((rs) => swap(rs, i, i - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="link"
                  title="Remove this line"
                  onClick={() =>
                    setRows((rs) => rs.filter((x) => x.id !== r.id))
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <datalist id="callout-suffixes">
              <option value="m" />
              <option value=" m" />
              <option value="°G" />
              <option value="°" />
              <option value="°T" />
              <option value="" />
            </datalist>
          </div>
          <div className="style-row">
            <select
              value=""
              onChange={(e) => {
                const k = e.target.value as CalloutRow["kind"];
                if (k) setRows((rs) => [...rs, newRow(k)]);
              }}
            >
              <option value="">Add a line…</option>
              <option value="e">Easting</option>
              <option value="n">Northing</option>
              <option value="text">Text (heading, depth…)</option>
            </select>
          </div>
          <FontPick
            value={c.font}
            sheetFont={useEditor.getState().template?.fontFamily}
            onChange={(f) => set({ font: f })}
          />
          <div className="row2">
            <Field
              label="Text height"
              type="number"
              step={0.1}
              suffix="mm"
              value={c.size}
              onCommit={(v) => num(v) > 0 && set({ size: num(v) })}
            />
            <Field
              label="Box width"
              type="number"
              suffix="mm"
              value={c.w}
              onCommit={(v) => num(v) > 5 && set({ w: num(v) })}
            />
          </div>
          <div className="row2">
            <Field
              label="Box height (empty = fit the lines)"
              type="number"
              suffix="mm"
              value={c.h ?? ""}
              onCommit={(v) =>
                v.trim() === ""
                  ? set({ h: undefined })
                  : num(v) > 3 && set({ h: num(v) })
              }
            />
          </div>
          <div className="colour-grid">
            {(
              [
                ["Title text", "titleColor"],
                ["Title background", "titleFill"],
                ["Text", "textColor"],
                ["Background", "fill"],
                ["Border", "border"],
                ["Arrow", "arrow"],
              ] as const
            ).map(([label, k]) => (
              <label key={k} className="field">
                <span>{label}</span>
                <ColourBox value={c[k]} onChange={(v) => set({ [k]: v })} />
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PlanStyleEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const st = planStyle(p);
  const set = (patch: Partial<PlanStyle>) =>
    s.updatePanel(p.id, { plan: { ...st, ...patch } });
  type ColourKey = {
    [K in keyof PlanStyle]-?: PlanStyle[K] extends string ? K : never;
  }[keyof PlanStyle];
  type NumberKey = {
    [K in keyof PlanStyle]-?: PlanStyle[K] extends number ? K : never;
  }[keyof PlanStyle];
  const colour = (label: string, key: ColourKey) => (
    <label className="field">
      <span>{label}</span>
      <ColourBox value={st[key]} onChange={(c) => set({ [key]: c })} />
    </label>
  );
  const size = (label: string, key: NumberKey, suffix = "mm", step = 0.1) => (
    <Field
      label={label}
      type="number"
      step={step}
      suffix={suffix}
      value={st[key]}
      onCommit={(v) => num(v) >= 0 && set({ [key]: num(v) })}
    />
  );
  return (
    <>
      <p className="hint">
        Runline and As Built colours and widths are set under Data above.
      </p>
      <h4>Matchlines</h4>
      <MatchlineControls
        st={{ ...DEFAULT_MATCHLINES, ...st.match }}
        onChange={(m) => set({ match: { ...st.match, ...m } })}
      />
      <h4>KP blocks</h4>
      <label className="check">
        <input
          type="checkbox"
          checked={st.showKp}
          onChange={(e) => set({ showKp: e.target.checked })}
        />{" "}
        Show KP blocks
      </label>
      <div className="row2">
        {size("Interval (0 = scale ÷ 10)", "kpInterval", "m", 50)}
        {size("Block size", "kpBlockSize")}
      </div>
      <Field
        label="Block rotation"
        type="number"
        step={5}
        suffix="°"
        value={st.kpRotation}
        onCommit={(v) => Number.isFinite(num(v)) && set({ kpRotation: num(v) })}
      />
      <div className="row2">
        {size("Stem length", "kpStem")}
        {size("Text height", "kpTextSize")}
      </div>
      <div className="row2">
        {colour("Block colour", "kpColor")}
        {colour("Block fill", "kpFill")}
      </div>
      {colour("Text colour", "kpTextColor")}
      <h4>Easting / northing grid</h4>
      <label className="check">
        <input
          type="checkbox"
          checked={st.showGrid}
          onChange={(e) => set({ showGrid: e.target.checked })}
        />{" "}
        Show grid
      </label>
      {size("Grid spacing (0 = auto)", "gridSpacing", "m", 100)}
      <div className="row2">
        {size("Text height", "gridTextSize")}
        {colour("Text colour", "gridTextColor")}
      </div>
      <div className="row2">
        {size("Cross size", "crossSize")}
        {colour("Cross colour", "crossColor")}
      </div>
      <div className="row2">
        {size("Tick length", "tickSize")}
        {colour("Tick colour", "tickColor")}
      </div>
      <p className="hint">
        Labels that would overlap another label or run off the frame are left
        out.
      </p>
      <h4>North arrow</h4>
      <label className="check">
        <input
          type="checkbox"
          checked={st.showNorth}
          onChange={(e) => set({ showNorth: e.target.checked })}
        />{" "}
        Show north arrow (drag it on the sheet to move it)
      </label>
      <div className="row2">
        {size("Size", "northSize")}
        {colour("Colour", "northColor")}
      </div>
    </>
  );
}

/** Imported files drawn in panels of this type, with show/hide, colour and remove. */
/** Codes in an events file that no row of the events panel takes, so the user can add them to a row. */
function UnplacedCodes({
  d,
  rows,
}: {
  d: Extract<Dataset, { kind: "events" }>;
  rows: EventRow[];
}) {
  const matchers = rows
    .filter((r) => !isKpRow(r))
    .map((r) => codeMatcher(rowCodes(r)));
  const codes = [...new Set(d.records.map((e) => e.code.toUpperCase()))].filter(
    (c) => !matchers.some((m) => m(c)),
  );
  if (!codes.length) return null;
  return (
    <p className="hint warn">
      Not in any row: {codes.join(", ")}. Add them to a row’s codes in the
      events panel.
    </p>
  );
}

function DataList({ panelType }: { panelType?: string }) {
  const datasets = useSurvey((x) => x.datasets);
  const events = useEditor((x) =>
    x.template?.panels.find((p) => p.type === "events"),
  );
  const targets = TARGETS.filter((t) =>
    panelType ? t.panelType === panelType : t.key !== "logo",
  );
  if (!targets.length) return null;
  const mine = datasets.filter((d) => targets.some((t) => t.key === d.target));
  return (
    <>
      <h4>Data</h4>
      {mine.length === 0 && <p className="hint">Nothing imported here yet.</p>}
      <ul className="data-list">
        {mine.map((d) => (
          <DataEntry key={d.id} d={d} events={events} />
        ))}
      </ul>
      <button onClick={() => useImport.getState().request([], panelType)}>
        Import data…
      </button>
    </>
  );
}

const kmText = (m: number) => (m / 1000).toFixed(3);

/** Every imported CP reading with its KP, in a folding list. */
function CpReadings({ d }: { d: Extract<Dataset, { kind: "cp" }> }) {
  const [all, setAll] = useState(false);
  const pts = pointsOf(d);
  const n = pts.length;
  const last = all ? n : Math.min(n, 50);
  const sv = useSurvey.getState();
  // Edits keep the reading's place in the list; the data behind the chart is re-sorted by KP.
  const save = (next: CpPoint[]) =>
    sv.updateDataset(d.id, pointsPatch(next, d.notes ?? []));
  const edit = (i: number, patch: Partial<CpPoint>) =>
    save(pts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const order = pts.map((_, i) => i).sort((a, b) => pts[a].kp - pts[b].kp);
  return (
    <details className="layer-list">
      <summary>Readings ({n.toLocaleString()})</summary>
      <p className="hint">
        Edit the KP (km) or the mV; double-click the panel on the sheet to move
        readings and add text.
      </p>
      <table className="mini-table">
        <thead>
          <tr>
            <th>KP (km)</th>
            <th>mV</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {order.slice(0, last).map((i) => (
            <tr key={i}>
              <td>
                <input
                  key={`k${pts[i].kp}`}
                  className="cell-input"
                  defaultValue={(pts[i].kp / 1000).toFixed(3)}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value.replace(",", "."));
                    if (
                      Number.isFinite(v) &&
                      Math.abs(v * 1000 - pts[i].kp) > 1e-6
                    )
                      edit(i, { kp: v * 1000 });
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.target as HTMLInputElement).blur()
                  }
                />
              </td>
              <td>
                <input
                  key={`m${pts[i].mv}`}
                  className="cell-input"
                  defaultValue={pts[i].mv}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value.replace(",", "."));
                    if (Number.isFinite(v) && v !== pts[i].mv)
                      edit(i, { mv: v });
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.target as HTMLInputElement).blur()
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="link"
                  title="Remove this reading"
                  onClick={() => save(pts.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {n > last && (
        <button type="button" className="link" onClick={() => setAll(true)}>
          Show all {n.toLocaleString()}
        </button>
      )}
      <button
        type="button"
        onClick={() =>
          save([
            ...pts,
            {
              kp: (pts[pts.length - 1]?.kp ?? 0) + 100,
              mv: pts[pts.length - 1]?.mv ?? -1000,
            },
          ])
        }
      >
        Add a reading
      </button>
    </details>
  );
}

/** Every imported event, grouped by code, each group folding open to its KPs. */
function EventList({ d }: { d: Extract<Dataset, { kind: "events" }> }) {
  const groups = new Map<string, typeof d.records>();
  for (const r of d.records) {
    const k = r.code.toUpperCase();
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const codes = [...groups.keys()].sort();
  return (
    <details className="layer-list">
      <summary>
        Events ({d.records.length.toLocaleString()} in {codes.length} codes)
      </summary>
      {codes.map((c) => {
        const rs = [...groups.get(c)!].sort((a, b) => a.kp - b.kp);
        return (
          <details key={c} className="layer-list">
            <summary>
              {c} <span className="muted">{rs.length}</span>
            </summary>
            <ul className="event-kps">
              {rs.slice(0, 200).map((r, i) => (
                <li key={i}>
                  KP {kmText(r.kp)}
                  {r.value ? <span className="muted"> · {r.value}</span> : null}
                </li>
              ))}
              {rs.length > 200 && (
                <li className="muted">… and {rs.length - 200} more</li>
              )}
            </ul>
          </details>
        );
      })}
    </details>
  );
}

/** One imported dataset in the properties list: a caret folds its settings away. */
function DataEntry({ d, events }: { d: Dataset; events?: Panel }) {
  const sv = useSurvey.getState();
  // The as-built line is greyed out when the runline is a copy of it: the runline entry is the one to use.
  const copied = useSurvey(
    (s) =>
      d.target === "asbuilt" &&
      s.datasets.some(
        (x) => x.kind === "route" && /\(survey line as runline\)$/.test(x.name),
      ),
  );
  const [open, setOpen] = useState(!copied);
  return (
    <li
      className={"data-entry" + (copied ? " greyed" : "")}
      title={
        copied
          ? "The runline is made from this survey line: set its look in the runline entry"
          : undefined
      }
    >
      <fieldset className="plain" disabled={copied}>
        <div className="data-row">
          <button
            type="button"
            className="link caret"
            title={open ? "Fold the settings away" : "Show the settings"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "▾" : "▸"}
          </button>
          <input
            type="checkbox"
            checked={d.visible && !copied}
            title="Show"
            onChange={(e) =>
              sv.updateDataset(d.id, { visible: e.target.checked })
            }
          />
          <span className="fname" title={d.name}>
            {d.name}
          </span>
          <button
            className="link"
            title="Remove"
            onClick={() => {
              sv.removeDataset(d.id);
              // Its file is not read again by itself.
              datasetRemoved(useProject.getState().active, d.name);
            }}
          >
            ×
          </button>
        </div>
        <div className="data-meta">
          {copied && "Used as the runline · "}
          {targetInfo(d.target).label}
          {d.kind === "route" && ` · ${(d.route.length / 1000).toFixed(3)} km`}
          {d.kind === "linework" &&
            ` · ${d.lw.lines.length.toLocaleString()} lines, ${d.lw.texts.length.toLocaleString()} texts`}
          {d.kind === "long" && ` · ${d.kp.length.toLocaleString()} rows`}
          {d.kind === "trans" && ` · ${d.kp.length.toLocaleString()} profiles`}
          {d.kind === "events" && ` · ${d.records.length} events`}
          {d.kind === "cp" && ` · ${d.kp.length} readings`}
        </div>
        {open && (
          <>
            {d.kind === "linework" && <DrawingLook d={d} />}
            {d.kind === "linework" && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!d.both}
                  onChange={(e) =>
                    sv.updateDataset(d.id, { both: e.target.checked })
                  }
                />
                {d.target === "plan"
                  ? "Also show in the key plan"
                  : "Also show in the plan view"}
              </label>
            )}
            <StyleControls
              target={d.target}
              style={styleOf(d)}
              seriesNames={
                d.kind === "long"
                  ? d.series
                      .filter((_, i) => i !== d.top && i !== d.bop)
                      .map((x) => x.name)
                  : []
              }
              onChange={(patch) =>
                sv.updateDataset(
                  d.id,
                  applyStyle(d, { ...styleOf(d), ...patch }),
                )
              }
            />
            {d.kind === "long" && (
              <div className="checks">
                {d.series.map((se, i) => (
                  <div key={i} className="series-row">
                    <ColourBox
                      value={se.color}
                      onChange={(c) =>
                        sv.updateDataset(d.id, {
                          series: d.series.map((x, j) =>
                            j === i ? { ...x, color: c } : x,
                          ),
                        })
                      }
                    />
                    <DraftNumber
                      step={1}
                      min={0}
                      className="small-num"
                      title="Line width (mm)"
                      placeholder={String(
                        i === d.top || i === d.bop
                          ? (d.opts?.pipeWidth ?? 0.3)
                          : (d.opts?.lineWidth ?? 0.2),
                      )}
                      value={se.width ?? ""}
                      onCommit={(v) =>
                        sv.updateDataset(d.id, {
                          series: d.series.map((x, j) =>
                            j === i
                              ? { ...x, width: v > 0 ? v : undefined }
                              : x,
                          ),
                        })
                      }
                    />
                    <span className="muted">mm</span>
                    <span className="series-name">{se.name}</span>
                  </div>
                ))}
              </div>
            )}
            {d.kind === "long" && d.top !== undefined && <LongSmooth d={d} />}
            {d.kind === "events" && (
              <>
                <LinksEditor
                  links={d.links}
                  onChange={(links) => sv.updateDataset(d.id, { links })}
                  codes={[
                    ...new Set(d.records.map((r) => r.code.toUpperCase())),
                  ].sort()}
                />
                {events && <UnplacedCodes d={d} rows={events.rows ?? []} />}
              </>
            )}
            {d.kind === "trans" && (
              <>
                <label
                  className="check"
                  title="Draw the pipe as a true circle at the lateral scale, so the vertical scale does not make it oval"
                >
                  <input
                    type="checkbox"
                    checked={!!d.pipeRound}
                    onChange={(e) =>
                      sv.updateDataset(d.id, { pipeRound: e.target.checked })
                    }
                  />
                  Keep the pipe diameter ratio (round pipe)
                </label>
              </>
            )}
            {d.kind === "cp" && <CpReadings d={d} />}
            {d.kind === "events" && <EventList d={d} />}
            {d.kind === "cp" && (
              <label className="field">
                <span>Draw as</span>
                <select
                  value={d.style}
                  onChange={(e) =>
                    sv.updateDataset(d.id, {
                      style: e.target.value as "line" | "ticks",
                    })
                  }
                >
                  <option value="ticks">Ticks with readings</option>
                  <option value="line">Line (gradient CP)</option>
                </select>
              </label>
            )}
          </>
        )}
      </fieldset>
    </li>
  );
}
