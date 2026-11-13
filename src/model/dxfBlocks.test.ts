import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDxfLinework } from './dxf';

describe('DXF blocks, text and small objects', () => {
  const lw = parseDxfLinework(readFileSync(new URL('./fixtures/blocks.dxf', import.meta.url), 'utf8'), 'blocks.dxf')!;
  it('keeps text, attributes and the block insert', () => {
    expect(lw.texts.map((t) => t.text).sort()).toEqual(['B1', 'Branch [Relocated]']);
    // Line, block line, block square, bulge arc, ellipse.
    expect(lw.lines.length).toBe(5);
  });
  it('places the block at its insertion point, scaled and rotated', () => {
    // The block line runs from the base point (1,1) to (3,2): 2× and 30°.
    const blockLine = lw.lines.find((l) => l.length === 4 && Math.abs(l[0] - 583570) < 1e-6)!;
    expect(blockLine[1]).toBeCloseTo(9852005);
    const dx = 4;
    const dy = 2;
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    expect(blockLine[2]).toBeCloseTo(583570 + dx * c - dy * s);
    expect(blockLine[3]).toBeCloseTo(9852005 + dx * s + dy * c);
  });
  it('turns a bulge into an arc', () => {
    const arc = lw.lines.find((l) => l.length > 6 && Math.abs(l[0] - 583565) < 1e-6)!;
    // Half circle of radius 0.5 above or below the chord.
    const mid = arc.length / 2;
    expect(Math.abs(arc[mid + 1] - 9852000)).toBeGreaterThan(0.3);
  });
});
