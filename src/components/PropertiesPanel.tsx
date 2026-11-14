import { pointsOf, pointsPatch } from "../model/cpEdit";
import type { CpPoint } from "../model/datasets";
import { DEFAULT_MATCHLINES } from "../model/matchlines";
import type { MatchlineStyle } from "../model/types";
import { ColourBox } from "./ColourBox";
import { useEffect, useState } from "react";
import { newId } from "../model/ids";
import { PAPER_SIZES } from "../model/paper";
import { formatScale, sheetCount } from "../model/scale";
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
import { TARGETS, targetInfo, type Dataset } from "../model/datasets";
import {
  codeMatcher,
  defaultRowCodes,
  isKpRow,
  rowCodes,
} from "../model/events";
import { useImport } from "./ImportDialog";
import { askCodes } from "./Dialog";
import {
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
} from "../model/legendData";
import { useLegendItems } from "./PanelContent";
import { keyplanStyle } from "./Keyplan";
import { planStyle } from "./PlanView";
import { DrawingEditPanel, DrawingLook } from "./DrawingProps";

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
  return (
    <aside className="props">
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
        <Field
          label={p.body2 !== undefined ? "Left column" : "Text"}
          multiline
          value={p.body}
          onCommit={(v) => set({ body: v })}
        />
      )}
      {p.body2 !== undefined && (
        <Field
          label="Right column"
          multiline
          value={p.body2}
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
      {p.type === "legend" && <LegendEditor p={p} />}
      {p.type === "plan" && <DrawingEditPanel panelId={p.id} when="idle" />}
      <DataList panelType={p.type} />
      {p.type === "keyplan" && <KeyplanEditor p={p} />}
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

function RowsEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const rows = p.rows ?? [];
  const setRows = (next: Panel["rows"]) => s.updatePanel(p.id, { rows: next });
  const patch = (id: string, change: Partial<EventRow>) =>
    setRows(rows.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const datasets = useSurvey((x) => x.datasets);
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
          <li key={r.id}>
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
                {r.textOnly && (
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
                {!r.textOnly && (
                  <button type="button" onClick={() => addCodes(r)}>
                    Add Events Code…
                  </button>
                )}
                {r.textOnly ? (
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
          <option value="chart">Only codes of the events on this chart</option>
        </select>
      </label>
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
      {ld.on && datasets.some((d) => d.kind === "events") && (
        <p className="hint">
          Event code definitions come from the imported events; untick “Build
          the legend from the imported data” to type your own.
        </p>
      )}
      <Field
        label="Event code definitions (code, Tab, description)"
        multiline
        value={p.eventCodes ?? ""}
        onCommit={(v) => s.updatePanel(p.id, { eventCodes: v })}
      />
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
      </div>
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
              step={0.05}
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
  const hScale = useEditor((x) => x.template?.scale.horizontal ?? 5000);
  const autoEvery = Math.max(1, hScale / 50);
  const sv = useSurvey.getState();
  const [open, setOpen] = useState(true);
  return (
    <li className="data-entry">
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
          checked={d.visible}
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
          onClick={() => sv.removeDataset(d.id)}
        >
          ×
        </button>
      </div>
      <div className="data-meta">
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
              sv.updateDataset(d.id, applyStyle(d, { ...styleOf(d), ...patch }))
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
                  <input
                    type="number"
                    className="small-num"
                    min={0.01}
                    step={0.05}
                    title="Line width (mm)"
                    placeholder={String(
                      i === d.top || i === d.bop
                        ? (d.opts?.pipeWidth ?? 0.3)
                        : (d.opts?.lineWidth ?? 0.2),
                    )}
                    value={se.width ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      sv.updateDataset(d.id, {
                        series: d.series.map((x, j) =>
                          j === i ? { ...x, width: v > 0 ? v : undefined } : x,
                        ),
                      });
                    }}
                  />
                  <span className="muted">mm</span>
                  <span className="series-name">{se.name}</span>
                </div>
              ))}
            </div>
          )}
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
              <Field
                label="KP interval of the profiles"
                type="number"
                step={10}
                suffix={`m (0 = auto: ${autoEvery} m)`}
                value={d.every}
                onCommit={(v) =>
                  num(v) >= 0 && sv.updateDataset(d.id, { every: num(v) })
                }
              />
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
    </li>
  );
}
