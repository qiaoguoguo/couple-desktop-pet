import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusTimer } from "./useFocusTimer";

afterEach(() => {
  vi.useRealTimers();
});

describe("useFocusTimer", () => {
  it("restores an elapsed deadline as one pending completion", async () => {
    const api = {
      readFocusTimer: vi.fn().mockResolvedValue({
        status: "running",
        durationMinutes: 1,
        startedAt: 1_000,
        endsAt: 61_000,
      }),
      writeFocusTimer: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useFocusTimer({ api, now: () => 70_000 }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.state.status).toBe("completed-unacknowledged");
  });

  it("starts, pauses, resumes, and ends with persisted transitions", async () => {
    let now = 1_000;
    const api = {
      readFocusTimer: vi.fn().mockResolvedValue(null),
      writeFocusTimer: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useFocusTimer({ api, now: () => now }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.start(25));
    expect(result.current.state.status).toBe("running");
    now = 61_000;
    act(() => result.current.pause());
    expect(result.current.state.status).toBe("paused");
    now = 80_000;
    act(() => result.current.resume());
    expect(result.current.state.status).toBe("running");
    act(() => result.current.end());
    expect(result.current.state).toEqual({ status: "idle", lastDurationMinutes: 25 });
    expect(api.writeFocusTimer).toHaveBeenCalledTimes(4);
  });

  it("completes from the wall clock and supports collapse, expand, repeat, and acknowledge", async () => {
    vi.useFakeTimers();
    let now = 1_000;
    const api = {
      readFocusTimer: vi.fn().mockResolvedValue(null),
      writeFocusTimer: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useFocusTimer({ api, now: () => now }));
    await act(async () => Promise.resolve());
    act(() => result.current.start(1));
    now = 61_000;
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.state.status).toBe("completed-unacknowledged");

    act(() => result.current.collapse());
    expect(result.current.state).toMatchObject({ collapsed: true });
    act(() => result.current.expand());
    expect(result.current.state).toMatchObject({ collapsed: false });
    act(() => result.current.repeat());
    expect(result.current.state.status).toBe("running");
    now = 121_000;
    act(() => vi.advanceTimersByTime(1_000));
    act(() => result.current.acknowledge());
    expect(result.current.state.status).toBe("idle");
  });
});
