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
          changedAt?: string | null;
          lastSeenAt?: string | null;
        }): void;
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
});

function HookProbe({ includeTimestamps = false }: { includeTimestamps?: boolean }) {
  const { state } = useRealtimeSync(
    {
      ...defaultSettings.sync,
      enabled: true,
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
    { onMessage: () => undefined },
  );

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
