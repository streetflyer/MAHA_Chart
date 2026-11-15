import type { Callout, CalloutRow } from "./types";
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
  rows: defaultRows(""),
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

export function defaultRows(heading: string): CalloutRow[] {
  return [
    { id: newId(), label: "Easting", kind: "e", value: "", suffix: "m" },
    { id: newId(), label: "Northing", kind: "n", value: "", suffix: "m" },
    {
      id: newId(),
      label: "Heading",
      kind: "text",
      value: heading,
      suffix: "°G",
    },
  ];
}

/** The box's lines (older boxes kept easting / northing / heading as switches). */
export function rowsOf(c: Callout): CalloutRow[] {
  if (c.rows) return c.rows;
  const h = c.heading.trim().replace(/\s*°\s*G$/i, "");
  return defaultRows(h).filter((r) => (r.kind === "text" ? !!h : c.showEN));
}

export function rowValue(c: Callout, r: CalloutRow): string {
  if (r.kind === "e") return `${groupNumber(c.e)}${r.suffix}`;
  if (r.kind === "n") return `${groupNumber(c.n)}${r.suffix}`;
  return r.value.trim() ? `${r.value.trim()}${r.suffix}` : "";
}

/** The label / value lines under the title band, with the line's id. */
export function calloutLines(c: Callout): [string, string, string][] {
  return rowsOf(c).map((r) => [r.label, rowValue(c, r), r.id]);
}

/** Layout of a box: title band height, line height and the height it needs for every line. */
export function calloutLayout(c: Callout, fs: number) {
  const lh = fs * 1.2;
  const pad = c.size * 0.5;
  const titles = c.title.split("\n");
  const head = titles.length * lh + pad * 1.4;
  const lines = calloutLines(c);
  const need = head + (lines.length ? lines.length * lh + pad * 1.6 : 0);
  return { lh, pad, titles, head, lines, need };
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
