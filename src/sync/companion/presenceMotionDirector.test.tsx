import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPresenceMotionState,
  getPresenceMotionDelay,
  transitionPresenceMotion,
  usePresenceMotionDirector,
} from "./presenceMotionDirector";

describe("presence motion director", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves online enter to idle with the planned timings", () => {
    const enter = transitionPresenceMotion(createPresenceMotionState(), {
      type: "SCENE_CHANGED",
      presence: "online",
      suspended: false,
      reducedMotion: false,
    });
    const idle = transitionPresenceMotion(enter, { type: "TIMER_ELAPSED" });

    expect(enter.phase).toBe("enter");
    expect(getPresenceMotionDelay(enter)).toBe(700);
    expect(idle.phase).toBe("online-idle");
    expect(getPresenceMotionDelay(idle)).toBe(5600);
  });

  it("uses short hover and press phases", () => {
    const idle = { phase: "online-idle" as const, presence: "online" as const };
    const hover = transitionPresenceMotion(idle, { type: "HOVER_STARTED" });
    const press = transitionPresenceMotion(idle, { type: "PRESS_STARTED" });

    expect(hover.phase).toBe("hover");
    expect(getPresenceMotionDelay(hover)).toBe(180);
    expect(press.phase).toBe("press");
    expect(getPresenceMotionDelay(press)).toBe(320);
  });

  it("transitions offline before entering offline idle", () => {
    const offlineTransition = transitionPresenceMotion(
      { phase: "online-idle", presence: "online" },
      {
        type: "SCENE_CHANGED",
        presence: "offline",
        suspended: false,
        reducedMotion: false,
      },
    );
    const offlineIdle = transitionPresenceMotion(offlineTransition, {
      type: "TIMER_ELAPSED",
    });

    expect(offlineTransition.phase).toBe("offline-transition");
    expect(getPresenceMotionDelay(offlineTransition)).toBe(900);
    expect(offlineIdle.phase).toBe("offline-idle");
    expect(getPresenceMotionDelay(offlineIdle)).toBe(6000);
  });

  it("uses a reduced-motion enter without movement phases", () => {
    const reduced = transitionPresenceMotion(createPresenceMotionState(), {
      type: "SCENE_CHANGED",
      presence: "online",
      suspended: false,
      reducedMotion: true,
    });

    expect(reduced.phase).toBe("reduced-enter");
    expect(getPresenceMotionDelay(reduced)).toBe(180);
  });

  it("clears scheduled timers on unmount", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = render(<MotionHarness />);
    expect(screen.getByTestId("phase").textContent).toBe("enter");

    act(() => vi.advanceTimersByTime(1));
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

function MotionHarness() {
  const motion = usePresenceMotionDirector({
    presence: "online",
    suspended: false,
    reducedMotion: false,
  });

  return (
    <button
      type="button"
      data-testid="phase"
      onMouseEnter={motion.onHover}
      onMouseDown={motion.onPress}
    >
      {motion.phase}
    </button>
  );
}
