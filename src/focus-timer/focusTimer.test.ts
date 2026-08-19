import { describe, expect, it } from "vitest";
import {
  acknowledgeFocusTimer,
  completeFocusTimerIfDue,
  endFocusTimer,
  getRemainingMs,
  pauseFocusTimer,
  repeatFocusTimer,
  restoreFocusTimer,
  resumeFocusTimer,
  startFocusTimer,
  setFocusTimerCollapsed,
  type FocusTimerState,
} from "./focusTimer";

describe("focus timer domain", () => {
  it("starts from a clamped minute duration and stores an absolute deadline", () => {
    const running = startFocusTimer(25, 1_000);

    expect(running).toEqual({
      status: "running",
      durationMinutes: 25,
      startedAt: 1_000,
      endsAt: 1_501_000,
    });
    expect(getRemainingMs(running, 2_000)).toBe(1_499_000);
    expect(startFocusTimer(0, 1_000).durationMinutes).toBe(1);
    expect(startFocusTimer(999, 1_000).durationMinutes).toBe(180);
  });

  it("pauses and resumes without losing the original remaining time", () => {
    const running = startFocusTimer(15, 10_000);
    const paused = pauseFocusTimer(running, 70_000);
    const resumed = resumeFocusTimer(paused, 120_000);

    expect(paused).toEqual({
      status: "paused",
      durationMinutes: 15,
      remainingMs: 840_000,
    });
    expect(resumed).toEqual({
      status: "running",
      durationMinutes: 15,
      startedAt: 120_000,
      endsAt: 960_000,
    });
  });

  it("completes a due running timer exactly once from the current clock", () => {
    const running = startFocusTimer(1, 5_000);

    expect(completeFocusTimerIfDue(running, 64_999)).toBe(running);
    expect(completeFocusTimerIfDue(running, 65_000)).toEqual({
      status: "completed-unacknowledged",
      durationMinutes: 1,
      completedAt: 65_000,
      collapsed: false,
    });
  });

  it("acknowledges and repeats a completed timer using the last duration", () => {
    const completed: FocusTimerState = {
      status: "completed-unacknowledged",
      durationMinutes: 45,
      completedAt: 90_000,
      collapsed: true,
    };

    expect(acknowledgeFocusTimer(completed)).toEqual({
      status: "idle",
      lastDurationMinutes: 45,
    });
    expect(repeatFocusTimer(completed, 100_000)).toEqual({
      status: "running",
      durationMinutes: 45,
      startedAt: 100_000,
      endsAt: 2_800_000,
    });
  });

  it("ends active timers and toggles the completion marker", () => {
    const running = startFocusTimer(45, 1_000);
    const completed = completeFocusTimerIfDue(startFocusTimer(1, 1_000), 61_000);

    expect(endFocusTimer(running)).toEqual({
      status: "idle",
      lastDurationMinutes: 45,
    });
    expect(setFocusTimerCollapsed(completed, true)).toEqual({
      status: "completed-unacknowledged",
      durationMinutes: 1,
      completedAt: 61_000,
      collapsed: true,
    });
    expect(setFocusTimerCollapsed(setFocusTimerCollapsed(completed, true), false)).toEqual(completed);
  });

  it("restores corrupt persisted input to an idle default", () => {
    expect(restoreFocusTimer(null, 1_000)).toEqual({
      status: "idle",
      lastDurationMinutes: 25,
    });
    expect(restoreFocusTimer({ status: "running", durationMinutes: "25" }, 1_000)).toEqual({
      status: "idle",
      lastDurationMinutes: 25,
    });
  });

  it("recovers valid persisted state and immediately completes elapsed deadlines", () => {
    expect(
      restoreFocusTimer(
        {
          status: "running",
          durationMinutes: 25,
          startedAt: 1_000,
          endsAt: 1_501_000,
        },
        2_000,
      ),
    ).toEqual({
      status: "running",
      durationMinutes: 25,
      startedAt: 1_000,
      endsAt: 1_501_000,
    });
    expect(
      restoreFocusTimer(
        {
          status: "running",
          durationMinutes: 25,
          startedAt: 1_000,
          endsAt: 1_501_000,
        },
        1_501_500,
      ),
    ).toEqual({
      status: "completed-unacknowledged",
      durationMinutes: 25,
      completedAt: 1_501_500,
      collapsed: false,
    });
  });
});
