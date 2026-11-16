import { useState } from "react";
import { dataEventCodes, definitionSources } from "../model/legendData";
import type { CodeDefSpec } from "../model/types";
import { useCodeDefs } from "../state/codeDefs";
import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";

const CONNECTORS = [" - ", ", ", "; ", " ", " / ", ": "];

/**
 * Writes the legend's event code definitions from the columns of the imported events file:
 * pick one or more columns (in the order ticked), a prefix, a suffix, the connector between
 * them and, if wanted, text of your own. The preview shows the result for the first codes.
 */
export function CodeDefsDialog() {
  const panelId = useCodeDefs((s) => s.panelId);
  return panelId ? <Inner key={panelId} panelId={panelId} /> : null;
}

function Inner({ panelId }: { panelId: string }) {
  const close = useCodeDefs((s) => s.close);
  const panel = useEditor((s) =>
    s.template?.panels.find((p) => p.id === panelId),
  );
  const datasets = useSurvey((s) => s.datasets);
  const saved = panel?.legendStyle?.codeDef;
  const [spec, setSpec] = useState<CodeDefSpec>(
    saved ?? { parts: [], prefix: "", suffix: "", connector: " - " },
  );
  const [own, setOwn] = useState("");
  if (!panel) return null;
  const sources = definitionSources(datasets);
  const apply = (next: CodeDefSpec | undefined) => {
    const ed = useEditor.getState();
    ed.updatePanel(panelId, {
      legendStyle: {
        ...panel.legendStyle,
        codeDef: next,
      } as typeof panel.legendStyle,
    });
    close();
  };
  const toggle = (id: string) =>
    setSpec((s) => ({
      ...s,
      parts: s.parts.includes(id)
        ? s.parts.filter((x) => x !== id)
        : [...s.parts, id],
    }));
  const move = (i: number, d: number) =>
    setSpec((s) => {
      const parts = [...s.parts];
      const j = i + d;
      if (j < 0 || j >= parts.length) return s;
      [parts[i], parts[j]] = [parts[j], parts[i]];
      return { ...s, parts };
    });
  const nameOf = (id: string) =>
    id.startsWith("t:")
      ? `Text: “${id.slice(2)}”`
      : (sources.find((s) => s.id === id)?.name ?? id);
  const preview = dataEventCodes(datasets, undefined, undefined, spec)
    .split("\n")
    .filter(Boolean)
    .slice(0, 6);
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="dialog codedefs-dialog"
        role="dialog"
        aria-label="Event code definitions"
        data-codedefs
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") close();
        }}
      >
        <h3>Event code definitions</h3>
        <p className="hint">
          Tick the columns of the events file to write each definition from. The
          order ticked is the order written.
        </p>
        <div className="cd-cols">
          {sources.map((s) => (
            <label key={s.id} className="check" data-cdcol={s.id}>
              <input
                type="checkbox"
                checked={spec.parts.includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              <span>
                {s.name}
                {s.sample && (
                  <em className="cd-sample"> e.g. {s.sample.slice(0, 40)}</em>
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="cd-add">
          <input
            placeholder="Your own text, e.g. Engin.Feature"
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && own.trim()) {
                toggle(`t:${own.trim()}`);
                setOwn("");
              }
            }}
          />
          <button
            type="button"
            disabled={!own.trim()}
            onClick={() => {
              toggle(`t:${own.trim()}`);
              setOwn("");
            }}
          >
            Add text
          </button>
        </div>
        {spec.parts.length > 0 && (
          <ol className="cd-order" data-cdorder>
            {spec.parts.map((id, i) => (
              <li key={id}>
                <span>{nameOf(id)}</span>
                <button
                  type="button"
                  className="icon"
                  title="Earlier"
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon"
                  title="Later"
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon"
                  title="Remove"
                  onClick={() => toggle(id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="cd-fields">
          <label className="field">
            <span>Prefix</span>
            <input
              data-cdprefix
              value={spec.prefix}
              onChange={(e) => setSpec({ ...spec, prefix: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Connector</span>
            <input
              data-cdconn
              list="cd-connectors"
              value={spec.connector}
              onChange={(e) => setSpec({ ...spec, connector: e.target.value })}
            />
            <datalist id="cd-connectors">
              {CONNECTORS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Suffix</span>
            <input
              data-cdsuffix
              value={spec.suffix}
              onChange={(e) => setSpec({ ...spec, suffix: e.target.value })}
            />
          </label>
        </div>
        <div className="cd-preview" data-cdpreview>
          {spec.parts.length === 0 ? (
            <em>
              Nothing ticked: the definitions keep the file&apos;s value column.
            </em>
          ) : (
            preview.map((l) => <div key={l}>{l.replace("\t", "  →  ")}</div>)
          )}
        </div>
        <div className="dialog-actions">
          {saved && (
            <button type="button" onClick={() => apply(undefined)}>
              Back to the value column
            </button>
          )}
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            data-cdok
            onClick={() => apply(spec.parts.length ? spec : undefined)}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
