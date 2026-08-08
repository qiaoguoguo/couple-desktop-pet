import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/defaultSettings";
import {
  E2E_REALTIME_OVERRIDE_EVENT,
  E2E_REALTIME_OVERRIDE_WINDOW_KEY,
} from "./e2eRealtimeOverride";
import { useRealtimeSync } from "./useRealtimeSync";

const realtimeMock = vi.hoisted(() => {
  const mock = {
    latestOptions: null as
      | {
          onEvent(event: {
            type: string;
          status?: string;
          peerPresence?: string;
          peerDeviceId?: string;
          peerActivityStatus?: string | null;
          changedAt?: string | null;
          lastSeenAt?: string | null;
        }): void;
        activityStatus?: string | null;
        }
      | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  return mock;
});

vi.mock("./realtimeClient", () => ({
  RealtimeClient: class MockRealtimeClient {
    constructor(options: NonNullable<typeof realtimeMock.latestOptions>) {
      realtimeMock.latestOptions = options;
    }

    connect(): void {
      realtimeMock.connect();
    }

    disconnect(): void {
      realtimeMock.disconnect();
    }
  },
}));

describe("useRealtimeSync", () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as Record<string, unknown>)[
      E2E_REALTIME_OVERRIDE_WINDOW_KEY
    ];
    vi.unstubAllEnvs();
    realtimeMock.latestOptions = null;
    realtimeMock.connect.mockClear();
    realtimeMock.disconnect.mockClear();
    vi.restoreAllMocks();
  });

  it("passes the local activity status to the realtime client without rebuilding for status-only changes", async () => {
    const { rerender } = render(<HookProbe activityStatus="overtime" />);

    const firstOptions = realtimeMock.latestOptions;
    expect(firstOptions?.activityStatus).toBe("overtime");

    rerender(<HookProbe activityStatus="slacking" />);

    expect(realtimeMock.latestOptions).toBe(firstOptions);
  });

  it("resets peer presence when connection leaves connected state", async () => {
    render(<HookProbe />);

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "connected",
      });
    });
    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "presence",
        peerPresence: "online",
        peerDeviceId: "dev_b",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe("connected:online");

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "disconnected",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe(
      "disconnected:unknown",
    );
  });

  it("stores peer presence timestamps and clears them on disconnect", async () => {
    render(<HookProbe includeTimestamps />);

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "connected",
      });
    });
    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "presence",
        peerPresence: "offline",
        peerDeviceId: "dev_b",
        changedAt: "2026-08-06T08:00:00.000Z",
        lastSeenAt: "2026-08-06T07:58:00.000Z",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe(
      "connected:offline:2026-08-06T08:00:00.000Z:2026-08-06T07:58:00.000Z",
    );

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "disconnected",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe(
      "disconnected:unknown:none:none",
    );
  });

  it("projects peer activity status and clears it when disconnected", async () => {
    render(<HookProbe includeActivityStatus />);

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "connected",
      });
    });
    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "peerStatus",
        peerDeviceId: "dev_b",
        peerActivityStatus: "dazing",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe(
      "connected:unknown:dazing",
    );

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "disconnected",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe(
      "disconnected:unknown:none",
    );
  });

  it("retains peer activity while offline and clears it on a fresh online event", async () => {
    render(<HookProbe includeActivityStatus />);

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "connected",
      });
    });
    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "peerStatus",
        peerDeviceId: "dev_b",
        peerActivityStatus: "slacking",
      });
    });
    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "presence",
        peerPresence: "offline",
        peerDeviceId: "dev_b",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe(
      "connected:offline:slacking",
    );

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "presence",
        peerPresence: "online",
        peerDeviceId: "dev_b",
      });
    });

    expect(screen.getByTestId("sync-state").textContent).toBe(
      "connected:online:none",
    );
  });

  it("lets the E2E realtime override replace and release the live client state", async () => {
    vi.stubEnv("VITE_TAURI_E2E", "1");
    (window as unknown as Record<string, unknown>)[
      E2E_REALTIME_OVERRIDE_WINDOW_KEY
    ] = {
      status: "connected",
      peerPresence: "online",
      peerActivityStatus: "overtime",
      peerPresenceChangedAt: null,
      peerLastSeenAt: null,
      lastError: null,
    };

    render(<HookProbe includeActivityStatus />);

    act(() => {
      realtimeMock.latestOptions?.onEvent({
        type: "status",
        status: "disconnected",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("sync-state").textContent).toBe(
        "connected:online:overtime",
      );
    });

    delete (window as unknown as Record<string, unknown>)[
      E2E_REALTIME_OVERRIDE_WINDOW_KEY
    ];
    act(() => {
      window.dispatchEvent(new Event(E2E_REALTIME_OVERRIDE_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByTestId("sync-state").textContent).toBe(
        "disconnected:unknown:none",
      );
    });
  });

  it("cleans up the E2E override listener across StrictMode mount and unmount", async () => {
    vi.stubEnv("VITE_TAURI_E2E", "1");
    const originalAddEventListener = window.addEventListener.bind(window);
    const originalRemoveEventListener = window.removeEventListener.bind(window);
    const addedListeners: EventListenerOrEventListenerObject[] = [];
    const removedListeners: EventListenerOrEventListenerObject[] = [];
    const addEventListener = vi
      .spyOn(window, "addEventListener")
      .mockImplementation((type, listener, options) => {
        if (type === E2E_REALTIME_OVERRIDE_EVENT) {
          addedListeners.push(listener);
        }
        originalAddEventListener(type, listener, options);
      });
    const removeEventListener = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation((type, listener, options) => {
        if (type === E2E_REALTIME_OVERRIDE_EVENT) {
          removedListeners.push(listener);
        }
        originalRemoveEventListener(type, listener, options);
      });

    const { unmount } = render(
      <StrictMode>
        <HookProbe />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(addedListeners.length).toBeGreaterThan(0);
    });

    unmount();

    await waitFor(() => {
      expect(removedListeners).toHaveLength(addedListeners.length);
    });

    expect(removedListeners).toEqual(addedListeners);

    act(() => {
      (window as unknown as Record<string, unknown>)[
        E2E_REALTIME_OVERRIDE_WINDOW_KEY
      ] = {
        status: "connected",
        peerPresence: "online",
        peerActivityStatus: null,
        peerPresenceChangedAt: null,
        peerLastSeenAt: null,
        lastError: null,
      };
      window.dispatchEvent(new Event(E2E_REALTIME_OVERRIDE_EVENT));
    });

    expect(addEventListener).toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalled();
  });

  it("restores window event listener spies before the next test starts", () => {
    expect(vi.isMockFunction(window.addEventListener)).toBe(false);
    expect(vi.isMockFunction(window.removeEventListener)).toBe(false);
  });
});

function HookProbe({
  activityStatus = null,
  includeActivityStatus = false,
  includeTimestamps = false,
}: {
  activityStatus?: "slacking" | "dazing" | "overtime" | null;
  includeActivityStatus?: boolean;
  includeTimestamps?: boolean;
}) {
  const { state } = useRealtimeSync(
    {
      ...defaultSettings.sync,
      enabled: true,
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      activityStatus,
    },
    { onMessage: () => undefined },
  );

  if (includeActivityStatus) {
    const peerActivityStatus =
      (state as { peerActivityStatus?: string | null }).peerActivityStatus ??
      "none";

    return (
      <output data-testid="sync-state">
        {state.status}:{state.peerPresence}:{peerActivityStatus}
      </output>
    );
  }

  if (includeTimestamps) {
    return (
      <output data-testid="sync-state">
        {state.status}:{state.peerPresence}:
        {state.peerPresenceChangedAt ?? "none"}:
        {state.peerLastSeenAt ?? "none"}
      </output>
    );
  }

  return (
    <output data-testid="sync-state">
      {state.status}:{state.peerPresence}
    </output>
  );
}
