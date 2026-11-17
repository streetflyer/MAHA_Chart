import { describe, expect, it } from "vitest";
import type { Dataset } from "./datasets";
import {
  dataEventCodes,
  definitionSources,
  writeDefinition,
} from "./legendData";

const ds = {
  id: "e",
  kind: "events",
  visible: true,
  columns: ["Event Code", "Event Group", "Event Description"],
  records: [
    {
      kp: 1,
      code: "E97",
      value: "",
      cells: ["E97", "Engin.Feature", "Touchdown Point"],
    },
    {
      kp: 2,
      code: "E97",
      value: "",
      cells: ["E97", "Engin.Feature", "Touchdown Point"],
    },
    { kp: 3, code: "AN.OK", value: "Anode OK" },
  ],
} as unknown as Dataset;

describe("event code definitions from columns", () => {
  const spec = {
    parts: ["c:0", "c:1", "c:2"],
    prefix: "",
    suffix: "",
    connector: " - ",
  };
  it("joins the ticked columns with the connector", () => {
    expect(writeDefinition(ds.records[0], spec)).toBe(
      "E97 - Engin.Feature - Touchdown Point",
    );
  });
  it("applies prefix, suffix and own text, and skips empty parts", () => {
    const s = {
      parts: ["t:Type", "c:2", "c:9"],
      prefix: "(",
      suffix: ")",
      connector: "; ",
    };
    expect(writeDefinition(ds.records[0], s)).toBe("(Type; Touchdown Point)");
    expect(writeDefinition(ds.records[2], s)).toBe("(Type)");
  });
  it("splits the code into group and subgroup", () => {
    const s = {
      parts: ["group", "sub", "value"],
      prefix: "",
      suffix: "",
      connector: ", ",
    };
    expect(writeDefinition(ds.records[2], s)).toBe("AN, OK, Anode OK");
  });
  it("writes one line per code and leaves the old wording without a spec", () => {
    const lines = dataEventCodes([ds], undefined, undefined, spec).split("\n");
    expect(lines).toContain("E97\tE97 - Engin.Feature - Touchdown Point");
    expect(dataEventCodes([ds]).split("\n")).toContain("AN.OK\tAnode OK");
  });
  it("lists the file's EventGroup first, then its other columns, then code, group, subgroup, value", () => {
    const ids = definitionSources([ds]).map((x) => x.id);
    expect(ids).toEqual(["c:1", "c:0", "c:2", "code", "group", "sub", "value"]);
  });
});
