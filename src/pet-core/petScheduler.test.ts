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
});
