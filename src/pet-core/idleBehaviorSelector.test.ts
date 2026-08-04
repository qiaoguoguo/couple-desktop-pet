import { describe, expect, it } from "vitest";
import { idleActionNames } from "../assets/petActionNames";
import { selectNextIdleBehavior } from "./idleBehaviorSelector";

describe("selectNextIdleBehavior", () => {
  it("returns only idle actions when ambient interactions are disabled", () => {
    expect(
      selectNextIdleBehavior({
        history: [],
        idleActions: idleActionNames,
        ambientEnabled: false,
        random: () => 0,
      }),
    ).toEqual({ action: "idle-breathe", source: "idle" });
  });

  it("returns an ambient interaction when the ambient gate is hit", () => {
    const values = [0.01, 0.01];

    expect(
      selectNextIdleBehavior({
        history: [],
        idleActions: idleActionNames,
        ambientEnabled: true,
        random: () => values.shift() ?? 0,
      }),
    ).toEqual({ action: "act-cute", source: "ambient-interaction" });
  });

  it("returns idle when the ambient gate is missed", () => {
    expect(
      selectNextIdleBehavior({
        history: [],
        idleActions: idleActionNames,
        ambientEnabled: true,
        random: () => 0.95,
      }).source,
    ).toBe("idle");
  });

  it("avoids immediately repeating the most recent ambient action", () => {
    const values = [0.01, 0.01];
    const selection = selectNextIdleBehavior({
      history: ["act-cute"],
      idleActions: idleActionNames,
      ambientEnabled: true,
      random: () => values.shift() ?? 0,
    });

    expect(selection.source).toBe("ambient-interaction");
    expect(selection.action).not.toBe("act-cute");
  });
});
