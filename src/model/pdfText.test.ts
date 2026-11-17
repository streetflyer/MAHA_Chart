import { describe, expect, it } from "vitest";
import { pdfRuns, pdfString } from "./pdfExport";

describe("pdf text", () => {
  it("draws a superscript two as a raised digit, with no extra mark", () => {
    const r = pdfRuns("APEX²", "F0", 10);
    expect(r).toContain("(APEX) Tj");
    expect(r).toContain("(2) Tj");
    expect(r).not.toContain("-");
    expect(r).not.toContain("\\262");
  });
  it("drops invisible characters and maps look-alike hyphens", () => {
    expect(pdfString("A­B​C")).toBe("ABC");
    expect(pdfString("a‑b")).toBe("a-b");
    expect(pdfString("x⁴")).toBe("x4");
  });
});
