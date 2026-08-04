import { describe, expect, it } from "vitest";
import {
  createInitialPetState,
  transitionPetState,
} from "./petStateMachine";
import { getNextScheduledEvent } from "./petScheduler";

describe("pet state machine", () => {
  it("starts in idle-breathe", () => {
    expect(createInitialPetState(1000)).toMatchObject({
      name: "idle",
      action: "idle-breathe",
    });
  });

  it("keeps pet click as UI-only state while preserving wakeup timing", () => {
    const idle = createInitialPetState(1000);
    const clicked = transitionPetState(idle, { type: "PET_CLICKED", at: 1100 });

    expect(clicked).toMatchObject({
      name: "idle",
      action: "idle-breathe",
      lastInteractionAt: 1100,
    });
  });

  it("opens an interaction action and returns to idle after completion", () => {
    const idle = createInitialPetState(1000);
    const interacting = transitionPetState(idle, {
      type: "INTERACTION_SELECTED",
      action: "act-cute",
      at: 1200,
    });
    const returnedIdle = transitionPetState(interacting, {
      type: "ANIMATION_FINISHED",
      at: 7200,
    });

    expect(interacting).toMatchObject({
      name: "interacting",
      action: "act-cute",
      lastInteractionAt: 1200,
    });
    expect(returnedIdle).toMatchObject({
      name: "idle",
      action: "idle-breathe",
    });
  });

  it("returns interactions to the configured idle action", () => {
    const idle = createInitialPetState(1000);
    const interacting = transitionPetState(idle, {
      type: "INTERACTION_SELECTED",
      action: "act-wave",
      returnTo: "idle-look",
      at: 1200,
    });
    const returnedIdle = transitionPetState(interacting, {
      type: "ANIMATION_FINISHED",
      at: 7200,
    });

    expect(interacting).toMatchObject({
      name: "interacting",
      action: "act-wave",
      returnTo: "idle-look",
    });
    expect(returnedIdle).toMatchObject({
      name: "idle",
      action: "idle-look",
    });
  });

  it("plays ambient interactions without updating the last user interaction time", () => {
    const idle = createInitialPetState(1000);
    const ambient = transitionPetState(idle, {
      type: "AMBIENT_INTERACTION_SELECTED",
      action: "act-wave",
      returnTo: "idle-look",
      at: 7000,
    });
    const returnedIdle = transitionPetState(ambient, {
      type: "ANIMATION_FINISHED",
      at: 13000,
    });

    expect(ambient).toMatchObject({
      name: "interacting",
      action: "act-wave",
      lastInteractionAt: 1000,
      returnTo: "idle-look",
    });
    expect(ambient.idleHistory).toEqual(["idle-breathe", "act-wave"]);
    expect(returnedIdle).toMatchObject({
      name: "idle",
      action: "idle-look",
      lastInteractionAt: 1000,
    });
    expect(returnedIdle.idleHistory).toEqual(["idle-breathe", "act-wave"]);
  });

  it("switches idle action when the current idle animation finishes", () => {
    const idle = createInitialPetState(1000);
    const nextIdle = transitionPetState(idle, {
      type: "IDLE_ANIMATION_FINISHED",
      action: "idle-look",
      at: 7000,
    });

    expect(nextIdle).toMatchObject({
      name: "idle",
      action: "idle-look",
    });
    expect(nextIdle.idleHistory).toEqual(["idle-breathe", "idle-look"]);
  });

  it("preserves drag priority, automatic movement, sleep, and wakeup paths", () => {
    const idle = createInitialPetState(1000);
    const dragging = transitionPetState(idle, {
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

    expect(dragging).toMatchObject({ name: "dragging", action: "drag" });
    expect(stillDragging).toMatchObject({ name: "dragging", action: "drag" });
    expect(idleAfterDrag).toMatchObject({ name: "idle", action: "idle-breathe" });
    expect(walking).toMatchObject({ name: "walking", action: "walk" });
    expect(sleeping).toMatchObject({ name: "sleeping", action: "sleep" });
    expect(woken).toMatchObject({ name: "idle", action: "idle-breathe" });
  });
});

describe("pet scheduler", () => {
  it("schedules interaction completion from the action duration", () => {
    const interacting = transitionPetState(createInitialPetState(1000), {
      type: "INTERACTION_SELECTED",
      action: "act-cute",
      at: 1100,
    });

    expect(getNextScheduledEvent(interacting, 6099, true, 6000)).toBeNull();
    expect(getNextScheduledEvent(interacting, 7100, true, 6000)).toEqual({
      type: "ANIMATION_FINISHED",
      at: 7100,
    });
  });

  it("schedules walking animation completion from the action duration", () => {
    const idle = createInitialPetState(1000);
    const walking = transitionPetState(idle, {
      type: "AUTO_MOVE_TICK",
      at: 2000,
    });

    expect(getNextScheduledEvent(walking, 6999, true, 5000)).toBeNull();
    expect(getNextScheduledEvent(walking, 7000, true, 5000)).toEqual({
      type: "ANIMATION_FINISHED",
      at: 7000,
    });
  });

  it("schedules idle animation completion from the action duration", () => {
    const idle = createInitialPetState(1000);

    expect(getNextScheduledEvent(idle, 6999, false, 6000)).toBeNull();
    expect(getNextScheduledEvent(idle, 7000, false, 6000)).toEqual({
      type: "IDLE_ANIMATION_FINISHED",
      action: "idle-breathe",
      at: 7000,
    });
  });

  it("schedules idle timeout after 120000 ms since last interaction", () => {
    const idle = createInitialPetState(1000);

    expect(getNextScheduledEvent(idle, 120999, true, 6000)).toEqual({
      type: "AUTO_MOVE_TICK",
      at: 120999,
    });
    expect(getNextScheduledEvent(idle, 121000, true, 6000)).toEqual({
      type: "IDLE_TIMEOUT",
      at: 121000,
    });
  });

  it("schedules automatic movement after idle has lasted 8000 ms when enabled", () => {
    const idle = createInitialPetState(1000);

    expect(getNextScheduledEvent(idle, 8999, true, 10000)).toBeNull();
    expect(getNextScheduledEvent(idle, 9000, true, 10000)).toEqual({
      type: "AUTO_MOVE_TICK",
      at: 9000,
    });
    expect(getNextScheduledEvent(idle, 9000, false, 10000)).toBeNull();
  });

  it("does not schedule idle timeout while sleeping", () => {
    const sleeping = transitionPetState(createInitialPetState(1000), {
      type: "IDLE_TIMEOUT",
      at: 121000,
    });

    expect(getNextScheduledEvent(sleeping, 400000, true, 6000)).toBeNull();
  });
});
