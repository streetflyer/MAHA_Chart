import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseStamp } from "./importers";
import { sessionText, surveySessions } from "./events";

describe("survey sessions from event time stamps", () => {
  it("reads day-first stamps", () => {
    const t = parseStamp("01/11/2026 01:58:50");
    const d = new Date(t);
    expect([
      d.getDate(),
      d.getMonth() + 1,
      d.getHours(),
      d.getSeconds(),
    ]).toEqual([1, 11, 1, 50]);
  });
  it("splits the log where it stops", () => {
    const rows = readFileSync(
      new URL("./fixtures/umb2_events.csv", import.meta.url),
      "utf8",
    )
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(";"))
      .filter((r) => r.length > 9)
      .map((r) => ({ kp: Number(r[9]) * 1000, t: parseStamp(r[5]) }));
    const s = surveySessions(rows, 60);
    expect(s.length).toBeGreaterThan(0);
  });
});
