import { useKeyplanView } from "../state/keyplanView";
import { keyplanFit } from "./Keyplan";
import { MODE_INFO, exitMode, useMode } from "../state/mode";

/**
 * Says which edit mode is on and how to leave it. The events mode has its own bar with
 * extra tools (EventEditBar), so this one covers the others.
 */
export function ModeBar() {
  const mode = useMode();
  if (mode === "idle" || mode === "events") return null;
  const info = MODE_INFO[mode];
  return (
    <div
      className="event-edit-bar mode-bar"
      role="status"
      title={info.hint}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span>{info.label}</span>
      <span className="mode-hint">Esc to finish</span>
      {mode === "keyview" && <KeyviewTools />}
      <button type="button" onClick={() => exitMode()}>
        Done
      </button>
    </div>
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
