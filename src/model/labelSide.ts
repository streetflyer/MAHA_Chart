import type { Panel } from "./types";

/** The panel as it is on chart `chart`: its description column on the side chosen for that chart. */
export function onChart(p: Panel, chart: number): Panel {
  const side = p.labelSides?.[chart] ?? p.labelSide;
  return side === p.labelSide ? p : { ...p, labelSide: side };
}
