import { beforeEach, describe, expect, it } from "vitest";
import { rulerSources, rulerTo, useRuler } from "./ruler";

describe("ruler", () => {
  beforeEach(() => {
    rulerSources.clear();
    useRuler.setState({ on: true, kp: null });
  });
  it("follows the KP read from the panel under the pointer", () => {
    rulerSources.set("long", {
      rect: { x: 0, y: 0, w: 100, h: 50 },
      kpAt: (x) => x * 10,
      at: () => null,
    });
    rulerSources.set("plan", {
      rect: { x: 0, y: 60, w: 100, h: 50 },
      kpAt: () => null,
      at: () => null,
    });
    rulerTo(30, 10);
    expect(useRuler.getState().kp).toBe(300);
    // A panel that can't say a KP, or empty paper, leaves the ruler where it is.
    rulerTo(30, 80);
    rulerTo(500, 500);
    expect(useRuler.getState().kp).toBe(300);
  });
  it("forgets its KP when turned off", () => {
    useRuler.setState({ kp: 5 });
    useRuler.getState().setOn(false);
    expect(useRuler.getState().kp).toBeNull();
  });
});
