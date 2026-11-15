import { describe, expect, it } from "vitest";
import { parseVideoRows, productIn, autoVideoText, periodsText } from "./video";

const rows = [
  ["Product Description", "Start", "", "End", "", "Remarks"],
  ["", "Date", "Time", "Date", "Time", ""],
  [
    "Umbilical UMB1",
    "30/10/2026",
    "21:21",
    "31/10/2026",
    "03:03",
    "Stopped for cargo operation.",
  ],
  [
    "Umbilical UMB1",
    "31/10/2026",
    "03:03",
    "31/10/2026",
    "10:17",
    "Stopped and relocated",
  ],
  [
    "Flowline 8” FL3",
    "01/11/2026",
    "02:47",
    "01/11/2026",
    "06:28",
    "FL3 completed",
  ],
];

describe("video log", () => {
  it("reads the survey summary table", () => {
    const v = parseVideoRows(rows);
    expect(v).toHaveLength(3);
    expect(v[0]).toMatchObject({
      product: "Umbilical UMB1",
      start: "2026-10-30T21:21",
      end: "2026-10-31T03:03",
    });
  });
  it("joins close lines and lists separate periods", () => {
    const v = parseVideoRows(rows);
    expect(productIn(v, "33DJ100160-T1201-UMB1-CH-01")).toBe("UMB1");
    expect(
      autoVideoText(v, {
        drawingNo: "X-UMB1-CH-01",
        folder: "",
        joinHours: 12,
      }),
    ).toBe("30 October 2026 21:21 PM to 31 October 2026 10:17 AM");
    expect(
      periodsText([
        { start: "2026-10-31T18:57", end: "2026-11-01T02:25" },
        { start: "2026-11-02T14:11", end: "2026-11-02T17:12" },
        { start: "2026-11-03T01:00", end: "2026-11-03T02:00" },
      ]),
    ).toBe(
      "31 October 2026 18:57 PM to 1 November 2026 02:25 AM, 2 November 2026 14:11 PM to 2 November 2026 17:12 PM, and 3 November 2026 01:00 AM to 3 November 2026 02:00 AM",
    );
  });
  it("reads Excel serials", () => {
    const v = parseVideoRows([["FJ1", "46325.5", "46326.25", "ok"]]);
    expect(v[0].start).toBe("2026-10-30T12:00");
  });
});

import { autoSurveyDate } from "./video";
describe("survey date from the video list", () => {
  it("lists every day the product's video covers", () => {
    const rows = [
      {
        id: "a",
        product: "Umbilical UMB2",
        start: "2025-03-14T14:14",
        end: "2025-03-14T20:00",
        remarks: "",
      },
      {
        id: "b",
        product: "Umbilical UMB2",
        start: "2025-03-18T22:00",
        end: "2025-03-19T03:00",
        remarks: "",
      },
      {
        id: "c",
        product: "Flowline FL1",
        start: "2025-03-20T10:00",
        end: "2025-03-20T12:00",
        remarks: "",
      },
    ];
    expect(
      autoSurveyDate(rows, {
        drawingNo: "33DJ-T1201-UMB2-002.001",
        folder: "",
      }),
    ).toBe("14/03/2025, 18/03/2025, And 19/03/2025");
  });
});
