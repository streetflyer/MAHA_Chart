import { describe, expect, it } from "vitest";
import { parseDxfLinework } from "./dxf";

const dxf = (rows: (string | number)[]) => rows.join("\n") + "\n";
const line = (layer: string, lw?: number) => [
  0,
  "LINE",
  8,
  layer,
  ...(lw === undefined ? [] : [370, lw]),
  10,
  0,
  20,
  0,
  11,
  10,
  21,
  0,
];

describe("AutoCAD lineweights", () => {
  const text = dxf([
    0,
    "SECTION",
    2,
    "TABLES",
    0,
    "TABLE",
    2,
    "LAYER",
    0,
    "LAYER",
    2,
    "THIN",
    62,
    1,
    370,
    13,
    0,
    "LAYER",
    2,
    "PLAIN",
    62,
    2,
    370,
    -3,
    0,
    "ENDTAB",
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
    ...line("THIN"),
    ...line("PLAIN"),
    ...line("PLAIN", 50),
    ...line("THIN", -3),
    0,
    "ENDSEC",
    0,
    "EOF",
  ]);
  it("reads by layer, own and default weights", () => {
    const lw = parseDxfLinework(text, "t.dxf")!;
    expect(lw.weights).toEqual([0.13, -1, 0.5, -1]);
  });
});
