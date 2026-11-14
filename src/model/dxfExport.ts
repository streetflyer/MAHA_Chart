/**
 * Save the chart as an AutoCAD DXF (R12, ASCII), in paper millimetres with the
 * origin at the sheet's bottom-left corner. It is written from the drawn sheet
 * itself, so what is on screen is what goes in the file: lines and polylines,
 * outlines of circles and curves, filled boxes as SOLIDs, and text as TEXT with
 * its height, rotation and colour. Everything clipped to a panel on screen is
 * clipped to it in the file too. Logos (images) are left out.
 */

import { ACI } from './aci';

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
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
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
  const cands = max - min < 24 ? [8, 9, 250, 251, 252, 253, 254, 255] : Array.from({ length: 249 }, (_, i) => i + 1).filter((i) => i !== 7 && i !== 8 && i !== 9);
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
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let lc: Pt | null = null; // last control point for S / T
  let i = 0;
  const n = () => parseFloat(toks[i++]);
  const flush = (closed: boolean) => {
    if (cur.length > 1) out.push({ pts: cur, closed });
    cur = [];
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    const steps = 12;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      cur.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey]);
    }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (C) {
      case 'M': {
        flush(false);
        x = ox + n();
        y = oy + n();
        sx = x;
        sy = y;
        cur.push([x, y]);
        cmd = rel ? 'l' : 'L';
        lc = null;
        break;
      }
      case 'L':
        x = ox + n();
        y = oy + n();
        cur.push([x, y]);
        lc = null;
        break;
      case 'H':
        x = ox + n();
        cur.push([x, y]);
        lc = null;
        break;
      case 'V':
        y = oy + n();
        cur.push([x, y]);
        lc = null;
        break;
      case 'Z':
        if (cur.length) cur.push([sx, sy]);
        flush(true);
        x = sx;
        y = sy;
        cur.push([x, y]);
        lc = null;
        break;
      case 'C': {
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
      case 'S': {
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
      case 'Q':
      case 'T': {
        const qx: number = C === 'Q' ? ox + n() : lc ? 2 * x - lc[0] : x;
        const qy: number = C === 'Q' ? oy + n() : lc ? 2 * y - lc[1] : y;
        const ex = ox + n();
        const ey = oy + n();
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
        lc = [qx, qy];
        x = ex;
        y = ey;
        break;
      }
      case 'A': {
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
function arcPoints(x1: number, y1: number, rx: number, ry: number, phi: number, large: boolean, sweep: boolean, x2: number, y2: number, out: Pt[]) {
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
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 18)));
  for (let k = 1; k <= steps; k++) {
    const t = t1 + (dt * k) / steps;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
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

class DxfWriter {
  private out: string[] = [];
  readonly layers = new Map<string, number>();
  constructor(private readonly paperH: number) {}
  private g(code: number, v: string | number) {
    this.out.push(String(code), typeof v === 'number' ? fmt(v) : v);
  }
  private head(type: string, layer: string, color: number) {
    this.g(0, type);
    this.g(8, layer);
    if (!this.layers.has(layer)) this.layers.set(layer, 7);
    this.g(62, color);
  }
  private y(v: number) {
    return this.paperH - v;
  }
  polyline(pts: Pt[], layer: string, color: number, closed = false, width = 0) {
    if (pts.length < 2) return;
    if (pts.length === 2 && !closed && !width) {
      this.head('LINE', layer, color);
      this.g(10, pts[0][0]);
      this.g(20, this.y(pts[0][1]));
      this.g(11, pts[1][0]);
      this.g(21, this.y(pts[1][1]));
      return;
    }
    this.head('POLYLINE', layer, color);
    this.g(66, 1);
    this.g(10, 0);
    this.g(20, 0);
    this.g(30, 0);
    this.g(70, closed ? 1 : 0);
    if (width) {
      this.g(40, width);
      this.g(41, width);
    }
    for (const [x, y] of pts) {
      this.g(0, 'VERTEX');
      this.g(8, layer);
      this.g(10, x);
      this.g(20, this.y(y));
      this.g(30, 0);
    }
    this.g(0, 'SEQEND');
    this.g(8, layer);
  }
  solid(p: Pt[], layer: string, color: number) {
    this.head('SOLID', layer, color);
    // SOLID corners go 1-2-4-3.
    const order = [p[0], p[1], p[3], p[2]];
    order.forEach(([x, y], k) => {
      this.g(10 + k, x);
      this.g(20 + k, this.y(y));
      this.g(30 + k, 0);
    });
  }
  text(x: number, y: number, h: number, rot: number, s: string, layer: string, color: number) {
    this.head('TEXT', layer, color);
    this.g(10, x);
    this.g(20, this.y(y));
    this.g(30, 0);
    this.g(40, h);
    this.g(1, encodeText(s));
    if (Math.abs(rot) > 1e-6) this.g(50, rot);
  }
  toString(): string {
    const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '9', '$MEASUREMENT', '70', '1', '0', 'ENDSEC'];
    const tables = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(this.layers.size)];
    for (const [name, c] of this.layers) tables.push('0', 'LAYER', '2', name, '70', '0', '62', String(c), '6', 'CONTINUOUS');
    tables.push('0', 'ENDTAB', '0', 'ENDSEC');
    return [...head, ...tables, '0', 'SECTION', '2', 'ENTITIES', ...this.out, '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n');
  }
}

const fmt = (v: number) => (Math.abs(v) < 1e-9 ? '0' : String(Math.round(v * 10000) / 10000));

/** DXF R12 is 8-bit: anything outside ASCII goes as \U+XXXX, which AutoCAD reads. */
function encodeText(s: string): string {
  return [...s.replace(/\s+/g, ' ')].map((ch) => (ch.charCodeAt(0) < 128 ? ch : `\\U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)).join('');
}

const SKIP = ['sel-outline', 'handle', 'edge-hit', 'text-hit', 'row-hit', 'guide', 'marquee', 'hint'];

/** Layer for an element: the panel it sits in, by type, e.g. "PANEL-PLANVIEW". */
function layerOf(el: Element): string {
  const panel = el.closest('g.panel');
  const type = panel ? [...panel.classList].find((c) => c.startsWith('type-'))?.slice(5) : undefined;
  if (type) return `PANEL-${type.toUpperCase()}`;
  if (el.closest('[data-kind="text"]')) return 'TEXT';
  return 'SHEET';
}

/** Write one drawn sheet (the svg.sheet element) into the writer, shifted by dx along x. */
function writeSheet(svg: SVGSVGElement, w: DxfWriter, dx: number) {
  const rootInv = svg.getScreenCTM()?.inverse();
  if (!rootInv) return;
  const toRoot = (el: SVGGraphicsElement) => rootInv.multiply(el.getScreenCTM()!);
  const clipCache = new Map<Element, Clip | null>();
  const clipFor = (el: Element): Clip | null => {
    const owner = el.closest('[clip-path]');
    if (!owner) return null;
    if (clipCache.has(owner)) return clipCache.get(owner)!;
    const id = owner.getAttribute('clip-path')!.match(/#([^)"']+)/)?.[1];
    const rect = id ? (svg.querySelector(`#${CSS.escape(id)} rect`) as SVGRectElement | null) : null;
    let c: Clip | null = null;
    if (rect) {
      const m = toRoot(owner as SVGGraphicsElement);
      const x = rect.x.baseVal.value;
      const y = rect.y.baseVal.value;
      const ps = [
        [x, y],
        [x + rect.width.baseVal.value, y + rect.height.baseVal.value],
      ].map(([px, py]) => new DOMPoint(px, py).matrixTransform(m));
      c = { x0: Math.min(ps[0].x, ps[1].x), y0: Math.min(ps[0].y, ps[1].y), x1: Math.max(ps[0].x, ps[1].x), y1: Math.max(ps[0].y, ps[1].y) };
    }
    clipCache.set(owner, c);
    return c;
  };
  const shown = (cs: CSSStyleDeclaration, prop: 'stroke' | 'fill') => {
    const v = cs[prop];
    if (!v || v === 'none') return null;
    const c = parseColour(v);
    if (!c || c[3] < 0.05) return null;
    const op = parseFloat(cs.opacity || '1') * parseFloat((prop === 'fill' ? cs.fillOpacity : cs.strokeOpacity) || '1');
    if (op < 0.05) return null;
    return c;
  };

  const walker = svg.querySelectorAll('line, polyline, polygon, rect, circle, ellipse, path, text');
  for (const el of walker) {
    if (el.closest('defs, clipPath, mask, pattern, marker')) continue;
    if (SKIP.some((c) => el.classList.contains(c)) || el.closest('.sel-outline, .handle, [data-edge], [data-img-handle]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let hidden = false;
    for (let a: Element | null = el; a && a !== svg; a = a.parentElement) {
      if (getComputedStyle(a).display === 'none' || parseFloat(getComputedStyle(a).opacity || '1') < 0.05) {
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
    const clipShift = clip ? { x0: clip.x0 + dx, x1: clip.x1 + dx, y0: clip.y0, y1: clip.y1 } : null;
    const layer = layerOf(el);
    const stroke = shown(cs, 'stroke');
    const fill = shown(cs, 'fill');

    if (el.tagName === 'text') {
      if (!fill) continue;
      writeText(el as SVGTextElement, m, dx, clipShift, w, layer, aci([fill[0], fill[1], fill[2]]));
      continue;
    }

    const shapes: { pts: Pt[]; closed: boolean }[] = [];
    switch (el.tagName) {
      case 'line': {
        const l = el as SVGLineElement;
        shapes.push({ pts: [P(l.x1.baseVal.value, l.y1.baseVal.value), P(l.x2.baseVal.value, l.y2.baseVal.value)], closed: false });
        break;
      }
      case 'polyline':
      case 'polygon': {
        const pl = el as SVGPolylineElement;
        const pts = [...pl.points].map((p) => P(p.x, p.y));
        if (el.tagName === 'polygon' && pts.length) pts.push(pts[0]);
        shapes.push({ pts, closed: el.tagName === 'polygon' });
        break;
      }
      case 'rect': {
        const r = el as SVGRectElement;
        const x = r.x.baseVal.value;
        const y = r.y.baseVal.value;
        const rw = r.width.baseVal.value;
        const rh = r.height.baseVal.value;
        if (!rw || !rh) continue;
        const pts = [P(x, y), P(x + rw, y), P(x + rw, y + rh), P(x, y + rh)];
        // A coloured box goes in as a SOLID (white boxes are just paper).
        if (fill && !(fill[0] > 245 && fill[1] > 245 && fill[2] > 245) && !clipShift && !el.classList.contains('paper')) w.solid(pts, layer, aci([fill[0], fill[1], fill[2]]));
        shapes.push({ pts: [...pts, pts[0]], closed: true });
        break;
      }
      case 'circle':
      case 'ellipse': {
        const c = el as SVGCircleElement & SVGEllipseElement;
        const cx = c.cx.baseVal.value;
        const cy = c.cy.baseVal.value;
        const rx = el.tagName === 'circle' ? c.r.baseVal.value : c.rx.baseVal.value;
        const ry = el.tagName === 'circle' ? c.r.baseVal.value : c.ry.baseVal.value;
        if (!rx || !ry) continue;
        const pts: Pt[] = [];
        for (let k = 0; k <= 36; k++) pts.push(P(cx + rx * Math.cos((k / 36) * 2 * Math.PI), cy + ry * Math.sin((k / 36) * 2 * Math.PI)));
        shapes.push({ pts, closed: true });
        break;
      }
      case 'path': {
        const d = el.getAttribute('d');
        if (!d) continue;
        for (const sp of flattenPath(d)) shapes.push({ pts: sp.pts.map(([x, y]) => P(x, y)), closed: sp.closed });
        break;
      }
    }
    // Outline in the stroke colour; a filled shape with no stroke is outlined in its fill colour.
    const col = stroke ?? fill;
    if (!col) continue;
    if (!stroke && fill && fill[0] > 245 && fill[1] > 245 && fill[2] > 245) continue;
    const color = aci([col[0], col[1], col[2]]);
    for (const s of shapes) {
      // Dots drawn as zero-length round-capped strokes: keep them as tiny circles' worth of line.
      if (s.pts.length === 2 && Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) < 1e-3) {
        const [x, y] = s.pts[0];
        const r = Math.max(0.05, (parseFloat(cs.strokeWidth) || 0.2) / 2);
        if (clipShift && (x < clipShift.x0 || x > clipShift.x1 || y < clipShift.y0 || y > clipShift.y1)) continue;
        w.polyline(
          [
            [x - r, y],
            [x + r, y],
          ],
          layer,
          color,
          false,
          r * 2,
        );
        continue;
      }
      if (clipShift) for (const piece of clipPolyline(s.pts, clipShift)) w.polyline(piece, layer, color);
      else w.polyline(s.pts, layer, color, s.closed && s.pts.length > 3);
    }
  }
}

function writeText(el: SVGTextElement, m: DOMMatrix, dx: number, clip: Clip | null, w: DxfWriter, layer: string, color: number) {
  // Each line: the text element itself, or each tspan that starts a new line (has its own x or dy).
  const tspans = [...el.querySelectorAll('tspan')].filter((t) => t.hasAttribute('x') || t.hasAttribute('dy') || t.hasAttribute('y'));
  const parts: SVGTextContentElement[] = tspans.length ? tspans : [el];
  const fsUser = parseFloat(getComputedStyle(el).fontSize) || 1;
  const scale = Math.hypot(m.a, m.b);
  const rot = (-Math.atan2(m.b, m.a) * 180) / Math.PI;
  for (const t of parts) {
    const s = (t.textContent ?? '').trim();
    if (!s || !t.getNumberOfChars()) continue;
    let p0: DOMPoint;
    try {
      p0 = t.getStartPositionOfChar(0);
    } catch {
      continue;
    }
    const p = new DOMPoint(p0.x, p0.y).matrixTransform(m);
    const x = p.x + dx;
    if (clip && (x < clip.x0 - 0.5 || x > clip.x1 + 0.5 || p.y < clip.y0 - 0.5 || p.y > clip.y1 + 0.5)) continue;
    // Our font size is cap height ÷ 0.7; DXF text height is the cap height.
    const fs = (parseFloat(getComputedStyle(t).fontSize) || fsUser) * scale;
    w.text(x, p.y, fs * 0.7, rot, s, layer, color);
  }
}

/** The DXF text of the chart(s) drawn by `draw`, which is called once per chart and resolves with that chart's svg. */
export async function chartsToDxf(paperW: number, paperH: number, sheets: number[], draw: (i: number) => Promise<SVGSVGElement | null>): Promise<string> {
  const w = new DxfWriter(paperH);
  let k = 0;
  for (const i of sheets) {
    const svg = await draw(i);
    if (svg) writeSheet(svg, w, k * (paperW + 50));
    k++;
  }
  return w.toString();
}
