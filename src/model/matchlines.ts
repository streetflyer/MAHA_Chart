import type { MatchlineStyle } from "./types";

export const DEFAULT_MATCHLINES: MatchlineStyle = {
  on: false,
  mode: "overlap",
  prefix: "",
  suffix: "",
  extra: "",
  color: "#d6249f",
  width: 0.35,
  dash: "4 1.5 0.8 1.5",
  textSize: 2.2,
  family: "Arial",
};

export interface MatchSpec {
  /** KP in metres. */
  kp: number;
  /** Which side of the line the other chart lies on along the route: -1 lower KP, +1 higher KP. */
  side: -1 | 1;
  /** Number (from 1) of the other chart, for the label. */
  chart: number;
}

/**
 * Matchlines for chart `index` given every chart's KP range (metres).
 * overlap: the end of the previous chart and the start of the next one, as they fall inside this chart.
 * profile: this chart's own start and end.
 */
export function matchSpecs(
  ranges: { start: number; end: number }[],
  index: number,
  mode: MatchlineStyle["mode"],
): MatchSpec[] {
  const out: MatchSpec[] = [];
  const me = ranges[index];
  const prev = ranges[index - 1];
  const next = ranges[index + 1];
  if (!me) return out;
  if (prev)
    out.push({
      kp: mode === "overlap" ? prev.end : me.start,
      side: -1,
      chart: index,
    });
  if (next)
    out.push({
      kp: mode === "overlap" ? next.start : me.end,
      side: 1,
      chart: index + 2,
    });
  return out;
}

export const matchLabel = (st: MatchlineStyle, chart: number) =>
  `${st.prefix}${String(chart).padStart(2, "0")}${st.suffix}`;
