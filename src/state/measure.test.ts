import { beforeEach, describe, expect, it } from "vitest";
import { measureDown, measureMove, measureUp, useMeasure } from "./measure";

describe("measuring arrow", () => {
  beforeEach(() => {
    useMeasure.setState({ armed: false, a: null, b: null, drag: null });
  });
  it("does nothing until armed, then draws by dragging", () => {
    expect(measureDown({ x: 10, y: 10 }, 1)).toBe(false);
    useMeasure.getState().setArmed(true);
    expect(measureDown({ x: 10, y: 10 }, 1)).toBe(true);
    measureMove({ x: 60, y: 12 }, false);
    measureUp();
    const { a, b, drag } = useMeasure.getState();
    expect(a).toEqual({ x: 10, y: 10 });
    expect(b).toEqual({ x: 60, y: 12 });
    expect(drag).toBeNull();
  });
  it("keeps the arrow straight with shift, and moves it by its body", () => {
    useMeasure.getState().setArmed(true);
    measureDown({ x: 0, y: 0 }, 1);
    measureMove({ x: 100, y: 5 }, true);
    measureUp();
    expect(useMeasure.getState().b).toEqual({ x: 100, y: 0 });
    useMeasure.getState().setArmed(false);
    expect(measureDown({ x: 50, y: 0.2 }, 1)).toBe(true);
    measureMove({ x: 50, y: 30 }, false);
    measureUp();
    expect(useMeasure.getState().a).toEqual({ x: 0, y: 29.8 });
  });
  it("a click without a drag leaves no arrow", () => {
    useMeasure.getState().setArmed(true);
    measureDown({ x: 5, y: 5 }, 1);
    measureUp();
    expect(useMeasure.getState().a).toBeNull();
  });
});
