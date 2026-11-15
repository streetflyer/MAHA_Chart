import { describe, expect, it } from "vitest";
import { askConfirm, askText, dialogsPending } from "./Dialog";

describe("questions to the user", () => {
  it("a second question waits instead of replacing the first", () => {
    void askText("First");
    void askConfirm("Second", "?");
    expect(dialogsPending()).toBe(2);
  });
});
