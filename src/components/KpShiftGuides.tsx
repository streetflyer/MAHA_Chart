import { useEditor } from "../state/store";
import { useKpShift } from "../state/kpShift";
import type { PanelType } from "../model/types";

export const KP_TYPES: PanelType[] = [
  "longProfile",
  "transProfile",
  "events",
  "cp",
];

/** The stop lines shown while a profile is moved sideways and sits on the plan view's start or end KP. Not printed. */
export function KpShiftGuides() {
  const guides = useKpShift((k) => k.guides);
  const panels = useEditor((s) => s.template?.panels);
  const kp = (panels ?? []).filter((p) => KP_TYPES.includes(p.type));
  if (!guides.length || !kp.length) return null;
  const y0 = Math.min(...kp.map((p) => p.y));
  const y1 = Math.max(...kp.map((p) => p.y + p.h));
  return (
    <g className="guide" pointerEvents="none" data-kp-stop={guides.length}>
      {guides.map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={y0}
          y2={y1}
          stroke="#ff2d95"
          strokeWidth={0.4}
          strokeDasharray="2 1"
        />
      ))}
    </g>
  );
}
