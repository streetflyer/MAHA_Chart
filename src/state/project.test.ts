import { describe, expect, it } from "vitest";
import { folderStatus, projectLink } from "./project";

describe("project states", () => {
  it("names a folder's state", () => {
    const s = { active: "A", charts: { B: {} as never } };
    expect(folderStatus(s, "A", 3)).toBe("onScreen");
    expect(folderStatus(s, "B", 3)).toBe("charted");
    expect(folderStatus(s, "C", 2)).toBe("files");
    expect(folderStatus(s, "D", 0)).toBe("empty");
  });
  it("names how the project is tied to the disk", () => {
    expect(projectLink({ tree: null, handle: null })).toBe("none");
    expect(projectLink({ tree: {} as never, handle: null })).toBe("readOnly");
    expect(projectLink({ tree: {} as never, handle: {} as never })).toBe(
      "linked",
    );
    expect(projectLink({ tree: null, handle: null, reconnect: "Job" })).toBe(
      "reconnect",
    );
  });
});
