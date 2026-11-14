import { newId } from "./ids";

/** One line of the video log: which product, and when the video started and ended. */
export interface VideoRow {
  id: string;
  product: string;
  /** Local date and time, 'YYYY-MM-DDTHH:mm' (what a datetime-local box holds). */
  start: string;
  end: string;
  remarks: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const p2 = (n: number) => String(n).padStart(2, "0");

type Cell =
  | { k: "date"; y: number; m: number; d: number }
  | { k: "time"; min: number }
  | { k: "dt"; y: number; m: number; d: number; min: number }
  | { k: "text"; s: string };

/** Excel serial day (1900 system) to a calendar date. */
function fromSerial(n: number) {
  const ms = Math.round((n - 25569) * 86400000);
  const t = new Date(ms);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    min: Math.round((((n % 1) + 1) % 1) * 1440) % 1440,
  };
}

function classify(raw: string): Cell | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 20000 && n < 80000) {
      const x = fromSerial(n);
      return n % 1 > 1e-6
        ? { k: "dt", ...x }
        : { k: "date", y: x.y, m: x.m, d: x.d };
    }
    if (n > 0 && n < 1) return { k: "time", min: Math.round(n * 1440) % 1440 };
    return { k: "text", s };
  }
  let m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(s);
  if (m) {
    let h = Number(m[1]);
    if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
    return { k: "time", min: h * 60 + Number(m[2]) };
  }
  // Day first: 30/10/2026, 30-10-26, 30.10.2026 (optionally followed by a time).
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(
    s,
  );
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const base = { y, m: Number(m[2]), d: Number(m[1]) };
    return m[4]
      ? { k: "dt", ...base, min: Number(m[4]) * 60 + Number(m[5]) }
      : { k: "date", ...base };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) {
    const base = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    return m[4]
      ? { k: "dt", ...base, min: Number(m[4]) * 60 + Number(m[5]) }
      : { k: "date", ...base };
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const mi = MONTHS.findIndex((n) =>
      n.toLowerCase().startsWith(m![2].toLowerCase().slice(0, 3)),
    );
    if (mi >= 0)
      return { k: "date", y: Number(m[3]), m: mi + 1, d: Number(m[1]) };
  }
  return { k: "text", s };
}

const stamp = (y: number, mo: number, d: number, min: number) =>
  `${y}-${p2(mo)}-${p2(d)}T${p2(Math.floor(min / 60))}:${p2(min % 60)}`;

/**
 * Read a table like the survey log: product, start date, start time, end date, end time, remarks.
 * Rows are recognised by their dates, so header lines and notes are skipped.
 */
export function parseVideoRows(rows: string[][]): VideoRow[] {
  const out: VideoRow[] = [];
  for (const r of rows) {
    const cells = r.map(classify);
    const texts = cells.flatMap((c) => (c && c.k === "text" ? [c.s] : []));
    const stamps: string[] = [];
    let pendingDate: { y: number; m: number; d: number } | null = null;
    const flush = () => {
      if (pendingDate)
        stamps.push(stamp(pendingDate.y, pendingDate.m, pendingDate.d, 0));
      pendingDate = null;
    };
    for (const c of cells) {
      if (!c || c.k === "text") continue;
      if (c.k === "dt") {
        flush();
        stamps.push(stamp(c.y, c.m, c.d, c.min));
      } else if (c.k === "date") {
        flush();
        pendingDate = c;
      } else if (pendingDate) {
        stamps.push(stamp(pendingDate.y, pendingDate.m, pendingDate.d, c.min));
        pendingDate = null;
      }
    }
    flush();
    if (!texts.length || stamps.length < 2) continue;
    out.push({
      id: newId("v"),
      product: texts[0],
      start: stamps[0],
      end: stamps[1],
      remarks: texts.length > 1 ? texts[texts.length - 1] : "",
    });
  }
  return out;
}

/** The product's short name inside its description: "Umbilical UMB1" → "UMB1". */
export const productKey = (product: string) =>
  /\b([A-Za-z]{1,6}\d+[A-Za-z]?)\b/.exec(product)?.[1].toUpperCase() ??
  product.trim().toUpperCase();

export function productKeys(rows: VideoRow[]): string[] {
  return [...new Set(rows.map((r) => productKey(r.product)))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

/** Which product key appears in the text (drawing number, folder name...) as a whole word. */
export function productIn(rows: VideoRow[], context: string): string | null {
  const ctx = context.toUpperCase();
  for (const k of productKeys(rows)) {
    const re = new RegExp(
      `(^|[^A-Z0-9])${k.replace(/[^A-Z0-9]/g, "\\\\$&")}([^A-Z0-9]|$)`,
    );
    if (re.test(ctx)) return k;
  }
  return null;
}

const ms = (s: string) => new Date(s).getTime();

/**
 * The product's video periods: its lines in time order, with lines closer together than
 * `joinHours` (a stop for cargo between two runs) joined into one period.
 */
export function videoPeriods(
  rows: VideoRow[],
  key: string,
  joinHours = 12,
): { start: string; end: string }[] {
  const mine = rows
    .filter((r) => productKey(r.product) === key && r.start && r.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  const out: { start: string; end: string }[] = [];
  for (const r of mine) {
    const last = out[out.length - 1];
    if (last && ms(r.start) - ms(last.end) <= joinHours * 3600000) {
      if (r.end > last.end) last.end = r.end;
    } else out.push({ start: r.start, end: r.end });
  }
  return out;
}

/** "14 March 2025 14:14 PM", the way the charts of this job print it. */
export function formatStamp(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]} ${m[4]}:${m[5]} ${Number(m[4]) >= 12 ? "PM" : "AM"}`;
}

export const videoText = (r: { start: string; end: string }) =>
  `${formatStamp(r.start)} to ${formatStamp(r.end)}`;

/** "x to y", "x to y and z to w", "x to y, z to w, and u to v" for several periods. */
export function periodsText(periods: { start: string; end: string }[]): string {
  const t = periods.map(videoText);
  if (t.length <= 1) return t[0] ?? "";
  if (t.length === 2) return `${t[0]} and ${t[1]}`;
  return `${t.slice(0, -1).join(", ")}, and ${t[t.length - 1]}`;
}

/** The text a video row prints on its own: the periods of the product named in the drawing number or folder. */
export function autoVideoText(
  rows: VideoRow[],
  opts: {
    product?: string;
    drawingNo: string;
    folder: string;
    joinHours: number;
  },
): string {
  const keys = productKeys(rows);
  const key =
    opts.product ||
    productIn(rows, opts.drawingNo) ||
    productIn(rows, opts.folder) ||
    (keys.length === 1 ? keys[0] : null);
  return key ? periodsText(videoPeriods(rows, key, opts.joinHours)) : "";
}
