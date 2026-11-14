import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDxfLinework } from "./dxf";

describe("DXF blocks, text and small objects", () => {
  const lw = parseDxfLinework(
    readFileSync(new URL("./fixtures/blocks.dxf", import.meta.url), "utf8"),
    "blocks.dxf",
  )!;
  it("keeps text, attributes and the block insert", () => {
    expect(lw.texts.map((t) => t.text).sort()).toEqual([
      "B1",
      "Branch [Relocated]",
    ]);
    // Line, block line, block square, bulge arc, ellipse.
    expect(lw.lines.length).toBe(5);
  });
  it("places the block at its insertion point, scaled and rotated", () => {
    // The block line runs from the base point (1,1) to (3,2): 2× and 30°.
    const blockLine = lw.lines.find(
      (l) => l.length === 4 && Math.abs(l[0] - 583570) < 1e-6,
    )!;
    expect(blockLine[1]).toBeCloseTo(9852005);
    const dx = 4;
    const dy = 2;
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    expect(blockLine[2]).toBeCloseTo(583570 + dx * c - dy * s);
    expect(blockLine[3]).toBeCloseTo(9852005 + dx * s + dy * c);
  });
  it("turns a bulge into an arc", () => {
    const arc = lw.lines.find(
      (l) => l.length > 6 && Math.abs(l[0] - 583565) < 1e-6,
    )!;
    // Half circle of radius 0.5 above or below the chord.
    const mid = arc.length / 2;
    expect(Math.abs(arc[mid + 1] - 9852000)).toBeGreaterThan(0.3);
  });
});

describe("DWG objects to DXF", () => {
  it("writes lines, text, inserts and splines the DXF reader draws", async () => {
    const { dwgDbToDxf } = await import("./dwgDb");
    const { parseDxfLinework } = await import("./dxf");
    const dxf = dwgDbToDxf({
      entities: [
        {
          type: "LINE",
          layer: "L",
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 10, y: 0 },
        },
        {
          type: "TEXT",
          layer: "T",
          text: "Branch [Relocated]",
          startPoint: { x: 1, y: 2 },
          textHeight: 2,
          rotation: Math.PI / 2,
          halign: 0,
        },
        {
          type: "INSERT",
          layer: "B",
          name: "SYM",
          insertionPoint: { x: 100, y: 100 },
          xScale: 2,
          yScale: 2,
          rotation: 0,
          attribs: [],
        },
        {
          type: "SPLINE",
          layer: "S",
          degree: 3,
          knots: [],
          controlPoints: [],
          fitPoints: [
            { x: 0, y: 0 },
            { x: 5, y: 5 },
            { x: 10, y: 0 },
          ],
        },
        {
          type: "ARC",
          layer: "A",
          center: { x: 0, y: 0 },
          radius: 1,
          startAngle: 0,
          endAngle: Math.PI,
        },
      ],
      tables: {
        BLOCK_RECORD: {
          entries: [
            { name: "*Model_Space", entities: [] },
            {
              name: "SYM",
              basePoint: { x: 0, y: 0 },
              entities: [
                {
                  type: "LINE",
                  layer: "0",
                  startPoint: { x: 0, y: 0 },
                  endPoint: { x: 1, y: 0 },
                },
              ],
            },
          ],
        },
      },
    });
    const lw = parseDxfLinework(dxf, "x.dwg")!;
    expect(lw.texts.map((t) => t.text)).toEqual(["Branch [Relocated]"]);
    expect(lw.texts[0].rot).toBeCloseTo(90);
    expect(lw.lines.length).toBe(4);
    const sym = lw.lines[lw.layers.indexOf("B")];
    expect([...sym]).toEqual([100, 100, 102, 100]);
    const spl = lw.lines[lw.layers.indexOf("S")];
    expect(spl.length).toBeGreaterThan(20);
  });
});
