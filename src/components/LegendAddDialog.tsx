import { useState } from "react";
import { mergeShapes } from "../model/legendShape";
import type { LegendItem } from "../model/types";
import { useLegendAdd } from "../state/legendAdd";
import { useEditor } from "../state/store";

/**
 * Add the chosen drawing objects to legend items that exist already (right-click in drawing edit mode):
 * tick the items, optionally give them a new name, and the objects become part of each item's symbol.
 */
export function LegendAddDialog() {
  const shape = useLegendAdd((s) => s.shape);
  return shape ? <Inner /> : null;
}

function Inner() {
  const { shape, chart, close } = useLegendAdd();
  const legend = useEditor((s) =>
    s.template?.panels.find((p) => p.type === "legend"),
  );
  const items = (legend?.legend ?? []).filter(
    (x) =>
      x.symbol === "drawing" &&
      x.shape &&
      (x.chart === undefined || x.chart === chart),
  );
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  if (!shape || !legend) return null;
  const chosen = items.filter((x) => ticked[x.id]);
  const apply = () => {
    if (!chosen.length) return;
    const ids = new Set(chosen.map((x) => x.id));
    useEditor.getState().updatePanel(legend.id, {
      legend: (legend.legend ?? []).map((x): LegendItem => {
        if (!ids.has(x.id) || !x.shape) return x;
        const m = mergeShapes(x.shape, shape);
        return {
          ...x,
          shape: m.shape,
          size: Math.round((x.size ?? 6) * m.grow * 100) / 100,
          label: name.trim() || x.label,
        };
      }),
    });
    close();
  };
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-label="Add to existing legend"
        data-legend-add
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") close();
        }}
      >
        <h3>Add to existing legend</h3>
        {items.length ? (
          <>
            <p>
              Tick the legend items that get the chosen objects as part of their
              symbol:
            </p>
            <div className="checks">
              {items.map((x) => (
                <label className="check" key={x.id}>
                  <input
                    type="checkbox"
                    data-legend-add-item={x.id}
                    checked={!!ticked[x.id]}
                    onChange={(e) =>
                      setTicked({ ...ticked, [x.id]: e.target.checked })
                    }
                  />{" "}
                  {x.label}
                </label>
              ))}
            </div>
            <label className="field">
              <span>New name (blank keeps the name)</span>
              <input
                value={name}
                data-legend-add-name
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </>
        ) : (
          <p>
            This chart's legend has no drawing symbols yet. Use "Add to legend
            panel" first.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            data-legend-add-ok
            disabled={!chosen.length}
            onClick={apply}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
