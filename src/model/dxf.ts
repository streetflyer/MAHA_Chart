import { aciHex, trueHex } from "./aci";
import { robustBounds, type Bounds } from "./route";

/** Linework read from a DXF for use as a background (key plan, plan view). */
export interface Linework {
  name: string;
  /** Each polyline as interleaved x, y. */
  lines: Float64Array[];
  /** Layer of each polyline, same order as lines. */
  layers: string[];
  /** Colour each polyline has in the drawing ('#rrggbb'; '' = none given), same order as lines. */
  colors: string[];
  /** The drawing object each polyline belongs to (a block insert is one object), same order as lines. */
  groups: number[];
  texts: DxfText[];
  /** Layers of the drawing with their colour and how much is on them. */
  layerInfo: LayerInfo[];
  /** Extent of the bulk of the drawing, ignoring stray far-off entities. */
  bounds: Bounds;
}

export interface LayerInfo {
  name: string;
  /** The layer's own colour ('#rrggbb'). */
  color: string;
  /** Lines plus texts on it. */
  count: number;
  /** Off or frozen in the drawing. */
  off: boolean;
}

export interface DxfText {
  x: number;
  y: number;
  /** Height in drawing units (metres for survey drawings). */
  h: number;
  /** Degrees anticlockwise. */
  rot: number;
  text: string;
  align: "start" | "middle" | "end";
  layer: string;
  /** Colour in the drawing ('#rrggbb'; '' = none given). */
  color: string;
  /** The drawing object it belongs to. */
  group: number;
  /** Set by editing: this text's own look. */
  font?: string;
  bold?: boolean;
  italic?: boolean;
}

/** A Linework from plain polylines (survey lines read from a listing). */
export function plainLinework(
  name: string,
  lines: Float64Array[],
  bounds: Bounds,
  layer = "0",
): Linework {
  return {
    name,
    lines,
    layers: lines.map(() => layer),
    colors: lines.map(() => ""),
    groups: lines.map((_, i) => i),
    texts: [],
    layerInfo: [{ name: layer, color: "", count: lines.length, off: false }],
    bounds,
  };
}

/** MTEXT keeps formatting codes inline; keep only the words. */
function plainMtext(s: string): string {
  return s
    .replace(/\\P/g, "\n")
    .replace(/\\[A-Za-z][^;\\]*;/g, "")
    .replace(/\\[A-Za-z]/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[dD]/g, "°")
    .replace(/%%[pP]/g, "±")
    .replace(/%%[cC]/g, "Ø");
}

interface Ent {
  type: string;
  /** Group code / value pairs in file order (repeats kept: vertices, fit points). */
  g: [number, string][];
  /** POLYLINE vertices or INSERT attributes that follow the entity. */
  kids: Ent[];
}

/** 2D affine map: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Xf = [number, number, number, number, number, number];
const IDENT: Xf = [1, 0, 0, 1, 0, 0];
const apply = (m: Xf, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const mul = (m: Xf, n: Xf): Xf => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const num = (e: Ent, code: number, dflt = NaN) => {
  const v = e.g.find((p) => p[0] === code);
  return v ? parseFloat(v[1]) : dflt;
};
const str = (e: Ent, code: number) => e.g.find((p) => p[0] === code)?.[1];

/** Points of an arc from a polyline bulge (tan of a quarter of the included angle). */
function bulgePts(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  b: number,
  out: number[],
) {
  const th = 4 * Math.atan(b);
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (!d || Math.abs(th) < 1e-9) return;
  const r = d / (2 * Math.sin(th / 2));
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const h = r * Math.cos(th / 2);
  // Centre sits to the left of the chord for a positive (anticlockwise) bulge.
  const cx = mx - (h * (y2 - y1)) / d;
  const cy = my + (h * (x2 - x1)) / d;
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  const n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 24)));
  for (let k = 1; k < n; k++) {
    const a = a0 + (th * k) / n;
    out.push(cx + Math.abs(r) * Math.cos(a), cy + Math.abs(r) * Math.sin(a));
  }
}

/** Vertices of a polyline with its bulges turned into arc points. */
function bulged(vs: [number, number, number][], closed: boolean): number[] {
  const out: number[] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const [x, y, b] = vs[i];
    out.push(x, y);
    const next = i + 1 < n ? vs[i + 1] : closed ? vs[0] : null;
    if (next && b) bulgePts(x, y, next[0], next[1], b, out);
  }
  if (closed && n > 1) out.push(vs[0][0], vs[0][1]);
  return out;
}

interface LayerDef {
  color: string;
  off: boolean;
}

/** Read the group pairs of the BLOCKS and ENTITIES sections into entities, and the layer table. */
function readEntities(text: string): {
  entities: Ent[];
  blocks: Map<string, { base: [number, number]; ents: Ent[] }>;
  layerDefs: Map<string, LayerDef>;
} {
  const rows = text.split(/\r?\n/);
  const entities: Ent[] = [];
  const blocks = new Map<string, { base: [number, number]; ents: Ent[] }>();
  const layerDefs = new Map<string, LayerDef>();
  let section = "";
  let block: { name: string; base: [number, number]; ents: Ent[] } | null =
    null;
  let cur: Ent | null = null;
  let parent: Ent | null = null;
  const close = () => {
    if (!cur) return;
    const t = cur.type;
    if (section === "TABLES" && t === "LAYER") {
      const c = num(cur, 62, 7);
      const tc = num(cur, 420);
      layerDefs.set(str(cur, 2) ?? "0", {
        color: Number.isFinite(tc) ? trueHex(tc) : aciHex(Math.abs(c) || 7),
        off: c < 0 || (num(cur, 70, 0) & 1) === 1,
      });
    } else if (section === "BLOCKS" && t === "BLOCK") {
      block = {
        name: str(cur, 2) ?? "",
        base: [num(cur, 10, 0), num(cur, 20, 0)],
        ents: [],
      };
    } else if (section === "BLOCKS" && t === "ENDBLK") {
      if (block) blocks.set(block.name, { base: block.base, ents: block.ents });
      block = null;
    } else if (t === "VERTEX" || t === "ATTRIB") {
      parent?.kids.push(cur);
    } else if (t === "SEQEND") {
      parent = null;
    } else {
      const list =
        section === "BLOCKS"
          ? block?.ents
          : section === "ENTITIES"
            ? entities
            : undefined;
      list?.push(cur);
      // POLYLINE vertices and INSERT attributes follow their owner until SEQEND.
      parent =
        t === "POLYLINE" || (t === "INSERT" && num(cur, 66, 0) === 1)
          ? cur
          : null;
    }
    cur = null;
  };
  for (let i = 0; i < rows.length - 1; i += 2) {
    const code = parseInt(rows[i].trim(), 10);
    const value = rows[i + 1].trim();
    if (code === 0) {
      close();
      if (value === "SECTION") {
        section = rows[i + 3]?.trim() ?? "";
        i += 2;
        continue;
      }
      if (value === "ENDSEC") {
        section = "";
        continue;
      }
      if (value === "EOF") break;
      if (
        section === "BLOCKS" ||
        section === "ENTITIES" ||
        (section === "TABLES" && value === "LAYER")
      )
        cur = { type: value, g: [], kids: [] };
      continue;
    }
    if (cur && Number.isFinite(code)) cur.g.push([code, value]);
  }
  close();
  return { entities, blocks, layerDefs };
}

/**
 * Read an ASCII DXF as linework: LINE, LWPOLYLINE / POLYLINE (with arcs from
 * bulges), CIRCLE, ARC, ELLIPSE, SPLINE, SOLID / TRACE / 3DFACE outlines, LEADER,
 * TEXT, MTEXT and block attributes, with every block INSERT (and the blocks behind
 * DIMENSIONs) drawn in place at its scale and rotation. Nothing is simplified, so
 * small symbols and short lines keep their shape. Hatches are left out.
 */
export function parseDxfLinework(text: string, name: string): Linework | null {
  const { entities, blocks, layerDefs } = readEntities(text);
  const lines: Float64Array[] = [];
  const layers: string[] = [];
  const colors: string[] = [];
  const groups: number[] = [];
  const texts: DxfText[] = [];
  // The drawing object being read: every line and text of it carries this number.
  let group = 0;

  const layerColor = (layer: string) => layerDefs.get(layer)?.color ?? "";
  /** Colour of an entity: its own (index or true colour), its layer's, or its block insert's. */
  const colorOf = (e: Ent, layer: string, inherit: string): string => {
    const tc = num(e, 420);
    if (Number.isFinite(tc)) return trueHex(tc);
    const c = num(e, 62);
    if (!Number.isFinite(c) || c === 256) return layerColor(layer);
    if (c === 0) return inherit || layerColor(layer);
    return aciHex(Math.abs(c));
  };

  const pushPts = (pts: number[], m: Xf, layer: string, color: string) => {
    if (pts.length < 4) return;
    const out = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
      const [x, y] = apply(m, pts[i], pts[i + 1]);
      out[i] = x;
      out[i + 1] = y;
    }
    lines.push(out);
    layers.push(layer);
    colors.push(color);
    groups.push(group);
  };
  const scaleOf = (m: Xf) =>
    Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const angleOf = (m: Xf) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;

  const addText = (e: Ent, m: Xf, layer: string, color: string) => {
    const t = e.type;
    let s =
      t === "MTEXT"
        ? e.g
            .filter((p) => p[0] === 3 || p[0] === 1)
            .map((p) => p[1])
            .join("")
        : (str(e, 1) ?? "");
    if (!s.trim()) return;
    if (t === "ATTRIB" && (num(e, 70, 0) & 1) === 1) return; // invisible attribute
    let x0 = num(e, 10, 0);
    let y0 = num(e, 20, 0);
    let align: DxfText["align"] = "start";
    if (t === "MTEXT") {
      const col = ((num(e, 71, 1) || 1) - 1) % 3;
      align = col === 1 ? "middle" : col === 2 ? "end" : "start";
      s = plainMtext(s);
    } else {
      const h72 = num(e, 72, 0);
      if (h72 && Number.isFinite(num(e, 11))) {
        x0 = num(e, 11);
        y0 = num(e, 21);
      }
      align = h72 === 1 || h72 === 4 ? "middle" : h72 === 2 ? "end" : "start";
      s = s
        .replace(/%%[dD]/g, "°")
        .replace(/%%[pP]/g, "±")
        .replace(/%%[cC]/g, "Ø")
        .replace(/%%[uUoO]/g, "");
    }
    const rot =
      t === "MTEXT" && Number.isFinite(num(e, 11))
        ? (Math.atan2(num(e, 21, 0), num(e, 11)) * 180) / Math.PI
        : num(e, 50, 0);
    const [x, y] = apply(m, x0, y0);
    texts.push({
      x,
      y,
      h: num(e, 40, 1) * scaleOf(m),
      rot: rot + angleOf(m),
      text: s,
      align,
      layer,
      color,
      group,
    });
  };

  const draw = (
    e: Ent,
    m: Xf,
    inherit: string,
    depth: number,
    inheritColor: string,
  ) => {
    const own = str(e, 8) ?? "0";
    const layer = own === "0" && inherit ? inherit : own;
    const color = colorOf(e, layer, inheritColor);
    switch (e.type) {
      case "LINE":
        pushPts(
          [num(e, 10, 0), num(e, 20, 0), num(e, 11, 0), num(e, 21, 0)],
          m,
          layer,
          color,
        );
        break;
      case "LWPOLYLINE": {
        const vs: [number, number, number][] = [];
        for (const [c, v] of e.g) {
          if (c === 10) vs.push([parseFloat(v), 0, 0]);
          else if (c === 20 && vs.length) vs[vs.length - 1][1] = parseFloat(v);
          else if (c === 42 && vs.length) vs[vs.length - 1][2] = parseFloat(v);
        }
        pushPts(bulged(vs, (num(e, 70, 0) & 1) === 1), m, layer, color);
        break;
      }
      case "POLYLINE": {
        const flags = num(e, 70, 0);
        if (flags & (16 | 64)) break; // polygon meshes and polyface meshes
        const vs = e.kids
          .filter((k) => k.type === "VERTEX")
          .map((k): [number, number, number] => [
            num(k, 10, 0),
            num(k, 20, 0),
            num(k, 42, 0),
          ]);
        pushPts(bulged(vs, (flags & 1) === 1), m, layer, color);
        break;
      }
      case "CIRCLE":
      case "ARC": {
        const r = num(e, 40, 0);
        if (!(r > 0)) break;
        const a0 = e.type === "ARC" ? (num(e, 50, 0) * Math.PI) / 180 : 0;
        let a1 =
          e.type === "ARC" ? (num(e, 51, 0) * Math.PI) / 180 : Math.PI * 2;
        if (a1 <= a0) a1 += Math.PI * 2;
        const n = Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 72));
        const p: number[] = [];
        for (let k = 0; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n;
          p.push(
            num(e, 10, 0) + r * Math.cos(a),
            num(e, 20, 0) + r * Math.sin(a),
          );
        }
        pushPts(p, m, layer, color);
        break;
      }
      case "ELLIPSE": {
        const cx = num(e, 10, 0);
        const cy = num(e, 20, 0);
        const mx = num(e, 11, 0);
        const my = num(e, 21, 0);
        const ratio = num(e, 40, 1);
        const t0 = num(e, 41, 0);
        let t1 = num(e, 42, Math.PI * 2);
        if (t1 <= t0) t1 += Math.PI * 2;
        const n = Math.max(8, Math.ceil(((t1 - t0) / (Math.PI * 2)) * 72));
        const p: number[] = [];
        for (let k = 0; k <= n; k++) {
          const t = t0 + ((t1 - t0) * k) / n;
          const c = Math.cos(t);
          const s = Math.sin(t) * ratio;
          p.push(cx + mx * c - my * s, cy + my * c + mx * s);
        }
        pushPts(p, m, layer, color);
        break;
      }
      case "SPLINE": {
        // Fit points when there are any (the curve passes through them), else the control frame.
        const fit: number[] = [];
        const ctl: number[] = [];
        let pend = NaN;
        let into: number[] = ctl;
        for (const [c, v] of e.g) {
          if (c === 10 || c === 11) {
            into = c === 10 ? ctl : fit;
            pend = parseFloat(v);
          } else if ((c === 20 || c === 21) && Number.isFinite(pend)) {
            into.push(pend, parseFloat(v));
            pend = NaN;
          }
        }
        pushPts(fit.length >= 4 ? fit : ctl, m, layer, color);
        break;
      }
      case "LEADER": {
        const p: number[] = [];
        let pend = NaN;
        for (const [c, v] of e.g) {
          if (c === 10) pend = parseFloat(v);
          else if (c === 20 && Number.isFinite(pend)) {
            p.push(pend, parseFloat(v));
            pend = NaN;
          }
        }
        pushPts(p, m, layer, color);
        break;
      }
      case "SOLID":
      case "TRACE":
      case "3DFACE": {
        const c = [10, 11, 12, 13]
          .map((k) => [num(e, k, NaN), num(e, k + 10, NaN)])
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
        // SOLID corners run 1-2-4-3.
        const order =
          e.type === "3DFACE"
            ? c
            : [c[0], c[1], c[3] ?? c[2], c[2]].filter(Boolean);
        pushPts([...order.flat(), ...order[0]], m, layer, color);
        break;
      }
      case "TEXT":
      case "MTEXT":
      case "ATTRIB":
        addText(e, m, layer, color);
        break;
      case "INSERT":
      case "DIMENSION": {
        const b = blocks.get(str(e, 2) ?? "");
        if (b && depth < 8) {
          const sx = e.type === "INSERT" ? num(e, 41, 1) : 1;
          const sy = e.type === "INSERT" ? num(e, 42, sx) : 1;
          const r = e.type === "INSERT" ? (num(e, 50, 0) * Math.PI) / 180 : 0;
          const ix = e.type === "INSERT" ? num(e, 10, 0) : 0;
          const iy = e.type === "INSERT" ? num(e, 20, 0) : 0;
          const cols = e.type === "INSERT" ? Math.max(1, num(e, 70, 1)) : 1;
          const rws = e.type === "INSERT" ? Math.max(1, num(e, 71, 1)) : 1;
          for (let ci = 0; ci < Math.min(cols, 50); ci++)
            for (let ri = 0; ri < Math.min(rws, 50); ri++) {
              const ox = ci * num(e, 44, 0);
              const oy = ri * num(e, 45, 0);
              const cos = Math.cos(r);
              const sin = Math.sin(r);
              // Block base point to origin, scale, array offset, rotate, then to the insertion point.
              const local: Xf = [
                sx * cos,
                sx * sin,
                -sy * sin,
                sy * cos,
                ix +
                  ox * cos -
                  oy * sin -
                  (b.base[0] * sx * cos - b.base[1] * sy * sin),
                iy +
                  ox * sin +
                  oy * cos -
                  (b.base[0] * sx * sin + b.base[1] * sy * cos),
              ];
              const mm = mul(m, local);
              for (const k of b.ents) draw(k, mm, layer, depth + 1, color);
            }
        }
        // Attributes are already placed in drawing coordinates.
        for (const k of e.kids)
          if (k.type === "ATTRIB")
            addText(
              k,
              m,
              str(k, 8) ?? layer,
              colorOf(k, str(k, 8) ?? layer, color),
            );
        break;
      }
    }
  };

  for (const e of entities) {
    draw(e, IDENT, "", 0, "");
    group++;
  }
  if (!lines.length && !texts.length) return null;
  const extent = lines.length
    ? lines
    : [new Float64Array(texts.flatMap((t) => [t.x, t.y]))];
  // Every layer that has something on it, plus the drawing's own empty ones left out.
  const count = new Map<string, number>();
  for (const l of layers) count.set(l, (count.get(l) ?? 0) + 1);
  for (const t of texts) count.set(t.layer, (count.get(t.layer) ?? 0) + 1);
  const layerInfo: LayerInfo[] = [...count.entries()]
    .map(([n, c]) => ({
      name: n,
      color: layerColor(n),
      count: c,
      off: layerDefs.get(n)?.off ?? false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return {
    name,
    lines,
    layers,
    colors,
    groups,
    texts,
    layerInfo,
    bounds: robustBounds(extent),
  };
}
