import type { Callout } from "./types";
import { newId } from "./ids";

export const newCallout = (e: number, n: number): Callout => ({
  id: newId(),
  title: "TIE-IN AT\nSTRUCTURE",
  e,
  n,
  heading: "",
  showEN: true,
  dx: 12,
  dy: -34,
  w: 56,
  h: 16,
  size: 2,
  titleColor: "#ffffff",
  titleFill: "#0b5aa6",
  textColor: "#555555",
  fill: "#ffffff",
  border: "#333333",
  arrow: "#000000",
});

/** 581247.66 → "581 247.7" (space between thousands, as on the charts). */
export function groupNumber(v: number, decimals = 1): string {
  const [i, f] = Math.abs(v).toFixed(decimals).split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${v < 0 ? "-" : ""}${g}${f ? "." + f : ""}`;
}

/** The label / value lines under the title band. */
export function calloutLines(c: Callout): [string, string][] {
  const out: [string, string][] = [];
  if (c.showEN) {
    out.push(["Easting", `${groupNumber(c.e)}m`]);
    out.push(["Northing", `${groupNumber(c.n)}m`]);
  }
  if (c.heading.trim()) out.push(["Heading", c.heading.trim()]);
  return out;
}

/** Where the leader leaves the box: the point of the box nearest the arrow point. */
export function leaderStart(
  box: { x: number; y: number; w: number; h: number },
  tx: number,
  ty: number,
): [number, number] {
  const cx = Math.min(box.x + box.w, Math.max(box.x, tx));
  const cy = Math.min(box.y + box.h, Math.max(box.y, ty));
  if (cx !== tx || cy !== ty) return [cx, cy];
  return [box.x + box.w / 2, box.y + box.h];
}
