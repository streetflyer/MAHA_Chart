import { create } from "zustand";
import { useMemo, useState } from "react";
import { newId } from "../model/ids";
import {
  MARKER_SHAPES,
  enColumns,
  newPointSet,
  plotPoints,
  type ColFilter,
  type PointSet,
} from "../model/pointSets";
import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";
import { ColourBox } from "./ColourBox";

/** The "Add to plan view" window: a new point set, or one being edited. */
export const usePointSetDialog = create<{
  draft: PointSet | null;
  cols: string[];
  isNew: boolean;
  openNew(
    source: string,
    filters: Record<string, ColFilter>,
    skip: string[],
    cols: string[],
  ): void;
  edit(set: PointSet): void;
  close(): void;
}>((set) => ({
  draft: null,
  cols: [],
  isNew: true,
  openNew: (source, filters, skip, cols) => {
    const s = newPointSet(newId("pts"), source);
    s.filters = filters;
    s.skip = skip;
    // A useful start: the code, or the first column after KP.
    const code = cols.findIndex((c) => /code/i.test(c));
    s.label.cols = [cols[code >= 0 ? code : Math.min(1, cols.length - 1)]];
    const vf = filters[cols[code]]?.values;
    s.name = vf?.length === 1 ? vf[0] : source.replace(/\.[^.]+$/, "");
    set({ draft: s, cols, isNew: true });
  },
  edit: (s) => {
    const d = useSurvey
      .getState()
      .datasets.find((x) => x.kind === "events" && x.name === s.source);
    const cols =
      d?.kind === "events"
        ? ["KP (km)", ...(d.columns?.length ? d.columns : ["Code", "Value"])]
        : [];
    set({ draft: structuredClone(s), cols, isNew: false });
  },
  close: () => set({ draft: null }),
}));

const planPanel = () =>
  useEditor.getState().template?.panels.find((p) => p.type === "plan");

export function PointSetDialog() {
  const draft = usePointSetDialog((s) => s.draft);
  return draft ? <Inner key={draft.id} init={draft} /> : null;
}

function Inner({ init }: { init: PointSet }) {
  const { cols, isNew, close } = usePointSetDialog.getState();
  const [s, setS] = useState(init);
  const up = (patch: Partial<PointSet>) => setS((x) => ({ ...x, ...patch }));
  const upLabel = (patch: Partial<PointSet["label"]>) =>
    setS((x) => ({ ...x, label: { ...x.label, ...patch } }));
  const route = useSurvey((x) => x.route);
  const datasets = useSurvey((x) => x.datasets);
  const t = useEditor((x) => x.template);
  const k0 = (parseFloat(t?.fields.START_KP ?? "0") || 0) * 1000;
  const d = datasets.find((x) => x.kind === "events" && x.name === s.source);
  const plot = useMemo(
    () =>
      d?.kind === "events"
        ? plotPoints(s, d, route, k0)
        : { points: [], byKp: 0 },
    [s, d, route, k0],
  );
  const hasEN = !!enColumns(cols);
  const save = () => {
    const p = planPanel();
    if (!p) return close();
    const list = p.pointSets ?? [];
    useEditor.getState().updatePanel(p.id, {
      pointSets: isNew
        ? [...list, s]
        : list.map((x) => (x.id === s.id ? s : x)),
    });
    close();
  };
  const toggleCol = (c: string, on: boolean) =>
    upLabel({
      cols: on ? [...s.label.cols, c] : s.label.cols.filter((x) => x !== c),
    });
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="dialog point-set-dialog"
        role="dialog"
        aria-label="Add to plan view"
        data-point-set-dialog
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") close();
        }}
      >
        <h3>{isNew ? "Add to plan view" : "Points in the plan view"}</h3>
        {!planPanel() && <p className="warn">This chart has no plan view.</p>}
        {(!hasEN || plot.byKp > 0) && (
          <p className="warn" data-kp-warning>
            {hasEN
              ? `${plot.byKp} of the rows have no Easting / Northing: they are placed on the survey line at their KP.`
              : "This listing has no Easting / Northing columns: the points are placed on the survey line at their KP, so points off the line (debris, structures) show in the wrong place."}
            {!route && " Load the survey line first."}
          </p>
        )}
        <div className="psd-grid">
          <label>
            Name (legend text)
            <input
              value={s.name}
              onChange={(e) => up({ name: e.target.value })}
            />
          </label>
          <div className="psd-row">
            <span>Symbol</span>
            <div className="psd-shapes">
              {MARKER_SHAPES.map(([k, l]) => (
                <button
                  type="button"
                  key={k}
                  data-shape={k}
                  aria-pressed={s.shape === k}
                  onClick={() => up({ shape: k })}
                  title={l}
                >
                  <svg width="22" height="22" viewBox="-6 -6 12 12">
                    <ShapeIcon shape={k} />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <label>
            Size (mm)
            <input
              type="number"
              step={0.2}
              min={0.4}
              value={s.size}
              onChange={(e) =>
                up({ size: Math.max(0.4, +e.target.value || 2) })
              }
            />
          </label>
          <label>
            Line width (mm)
            <input
              type="number"
              step={0.05}
              min={0.05}
              value={s.width}
              onChange={(e) =>
                up({ width: Math.max(0.05, +e.target.value || 0.25) })
              }
            />
          </label>
          <div className="psd-row">
            <span>Colour</span>
            <ColourBox value={s.color} onChange={(c) => up({ color: c })} />
          </div>
          <label>
            Fill
            <select
              value={s.fill}
              onChange={(e) => up({ fill: e.target.value as PointSet["fill"] })}
            >
              <option value="none">None</option>
              <option value="solid">Solid</option>
              <option value="hatch">Hatch</option>
            </select>
          </label>
          {s.fill !== "none" && (
            <div className="psd-row">
              <span>Fill colour</span>
              <ColourBox
                value={s.fillColor ?? s.color}
                onChange={(c) => up({ fillColor: c })}
              />
            </div>
          )}
          <label className="psd-check">
            <input
              type="checkbox"
              checked={s.keyplan}
              onChange={(e) => up({ keyplan: e.target.checked })}
            />
            Show in the key plan too
          </label>
        </div>
        <h4>Description</h4>
        <label className="psd-check">
          <input
            type="checkbox"
            checked={s.label.show}
            onChange={(e) => upLabel({ show: e.target.checked })}
          />
          Write a description by each point
        </label>
        {s.label.show && (
          <>
            <p className="hint">
              Tick the columns to use, in the order you want them.
            </p>
            <div className="psd-cols">
              {cols.map((c) => {
                const n = s.label.cols.indexOf(c);
                return (
                  <label key={c}>
                    <input
                      type="checkbox"
                      data-label-col={c}
                      checked={n >= 0}
                      onChange={(e) => toggleCol(c, e.target.checked)}
                    />
                    {n >= 0 && <b>{n + 1}.</b>} {c}
                  </label>
                );
              })}
            </div>
            <div className="psd-grid">
              <label>
                Own text before
                <input
                  value={s.label.before}
                  data-label-before
                  onChange={(e) => upLabel({ before: e.target.value })}
                />
              </label>
              <label>
                Own text after
                <input
                  value={s.label.after}
                  onChange={(e) => upLabel({ after: e.target.value })}
                />
              </label>
              <label>
                Between columns
                <select
                  value={s.label.sep}
                  onChange={(e) => upLabel({ sep: e.target.value })}
                >
                  <option value=" ">Space</option>
                  <option value=", ">Comma</option>
                  <option value=" - ">Dash</option>
                  <option value={"\n"}>New line</option>
                </select>
              </label>
              <label>
                Text height (mm)
                <input
                  type="number"
                  step={0.1}
                  min={0.5}
                  value={s.label.size}
                  onChange={(e) =>
                    upLabel({ size: Math.max(0.5, +e.target.value || 1.6) })
                  }
                />
              </label>
              <div className="psd-row">
                <span>Text colour</span>
                <ColourBox
                  value={s.label.color}
                  onChange={(c) => upLabel({ color: c })}
                />
              </div>
            </div>
          </>
        )}
        <div className="psd-preview">
          <svg width="44" height="44" viewBox="-6 -6 12 12">
            <ShapeIcon
              shape={s.shape}
              color={s.color}
              fill={s.fill === "none" ? "none" : (s.fillColor ?? s.color)}
            />
          </svg>
          <span data-label-preview style={{ whiteSpace: "pre-line" }}>
            {s.label.show ? plot.points[0]?.text || "(no description)" : ""}
          </span>
          <span className="hint">{plot.points.length} points</span>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            data-point-set-ok
            onClick={save}
          >
            {isNew ? "Add to plan view" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShapeIcon({
  shape,
  color = "currentColor",
  fill = "none",
}: {
  shape: PointSet["shape"];
  color?: string;
  fill?: string;
}) {
  const st = { stroke: color, strokeWidth: 1, fill };
  switch (shape) {
    case "circle":
      return <circle r={4} style={st} />;
    case "square":
      return <rect x={-4} y={-4} width={8} height={8} style={st} />;
    case "triangle":
      return <polygon points="0,-4.5 4.3,3.2 -4.3,3.2" style={st} />;
    case "x":
      return <path d="M-4 -4L4 4M-4 4L4 -4" style={{ ...st, fill: "none" }} />;
    case "plus":
      return (
        <path d="M-4.5 0H4.5M0 -4.5V4.5" style={{ ...st, fill: "none" }} />
      );
  }
}
