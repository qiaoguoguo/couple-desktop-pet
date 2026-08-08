import { describe, expect, it } from "vitest";
import { chooseSafeDistinctWindowPosition } from "./windowPosition";

describe("E2E window position helpers", () => {
  it("chooses a different target inside the same 24px safe bounds used by saved position restore", () => {
    const target = chooseSafeDistinctWindowPosition({
      position: { x: 1120, y: 540 },
      size: { width: 320, height: 360 },
      work_area: { x: 0, y: 25, width: 1440, height: 875 },
    });

    expect(target).not.toEqual({ x: 1120, y: 540 });
    expect(target.x).toBeGreaterThanOrEqual(24);
    expect(target.y).toBeGreaterThanOrEqual(49);
    expect(target.x).toBeLessThanOrEqual(1096);
    expect(target.y).toBeLessThanOrEqual(516);
  });

  it("keeps the target inside safe bounds on a negative-origin secondary display", () => {
    const target = chooseSafeDistinctWindowPosition({
      position: { x: -420, y: 540 },
      size: { width: 320, height: 360 },
      work_area: { x: -1920, y: 24, width: 1920, height: 1056 },
    });

    expect(target).not.toEqual({ x: -420, y: 540 });
    expect(target.x).toBeGreaterThanOrEqual(-1896);
    expect(target.y).toBeGreaterThanOrEqual(48);
    expect(target.x).toBeLessThanOrEqual(-344);
    expect(target.y).toBeLessThanOrEqual(696);
  });

  it("falls back to the centered axis when the window is too large for both safe margins", () => {
    const target = chooseSafeDistinctWindowPosition({
      position: { x: 20, y: 130 },
      size: { width: 180, height: 70 },
      work_area: { x: 10, y: 20, width: 200, height: 300 },
    });

    expect(target).not.toEqual({ x: 20, y: 130 });
    expect(target.x).toBe(20);
    expect(target.y).toBeGreaterThanOrEqual(44);
    expect(target.y).toBeLessThanOrEqual(226);
  });

  it("throws when the only safe position is the current position", () => {
    expect(() =>
      chooseSafeDistinctWindowPosition({
        position: { x: 20, y: 30 },
        size: { width: 180, height: 280 },
        work_area: { x: 10, y: 20, width: 200, height: 300 },
      }),
    ).toThrow("Unable to choose a distinct safe window position for E2E");
  });
});
