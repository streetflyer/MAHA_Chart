import { useState } from "react";
import {
  chartFields,
  clearChartField,
  setChartField,
} from "../model/chartText";
import { sheetCount } from "../model/scale";
import { templateTokens } from "../model/tokens";
import { useEditor } from "../state/store";

/** Filled in by the app; they can still be given a value for one chart. */
const AUTO: Record<string, string> = {
  KP_START: "KP where this chart's runline starts (plan view edge)",
  KP_END: "KP where this chart's runline ends (plan view edge)",
  CHART_NO: "Drawing number",
  REV: "Current revision (newest row of the revision table)",
  SHEET: "Chart number",
  NUM_CHARTS: "Number of charts",
  H_SCALE: "Horizontal scale",
  V_SCALE_LONG: "Vertical scale, longitudinal profile",
  V_SCALE_TRANS: "Vertical scale, transverse profile",
  L_SCALE_TRANS: "Lateral scale, transverse profile",
  KP_PER_SHEET: "KP length of a chart",
  PAPER: "Paper size",
  PLOT_SIZE: "Plot size",
};

/** Fields kept for the app's own use, not shown. */
const HIDDEN = new Set(["SURVEY_DATE_MANUAL"]);

/**
 * Every {PARAMETER} the chart's text can use, with its value for all charts and, beside
 * it, the value for one chart only. Typing in either column changes the chart at once.
 */
export function ParametersDialog({ onClose }: { onClose(): void }) {
  const t = useEditor((s) => s.template)!;
  const current = useEditor((s) => s.sheetIndex);
  const [chart, setChart] = useState(current);
  const [newKey, setNewKey] = useState("");
  const n = sheetCount(t);
  const i = Math.min(chart, n - 1);
  const tokens = templateTokens(t, i);
  const own = chartFields(t, i);
  const commit = useEditor.getState().commit;
  const typed = Object.keys(t.fields).filter((k) => !HIDDEN.has(k));
  const auto = Object.keys(AUTO).filter((k) => !typed.includes(k));
  const setAll = (k: string, v: string) =>
    v !== (t.fields[k] ?? "") &&
    commit((tt) => ({ ...tt, fields: { ...tt.fields, [k]: v } }));
  const setOwn = (k: string, v: string) => {
    if (v === (own[k] ?? "")) return;
    commit((tt) =>
      v === "" ? clearChartField(tt, i, k) : setChartField(tt, i, k, v, true),
    );
  };
  const box = (
    value: string,
    onCommit: (v: string) => void,
    placeholder = "",
    disabled = false,
  ) => (
    <input
      key={`${i}-${value}`}
      defaultValue={value}
      placeholder={placeholder}
      disabled={disabled}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") onClose();
      }}
    />
  );
  const row = (k: string, isAuto: boolean) => (
    <tr key={k} data-param={k}>
      <td className="pm-key" title={AUTO[k] ?? ""}>
        {`{${k}}`}
        {isAuto && <div className="pm-note">{AUTO[k]}</div>}
      </td>
      <td>
        {isAuto
          ? box(tokens[k] ?? "", () => undefined, "", true)
          : box(t.fields[k] ?? "", (v) => setAll(k, v))}
      </td>
      <td>{box(own[k] ?? "", (v) => setOwn(k, v), "same as all charts")}</td>
      <td>
        {!isAuto && (
          <button
            type="button"
            className="icon"
            title={`Remove {${k}}`}
            onClick={() =>
              commit((tt) => {
                const fields = { ...tt.fields };
                delete fields[k];
                return { ...tt, fields };
              })
            }
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="dialog params-dialog"
        role="dialog"
        aria-label="Parameters"
      >
        <h3>Parameters</h3>
        <p className="hint">
          Text on the chart uses these as {"{NAME}"}, e.g. {"{TITLE}"} in the
          title box. A value in the right column is used on that chart only.
        </p>
        <label className="field pm-chart">
          <span>Chart</span>
          <select value={i} onChange={(e) => setChart(Number(e.target.value))}>
            {Array.from({ length: n }, (_, k) => (
              <option key={k} value={k}>
                Chart {k + 1}
              </option>
            ))}
          </select>
        </label>
        <div className="pm-table">
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>All charts</th>
                <th>Chart {i + 1} only</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {typed.map((k) => row(k, false))}
              <tr>
                <td colSpan={4} className="pm-sep">
                  Filled in automatically
                </td>
              </tr>
              {auto.map((k) => row(k, true))}
            </tbody>
          </table>
        </div>
        <div className="add-field">
          <input
            placeholder="NEW_PARAMETER"
            value={newKey}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              setNewKey(
                e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
              )
            }
          />
          <button
            type="button"
            disabled={!newKey || newKey in t.fields || newKey in AUTO}
            onClick={() => {
              commit((tt) => ({
                ...tt,
                fields: { ...tt.fields, [newKey]: "" },
              }));
              setNewKey("");
            }}
          >
            Add parameter
          </button>
        </div>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
