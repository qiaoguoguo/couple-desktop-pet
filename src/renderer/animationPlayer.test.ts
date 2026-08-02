import { describe, expect, it } from "vitest";
import { getFrameIndex } from "./animationPlayer";

describe("getFrameIndex", () => {
  it("starts at the first frame for negative or zero elapsed time", () => {
    expect(getFrameIndex(-100, 4, 8, true)).toBe(0);
    expect(getFrameIndex(0, 4, 8, true)).toBe(0);
  });

  it("advances frames from elapsed time and fps", () => {
    expect(getFrameIndex(124, 4, 8, true)).toBe(0);
    expect(getFrameIndex(125, 4, 8, true)).toBe(1);
    expect(getFrameIndex(375, 4, 8, true)).toBe(3);
  });

  it("wraps looping animations", () => {
    expect(getFrameIndex(500, 4, 8, true)).toBe(0);
    expect(getFrameIndex(625, 4, 8, true)).toBe(1);
  });

  it("clamps non-looping animations to the last frame", () => {
    expect(getFrameIndex(500, 4, 8, false)).toBe(3);
    expect(getFrameIndex(5000, 4, 8, false)).toBe(3);
  });

  it("returns the first frame for invalid frame counts or fps", () => {
    expect(getFrameIndex(500, 0, 8, true)).toBe(0);
    expect(getFrameIndex(500, 4, 0, true)).toBe(0);
  });
});
