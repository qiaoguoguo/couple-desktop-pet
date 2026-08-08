import { browser } from "@wdio/globals";

type E2eRealtimeOverrideState = {
  status: "disabled" | "connecting" | "connected" | "disconnected" | "authFailed";
  peerPresence: "unknown" | "online" | "offline";
  peerActivityStatus: "slacking" | "dazing" | "overtime" | null;
  peerPresenceChangedAt: string | null;
  peerLastSeenAt: string | null;
  lastError: string | null;
};

const e2eRealtimeOverrideWindowKey = "__COUPLE_PET_E2E_REALTIME_OVERRIDE__";
const e2eRealtimeOverrideEvent = "couple-pet:e2e-realtime-override:wdio:default";

export async function setE2eRealtimeOverride(
  state: E2eRealtimeOverrideState,
): Promise<void> {
  await browser.execute(
    (key, eventName, nextState) => {
      Object.defineProperty(window, key, {
        configurable: true,
        enumerable: false,
        value: nextState,
        writable: true,
      });
      window.dispatchEvent(new Event(eventName));
    },
    e2eRealtimeOverrideWindowKey,
    e2eRealtimeOverrideEvent,
    state,
  );
}

export async function clearE2eRealtimeOverride(): Promise<void> {
  await browser.execute(
    (key, eventName) => {
      Reflect.deleteProperty(window, key);
      window.dispatchEvent(new Event(eventName));
    },
    e2eRealtimeOverrideWindowKey,
    e2eRealtimeOverrideEvent,
  ).catch(() => undefined);
}
