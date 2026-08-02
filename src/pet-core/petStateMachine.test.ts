import { describe, expect, it } from "vitest";
import {
  createInitialPetState,
  transitionPetState,
} from "./petStateMachine";
import { getNextScheduledEvent } from "./petScheduler";

describe("pet state machine", () => {
  it("starts in idle", () => {
    expect(createInitialPetState(1000).name).toBe("idle");
  });

  it("transitions through click, animation, drag, movement, sleep, and wakeup states", () => {
    const idle = createInitialPetState(1000);
    const happy = transitionPetState(idle, { type: "PET_CLICKED", at: 1100 });
    const returnedIdle = transitionPetState(happy, {
      type: "ANIMATION_FINISHED",
      at: 1400,
    });
    const dragging = transitionPetState(returnedIdle, {
      type: "DRAG_STARTED",
      at: 1500,
    });
    const stillDragging = transitionPetState(dragging, {
      type: "AUTO_MOVE_TICK",
      at: 1600,
    });
    const idleAfterDrag = transitionPetState(stillDragging, {
      type: "DRAG_ENDED",
      at: 1700,
    });
    const walking = transitionPetState(idleAfterDrag, {
      type: "AUTO_MOVE_TICK",
      at: 2400,
    });
    const sleeping = transitionPetState(walking, {
      type: "IDLE_TIMEOUT",
      at: 9000,
    });
    const woken = transitionPetState(sleeping, {
      type: "PET_CLICKED",
      at: 9100,
    });

    expect(happy.name).toBe("happy");
    expect(returnedIdle.name).toBe("idle");
    expect(dragging.name).toBe("dragging");
    expect(stillDragging.name).toBe("dragging");
    expect(idleAfterDrag.name).toBe("idle");
    expect(walking.name).toBe("walking");
    expect(sleeping.name).toBe("sleeping");
    expect(woken.name).toBe("happy");
  });
});

describe("pet scheduler", () => {
  it("schedules happy animation completion after 900 ms", () => {
    const idle = createInitialPetState(1000);
    const happy = transitionPetState(idle, { type: "PET_CLICKED", at: 1100 });

    expect(getNextScheduledEvent(happy, 1999, true)).toBeNull();
    expect(getNextScheduledEvent(happy, 2000, true)).toEqual({
      type: "ANIMATION_FINISHED",
      at: 2000,
    });
  });

  it("schedules walking animation completion after 1600 ms", () => {
    const idle = createInitialPetState(1000);
    const walking = transitionPetState(idle, {
      type: "AUTO_MOVE_TICK",
      at: 2000,
    });

    expect(getNextScheduledEvent(walking, 3599, true)).toBeNull();
    expect(getNextScheduledEvent(walking, 3600, true)).toEqual({
      type: "ANIMATION_FINISHED",
      at: 3600,
    });
  });

  it("schedules idle timeout after 120000 ms since last interaction", () => {
    const idle = createInitialPetState(1000);

    expect(getNextScheduledEvent(idle, 120999, true)).toEqual({
      type: "AUTO_MOVE_TICK",
      at: 120999,
    });
    expect(getNextScheduledEvent(idle, 121000, true)).toEqual({
      type: "IDLE_TIMEOUT",
      at: 121000,
    });
  });

  it("schedules automatic movement after idle has lasted 8000 ms when enabled", () => {
    const idle = createInitialPetState(1000);

    expect(getNextScheduledEvent(idle, 8999, true)).toBeNull();
    expect(getNextScheduledEvent(idle, 9000, true)).toEqual({
      type: "AUTO_MOVE_TICK",
      at: 9000,
    });
    expect(getNextScheduledEvent(idle, 9000, false)).toBeNull();
  });

  it("does not schedule idle timeout while sleeping", () => {
    const sleeping = transitionPetState(createInitialPetState(1000), {
      type: "IDLE_TIMEOUT",
      at: 121000,
    });

    expect(getNextScheduledEvent(sleeping, 400000, true)).toBeNull();
  });
});
