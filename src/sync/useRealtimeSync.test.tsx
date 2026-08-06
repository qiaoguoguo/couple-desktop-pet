import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/defaultSettings";
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
