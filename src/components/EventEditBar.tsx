import { useSurvey } from "../state/surveyData";
import { useEventEdit } from "../state/eventEdit";
import { resetEventPositions, undoEventLabels } from "./eventLabelEdit";

/** Floating tools while the codes of an Engineering Events panel are being edited. */
export function EventEditBar() {
  const active = useEventEdit((s) => s.active);
  const n = useEventEdit((s) => s.history.length);
  if (!active) return null;
  return (
    <div className="event-edit-bar" onPointerDown={(e) => e.stopPropagation()}>
      <span>Editing event codes</span>
      <button
        type="button"
        disabled={!n}
        title="Undo the last move or change of a code (Ctrl+Z)"
        onClick={() => undoEventLabels()}
      >
        Undo
      </button>
      <button
        type="button"
        title="Put every code of this panel back to its automatic position"
        onClick={() => {
          for (const d of useSurvey.getState().datasets)
            if (d.kind === "events") resetEventPositions(d.id);
        }}
      >
        Reset positions
      </button>
      <button type="button" onClick={() => useEventEdit.getState().exit()}>
        Done
      </button>
    </div>
  );
}
