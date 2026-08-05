import { describe, expect, it } from "vitest";
import type { ResolvedPetMotion } from "../assets/petPackageRegistry";
import {
  selectMotionForTag,
  selectNextPetMotion,
} from "./motionPoolDirector";

const motions: Record<string, ResolvedPetMotion> = {
  calm: motion("calm", 1, ["idle"]),
  wave: motion("wave", 4, ["idle", "message"]),
};

describe("motionPoolDirector", () => {
  it("returns the default motion when it is the only available motion", () => {
    expect(
      selectNextPetMotion({
        motions: { calm: motions.calm },
        defaultMotionId: "calm",
        history: [],
        random: () => 0.99,
      }),
    ).toBe("calm");
  });

  it("avoids repeating the immediately previous motion when alternatives exist", () => {
    expect(
      selectNextPetMotion({
        motions,
        defaultMotionId: "calm",
        history: ["calm"],
        random: () => 0,
      }),
    ).toBe("wave");
  });

  it("selects a motion by tag and falls back to null when no tag matches", () => {
    expect(selectMotionForTag(motions, "message", () => 0)).toBe("wave");
    expect(selectMotionForTag(motions, "comfort", () => 0)).toBeNull();
  });
});

function motion(
  id: string,
  weight: number,
  tags: string[],
): ResolvedPetMotion {
  return {
    id,
    fps: 5,
    loop: true,
    frameCount: 2,
    durationMs: 6000,
    frames: [`${id}-1.png`, `${id}-2.png`],
    weight,
    tags,
  };
}
