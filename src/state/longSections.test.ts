import { describe, expect, it } from "vitest";
import { longSectionAt, longSections } from "./longSections";

describe("longSectionAt", () => {
  it("ignores an entry whose data set is no longer loaded", () => {
    longSections.set("p|gone", {
      panelId: "p",
      datasetId: "gone",
      y: 0,
      h: 10,
      parts: [{ xa: 0, xb: 10 }],
    });
    expect(longSectionAt(5, 5)).toBeNull();
  });
});
