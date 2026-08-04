import { describe, expect, it } from "vitest";
import type { IdleActionName } from "../assets/petActionNames";
import { selectNextIdleAction } from "./idleActionSelector";

const idleActions: readonly IdleActionName[] = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
];

describe("selectNextIdleAction", () => {
  it("selects a deterministic idle action from the random value", () => {
    expect(selectNextIdleAction([], idleActions, () => 0)).toBe("idle-breathe");
    expect(selectNextIdleAction([], idleActions, () => 0.4)).toBe("idle-look");
    expect(selectNextIdleAction([], idleActions, () => 0.8)).toBe(
      "idle-stretch",
    );
  });

  it("avoids selecting the same idle action three times in a row", () => {
    const history: readonly IdleActionName[] = [
      "idle-breathe",
      "idle-breathe",
    ];

    expect(selectNextIdleAction(history, idleActions, () => 0)).toBe(
      "idle-look",
    );
  });
});
