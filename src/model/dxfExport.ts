/**
 * Save the chart as an AutoCAD 2018 DXF (ASCII), in paper millimetres with the
 * origin at the sheet's bottom-left corner. It is written from the drawn sheet
 * itself, so what is on screen is what goes in the file: lines and polylines with
 * their dash pattern (a real linetype), line weight and true colour, outlines of
 * circles and curves, coloured fills and hatch patterns as HATCH objects, text as
 * TEXT, and logos as IMAGEs pointing at PNG files saved beside the DXF. Everything
 * clipped to a panel on screen is clipped to it in the file too.
 */

import { ACI } from "./aci";
import { DXF_TEMPLATE } from "./dxfTemplate";
import { clipPolygon } from "./matchlines";

type Pt = [number, number];
interface Clip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// --- AutoCAD colour index -------------------------------------------------------

function parseColour(c: string): [number, number, number, number] | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/**
 * Nearest colour index. Black (and near-black ink) is 7, which AutoCAD shows black
 * on white paper; white is 255 so it stays white. Greys only match the grey indices,
 * so a dark grey line doesn't turn dark red.
 */
function aci(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 60) return 7;
  if (min > 250) return 255;
  const cands =
    max - min < 24
      ? [8, 9, 250, 251, 252, 253, 254, 255]
      : Array.from({ length: 249 }, (_, i) => i + 1).filter(
          (i) => i !== 7 && i !== 8 && i !== 9,
        );
  let best = 7;
  let bd = Infinity;
  for (const i of cands) {
    const [R, G, B] = ACI[i];
    const d = 2 * (r - R) ** 2 + 4 * (g - G) ** 2 + 3 * (b - B) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// --- SVG path data ----------------------------------------------------------------

/** Subpaths of an SVG path as point lists, curves and arcs flattened. */
export function flattenPath(d: string): { pts: Pt[]; closed: boolean }[] {
  const toks =
    d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  let lc: Pt | null = null; // last control point for S / T
  let i = 0;
  const n = () => parseFloat(toks[i++]);
  const flush = (closed: boolean) => {
    if (cur.length > 1) out.push({ pts: cur, closed });
    cur = [];
  };
  const cubic = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ex: number,
    ey: number,
  ) => {
    const steps = 12;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      cur.push([
        u * u * u * x +
          3 * u * u * t * x1 +
          3 * u * t * t * x2 +
          t * t * t * ex,
        u * u * u * y +
          3 * u * u * t * y1 +
          3 * u * t * t * y2 +
          t * t * t * ey,
      ]);
    }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (C) {
      case "M": {
        flush(false);
        x = ox + n();
        y = oy + n();
        sx = x;
        sy = y;
        cur.push([x, y]);
        cmd = rel ? "l" : "L";
        lc = null;
        break;
      }
      case "L":
        x = ox + n();
        y = oy + n();
        cur.push([x, y]);
        lc = null;
        break;
      case "H":
        x = ox + n();
        cur.push([x, y]);
        lc = null;
        break;
      case "V":
        y = oy + n();
        cur.push([x, y]);
        lc = null;
        break;
      case "Z":
        if (cur.length) cur.push([sx, sy]);
        flush(true);
        x = sx;
        y = sy;
        cur.push([x, y]);
        lc = null;
        break;
      case "C": {
        const x1 = ox + n();
        const y1 = oy + n();
        const x2 = ox + n();
        const y2 = oy + n();
        const ex = ox + n();
        const ey = oy + n();
        cubic(x1, y1, x2, y2, ex, ey);
        lc = [x2, y2];
        x = ex;
        y = ey;
        break;
      }
      case "S": {
        const x1 = lc ? 2 * x - lc[0] : x;
        const y1 = lc ? 2 * y - lc[1] : y;
        const x2 = ox + n();
        const y2 = oy + n();
        const ex = ox + n();
        const ey = oy + n();
        cubic(x1, y1, x2, y2, ex, ey);
        lc = [x2, y2];
        x = ex;
        y = ey;
        break;
      }
      case "Q":
      case "T": {
        const qx: number = C === "Q" ? ox + n() : lc ? 2 * x - lc[0] : x;
        const qy: number = C === "Q" ? oy + n() : lc ? 2 * y - lc[1] : y;
        const ex = ox + n();
        const ey = oy + n();
        cubic(
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          ex + (2 / 3) * (qx - ex),
          ey + (2 / 3) * (qy - ey),
          ex,
          ey,
        );
        lc = [qx, qy];
        x = ex;
        y = ey;
        break;
      }
      case "A": {
        const rx = Math.abs(n());
        const ry = Math.abs(n());
        const phi = (n() * Math.PI) / 180;
        const large = n() !== 0;
        const sweep = n() !== 0;
        const ex = ox + n();
        const ey = oy + n();
        arcPoints(x, y, rx, ry, phi, large, sweep, ex, ey, cur);
        x = ex;
        y = ey;
        lc = null;
        break;
      }
      default:
        i++; // unknown token: skip it
    }
  }
  flush(false);
  return out;
}

/** SVG elliptical arc (endpoint form) as points, after the SVG spec's centre conversion. */
function arcPoints(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phi: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
  out: Pt[],
) {
  if (!rx || !ry) {
    out.push([x2, y2]);
    return;
  }
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 18)));
  for (let k = 1; k <= steps; k++) {
    const t = t1 + (dt * k) / steps;
    out.push([
      cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
      cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
    ]);
  }
}

// --- Clipping ---------------------------------------------------------------------

/** Pieces of a polyline inside an axis-aligned box (Liang–Barsky per segment). */
function clipPolyline(pts: Pt[], c: Clip): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  const end = () => {
    if (run.length > 1) out.push(run);
    run = [];
  };
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [p, q] of [
      [-dx, ax - c.x0],
      [dx, c.x1 - ax],
      [-dy, ay - c.y0],
      [dy, c.y1 - ay],
    ]) {
      if (p === 0) {
        if (q < 0) ok = false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!ok || t0 > t1) {
      end();
      continue;
    }
    const s: Pt = [ax + t0 * dx, ay + t0 * dy];
    const e: Pt = [ax + t1 * dx, ay + t1 * dy];
    if (!run.length || t0 > 0) {
      end();
      run.push(s);
    }
    run.push(e);
    if (t1 < 1) end();
  }
  end();
  return out;
}

// --- Writing ----------------------------------------------------------------------

/** How a DXF entity looks beyond its layer: colour (index and true colour), linetype, lineweight, see-through. */
export interface Look {
  aci: number;
  /** True colour 0xRRGGBB. */
  rgb?: number;
  /** Dash pattern in drawing units: dashes positive, gaps negative, 0 = dot. */
  dash?: number[];
  /** Line weight in mm (rounded to AutoCAD's list). */
  lw?: number;
  /** 0..1, 1 = solid. */
  alpha?: number;
}

/** A family of parallel hatch lines, in sheet coordinates (y down). */
export interface HatchFamily {
  /** Direction of the lines. */
  dir: Pt;
  /** A point the lines pass through. */
  base: Pt;
  /** Spacing between neighbouring lines, square to them. */
  gap: number;
  /** Dashes along each line (empty = continuous). */
  dash: number[];
}

const LINEWEIGHTS = [
  0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106,
  120, 140, 158, 200, 211,
];

type Pair = [number, string];

function templatePairs(): Pair[] {
  const l = DXF_TEMPLATE.split("\n");
  const out: Pair[] = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([Number(l[i]), l[i + 1]]);
  return out;
}

/**
 * Writes an AutoCAD 2018 DXF (AC1032, the newest DXF version): layers, real linetypes
 * for dashed lines, line weights and true colours, editable HATCH objects, and raster
 * images that point at picture files saved next to the DXF.
 */
class DxfWriter {
  private ents: Pair[] = [];
  readonly layers = new Map<string, number>();
  private ltypes = new Map<string, number[]>();
  readonly images: { name: string; data: Uint8Array }[] = [];
  private imageDefs: { name: string; def: string }[] = [];
  private seed: number;
  private msp: string;
  constructor(
    private readonly paperH: number,
    /** Real-world coordinates (y up) in metres, instead of paper mm with y flipped. */
    private readonly ground = false,
  ) {
    const t = templatePairs();
    const k = t.findIndex(([c, v]) => c === 9 && v === "$HANDSEED");
    this.seed = parseInt(t[k + 1][1], 16);
    // The model space block record owns every entity.
    let ms = "17";
    for (let i = 0; i < t.length; i++)
      if (t[i][0] === 2 && t[i][1] === "*Model_Space") {
        for (let j = i; j > 0 && !(t[j][0] === 0); j--)
          if (t[j][0] === 5) ms = t[j][1];
        break;
      }
    this.msp = ms;
  }
  private handle(): string {
    return (this.seed++).toString(16).toUpperCase();
  }
  private g(code: number, v: string | number, to: Pair[] = this.ents) {
    to.push([code, typeof v === "number" ? fmt(v) : v]);
  }
  private y(v: number) {
    return this.ground ? v : this.paperH - v;
  }
  private look(c: number | Look): Look {
    return typeof c === "number" ? { aci: c } : c;
  }
  private ltypeName(dash: number[]): string {
    const name =
      "MC_" + dash.map((d) => fmt(Math.abs(d)).replace(".", "p")).join("_");
    if (!this.ltypes.has(name)) this.ltypes.set(name, dash);
    return name;
  }
  private head(type: string, layer: string, color: number | Look, lt = true) {
    const l = this.look(color);
    this.g(0, type);
    this.g(5, this.handle());
    this.g(330, this.msp);
    this.g(100, "AcDbEntity");
    this.g(8, layer);
    if (!this.layers.has(layer)) this.layers.set(layer, 7);
    if (lt && l.dash?.length) this.g(6, this.ltypeName(l.dash));
    this.g(62, l.aci);
    if (l.lw !== undefined) {
      const want = l.lw * 100;
      let best = 0;
      for (const w of LINEWEIGHTS)
        if (Math.abs(w - want) < Math.abs(best - want)) best = w;
      this.g(370, best);
    }
    if (l.rgb !== undefined) this.g(420, String(l.rgb));
    if (l.alpha !== undefined && l.alpha < 0.999)
      this.g(440, String(0x02000000 | Math.round(255 * Math.max(0, l.alpha))));
  }
  polyline(
    pts: Pt[],
    layer: string,
    color: number | Look,
    closed = false,
    width = 0,
  ) {
    if (pts.length < 2) return;
    if (pts.length === 2 && !closed && !width) {
      this.head("LINE", layer, color);
      this.g(100, "AcDbLine");
      this.g(10, pts[0][0]);
      this.g(20, this.y(pts[0][1]));
      this.g(30, 0);
      this.g(11, pts[1][0]);
      this.g(21, this.y(pts[1][1]));
      this.g(31, 0);
      return;
    }
    this.head("LWPOLYLINE", layer, color);
    this.g(100, "AcDbPolyline");
    this.g(90, String(pts.length));
    // 128: the dash pattern runs on round the corners instead of restarting at each vertex.
    this.g(70, String((closed ? 1 : 0) | 128));
    if (width) this.g(43, width);
    for (const [x, y] of pts) {
      this.g(10, x);
      this.g(20, this.y(y));
    }
  }
  solid(p: Pt[], layer: string, color: number | Look) {
    this.head("SOLID", layer, color, false);
    this.g(100, "AcDbTrace");
    // SOLID corners go 1-2-4-3.
    const order = [p[0], p[1], p[3], p[2]];
    order.forEach(([x, y], k) => {
      this.g(10 + k, x);
      this.g(20 + k, this.y(y));
      this.g(30 + k, 0);
    });
  }
  /** A HATCH over closed rings: solid when `families` is empty, else lines. */
  hatch(
    rings: Pt[][],
    layer: string,
    color: number | Look,
    families: HatchFamily[] = [],
  ) {
    const rs = rings.filter((r) => r.length > 2);
    if (!rs.length) return;
    this.head("HATCH", layer, color, false);
    this.g(100, "AcDbHatch");
    this.g(10, 0);
    this.g(20, 0);
    this.g(30, 0);
    this.g(210, 0);
    this.g(220, 0);
    this.g(230, 1);
    const solid = !families.length;
    this.g(2, solid ? "SOLID" : "MC_HATCH");
    this.g(70, solid ? "1" : "0");
    this.g(71, "0");
    this.g(91, String(rs.length));
    for (const r of rs) {
      this.g(92, "3"); // external polyline boundary
      this.g(72, "0");
      this.g(73, "1");
      this.g(93, String(r.length));
      for (const [x, y] of r) {
        this.g(10, x);
        this.g(20, this.y(y));
      }
      this.g(97, "0");
    }
    this.g(75, "0");
    this.g(76, solid ? "1" : "2");
    if (!solid) {
      this.g(52, 0);
      this.g(41, 1);
      this.g(77, "0");
      this.g(78, String(families.length));
      for (const f of families) {
        const fy = this.ground ? 1 : -1;
        const d = Math.hypot(f.dir[0], f.dir[1]) || 1;
        const ux = f.dir[0] / d;
        const uy = (fy * f.dir[1]) / d;
        this.g(53, (Math.atan2(uy, ux) * 180) / Math.PI);
        this.g(43, f.base[0]);
        this.g(44, this.y(f.base[1]));
        // Offset to the next line, square to this one (stored turned, as AutoCAD keeps it).
        this.g(45, -uy * f.gap);
        this.g(46, ux * f.gap);
        this.g(79, String(f.dash.length));
        for (const x of f.dash) this.g(49, x);
      }
    }
    this.g(98, "0");
  }
  text(
    x: number,
    y: number,
    h: number,
    rot: number,
    s: string,
    layer: string,
    color: number | Look,
  ) {
    this.head("TEXT", layer, color, false);
    this.g(100, "AcDbText");
    this.g(10, x);
    this.g(20, this.y(y));
    this.g(30, 0);
    this.g(40, h);
    this.g(1, encodeText(s));
    if (Math.abs(rot) > 1e-6) this.g(50, rot);
    this.g(7, "Standard");
    this.g(100, "AcDbText");
  }
  /**
   * A picture, as AutoCAD keeps it: an IMAGE that points to a file next to the DXF.
   * `corner` is the picture's bottom-left on the sheet; `u` and `v` one pixel across and up.
   */
  image(
    name: string,
    data: Uint8Array,
    px: [number, number],
    corner: Pt,
    u: Pt,
    v: Pt,
    layer: string,
  ) {
    let def = this.imageDefs.find((d) => d.name === name)?.def;
    if (!def) {
      def = this.handle();
      this.imageDefs.push({ name, def });
      this.images.push({ name, data });
    }
    const reactor = this.handle();
    const fy = this.ground ? 1 : -1;
    this.head("IMAGE", layer, 7, false);
    this.g(100, "AcDbRasterImage");
    this.g(90, "0");
    this.g(10, corner[0]);
    this.g(20, this.y(corner[1]));
    this.g(30, 0);
    this.g(11, u[0]);
    this.g(21, fy * u[1]);
    this.g(31, 0);
    this.g(12, v[0]);
    this.g(22, fy * v[1]);
    this.g(32, 0);
    this.g(13, px[0]);
    this.g(23, px[1]);
    this.g(340, def);
    this.g(70, "3");
    this.g(280, "0");
    this.g(281, "50");
    this.g(282, "50");
    this.g(283, "0");
    this.g(360, reactor);
    this.g(71, "1");
    this.g(91, "2");
    this.g(14, -0.5);
    this.g(24, -0.5);
    this.g(14, px[0] - 0.5);
    this.g(24, px[1] - 0.5);
    this.g(290, "0");
    // The reactor ties the image to its definition.
    const imgHandle = this.lastEntityHandle();
    this.reactors.push({ reactor, image: imgHandle, def });
    this.pixels.set(def, px);
  }
  private reactors: { reactor: string; image: string; def: string }[] = [];
  private pixels = new Map<string, [number, number]>();
  private lastEntityHandle(): string {
    for (let i = this.ents.length - 1; i >= 0; i--)
      if (this.ents[i][0] === 0) return this.ents[i + 1][1];
    return "0";
  }
  toString(): string {
    const t = templatePairs();
    const out: Pair[] = [];
    // Handles of the tables and the root dictionary, read from the template.
    const tableHandle = (name: string) => {
      for (let i = 0; i + 2 < t.length; i++)
        if (
          t[i][0] === 0 &&
          t[i][1] === "TABLE" &&
          t[i + 1][0] === 2 &&
          t[i + 1][1] === name
        )
          return t[i + 2][1];
      return "0";
    };
    const ltypeOwner = tableHandle("LTYPE");
    const layerOwner = tableHandle("LAYER");
    // The template's layer "0" gives the plot style and material every layer refers to.
    const layer0: Pair[] = [];
    for (let i = 0; i < t.length; i++)
      if (t[i][0] === 0 && t[i][1] === "LAYER") {
        let j = i + 1;
        while (t[j][0] !== 0) j++;
        const rec = t.slice(i, j);
        if (rec.some(([c, v]) => c === 2 && v === "0")) {
          layer0.push(...rec);
          break;
        }
      }
    const ltypeRecords = (): Pair[] => {
      const o: Pair[] = [];
      for (const [name, dash] of this.ltypes) {
        o.push([0, "LTYPE"], [5, this.handle()], [330, ltypeOwner]);
        o.push(
          [100, "AcDbSymbolTableRecord"],
          [100, "AcDbLinetypeTableRecord"],
        );
        o.push([2, name], [70, "0"], [3, name.replace(/_/g, " ")], [72, "65"]);
        o.push([73, String(dash.length)]);
        o.push([40, fmt(dash.reduce((a, d) => a + Math.abs(d), 0))]);
        for (const d of dash) o.push([49, fmt(d)], [74, "0"]);
      }
      return o;
    };
    const layerRecords = (): Pair[] => {
      const o: Pair[] = [];
      for (const [name, c] of this.layers) {
        if (name === "0") continue;
        for (const [code, v] of layer0)
          o.push([
            code,
            code === 5
              ? this.handle()
              : code === 330
                ? layerOwner
                : code === 2
                  ? name
                  : code === 62
                    ? String(c)
                    : v,
          ]);
      }
      return o;
    };
    const lt = ltypeRecords();
    const la = layerRecords();
    // Image objects: a dictionary of picture definitions in the root dictionary, plus raster settings.
    const imgDict = this.imageDefs.length ? this.handle() : "";
    const imgVars = this.imageDefs.length ? this.handle() : "";
    let section = "";
    let table = "";
    let rootDone = false;
    let lastDict = -100;
    for (let i = 0; i < t.length; i++) {
      const [c, v] = t[i];
      if (c === 0 && v === "SECTION") section = t[i + 1][1];
      if (c === 0 && v === "TABLE") table = t[i + 1][1];
      if (c === 9 && v === "$HANDSEED") {
        out.push(t[i]);
        out.push([5, "%SEED%"]);
        i++;
        continue;
      }
      if (c === 0 && v === "ENDTAB") {
        if (table === "LTYPE") for (const e of lt) out.push(e);
        if (table === "LAYER") for (const e of la) out.push(e);
      }
      if (c === 0 && v === "ENDSEC" && section === "ENTITIES")
        for (const e of this.ents) out.push(e);
      if (c === 0 && v === "ENDSEC" && section === "OBJECTS" && imgDict) {
        out.push([0, "DICTIONARY"], [5, imgDict], [330, "A"]);
        out.push([100, "AcDbDictionary"], [281, "1"]);
        for (const d of this.imageDefs) out.push([3, d.name], [350, d.def]);
        out.push([0, "RASTERVARIABLES"], [5, imgVars], [330, "A"]);
        out.push([100, "AcDbRasterVariables"], [90, "0"], [70, "0"]);
        out.push([71, "1"], [72, "3"]);
        for (const d of this.imageDefs) {
          const px = this.pixels.get(d.def) ?? [1, 1];
          out.push([0, "IMAGEDEF"], [5, d.def], [102, "{ACAD_REACTORS"]);
          out.push([330, imgDict]);
          for (const r of this.reactors.filter((x) => x.def === d.def))
            out.push([330, r.reactor]);
          out.push([102, "}"], [330, imgDict], [100, "AcDbRasterImageDef"]);
          out.push([90, "0"], [1, d.name], [10, fmt(px[0])], [20, fmt(px[1])]);
          out.push([11, "1"], [21, "1"], [280, "1"], [281, "0"]);
        }
        for (const r of this.reactors) {
          out.push([0, "IMAGEDEF_REACTOR"], [5, r.reactor], [330, r.image]);
          out.push([100, "AcDbRasterImageDefReactor"], [90, "2"]);
          out.push([330, r.image]);
        }
      }
      if (c === 0 && v === "DICTIONARY") lastDict = out.length;
      out.push(t[i]);
      // The root dictionary (first object, owner 0) lists the image dictionaries.
      if (
        imgDict &&
        !rootDone &&
        section === "OBJECTS" &&
        c === 281 &&
        lastDict > out.length - 8
      ) {
        out.push([3, "ACAD_IMAGE_DICT"], [350, imgDict]);
        out.push([3, "ACAD_IMAGE_VARS"], [350, imgVars]);
        rootDone = true;
      }
    }
    const seed = this.seed.toString(16).toUpperCase();
    const lines: string[] = [];
    for (const [c, v] of out) lines.push(String(c), v === "%SEED%" ? seed : v);
    return lines.join("\r\n") + "\r\n";
  }
}

const fmt = (v: number) =>
  Math.abs(v) < 1e-9 ? "0" : String(Math.round(v * 10000) / 10000);

/** DXF 2007 and later is UTF-8: characters such as ° and ± go in as they are. */
function encodeText(s: string): string {
  return s.replace(/\s+/g, " ");
}

const SKIP = [
  "sel-outline",
  "handle",
  "edge-hit",
  "text-hit",
  "row-hit",
  "guide",
  "marquee",
  "hint",
];

/** Layer for an element: the panel it sits in, by type, e.g. "PANEL-PLANVIEW". */
function layerOf(el: Element): string {
  const panel = el.closest("g.panel");
  const type = panel
    ? [...panel.classList].find((c) => c.startsWith("type-"))?.slice(5)
    : undefined;
  if (type) return `PANEL-${type.toUpperCase()}`;
  if (el.closest('[data-kind="text"]')) return "TEXT";
  return "SHEET";
}

/** Write one drawn sheet (the svg.sheet element) into the writer, shifted by dx along x. */
/** A picture on the sheet, to be read into a file after the sheet is walked. */
interface ImageJob {
  href: string;
  /** Box the picture is fitted into (preserveAspectRatio meet), in the image's own units. */
  box: { x: number; y: number; w: number; h: number };
  m: DOMMatrix;
  dx: number;
  layer: string;
}

function writeSheet(
  svg: SVGSVGElement,
  w: DxfWriter,
  dx: number,
  images: ImageJob[] = [],
) {
  const rootInv = svg.getScreenCTM()?.inverse();
  if (!rootInv) return;
  const toRoot = (el: SVGGraphicsElement) =>
    rootInv.multiply(el.getScreenCTM()!);
  const clipCache = new Map<Element, Clip | null>();
  const clipFor = (el: Element): Clip | null => {
    const owner = el.closest("[clip-path]");
    if (!owner) return null;
    if (clipCache.has(owner)) return clipCache.get(owner)!;
    const id = owner.getAttribute("clip-path")!.match(/#([^)"']+)/)?.[1];
    const rect = id
      ? (svg.querySelector(`#${CSS.escape(id)} rect`) as SVGRectElement | null)
      : null;
    let c: Clip | null = null;
    if (rect) {
      const m = toRoot(owner as SVGGraphicsElement);
      const x = rect.x.baseVal.value;
      const y = rect.y.baseVal.value;
      const ps = [
        [x, y],
        [x + rect.width.baseVal.value, y + rect.height.baseVal.value],
      ].map(([px, py]) => new DOMPoint(px, py).matrixTransform(m));
      c = {
        x0: Math.min(ps[0].x, ps[1].x),
        y0: Math.min(ps[0].y, ps[1].y),
        x1: Math.max(ps[0].x, ps[1].x),
        y1: Math.max(ps[0].y, ps[1].y),
      };
    }
    clipCache.set(owner, c);
    return c;
  };
  const shown = (cs: CSSStyleDeclaration, prop: "stroke" | "fill") => {
    const v = cs[prop];
    if (!v || v === "none") return null;
    const c = parseColour(v);
    if (!c || c[3] < 0.05) return null;
    const op =
      parseFloat(cs.opacity || "1") *
      parseFloat((prop === "fill" ? cs.fillOpacity : cs.strokeOpacity) || "1");
    if (op < 0.05) return null;
    return c;
  };

  const walker = svg.querySelectorAll(
    "line, polyline, polygon, rect, circle, ellipse, path, text, image",
  );
  for (const el of walker) {
    if (el.closest("defs, clipPath, mask, pattern, marker")) continue;
    if (
      SKIP.some((c) => el.classList.contains(c)) ||
      el.closest(".sel-outline, .handle, [data-edge], [data-img-handle]")
    )
      continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    let hidden = false;
    for (let a: Element | null = el; a && a !== svg; a = a.parentElement) {
      if (
        getComputedStyle(a).display === "none" ||
        parseFloat(getComputedStyle(a).opacity || "1") < 0.05
      ) {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;
    const g = el as SVGGraphicsElement;
    const m = toRoot(g);
    const P = (x: number, y: number): Pt => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      return [p.x + dx, p.y];
    };
    const clip = clipFor(el);
    const clipShift = clip
      ? { x0: clip.x0 + dx, x1: clip.x1 + dx, y0: clip.y0, y1: clip.y1 }
      : null;
    const layer = layerOf(el);
    const stroke = shown(cs, "stroke");
    const fill = shown(cs, "fill");
    const scale = Math.hypot(m.a, m.b) || 1;
    const rgbOf = (c: number[]) => (c[0] << 16) | (c[1] << 8) | c[2];
    const opacity = parseFloat(cs.opacity || "1");
    // The line's look: true colour, dash pattern as a linetype, paper line weight.
    const lineLook = (c: number[]): Look => {
      const da = (cs.strokeDasharray || "none")
        .split(/[\s,]+/)
        .map((v) => parseFloat(v) * scale)
        .filter((v) => Number.isFinite(v));
      const pat = da.length % 2 ? [...da, ...da] : da;
      return {
        aci: aci([c[0], c[1], c[2]]),
        rgb: rgbOf(c),
        dash:
          pat.length && pat.some((v) => v > 0)
            ? pat.map((v, k) => (k % 2 ? -Math.max(v, 0.01) : v))
            : undefined,
        lw: (parseFloat(cs.strokeWidth) || 0) * scale,
      };
    };

    if (el.tagName === "image") {
      const im = el as SVGImageElement;
      const href = im.href.baseVal || im.getAttribute("xlink:href") || "";
      if (href)
        images.push({
          href,
          box: {
            x: im.x.baseVal.value,
            y: im.y.baseVal.value,
            w: im.width.baseVal.value,
            h: im.height.baseVal.value,
          },
          m,
          dx,
          layer: layer === "SHEET" ? "IMAGES" : `${layer}_IMAGES`,
        });
      continue;
    }

    if (el.tagName === "text") {
      if (!fill) continue;
      writeText(el as SVGTextElement, m, dx, clipShift, w, layer, {
        aci: aci([fill[0], fill[1], fill[2]]),
        rgb: rgbOf(fill),
      });
      continue;
    }

    const shapes: { pts: Pt[]; closed: boolean }[] = [];
    switch (el.tagName) {
      case "line": {
        const l = el as SVGLineElement;
        shapes.push({
          pts: [
            P(l.x1.baseVal.value, l.y1.baseVal.value),
            P(l.x2.baseVal.value, l.y2.baseVal.value),
          ],
          closed: false,
        });
        break;
      }
      case "polyline":
      case "polygon": {
        const pl = el as SVGPolylineElement;
        const pts = [...pl.points].map((p) => P(p.x, p.y));
        if (el.tagName === "polygon" && pts.length) pts.push(pts[0]);
        shapes.push({ pts, closed: el.tagName === "polygon" });
        break;
      }
      case "rect": {
        const r = el as SVGRectElement;
        const x = r.x.baseVal.value;
        const y = r.y.baseVal.value;
        const rw = r.width.baseVal.value;
        const rh = r.height.baseVal.value;
        if (!rw || !rh) continue;
        const pts = [P(x, y), P(x + rw, y), P(x + rw, y + rh), P(x, y + rh)];
        shapes.push({ pts: [...pts, pts[0]], closed: true });
        break;
      }
      case "circle":
      case "ellipse": {
        const c = el as SVGCircleElement & SVGEllipseElement;
        const cx = c.cx.baseVal.value;
        const cy = c.cy.baseVal.value;
        const rx =
          el.tagName === "circle" ? c.r.baseVal.value : c.rx.baseVal.value;
        const ry =
          el.tagName === "circle" ? c.r.baseVal.value : c.ry.baseVal.value;
        if (!rx || !ry) continue;
        const pts: Pt[] = [];
        for (let k = 0; k <= 36; k++)
          pts.push(
            P(
              cx + rx * Math.cos((k / 36) * 2 * Math.PI),
              cy + ry * Math.sin((k / 36) * 2 * Math.PI),
            ),
          );
        shapes.push({ pts, closed: true });
        break;
      }
      case "path": {
        const d = el.getAttribute("d");
        if (!d) continue;
        for (const sp of flattenPath(d))
          shapes.push({
            pts: sp.pts.map(([x, y]) => P(x, y)),
            closed: sp.closed,
          });
        break;
      }
    }
    // The closed shapes, cut to the panel they sit in, carry the fill.
    const closed = shapes.filter((s) => s.closed && s.pts.length > 2);
    const rings = closed
      .map((s) =>
        clipShift
          ? clipPolygon(s.pts, [
              [clipShift.x0, clipShift.y0],
              [clipShift.x1, clipShift.y0],
              [clipShift.x1, clipShift.y1],
              [clipShift.x0, clipShift.y1],
            ])
          : s.pts,
      )
      .filter((r) => r.length > 2);
    // A pattern fill goes in as an editable HATCH (lines it can't describe: cut lines on a _HATCH layer).
    const fillRef = el.getAttribute("fill") ?? (el as SVGElement).style.fill;
    const patId = /url\(\s*["']?#([^)"']+)/.exec(fillRef ?? "")?.[1];
    if (patId) {
      const pat = svg.querySelector(`pattern#${CSS.escape(patId)}`);
      if (pat && rings.length)
        writePattern(
          pat as SVGPatternElement,
          g,
          P,
          rings,
          clipShift,
          layer,
          w,
        );
    } else if (
      // A coloured fill is a solid HATCH in its true colour (white is just paper).
      fill &&
      rings.length &&
      !(fill[0] > 245 && fill[1] > 245 && fill[2] > 245) &&
      !el.classList.contains("paper")
    )
      w.hatch(rings, layer, {
        aci: aci([fill[0], fill[1], fill[2]]),
        rgb: rgbOf(fill),
        alpha:
          opacity * (parseFloat(cs.fillOpacity || "1") || 1) * (fill[3] ?? 1),
      });
    // Outline in the stroke colour; a filled shape with no stroke is outlined in its fill colour.
    const col = stroke ?? fill;
    if (!col) continue;
    if (!stroke && fill && fill[0] > 245 && fill[1] > 245 && fill[2] > 245)
      continue;
    const color: Look = stroke
      ? lineLook(col)
      : { aci: aci([col[0], col[1], col[2]]), rgb: rgbOf(col) };
    for (const s of shapes) {
      // Dots drawn as zero-length round-capped strokes: keep them as tiny circles' worth of line.
      if (
        s.pts.length === 2 &&
        Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) < 1e-3
      ) {
        const [x, y] = s.pts[0];
        const r = Math.max(0.05, (parseFloat(cs.strokeWidth) || 0.2) / 2);
        if (
          clipShift &&
          (x < clipShift.x0 ||
            x > clipShift.x1 ||
            y < clipShift.y0 ||
            y > clipShift.y1)
        )
          continue;
        w.polyline(
          [
            [x - r, y],
            [x + r, y],
          ],
          layer,
          { ...color, dash: undefined },
          false,
          r * 2,
        );
        continue;
      }
      if (clipShift)
        for (const piece of clipPolyline(s.pts, clipShift))
          w.polyline(piece, layer, color);
      else w.polyline(s.pts, layer, color, s.closed && s.pts.length > 3);
    }
  }
}

/** Inside the closed shapes (even-odd), in root coordinates. */
function insideShapes(x: number, y: number, shapes: { pts: Pt[] }[]): boolean {
  let inside = false;
  for (const { pts } of shapes)
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  return inside;
}

/** The parts of segment a-b inside the shapes. */
export function cutToShapes(a: Pt, b: Pt, shapes: { pts: Pt[] }[]): Pt[][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ts = [0, 1];
  for (const { pts } of shapes)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
      const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  ts.sort((x, y) => x - y);
  const out: Pt[][] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k];
    const t1 = ts[k + 1];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (insideShapes(a[0] + dx * tm, a[1] + dy * tm, shapes))
      out.push([
        [a[0] + dx * t0, a[1] + dy * t0],
        [a[0] + dx * t1, a[1] + dy * t1],
      ]);
  }
  return out;
}

/**
 * An SVG pattern fill as an editable HATCH: each straight line in the pattern tile makes a
 * family of parallel lines (spacing from how the tile repeats), dots make dotted lines, and a
 * filled tile a solid hatch. Anything else is drawn as cut lines instead.
 */
function writePattern(
  pat: SVGPatternElement,
  el: SVGGraphicsElement,
  P: (x: number, y: number) => Pt,
  rings: Pt[][],
  clip: Clip | null,
  layer: string,
  w: DxfWriter,
) {
  const pw = pat.width.baseVal.value;
  const ph = pat.height.baseVal.value;
  if (!(pw > 0 && ph > 0)) return;
  const tm =
    pat.patternTransform.baseVal.consolidate()?.matrix ?? new DOMMatrix();
  const toRoot = (x: number, y: number): Pt => {
    const q = new DOMPoint(x, y).matrixTransform(tm);
    return P(q.x, q.y);
  };
  const o = toRoot(0, 0);
  const A = toRoot(pw, 0);
  const B = toRoot(0, ph);
  const va: Pt = [A[0] - o[0], A[1] - o[1]];
  const vb: Pt = [B[0] - o[0], B[1] - o[1]];
  // Spacing of a family of lines with direction u: the nearest repeat of the tile across them.
  const gapFor = (u: Pt) => {
    let best = Infinity;
    for (let i = -3; i <= 3; i++)
      for (let j = -3; j <= 3; j++) {
        const v: Pt = [i * va[0] + j * vb[0], i * va[1] + j * vb[1]];
        const c = Math.abs(u[0] * v[1] - u[1] * v[0]);
        if (c > 1e-6 && c < best) best = c;
      }
    return best;
  };
  const byColour = new Map<string, { look: Look; fams: HatchFamily[] }>();
  let unknown = false;
  for (const child of pat.children) {
    const cs = getComputedStyle(child);
    const op =
      parseFloat(cs.opacity || "1") *
      parseFloat(child.getAttribute("opacity") ?? "1");
    if (child.tagName === "rect") {
      const c = parseColour(cs.fill);
      if (c)
        w.hatch(rings, `${layer}_HATCH`, {
          aci: aci([c[0], c[1], c[2]]),
          rgb: (c[0] << 16) | (c[1] << 8) | c[2],
          alpha: op * (c[3] ?? 1),
        });
      continue;
    }
    const paint = child.tagName === "circle" ? cs.fill : cs.stroke;
    const c = parseColour(paint);
    if (!c) continue;
    const key = c.slice(0, 3).join(",");
    const entry = byColour.get(key) ?? {
      look: {
        aci: aci([c[0], c[1], c[2]]),
        rgb: (c[0] << 16) | (c[1] << 8) | c[2],
        alpha: op < 0.999 ? op : undefined,
      },
      fams: [],
    };
    byColour.set(key, entry);
    if (child.tagName === "circle") {
      const ci = child as SVGCircleElement;
      const base = toRoot(ci.cx.baseVal.value, ci.cy.baseVal.value);
      const u: Pt = [va[0], va[1]];
      const len = Math.hypot(u[0], u[1]);
      entry.fams.push({
        dir: u,
        base,
        gap: gapFor([u[0] / len, u[1] / len]),
        dash: [0, -len],
      });
      continue;
    }
    if (child.tagName !== "path" && child.tagName !== "line") {
      unknown = true;
      continue;
    }
    const segs: [Pt, Pt][] = [];
    if (child.tagName === "line") {
      const l = child as SVGLineElement;
      segs.push([
        [l.x1.baseVal.value, l.y1.baseVal.value],
        [l.x2.baseVal.value, l.y2.baseVal.value],
      ]);
    } else
      for (const sp of flattenPath(child.getAttribute("d") ?? ""))
        for (let k = 0; k + 1 < sp.pts.length; k++)
          segs.push([sp.pts[k], sp.pts[k + 1]]);
    for (const [a, b] of segs) {
      const ra = toRoot(a[0], a[1]);
      const rb = toRoot(b[0], b[1]);
      const len = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]);
      if (len < 1e-9) continue;
      const u: Pt = [(rb[0] - ra[0]) / len, (rb[1] - ra[1]) / len];
      // One family per direction (the corner bits of a tile repeat the same lines).
      const same = entry.fams.find(
        (f) =>
          !f.dash.length && Math.abs(f.dir[0] * u[1] - f.dir[1] * u[0]) < 1e-6,
      );
      if (!same)
        entry.fams.push({ dir: u, base: ra, gap: gapFor(u), dash: [] });
    }
  }
  if (
    unknown ||
    [...byColour.values()].some((e) =>
      e.fams.some((f) => !Number.isFinite(f.gap)),
    )
  ) {
    writeHatch(
      pat,
      el,
      P,
      rings.map((pts) => ({ pts })),
      clip,
      layer,
      w,
    );
    return;
  }
  for (const { look, fams } of byColour.values())
    if (fams.length) w.hatch(rings, `${layer}_HATCH`, look, fams);
}

/**
 * Draw an SVG pattern fill as plain lines (and dots as small circles), the way DXF R12
 * keeps a hatch: AutoCAD shows it as drawn, on its own layer so it can be turned off.
 */
function writeHatch(
  pat: SVGPatternElement,
  el: SVGGraphicsElement,
  P: (x: number, y: number) => Pt,
  shapes: { pts: Pt[] }[],
  clip: Clip | null,
  layer: string,
  w: DxfWriter,
) {
  const pw = pat.width.baseVal.value;
  const ph = pat.height.baseVal.value;
  if (!(pw > 0 && ph > 0)) return;
  const tm =
    pat.patternTransform.baseVal.consolidate()?.matrix ?? new DOMMatrix();
  const inv = tm.inverse();
  let bb: DOMRect;
  try {
    bb = el.getBBox();
  } catch {
    return;
  }
  // The element's box in pattern space, to know which tiles to lay.
  const corners = [
    [bb.x, bb.y],
    [bb.x + bb.width, bb.y],
    [bb.x, bb.y + bb.height],
    [bb.x + bb.width, bb.y + bb.height],
  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(inv));
  const i0 = Math.floor(Math.min(...corners.map((c) => c.x)) / pw) - 1;
  const i1 = Math.ceil(Math.max(...corners.map((c) => c.x)) / pw) + 1;
  const j0 = Math.floor(Math.min(...corners.map((c) => c.y)) / ph) - 1;
  const j1 = Math.ceil(Math.max(...corners.map((c) => c.y)) / ph) + 1;
  if ((i1 - i0) * (j1 - j0) > 40000) return; // far too fine to be a hatch
  const toRoot = (x: number, y: number): Pt => {
    const q = new DOMPoint(x, y).matrixTransform(tm);
    return P(q.x, q.y);
  };
  const inClip = ([x, y]: Pt) =>
    !clip || (x >= clip.x0 && x <= clip.x1 && y >= clip.y0 && y <= clip.y1);
  const hl = `${layer}_HATCH`;
  // Neighbouring tiles repeat the bits of line that cross their edges: write each once.
  const seen = new Set<string>();
  const once = (pts: Pt[]) => {
    const k = pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
    const r = [...pts]
      .reverse()
      .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)
      .join(" ");
    if (seen.has(k) || seen.has(r)) return false;
    seen.add(k);
    return true;
  };
  for (const child of pat.querySelectorAll("path, line, circle")) {
    const cs = getComputedStyle(child);
    const paint =
      child.tagName === "circle"
        ? cs.fill
        : cs.stroke !== "none"
          ? cs.stroke
          : cs.fill;
    const rgb = parseColour(paint);
    if (!rgb) continue;
    const color = aci([rgb[0], rgb[1], rgb[2]]);
    if (child.tagName === "circle") {
      const c = child as SVGCircleElement;
      const r = c.r.baseVal.value;
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const ctr = toRoot(
            c.cx.baseVal.value + i * pw,
            c.cy.baseVal.value + j * ph,
          );
          if (!inClip(ctr) || !insideShapes(ctr[0], ctr[1], shapes)) continue;
          const pts: Pt[] = [];
          for (let k = 0; k <= 12; k++)
            pts.push(
              toRoot(
                c.cx.baseVal.value +
                  i * pw +
                  r * Math.cos((k / 12) * 2 * Math.PI),
                c.cy.baseVal.value +
                  j * ph +
                  r * Math.sin((k / 12) * 2 * Math.PI),
              ),
            );
          w.polyline(pts, hl, color, true);
        }
      continue;
    }
    const segs: [Pt, Pt][] = [];
    if (child.tagName === "line") {
      const l = child as SVGLineElement;
      segs.push([
        [l.x1.baseVal.value, l.y1.baseVal.value],
        [l.x2.baseVal.value, l.y2.baseVal.value],
      ]);
    } else
      for (const sp of flattenPath(child.getAttribute("d") ?? ""))
        for (let k = 0; k + 1 < sp.pts.length; k++)
          segs.push([sp.pts[k], sp.pts[k + 1]]);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (const [a, b] of segs)
          for (const piece of cutToShapes(
            toRoot(a[0] + i * pw, a[1] + j * ph),
            toRoot(b[0] + i * pw, b[1] + j * ph),
            shapes,
          ))
            for (const part of clip ? clipPolyline(piece, clip) : [piece])
              if (part.length > 1 && once(part)) w.polyline(part, hl, color);
  }
}

function writeText(
  el: SVGTextElement,
  m: DOMMatrix,
  dx: number,
  clip: Clip | null,
  w: DxfWriter,
  layer: string,
  color: number | Look,
) {
  // Each line: the text element itself, or each tspan that starts a new line (has its own x or dy).
  const tspans = [...el.querySelectorAll("tspan")].filter(
    (t) => t.hasAttribute("x") || t.hasAttribute("dy") || t.hasAttribute("y"),
  );
  const parts: SVGTextContentElement[] = tspans.length ? tspans : [el];
  const fsUser = parseFloat(getComputedStyle(el).fontSize) || 1;
  const scale = Math.hypot(m.a, m.b);
  const rot = (-Math.atan2(m.b, m.a) * 180) / Math.PI;
  for (const t of parts) {
    const s = (t.textContent ?? "").trim();
    if (!s || !t.getNumberOfChars()) continue;
    let p0: DOMPoint;
    try {
      p0 = t.getStartPositionOfChar(0);
    } catch {
      continue;
    }
    const p = new DOMPoint(p0.x, p0.y).matrixTransform(m);
    const x = p.x + dx;
    if (
      clip &&
      (x < clip.x0 - 0.5 ||
        x > clip.x1 + 0.5 ||
        p.y < clip.y0 - 0.5 ||
        p.y > clip.y1 + 0.5)
    )
      continue;
    // Our font size is cap height ÷ 0.7; DXF text height is the cap height.
    const fs = (parseFloat(getComputedStyle(t).fontSize) || fsUser) * scale;
    w.text(x, p.y, fs * 0.7, rot, s, layer, color);
  }
}

/** Read a picture into PNG bytes and its pixel size. */
async function pictureOf(
  href: string,
): Promise<{ data: Uint8Array; px: [number, number] } | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = href;
    await img.decode();
    const pw = img.naturalWidth;
    const ph = img.naturalHeight;
    if (!pw || !ph) return null;
    const c = document.createElement("canvas");
    c.width = pw;
    c.height = ph;
    // AutoCAD shows the see-through parts of a PNG as black: lay the picture on white
    // paper first, so it looks the way it does on the sheet.
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) =>
      c.toBlob(r, "image/png"),
    );
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), px: [pw, ph] };
  } catch {
    return null;
  }
}

/**
 * The DXF of the chart(s) drawn by `draw`, which is called once per chart and resolves with
 * that chart's svg. Pictures (logos) come back as PNG files named `<imagePrefix>_imageN.png`,
 * which the DXF points to: keep them in the same folder as the DXF.
 */
export async function chartsToDxf(
  paperW: number,
  paperH: number,
  sheets: number[],
  draw: (i: number) => Promise<SVGSVGElement | null>,
  imagePrefix = "chart",
): Promise<{ text: string; images: { name: string; data: Uint8Array }[] }> {
  const w = new DxfWriter(paperH);
  const files = new Map<
    string,
    { name: string; data: Uint8Array; px: [number, number] } | null
  >();
  let k = 0;
  for (const i of sheets) {
    const svg = await draw(i);
    if (svg) {
      // Paper widths, not the on-screen one-pixel minimum.
      const px = svg.style.getPropertyValue("--px");
      svg.style.setProperty("--px", "0px");
      const jobs: ImageJob[] = [];
      writeSheet(svg, w, k * (paperW + 50), jobs);
      svg.style.setProperty("--px", px);
      for (const j of jobs) {
        if (!files.has(j.href)) {
          const pic = await pictureOf(j.href);
          files.set(
            j.href,
            pic
              ? { name: `${imagePrefix}_image${files.size + 1}.png`, ...pic }
              : null,
          );
        }
        const f = files.get(j.href);
        if (!f) continue;
        // Fitted inside its box, keeping its shape (preserveAspectRatio "meet").
        const s = Math.min(j.box.w / f.px[0], j.box.h / f.px[1]);
        const fw = f.px[0] * s;
        const fh = f.px[1] * s;
        const fx = j.box.x + (j.box.w - fw) / 2;
        const fy = j.box.y + (j.box.h - fh) / 2;
        const P = (x: number, y: number): Pt => {
          const q = new DOMPoint(x, y).matrixTransform(j.m);
          return [q.x + j.dx, q.y];
        };
        const corner = P(fx, fy + fh);
        const right = P(fx + fw, fy + fh);
        const top = P(fx, fy);
        w.image(
          f.name,
          f.data,
          f.px,
          corner,
          [(right[0] - corner[0]) / f.px[0], (right[1] - corner[1]) / f.px[0]],
          [(top[0] - corner[0]) / f.px[1], (top[1] - corner[1]) / f.px[1]],
          j.layer,
        );
      }
    }
    k++;
  }
  return { text: w.toString(), images: w.images };
}

/**
 * The chart boxes of the key plan as a DXF in grid coordinates (easting, northing, metres): one closed
 * rectangle per chart on layer CHART_BOXES, with the drawing number written at its centre.
 */
export function chartBoxesToDxf(
  frames: [number, number][][],
  names: string[],
): string {
  const w = new DxfWriter(0, true);
  frames.forEach((f, i) => {
    w.polyline(f, "CHART_BOXES", 1, true);
    const cx = f.reduce((a, p) => a + p[0], 0) / f.length;
    const cy = f.reduce((a, p) => a + p[1], 0) / f.length;
    const size =
      Math.max(...f.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) / 12;
    w.text(cx, cy, size, 0, names[i] || `Chart ${i + 1}`, "CHART_NAMES", 3);
  });
  return w.toString();
}
