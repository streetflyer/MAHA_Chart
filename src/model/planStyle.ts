import type { Panel, PlanStyle } from "./types";

export const DEFAULT_PLAN: PlanStyle = {
  routeColor: "#e00000",
  routeWidth: 0.5,
  dxfColor: "#8a8a8a",
  showKp: true,
  kpInterval: 0,
  kpRotation: 0,
  kpColor: "#e00000",
  kpFill: "#ffffff",
  kpTextColor: "#e00000",
  kpTextSize: 1.6,
  kpBlockSize: 10,
  kpStem: 10,
  showGrid: true,
  gridSpacing: 0,
  gridTextSize: 2,
  gridTextColor: "#3d6170",
  crossSize: 6,
  crossColor: "#3d6170",
  tickSize: 3,
  tickColor: "#3d6170",
  showNorth: true,
  northX: 0.96,
  northY: 0.22,
  northSize: 14,
  northColor: "#6b6b6b",
};

/** KP block spacing: the set interval, or a tenth of the scale (1:5,000 gives 500 m). */
export const kpInterval = (st: PlanStyle, scale: number) =>
  st.kpInterval > 0 ? st.kpInterval : Math.max(1, scale / 10);

export const planStyle = (p: Panel): PlanStyle => ({
  ...DEFAULT_PLAN,
  ...p.plan,
});

/**
 * KPs of the marks from `from` to `to` at the interval, with the line's end KP added
 * (the plan view puts a block there and every KP panel a grid line), in order.
 */
export function withLineEnd(
  from: number,
  to: number,
  interval: number,
  end: number,
): number[] {
  const out: number[] = [];
  for (let kp = from; kp <= to + 1e-6 && out.length < 400; kp += interval)
    out.push(kp);
  if (!out.some((k) => Math.abs(k - end) < 0.5)) {
    out.push(end);
    out.sort((a, b) => a - b);
  }
  return out;
}
