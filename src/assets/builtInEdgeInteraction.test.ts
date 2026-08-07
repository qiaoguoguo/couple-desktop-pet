import { describe, expect, it } from "vitest";
import { getBuiltInEdgeProfile } from "./builtInEdgeInteraction";
import type { EdgePhase } from "../pet/edgeInteraction";

const sides = ["left", "right", "top", "bottom"] as const;
const phases = ["enter", "idle", "react"] as const;
const expectedCounts: Record<(typeof phases)[number], number> = {
  enter: 6,
  idle: 22,
  react: 6,
};

function frameNumber(url: string) {
  const match = url.match(/\/(\d{4})\.png(?:\?|$)/);

  if (!match) {
    throw new Error(`Frame URL has no numeric PNG name: ${url}`);
  }

  return Number(match[1]);
}

describe("getBuiltInEdgeProfile", () => {
  it("returns Q-girl edge interaction frames only for the built-in package", () => {
    expect(getBuiltInEdgeProfile("imported:boy", "left")).toBeNull();
    expect(getBuiltInEdgeProfile("builtin:unknown", "left")).toBeNull();
    expect(getBuiltInEdgeProfile("builtin:q-girl", "top")?.idle.frames).toHaveLength(22);
  });

  it("registers every bundled Q-girl edge PNG with continuous numbering", () => {
    const uniqueFrames = new Set<string>();

    for (const side of sides) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      expect(profile?.side).toBe(side);
      expect(profile).not.toBeNull();

      if (!profile) {
        continue;
      }

      for (const phase of phases) {
        const motion = profile[phase];
        const numbers = motion.frames.map(frameNumber);

        expect(motion.frames).toHaveLength(expectedCounts[phase]);
        expect(motion.frameAnchors).toHaveLength(expectedCounts[phase]);
        expect(numbers).toEqual(
          Array.from({ length: expectedCounts[phase] }, (_, index) => index + 1),
        );

        for (const frame of motion.frames) {
          expect(frame).toContain(`/q-girl/edge-interaction/${side}/${phase}/`);
          uniqueFrames.add(frame);
        }
      }
    }

    expect(uniqueFrames.size).toBe(136);
  });

  it("uses the specified timing and contact anchors", () => {
    const expectedContactAnchors = {
      left: { x: 0.275, y: 0.5 },
      right: { x: 0.725, y: 0.5 },
      top: { x: 0.5, y: 0.05 },
      bottom: { x: 0.5, y: 0.367 },
    } as const;

    for (const side of sides) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      expect(profile).not.toBeNull();

      if (!profile) {
        continue;
      }

      expect(profile.contactAnchor).toEqual(expectedContactAnchors[side]);
      expect(profile.enter).toMatchObject({
        fps: 8,
        loop: false,
        durationMs: 750,
      });
      expect(profile.idle).toMatchObject({
        fps: 4,
        loop: true,
        durationMs: 5500,
      });
      expect(profile.react).toMatchObject({
        fps: 6,
        loop: false,
        durationMs: 1000,
      });

      for (const phase of phases) {
        expect(
          profile[phase as Exclude<EdgePhase, "exit">].frameAnchors,
        ).toEqual(
          Array.from(
            { length: expectedCounts[phase] },
            () => expectedContactAnchors[side],
          ),
        );
      }
    }
  });
});
