import { describe, expect, it } from "vitest";
import { calculateSpriteFitScale } from "./PixiPetStage";

describe("calculateSpriteFitScale", () => {
  it("fits a square generated frame inside the pet canvas without cropping", () => {
    const fitScale = calculateSpriteFitScale(512, 512, 256, 320);

    expect(fitScale).toBe(0.5);
    expect(512 * fitScale).toBeLessThanOrEqual(256);
    expect(512 * fitScale).toBeLessThanOrEqual(320);
  });

  it("returns 1 for invalid texture dimensions", () => {
    expect(calculateSpriteFitScale(0, 512, 256, 320)).toBe(1);
    expect(calculateSpriteFitScale(512, 0, 256, 320)).toBe(1);
  });
});
