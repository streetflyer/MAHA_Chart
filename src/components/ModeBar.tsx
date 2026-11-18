import { useKeyplanView } from "../state/keyplanView";
import { keyplanFit } from "./Keyplan";
import { MODE_INFO, exitMode, useMode } from "../state/mode";
import { useScope } from "../state/scope";

/**
 * Says which edit mode is on and how to leave it. The events mode has its own bar with
 * extra tools (EventEditBar), so this one covers the others.
 */
export function ModeBar() {
  const mode = useMode();
  const scope = useScope((s) => s.scope);
  if (mode === "idle" || mode === "events") return null;
  const info = MODE_INFO[mode];
  return (
    <div
      className="event-edit-bar mode-bar"
      data-scope={scope}
      role="status"
      title={info.hint}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span>{info.label}</span>
      <span className="mode-hint">Esc to finish</span>
      {mode === "keyview" && <KeyviewTools />}
      <ScopeSwitch />
      <button type="button" onClick={() => exitMode()}>
        Done
      </button>
    </div>
  );
}

/** "Changes apply to: All charts (F8) | This chart only (F9)". */
export function ScopeSwitch() {
  const scope = useScope((s) => s.scope);
  const set = useScope((s) => s.set);
  return (
    <span className="scope-switch" role="group" aria-label="Changes apply to">
      <span>Changes apply to:</span>
      <button
        type="button"
        data-scope-btn="all"
        aria-pressed={scope === "all"}
        onClick={() => set("all")}
        title="F8"
      >
        All charts
      </button>
      <button
        type="button"
        data-scope-btn="chart"
        aria-pressed={scope === "chart"}
        onClick={() => set("chart")}
        title="F9"
      >
        This chart only
      </button>
    </span>
  );
}

/** Zoom-to-fit buttons of the key plan view mode. */
function KeyviewTools() {
  const id = useKeyplanView((s) => s.panelId);
  const fit = (whole: boolean) => id && keyplanFit.get(id)?.(whole);
  return (
    <>
      <button type="button" data-kv-fit="line" onClick={() => fit(false)}>
        Fit line and charts
      </button>
      <button type="button" data-kv-fit="whole" onClick={() => fit(true)}>
        Fit the whole map
      </button>
    </>
  );
}
