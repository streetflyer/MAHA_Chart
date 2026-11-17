import { LEGEND_SYMBOLS } from "../model/presets";
import type { LegendItem, SymbolLook } from "../model/types";
import { useSymbolEdit } from "../state/symbolEdit";
import { useEditor } from "../state/store";
import { ColourBox } from "./ColourBox";
import { LegendSymbolView, useLegendItems } from "./PanelContent";

const DASHES: [string, string][] = [
  ["Solid", ""],
  ["Dashed", "2 1"],
  ["Long dash", "4 1.5"],
  ["Dotted", "0.4 0.8"],
  ["Dash-dot", "3 1 0.5 1"],
];
const LINE_SYMBOLS = new Set([
  "line",
  "thinLine",
  "dashed",
  "dashedThick",
  "doubleLine",
  "matchline",
]);

/**
 * The window of a legend symbol (double-click it in the legend): shape, colour, line style,
 * size, turn and, for burial and freespan lines, the bold bar's place, colour and pattern.
 * A line built from the imported data keeps its changes under its data key.
 */
export function SymbolDialog() {
  const target = useSymbolEdit((s) => s.target);
  return target ? (
    <Inner key={`${target.panelId}|${target.itemId}`} {...target} />
  ) : null;
}

function Inner({ panelId, itemId }: { panelId: string; itemId: string }) {
  const close = useSymbolEdit((s) => s.close);
  const panel = useEditor((s) =>
    s.template?.panels.find((p) => p.id === panelId),
  );
  const { items } = useLegendItems(panel!);
  const it = items.find((x) => x.id === itemId);
  if (!panel || !it) return null;
  const isData = itemId.startsWith("data:");
  const key = itemId.slice(5);
  const patch = (look: Partial<SymbolLook>) => {
    const ed = useEditor.getState();
    if (isData) {
      const ld = panel.legendData ?? { on: true, overrides: {} };
      const next = { ...ld.overrides[key], ...look };
      for (const k of Object.keys(next) as (keyof typeof next)[])
        if (next[k] === undefined) delete next[k];
      ed.updatePanel(panelId, {
        legendData: { ...ld, overrides: { ...ld.overrides, [key]: next } },
      });
    } else
      ed.updatePanel(panelId, {
        legend: (panel.legend ?? []).map((x) =>
          x.id === itemId ? ({ ...x, ...look } as LegendItem) : x,
        ),
      });
  };
  const reset = () => {
    const ed = useEditor.getState();
    if (!isData) return;
    const ld = panel.legendData ?? { on: true, overrides: {} };
    const { label, hidden } = ld.overrides[key] ?? {};
    ed.updatePanel(panelId, {
      legendData: {
        ...ld,
        overrides: { ...ld.overrides, [key]: { label, hidden } },
      },
    });
  };
  const drawing = it.symbol === "drawing";
  const bar = it.symbol === "burial" || it.symbol === "freespan";
  const num = (v: string) => (v === "" ? undefined : Number(v));
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="dialog symbol-dialog"
        role="dialog"
        aria-label="Legend symbol"
        data-symbol-dialog
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || e.key === "Enter") close();
        }}
      >
        <h3>Legend symbol</h3>
        <svg
          className="sym-preview"
          viewBox="-14 -9 28 18"
          width="168"
          height="108"
        >
          <rect x={-14} y={-9} width={28} height={18} fill="#fff" />
          <LegendSymbolView it={it} x={-8} cy={0} w={16} tokens={{}} />
        </svg>
        <p className="hint">{it.label}</p>
        {!drawing && (
          <label className="field">
            <span>Shape</span>
            <select
              data-sym-shape
              value={it.symbol}
              onChange={(e) =>
                patch({ symbol: e.target.value as LegendItem["symbol"] })
              }
            >
              {Object.entries(LEGEND_SYMBOLS)
                .filter(([k]) => k !== "drawing")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="row2">
          <label className="field">
            <span>
              {drawing ? "Colour (when not the drawing's)" : "Colour"}
            </span>
            <ColourBox
              value={it.color}
              onChange={(c) =>
                patch(drawing ? { color: c, keepColours: false } : { color: c })
              }
            />
          </label>
          {(it.symbol === "pipeBand" || it.symbol === "seabedProfile") && (
            <label className="field">
              <span>Fill</span>
              <ColourBox
                value={it.fill ?? "#6b6b6b"}
                onChange={(c) => patch({ fill: c })}
              />
            </label>
          )}
        </div>
        <div className="row2">
          <label className="field">
            <span>{drawing ? "Size (mm)" : "Size (%)"}</span>
            <input
              type="number"
              data-sym-size
              min={drawing ? 1 : 20}
              step={drawing ? 0.5 : 10}
              defaultValue={
                drawing ? (it.size ?? 6) : Math.round((it.scale ?? 1) * 100)
              }
              onBlur={(e) => {
                const v = num(e.target.value);
                if (v && v > 0)
                  patch(drawing ? { size: v } : { scale: v / 100 });
              }}
            />
          </label>
          <label className="field">
            <span>Turn (°)</span>
            <input
              type="number"
              step={15}
              defaultValue={it.rot ?? 0}
              onBlur={(e) => patch({ rot: num(e.target.value) || undefined })}
            />
          </label>
        </div>
        <div className="row2">
          <label className="field">
            <span>Line width (mm, 0 = standard)</span>
            <input
              type="number"
              min={0}
              step={0.05}
              defaultValue={it.lineWidth ?? 0}
              onBlur={(e) => {
                const v = num(e.target.value);
                patch({ lineWidth: v && v > 0 ? v : undefined });
              }}
            />
          </label>
          {(LINE_SYMBOLS.has(it.symbol) || bar) && (
            <label className="field">
              <span>Line style</span>
              <select
                value={it.dash === undefined ? "default" : it.dash}
                onChange={(e) =>
                  patch({
                    dash:
                      e.target.value === "default" ? undefined : e.target.value,
                  })
                }
              >
                <option value="default">Standard</option>
                {DASHES.map(([n, d]) => (
                  <option key={n} value={d}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {bar && (
          <>
            <h4>Thick bar</h4>
            <div className="row2">
              <label className="field">
                <span>Place</span>
                <select
                  data-sym-barpos
                  value={
                    it.boldPos ?? (it.symbol === "burial" ? "bottom" : "top")
                  }
                  onChange={(e) =>
                    patch({
                      boldPos: e.target.value as "top" | "middle" | "bottom",
                    })
                  }
                >
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <label className="field">
                <span>Colour</span>
                <ColourBox
                  value={it.boldColor ?? it.color}
                  onChange={(c) => patch({ boldColor: c })}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={!!it.boldDash}
                onChange={(e) => patch({ boldDash: e.target.checked })}
              />
              Dashed bar
            </label>
          </>
        )}
        <div className="dialog-actions">
          {isData && (
            <button type="button" onClick={reset}>
              Back to the standard look
            </button>
          )}
          <button type="button" className="primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
