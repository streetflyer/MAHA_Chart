import { describe, expect, it } from 'vitest';
import { normalize } from '../state/store';
import { alignmentSheetA1 } from './builtinTemplates';
import { linkedEdges, resizeEdge } from './layout';
import { paperDimensions, resizePaper } from './paper';
import { niceScaleBar, setHorizontalScale, syncScaleToPlan } from './scale';
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
  it('dragging the gutter between plan view and longitudinal profile moves both', () => {
    const t = alignmentSheetA1();
    const edges = linkedEdges(t.panels, 'p_plan', 'bottom');
    expect(edges).toContainEqual(['p_long', 'top']);
    const panels = resizeEdge(t.panels, 'p_plan', 'bottom', 157.5);
    const plan = panels.find((p) => p.id === 'p_plan')!;
    const long = panels.find((p) => p.id === 'p_long')!;
    expect(plan.h).toBeCloseTo(142);
    expect(long.y).toBeCloseTo(169.5);
    expect(long.y + long.h).toBeCloseTo(239.5); // bottom unchanged
  });

  it('a shared edge between two chart information sections moves both', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 's_legend', 'bottom', 140);
    expect(panels.find((p) => p.id === 's_legend')!.y + panels.find((p) => p.id === 's_legend')!.h).toBeCloseTo(140);
    expect(panels.find((p) => p.id === 's_notes')!.y).toBeCloseTo(140);
  });

  it('the column gutter moves the chart information container and all its sections', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 'p_plan', 'right', 600);
    expect(panels.find((p) => p.id === 'p_info')!.x).toBeCloseTo(655.5 - 44.7);
    expect(panels.find((p) => p.id === 's_scale')!.x).toBeCloseTo(655.5 - 44.7);
  });

  it('unlinked resize (Alt) moves only the dragged panel', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 'p_plan', 'bottom', 157.5, false);
    expect(panels.find((p) => p.id === 'p_long')!.y).toBeCloseTo(159.5);
  });

  it('never shrinks a panel below the minimum', () => {
    const t = alignmentSheetA1();
    const panels = resizeEdge(t.panels, 'p_plan', 'bottom', 400);
    const long = panels.find((p) => p.id === 'p_long')!;
    expect(long.h).toBeGreaterThanOrEqual(5);
  });
});

describe('linked scale', () => {
  it('with KP locked, narrowing the plan view changes the scale and the profiles follow', () => {
    const t = alignmentSheetA1();
    const next = normalize(t, { ...t, panels: resizeEdge(t.panels, 'p_plan', 'right', 14.7 + 315, false) });
    expect(next.scale.horizontal).toBe(10000);
    expect(byId(next, 'p_long').w).toBeCloseTo(315);
    expect(templateTokens(next).H_SCALE).toBe('1:10,000');
  });

  it('with scale locked, resizing the plan view changes KP per sheet instead', () => {
    const t0 = alignmentSheetA1();
    const t = { ...t0, scale: { ...t0.scale, lock: 'scale' as const } };
    const next = syncScaleToPlan({ ...t, panels: t.panels.map((p) => (p.id === 'p_plan' ? { ...p, w: 500 } : p)) });
    expect(next.scale.horizontal).toBe(5000);
    expect(next.scale.kpPerSheet).toBe(2500);
  });

  it('typing a new scale resizes the plan view when KP is locked', () => {
    const t = alignmentSheetA1();
    const next = setHorizontalScale(t, 6000);
    expect(byId(next, 'p_plan').w).toBeCloseTo(525);
    expect(byId(next, 'p_cp').w).toBeCloseTo(525);
  });

  it('caps the plan view at the paper edge and shortens the KP range instead', () => {
    const t = alignmentSheetA1();
    const next = setHorizontalScale(t, 2000);
    expect(byId(next, 'p_plan').x + byId(next, 'p_plan').w).toBeLessThanOrEqual(841);
    expect(next.scale.kpPerSheet).toBeLessThan(3150);
  });

  it('a resized KP-aligned panel drags the plan view with it', () => {
    const t = alignmentSheetA1();
    const next = normalize(t, { ...t, panels: t.panels.map((p) => (p.id === 'p_long' ? { ...p, w: 600 } : p)) });
    expect(byId(next, 'p_plan').w).toBe(600);
    expect(byId(next, 'p_events').w).toBe(600);
    expect(next.scale.horizontal).toBe(5250);
  });
});

describe('paper', () => {
  it('scales the layout to A3 and keeps KP per sheet', () => {
    const t = alignmentSheetA1();
    const [w, h] = paperDimensions('A3', 'landscape');
    const next = syncScaleToPlan(resizePaper(t, w, h));
    expect(next.paper.width).toBe(420);
    expect(next.scale.kpPerSheet).toBe(3150);
    expect(next.scale.horizontal).toBeCloseTo(10012, -1);
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
});
