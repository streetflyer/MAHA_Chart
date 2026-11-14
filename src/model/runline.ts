/**
 * NaviModel / NaviPac runlines.
 *
 * A .rlx file is a header line `"name"; segments; startKP; "Meter"` followed by
 * one segment per line: `E1; N1; E2; N2; KP1; KP2; radius; ?; type`, with KP in
 * km. Type 64 is a straight, 128 an arc whose signed radius turns clockwise when
 * positive. An .rlxp is XML holding one or more runlines, each with the same
 * text inside <RLXString>.
 */

export interface Runline {
  name: string;
  /** Interleaved easting, northing, arcs broken into short chords. */
  en: number[];
  /** KP in metres at each vertex. */
  kp: number[];
  /** Display colour from the file, if it gave one. */
  color?: string;
}

const ARC_STEP = 2; // metres between arc vertices

export function parseRlx(
  text: string,
  fallbackName = "Runline",
): Runline | null {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trimStart().startsWith("#"));
  let name = fallbackName;
  const en: number[] = [];
  const kp: number[] = [];
  for (const line of lines) {
    const f = line.split(";").map((s) => s.trim());
    if (f[0]?.startsWith('"')) {
      name = f[0].replace(/"/g, "") || name;
      continue;
    }
    const v = f.map(Number);
    if (v.length < 6 || v.slice(0, 6).some((x) => !Number.isFinite(x)))
      continue;
    const [e1, n1, e2, n2, k1, k2] = v;
    const radius = Number.isFinite(v[6]) ? v[6] : 0;
    const type = v[8];
    if (!en.length) {
      en.push(e1, n1);
      kp.push(k1 * 1000);
    }
    if (type === 128 && Math.abs(radius) > 0)
      arcPoints(e1, n1, e2, n2, k1 * 1000, k2 * 1000, radius, en, kp);
    en.push(e2, n2);
    kp.push(k2 * 1000);
  }
  return en.length >= 4 ? { name, en, kp } : null;
}

/** Vertices strictly between the ends of an arc segment. */
function arcPoints(
  e1: number,
  n1: number,
  e2: number,
  n2: number,
  k1: number,
  k2: number,
  radius: number,
  en: number[],
  kp: number[],
) {
  const dx = e2 - e1;
  const dy = n2 - n1;
  const c = Math.hypot(dx, dy);
  const r = Math.abs(radius);
  if (c === 0 || r < c / 2) return;
  const h = Math.sqrt(r * r - (c / 2) ** 2);
  // Clockwise arcs have their centre on the right of the chord.
  const side = radius > 0 ? 1 : -1;
  const cx = (e1 + e2) / 2 + (side * dy * h) / c;
  const cy = (n1 + n2) / 2 - (side * dx * h) / c;
  const a1 = Math.atan2(n1 - cy, e1 - cx);
  let sweep = Math.atan2(n2 - cy, e2 - cx) - a1;
  if (side > 0) while (sweep > 0) sweep -= 2 * Math.PI;
  else while (sweep < 0) sweep += 2 * Math.PI;
  const steps = Math.min(500, Math.floor((Math.abs(sweep) * r) / ARC_STEP));
  for (let i = 1; i < steps; i++) {
    const a = a1 + (sweep * i) / steps;
    en.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    kp.push(k1 + ((k2 - k1) * i) / steps);
  }
}

/** Every runline inside an .rlxp container. */
export function parseRlxp(xml: string): Runline[] {
  const out: Runline[] = [];
  for (const m of xml.matchAll(/<RUNLINE_ENTRY>([\s\S]*?)<\/RUNLINE_ENTRY>/g)) {
    const body = m[1];
    const s = /<RLXString>([\s\S]*?)<\/RLXString>/.exec(body)?.[1];
    if (!s) continue;
    const name = /<NAME>([\s\S]*?)<\/NAME>/.exec(body)?.[1]?.trim();
    const r = parseRlx(decodeXml(s), name || `Runline ${out.length + 1}`);
    if (!r) continue;
    if (name) r.name = name;
    const argb = /<Color>\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*<\/Color>/.exec(
      body,
    );
    if (argb)
      r.color =
        "#" +
        [argb[2], argb[3], argb[4]]
          .map((x) => Number(x).toString(16).padStart(2, "0"))
          .join("");
    out.push(r);
  }
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/**
 * Split a runline at KP 0: the charted line starts at KP 0, and whatever lies
 * before it (a platform approach) is returned separately so it can still be drawn.
 */
export function splitAtKp0(r: Runline): {
  line: number[];
  before: number[] | null;
} {
  const { en, kp } = r;
  if (kp[0] >= 0) return { line: en, before: null };
  let i = 0;
  while (i < kp.length && kp[i] < 0) i++;
  if (i >= kp.length) return { line: en, before: null };
  const t = kp[i] === kp[i - 1] ? 0 : (0 - kp[i - 1]) / (kp[i] - kp[i - 1]);
  const e0 = en[2 * i - 2] + (en[2 * i] - en[2 * i - 2]) * t;
  const n0 = en[2 * i - 1] + (en[2 * i + 1] - en[2 * i - 1]) * t;
  const before = [...en.slice(0, 2 * i), e0, n0];
  const line = t >= 1 ? en.slice(2 * i) : [e0, n0, ...en.slice(2 * i)];
  return { line, before };
}
