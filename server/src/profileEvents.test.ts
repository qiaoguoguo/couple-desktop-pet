import { describe, expect, it } from "vitest";
import type { DeviceProfileV1 } from "../../shared/profileProtocol.js";
import { ProfileEventHub, type ProfileUpdatedEvent } from "./profileEvents.js";

const profile: DeviceProfileV1 = {
  version: 1,
  nickname: "小满",
  city: {
    provider: "weatherapi",
    providerLocationId: 1785728,
    name: "杭州",
    region: "浙江",
    country: "中国",
    latitude: 30.27,
    longitude: 120.15,
  },
  updatedAt: "2026-08-03T12:00:00.000Z",
};

const event: ProfileUpdatedEvent = {
  deviceId: "dev_a",
  profile,
  changedAt: profile.updatedAt,
};

describe("ProfileEventHub", () => {
  it("publishes synchronously and supports idempotent unsubscribe", () => {
    const hub = new ProfileEventHub();
    const received: ProfileUpdatedEvent[] = [];
    const unsubscribe = hub.subscribe((next) => received.push(next));

    hub.publish(event);
    unsubscribe();
    unsubscribe();
    hub.publish(event);

    expect(received).toEqual([event]);
  });

  it("isolates listener failures", () => {
    const hub = new ProfileEventHub();
    const received: ProfileUpdatedEvent[] = [];
    hub.subscribe(() => {
      throw new Error("listener failed");
    });
    hub.subscribe((next) => received.push(next));

    expect(() => hub.publish(event)).not.toThrow();
    expect(received).toEqual([event]);
  });
});
