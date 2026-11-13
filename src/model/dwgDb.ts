/**
 * DXF text from a drawing LibreDWG has read into JavaScript objects. Used when
 * LibreDWG's own DXF writer stops on a drawing it can read but not write out.
 * Only what the DXF reader draws is written: lines, polylines, arcs, circles,
 * ellipses, splines (as polylines through the curve), solids, leaders, text,
 * block inserts with their attributes, and dimensions.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = { x: number; y: number; z?: number };
type E = Record<string, any> & { type: string; layer?: string };

export interface DwgDb {
  entities: E[];
  tables: { BLOCK_RECORD?: { entries: { name: string; basePoint?: P; entities?: E[] }[] } };
}

const DEG = 180 / Math.PI;
const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const fmt = (v: number) => (Number.isFinite(v) ? String(+v.toFixed(9)) : '0');
const oneLine = (s: string) => s.replace(/\r\n|\r|\n/g, '\\P');

class Out {
  rows: string[] = [];
  g(code: number, v: string | number) {
    this.rows.push(String(code), typeof v === 'number' ? fmt(v) : v);
  }
  pt(code: number, p: P | undefined) {
    this.g(code, n(p?.x));
    this.g(code + 10, n(p?.y));
  }
}

/** Points along a NURBS curve (de Boor), or null when its data doesn't add up. */
export function splinePoints(degree: number, knots: number[], ctl: P[], weights?: number[]): number[] | null {
  const p = degree;
  const m = ctl.length;
  if (p < 1 || m < p + 1 || knots.length !== m + p + 1) return null;
  const w = weights?.length === m ? weights : ctl.map(() => 1);
  const t0 = knots[p];
  const t1 = knots[m];
  if (!(t1 > t0)) return null;
  const steps = Math.min(400, Math.max(16, m * 8));
  const out: number[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s === steps ? t1 - 1e-12 * (t1 - t0) : t0 + ((t1 - t0) * s) / steps;
    let k = p;
    while (k < m - 1 && knots[k + 1] <= t) k++;
    const d = [];
    for (let j = 0; j <= p; j++) {
      const c = ctl[k - p + j];
      const wj = w[k - p + j] || 1;
      d.push([c.x * wj, c.y * wj, wj]);
    }
    for (let r = 1; r <= p; r++)
      for (let j = p; j >= r; j--) {
        const i = k - p + j;
        const den = knots[i + p - r + 1] - knots[i];
        const a = den ? (t - knots[i]) / den : 0;
        for (let q = 0; q < 3; q++) d[j][q] = (1 - a) * d[j - 1][q] + a * d[j][q];
      }
    out.push(d[p][0] / d[p][2], d[p][1] / d[p][2]);
  }
  return out;
}

/** A smooth curve through fit points (cubic Hermite, chord-length tangents; given end tangents kept). */
export function fitCurve(pts: P[], t0?: P, t1?: P): number[] {
  const k = pts.length;
  const unit = (v: P | undefined) => {
    const l = Math.hypot(n(v?.x), n(v?.y));
    return l > 1e-12 ? { x: n(v!.x) / l, y: n(v!.y) / l } : null;
  };
  const tan: P[] = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(k - 1, i + 1)];
    const u = unit({ x: b.x - a.x, y: b.y - a.y }) ?? { x: 0, y: 0 };
    return u;
  });
  const s0 = unit(t0);
  const s1 = unit(t1);
  if (s0) tan[0] = s0;
  if (s1) tan[k - 1] = s1;
  const out: number[] = [pts[0].x, pts[0].y];
  for (let i = 0; i < k - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = 12;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
      const h10 = t ** 3 - 2 * t ** 2 + t;
      const h01 = -2 * t ** 3 + 3 * t ** 2;
      const h11 = t ** 3 - t ** 2;
      out.push(h00 * a.x + h10 * d * tan[i].x + h01 * b.x + h11 * d * tan[i + 1].x, h00 * a.y + h10 * d * tan[i].y + h01 * b.y + h11 * d * tan[i + 1].y);
    }
  }
  return out;
}

function writeText(o: Out, type: 'TEXT' | 'ATTRIB', t: any, layer: string, mirror: boolean, extra?: (o: Out) => void) {
  const s = String(t?.text ?? '');
  if (!s.trim()) return;
  const fx = (p: P | undefined) => (mirror ? { x: -n(p?.x), y: n(p?.y) } : p);
  o.g(0, type);
  o.g(8, layer);
  o.pt(10, fx(t.startPoint));
  o.g(40, n(t.textHeight, 1));
  o.g(1, oneLine(s));
  const rot = n(t.rotation) * DEG;
  o.g(50, mirror ? 180 - rot : rot);
  const h = n(t.halign);
  if (h) {
    o.g(72, h);
    o.pt(11, fx(t.endPoint ?? t.alignmentPoint));
  }
  extra?.(o);
}

function writeEntity(o: Out, e: E) {
  const layer = e.layer || '0';
  if (e.isVisible === false || e.isInPaperSpace) return;
  const mirror = n(e.extrusionDirection?.z, 1) < 0;
  const mx = (x: number) => (mirror ? -x : x);
  const poly = (pts: { x: number; y: number; bulge?: number }[], closed: boolean) => {
    if (pts.length < 2) return;
    o.g(0, 'LWPOLYLINE');
    o.g(8, layer);
    o.g(90, pts.length);
    o.g(70, closed ? 1 : 0);
    for (const v of pts) {
      o.g(10, mx(n(v.x)));
      o.g(20, n(v.y));
      if (v.bulge) o.g(42, mirror ? -v.bulge : v.bulge);
    }
  };
  switch (e.type) {
    case 'LINE':
      o.g(0, 'LINE');
      o.g(8, layer);
      o.pt(10, e.startPoint);
      o.pt(11, e.endPoint);
      break;
    case 'LWPOLYLINE':
      poly(e.vertices ?? [], (n(e.flag) & 1) === 1 || (n(e.flag) & 512) === 512);
      break;
    case 'POLYLINE2D':
    case 'POLYLINE3D':
      if (n(e.flag) & (16 | 64)) break; // meshes
      poly((e.vertices ?? []).filter((v: any) => !(n(v.flag) & 16)), (n(e.flag) & 1) === 1);
      break;
    case 'CIRCLE':
    case 'ARC': {
      o.g(0, e.type);
      o.g(8, layer);
      o.g(10, mx(n(e.center?.x)));
      o.g(20, n(e.center?.y));
      o.g(40, n(e.radius));
      if (e.type === 'ARC') {
        const a0 = n(e.startAngle) * DEG;
        const a1 = n(e.endAngle) * DEG;
        o.g(50, mirror ? 180 - a1 : a0);
        o.g(51, mirror ? 180 - a0 : a1);
      }
      break;
    }
    case 'ELLIPSE':
      o.g(0, 'ELLIPSE');
      o.g(8, layer);
      o.pt(10, e.center);
      o.pt(11, e.majorAxisEndPoint);
      o.g(40, n(e.axisRatio, 1));
      o.g(41, n(e.startAngle));
      o.g(42, n(e.endAngle, Math.PI * 2));
      break;
    case 'SPLINE': {
      const fit: P[] = e.fitPoints ?? [];
      const pts = splinePoints(n(e.degree, 3), e.knots ?? [], e.controlPoints ?? [], e.weights);
      if (pts) {
        const vs = [];
        for (let i = 0; i < pts.length; i += 2) vs.push({ x: pts[i], y: pts[i + 1] });
        poly(vs, false);
      } else if (fit.length >= 2) {
        const c = fitCurve(fit, e.startTangent, e.endTangent);
        const vs = [];
        for (let i = 0; i < c.length; i += 2) vs.push({ x: c[i], y: c[i + 1] });
        poly(vs, false);
      } else poly(e.controlPoints ?? [], false);
      break;
    }
    case 'LEADER':
      poly(e.vertices ?? [], false);
      break;
    case 'SOLID':
    case 'TRACE':
      o.g(0, 'SOLID');
      o.g(8, layer);
      o.pt(10, e.corner1);
      o.pt(11, e.corner2);
      o.pt(12, e.corner3);
      o.pt(13, e.corner4 ?? e.corner3);
      break;
    case 'TEXT':
      writeText(o, 'TEXT', e, layer, mirror);
      break;
    case 'MTEXT': {
      const s = String(e.text ?? '');
      if (!s.trim()) break;
      o.g(0, 'MTEXT');
      o.g(8, layer);
      o.pt(10, e.insertionPoint);
      o.g(40, n(e.textHeight, 1));
      o.g(71, n(e.attachmentPoint, 1));
      o.g(1, oneLine(s));
      if (e.direction && (n(e.direction.x) || n(e.direction.y))) o.pt(11, e.direction);
      else o.g(50, n(e.rotation) * DEG);
      break;
    }
    case 'INSERT': {
      const attribs: any[] = (e.attribs ?? []).filter((a: any) => !(n(a.flags) & 1));
      o.g(0, 'INSERT');
      o.g(8, layer);
      if (attribs.length) o.g(66, 1);
      o.g(2, String(e.name ?? ''));
      o.g(10, mx(n(e.insertionPoint?.x)));
      o.g(20, n(e.insertionPoint?.y));
      o.g(41, mirror ? -n(e.xScale, 1) : n(e.xScale, 1));
      o.g(42, n(e.yScale, 1));
      o.g(50, (mirror ? -1 : 1) * n(e.rotation) * DEG);
      if (n(e.columnCount, 1) > 1 || n(e.rowCount, 1) > 1) {
        o.g(70, n(e.columnCount, 1));
        o.g(71, n(e.rowCount, 1));
        o.g(44, n(e.columnSpacing));
        o.g(45, n(e.rowSpacing));
      }
      if (attribs.length) {
        for (const a of attribs) writeText(o, 'ATTRIB', a.text ?? a, a.layer || layer, false, (x) => x.g(70, n(a.flags)));
        o.g(0, 'SEQEND');
      }
      break;
    }
    case 'DIMENSION':
      if (!e.name) break;
      o.g(0, 'DIMENSION');
      o.g(8, layer);
      o.g(2, String(e.name));
      break;
  }
}

/** Write the drawing as an ASCII DXF the DXF reader understands. */
export function dwgDbToDxf(db: DwgDb): string {
  const o = new Out();
  o.g(0, 'SECTION');
  o.g(2, 'BLOCKS');
  for (const b of db.tables.BLOCK_RECORD?.entries ?? []) {
    if (/^\*(Model|Paper)_Space/i.test(b.name)) continue;
    o.g(0, 'BLOCK');
    o.g(8, '0');
    o.g(2, b.name);
    o.pt(10, b.basePoint);
    for (const e of b.entities ?? []) writeEntity(o, { ...e, isInPaperSpace: false });
    o.g(0, 'ENDBLK');
  }
  o.g(0, 'ENDSEC');
  o.g(0, 'SECTION');
  o.g(2, 'ENTITIES');
  for (const e of db.entities) writeEntity(o, e);
  o.g(0, 'ENDSEC');
  o.g(0, 'EOF');
  return o.rows.join('\n');
}
