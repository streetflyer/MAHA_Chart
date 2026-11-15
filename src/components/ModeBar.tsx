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
      <button type="button" onClick={() => exitMode()}>
        Done
      </button>
    </div>
  );
}
