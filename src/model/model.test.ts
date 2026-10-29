import { describe, expect, it } from 'vitest';
import { normalize } from '../state/store';
import { alignmentSheetA1, alignmentSheetA1NoCp } from './builtinTemplates';
import { parseDxfLinework } from './dxf';
import { findFreeSpot } from './freeSpace';
import { linkedEdges, resizeEdge } from './layout';
import { paperDimensions, resizePaper } from './paper';
import { autoSheets, chartFrames, chartGeometry, nearestChainage, pointAt, parseRoute, reverseRoute, robustBounds } from './route';
import { deleteSheet, editSheet, insertSheet, niceScaleBar, setHorizontalScale, setKpPerSheet, sheetCount, sheetRange, syncScaleToPlan } from './scale';
import { templateTokens } from './tokens';

const byId = (t: ReturnType<typeof alignmentSheetA1>, id: string) => t.panels.find((p) => p.id === id)!;

describe('built-in alignment sheet', () => {
  it('matches the 5-panel DXF: 630 mm plan view at 1:5,000 covers 3.150 km', () => {
    const t = alignmentSheetA1();
    expect(byId(t, 'p_plan').w).toBe(630);
    expect(t.scale.kpPerSheet).toBe(3150);
    expect(byId(t, 'p_events').rows).toHaveLength(12);
  });
});

describe('dividers', () => {
  it('resizing one panel leaves panels across a gap alone', () => {
    const t = alignmentSheetA1();
    expect(linkedEdges(t.panels, 'p_plan', 'bottom')).toEqual([['p_plan', 'bottom']]);
    const panels = resizeEdge(t.panels, 'p_plan', 'right', 600);
    expect(panels.find((p) => p.id === 'p_info')!.x).toBeCloseTo(655.5);
  });

  it('a shared edge between two chart information sections moves both', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 's_legend', 'bottom', 140);
    const legend = panels.find((p) => p.id === 's_legend')!;
    expect(legend.y + legend.h).toBeCloseTo(140);
    expect(panels.find((p) => p.id === 's_notes')!.y).toBeCloseTo(140);
  });

  it('the chart information container edge moves its sections with it', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 'p_info', 'left', 640);
    expect(panels.find((p) => p.id === 's_scale')!.x).toBeCloseTo(640);
    expect(panels.find((p) => p.id === 's_acquired')!.x).toBeCloseTo(777.7);
  });

  it('unlinked resize (Alt) moves only the dragged panel', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 's_legend', 'bottom', 140, false);
    expect(panels.find((p) => p.id === 's_notes')!.y).toBeCloseTo(148.5);
  });

  it('never shrinks a panel below the minimum', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 's_legend', 'bottom', 400);
    expect(panels.find((p) => p.id === 's_notes')!.h).toBeGreaterThanOrEqual(5);
  });
});

describe('viewport-style scale', () => {
  it('changing the scale never resizes a panel; KP per chart follows', () => {
    const t = alignmentSheetA1();
    const a = setHorizontalScale(t, 2000);
    expect(byId(a, 'p_plan').w).toBe(630);
    expect(a.scale.kpPerSheet).toBe(1260);
    const b = setHorizontalScale(a, 5000);
    expect(b.scale.kpPerSheet).toBe(3150);
    const c = setHorizontalScale(t, 10000);
    expect(c.scale.kpPerSheet).toBe(6300);
    expect(byId(c, 'p_long').w).toBe(630);
  });

  it('resizing the plan view keeps the scale and changes KP per chart', () => {
    const t = alignmentSheetA1();
    const next = normalize(t, { ...t, panels: resizeEdge(t.panels, 'p_plan', 'right', 14.7 + 500) });
    expect(next.scale.horizontal).toBe(5000);
    expect(next.scale.kpPerSheet).toBe(2500);
    expect(byId(next, 'p_events').w).toBeCloseTo(500);
  });

  it('typing KP per chart picks the scale', () => {
    const next = setKpPerSheet(alignmentSheetA1(), 6300);
    expect(next.scale.horizontal).toBe(10000);
  });
});

describe('charts needed for the survey line', () => {
  it('10 km at 1:5,000 on a 630 mm plan view needs 4 charts', () => {
    const t = alignmentSheetA1();
    const s = setHorizontalScale({ ...t, scale: { ...t.scale, routeLength: 10000 } }, 5000);
    expect(sheetCount(s)).toBe(4);
    expect(sheetRange(s, 1)).toEqual({ start: 3.15, end: 6.3 });
    expect(templateTokens(s, 3).SHEET).toBe('4');
    expect(templateTokens(s, 3).NUM_CHARTS).toBe('04');
  });

  it('an exact fit does not add an empty chart', () => {
    const t = alignmentSheetA1();
    expect(sheetCount({ ...t, scale: { ...t.scale, routeLength: 6300 } })).toBe(2);
  });
});

describe('free space for new panels', () => {
  it('finds a spot that overlaps nothing once the CP panel is gone', () => {
    const t = alignmentSheetA1NoCp();
    const events = t.panels.find((p) => p.id === 'p_events')!;
    const smaller = { ...t, panels: t.panels.map((p) => (p.id === 'p_events' ? { ...p, h: 100 } : p)) };
    const r = findFreeSpot(smaller, 200, 40);
    expect(r.y).toBeGreaterThan(events.y + 100);
  });
});

describe('paper', () => {
  it('scales the layout to A3 and keeps KP per sheet', () => {
    const t = alignmentSheetA1();
    const [w, h] = paperDimensions('A3', 'landscape');
    const next = syncScaleToPlan(resizePaper(t, w, h));
    expect(next.paper.width).toBe(420);
    expect(next.scale.horizontal).toBe(5000);
    expect(next.scale.kpPerSheet).toBeCloseTo(1573, 0);
  });
});

describe('scale bar', () => {
  it('picks a round length that fits', () => {
    expect(niceScaleBar(5000, 120)).toEqual({ metres: 500, divisions: 5, paperMm: 100 });
  });
});

describe('tokens', () => {
  it('gives the KP range of later sheets with overlap', () => {
    const t = alignmentSheetA1();
    const tk = templateTokens({ ...t, scale: { ...t.scale, overlap: 150 } }, 1);
    expect(tk.KP_START).toBe('3.000');
    expect(tk.KP_END).toBe('6.150');
  });

  it('takes Rev from the newest revision row and Plot Size from the paper', () => {
    const tk = templateTokens(alignmentSheetA1());
    expect(tk.REV).toBe('1');
    expect(tk.PLOT_SIZE).toBe('ISO A1');
  });
});

describe('route and key plan', () => {
  it('reads a .dig and frames each chart from its start KP along the line', () => {
    const dig = '#unit=m\n#Type=Pipe\n' + Array.from({ length: 10001 }, (_, i) => `${500000 + i} 9800000 -40`).join('\n');
    const r = parseRoute(dig, 'line.dig')!;
    expect(r.length).toBeCloseTo(10000);
    const t = alignmentSheetA1();
    const s = { ...t, scale: { ...t.scale, routeLength: r.length } };
    const frames = chartFrames(s, r);
    expect(frames).toHaveLength(4);
    // Chart 2 starts at KP 3.150: 3150 m along an eastward line.
    expect(frames[1][0][0]).toBeCloseTo(503150);
    expect(frames[1][1][0]).toBeCloseTo(506300);
    expect(frames[1][2][1] - frames[1][1][1]).toBeCloseTo((132 * 5000) / 1000);
  });

  it('reads lines and polylines from a DXF', () => {
    const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '10', '1', '20', '2', '11', '3', '21', '4', '0', 'LWPOLYLINE', '90', '3', '70', '1', '10', '0', '20', '0', '10', '5', '20', '0', '10', '5', '20', '5', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const lw = parseDxfLinework(dxf, 'bg.dxf')!;
    expect(lw.lines).toHaveLength(2);
    expect(lw.lines[1]).toHaveLength(8);
    expect(lw.bounds).toEqual({ minE: 0, minN: 0, maxE: 5, maxN: 5 });
  });
});

describe('fine-tuning charts', () => {
  const line = parseRoute(Array.from({ length: 10001 }, (_, i) => `${500000 + i} 9800000`).join('\n'), 'l')!;
  it('a dragged chart moves on its own and more charts are added if the end is uncovered', () => {
    const t = alignmentSheetA1();
    const base = { ...t, scale: { ...t.scale, routeLength: 10000 } };
    const s = editSheet(base, 3, { start: 8950 });
    expect(sheetRange(s, 3).start).toBeCloseTo(8.95);
    expect(sheetRange(s, 2).start).toBeCloseTo(6.3);
    expect(sheetCount(s)).toBe(4);
    const back = editSheet({ ...t, scale: { ...t.scale, routeLength: 12600 } }, 3, { start: 8950 });
    expect(sheetCount(back)).toBe(5);
  });

  it('chart 1 can start before KP 0, and charts can be added, deleted and turned', () => {
    const t = alignmentSheetA1();
    const base = { ...t, scale: { ...t.scale, routeLength: 10000 } };
    const early = editSheet(base, 0, { start: -200 });
    expect(sheetRange(early, 0).start).toBeCloseTo(-0.2);
    const g = chartGeometry(early, line, 0)!;
    expect(g.origin[0]).toBeCloseTo(499800);
    const more = insertSheet(base, 1);
    expect(sheetCount(more)).toBe(5);
    expect(sheetRange(more, 2).start).toBeCloseTo(4.725);
    expect(sheetCount(deleteSheet(more, 2))).toBe(4);
    const turned = chartGeometry(editSheet(base, 0, { rotation: 90 }), line, 0)!;
    expect(turned.u[0]).toBeCloseTo(0);
    expect(turned.u[1]).toBeCloseTo(1);
  });

  it('reversing puts KP 0 at the other end', () => {
    const r = reverseRoute(line);
    expect(r.en[0]).toBe(510000);
    expect(nearestChainage(r, 509000, 9800050)).toBeCloseTo(1000);
  });

  it('ignores stray entities when fitting a background', () => {
    const lines = [new Float64Array([0, 0, 1, 1]), ...Array.from({ length: 300 }, (_, i) => new Float64Array([570000 + i, 9850000, 570000 + i, 9851000]))];
    const b = robustBounds(lines);
    expect(b.minE).toBeGreaterThan(560000);
  });
});

describe('automatic frames at bends', () => {
  it('cuts a chart short at a sharp bend so the line stays inside every frame', () => {
    const pts: string[] = [];
    for (let i = 0; i <= 2000; i++) pts.push(`${500000 + i} 9800000`);
    for (let i = 1; i <= 3000; i++) pts.push(`${502000} ${9800000 + i}`);
    const r = parseRoute(pts.join('\n'), 'L')!;
    const t0 = alignmentSheetA1();
    const t = { ...t0, scale: { ...t0.scale, routeLength: r.length } };
    const auto = autoSheets(t, r)!;
    const s = { ...t, scale: { ...t.scale, autoSheets: auto } };
    expect(auto[0].end).toBeDefined();
    expect(auto[0].end!).toBeLessThan(3150);
    for (let i = 0; i < sheetCount(s); i++) {
      const g = chartGeometry(s, r, i)!;
      const { start, end } = sheetRange(s, i);
      for (let m = Math.max(0, start * 1000); m <= Math.min(r.length, end * 1000); m += 25) {
        const [e, n] = pointAt(r, m);
        const de = e - g.origin[0];
        const dn = n - g.origin[1];
        const pu = de * g.u[0] + dn * g.u[1];
        const pv = -de * g.u[1] + dn * g.u[0];
        expect(pu).toBeGreaterThanOrEqual(-1);
        expect(pu).toBeLessThanOrEqual(g.along + 1);
        expect(Math.abs(pv)).toBeLessThanOrEqual(g.across / 2);
      }
    }
    expect(sheetRange(s, sheetCount(s) - 1).end * 1000).toBeGreaterThanOrEqual(r.length - 1);
  });
});
