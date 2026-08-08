import { describe, expect, it } from "vitest";
import {
  E2E_REALTIME_OVERRIDE_EVENT,
  E2E_REALTIME_OVERRIDE_WINDOW_KEY,
  parseE2eRealtimeOverride,
} from "./e2eRealtimeOverride";

describe("E2E realtime override", () => {
  it("accepts only a complete safe connected peer-online runtime state", () => {
    expect(E2E_REALTIME_OVERRIDE_WINDOW_KEY).toBe(
      "__COUPLE_PET_E2E_REALTIME_OVERRIDE__",
    );
    expect(E2E_REALTIME_OVERRIDE_EVENT).toBe(
      "couple-pet:e2e-realtime-override:wdio:default",
    );

    expect(
      parseE2eRealtimeOverride({
        status: "connected",
        peerPresence: "online",
        peerActivityStatus: null,
        peerPresenceChangedAt: "2026-08-08T00:00:00.000Z",
        peerLastSeenAt: null,
        lastError: null,
      }),
    ).toEqual({
      status: "connected",
      peerPresence: "online",
      peerActivityStatus: null,
      peerPresenceChangedAt: "2026-08-08T00:00:00.000Z",
      peerLastSeenAt: null,
      lastError: null,
    });
  });

  it("rejects malformed override state instead of relaxing product sendability", () => {
    for (const value of [
      null,
      [],
      { status: "connected", peerPresence: "online" },
      {
        status: "connected",
        peerPresence: "available",
        peerActivityStatus: null,
        peerPresenceChangedAt: null,
        peerLastSeenAt: null,
        lastError: null,
      },
      {
        status: "ready",
        peerPresence: "online",
        peerActivityStatus: null,
        peerPresenceChangedAt: null,
        peerLastSeenAt: null,
        lastError: null,
      },
    ]) {
      expect(parseE2eRealtimeOverride(value)).toBeNull();
    }
  });
});
