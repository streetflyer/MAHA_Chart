import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseStamp } from "./importers";
import { sessionText, connectSessions, surveySessions } from "./events";

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

describe("connectSessions", () => {
  const s = [
    { t0: 1, t1: 2, k0: 0, k1: 2835 },
    { t0: 10, t1: 11, k0: 2846, k1: 2906 },
  ];
  it("joins sessions end to end", () => {
    const j = connectSessions(s);
    expect(j[0].k1).toBe(2846);
    expect(j[1].k0).toBe(2846);
  });
  it("uses the user's KPs and moves the neighbour", () => {
    const j = connectSessions(s, { "1": { k0: 0, k1: 2800 } });
    expect(j[0].k1).toBe(2800);
    expect(j[1].k0).toBe(2800);
  });
});
