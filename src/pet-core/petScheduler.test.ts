import { describe, expect, it } from "vitest";
import { getNextScheduledEvent } from "./petScheduler";
import type { PetState } from "./petTypes";

const interactingState: PetState = {
  name: "interacting",
  action: "act-cute",
  enteredAt: 1_000,
  lastInteractionAt: 1_000,
  direction: 1,
  idleHistory: [],
};

describe("pet scheduler", () => {
  it("keeps interaction scenes alive until the selected action duration elapses", () => {
    expect(getNextScheduledEvent(interactingState, 6_999, false, 6000)).toBeNull();
    expect(getNextScheduledEvent(interactingState, 7_000, false, 6000)).toEqual(
      {
        type: "ANIMATION_FINISHED",
        at: 7_000,
      },
    );
  });

  it("schedules auto move from current idle residence time, not stale user interaction time", () => {
    const idle: PetState = {
      name: "idle",
      action: "idle-breathe",
      enteredAt: 20_000,
      lastInteractionAt: 1_000,
      direction: 1,
      idleHistory: ["idle-breathe"],
    };

    expect(getNextScheduledEvent(idle, 20_250, true, 6000)).toBeNull();
    expect(getNextScheduledEvent(idle, 26_000, true, 6000)).toEqual({
      type: "IDLE_ANIMATION_FINISHED",
      action: "idle-breathe",
      at: 26_000,
    });
    expect(getNextScheduledEvent(idle, 28_000, true, 10_000)).toEqual({
      type: "AUTO_MOVE_TICK",
      at: 28_000,
    });
  });
});
