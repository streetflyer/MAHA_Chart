import { describe, expect, it } from "vitest";
import { eventKeys } from "./datasets";

describe("eventKeys", () => {
  it("gives repeated code and KP pairs their own key", () => {
    const list = [
      { code: "A1", kp: 6 },
      { code: "A1", kp: 6 },
      { code: "FJ", kp: 6 },
      { code: "A1", kp: 281 },
      { code: "A1", kp: 281 },
      { code: "A1", kp: 6 },
    ];
    const keys = eventKeys(list);
    expect(new Set(keys).size).toBe(list.length);
    // The first keeps the plain key, so saved label edits still apply to it.
    expect(keys[0]).toBe("A1@6.000");
    expect(keys[1]).toBe("A1@6.000#2");
    expect(keys[5]).toBe("A1@6.000#3");
    expect(keys[3]).toBe("A1@281.000");
  });
});
