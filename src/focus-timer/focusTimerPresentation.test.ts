import { describe, expect, it } from "vitest";
import { projectFocusTimerPresentation } from "./focusTimerPresentation";

const completed = {
  status: "completed-unacknowledged" as const,
  durationMinutes: 25,
  completedAt: 1_000,
  collapsed: false,
};

describe("focus timer completion presentation", () => {
  it("queues behind another transient surface", () => {
    expect(projectFocusTimerPresentation(completed, true, 5_000, null)).toBe("queued");
  });

  it("animates for 2.4 seconds and stays expanded for 12 seconds", () => {
    expect(projectFocusTimerPresentation(completed, false, 2_000, 1_000)).toBe("animating");
    expect(projectFocusTimerPresentation(completed, false, 3_400, 1_000)).toBe("expanded");
    expect(projectFocusTimerPresentation(completed, false, 15_399, 1_000)).toBe("expanded");
    expect(projectFocusTimerPresentation(completed, false, 15_400, 1_000)).toBe("collapsed");
  });

  it("keeps persisted collapsed completions collapsed", () => {
    expect(
      projectFocusTimerPresentation({ ...completed, collapsed: true }, false, 2_000, 1_000),
    ).toBe("collapsed");
  });
});
