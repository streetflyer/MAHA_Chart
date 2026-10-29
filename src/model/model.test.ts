import { describe, expect, it } from 'vitest';
import { normalize } from '../state/store';
import { alignmentSheetA1, alignmentSheetA1NoCp } from './builtinTemplates';
import { findFreeSpot } from './freeSpace';
import { linkedEdges, resizeEdge } from './layout';
import { paperDimensions, resizePaper } from './paper';
import { niceScaleBar, setHorizontalScale, setKpPerSheet, sheetCount, sheetRange, syncScaleToPlan } from './scale';
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
