import { describe, expect, it, vi } from "vitest";
import { loadFocusTimer, saveFocusTimer } from "./focusTimerStore";

describe("focus timer persistence", () => {
  it("restores an elapsed timer as one pending completion", async () => {
    const api = {
      readFocusTimer: vi.fn().mockResolvedValue({
        status: "running",
        durationMinutes: 1,
        startedAt: 1_000,
        endsAt: 61_000,
      }),
      writeFocusTimer: vi.fn(),
    };

    await expect(loadFocusTimer(api, 70_000)).resolves.toEqual({
      status: "completed-unacknowledged",
      durationMinutes: 1,
      completedAt: 70_000,
      collapsed: false,
    });
  });

  it("falls back to idle when reading fails", async () => {
    const api = {
      readFocusTimer: vi.fn().mockRejectedValue(new Error("read failed")),
      writeFocusTimer: vi.fn(),
    };

    await expect(loadFocusTimer(api, 1_000)).resolves.toEqual({
      status: "idle",
      lastDurationMinutes: 25,
    });
  });

  it("writes the serializable timer state unchanged", async () => {
    const api = {
      readFocusTimer: vi.fn(),
      writeFocusTimer: vi.fn().mockResolvedValue(undefined),
    };
    const state = {
      status: "paused" as const,
      durationMinutes: 25,
      remainingMs: 300_000,
    };

    await saveFocusTimer(api, state);

    expect(api.writeFocusTimer).toHaveBeenCalledWith(state);
  });
});
