import type { MatchlineStyle } from "./types";

export const DEFAULT_MATCHLINES: MatchlineStyle = {
  on: false,
  mode: "overlap",
  prefix: "Matchline to ",
  suffix: "",
  extra: "",
  color: "#6b6b6b",
  width: 0.15,
  dash: "4 1.5 0.8 1.5",
  textSize: 2.5,
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

/** Drawing number of another chart: the sheet number after the last dot is replaced (…CH-002.001 → …CH-002.002). */
export function chartName(drawingNo: string, n: number): string {
  const no = drawingNo.trim();
  if (!no) return `Chart ${n}`;
  const m = /^(.*\.)(\d+)$/.exec(no);
  if (m) return m[1] + String(n).padStart(m[2].length, "0");
  return `${no}.${String(n).padStart(3, "0")}`;
}

export const matchLabel = (st: MatchlineStyle, chart: number, drawingNo = "") =>
  `${st.prefix}${chartName(drawingNo, chart)}${st.suffix}`;
