import { describe, expect, it } from "vitest";
import { defaultSettings } from "../settings/defaultSettings";
import { ensureDeviceIdentity } from "./deviceIdentity";

describe("ensureDeviceIdentity", () => {
  it("creates stable device credentials when missing", () => {
    const first = ensureDeviceIdentity(defaultSettings.sync);

    expect(first.deviceId).toMatch(/^dev_/);
    expect(first.deviceSecret).toMatch(/^sec_/);

    const second = ensureDeviceIdentity(first);
    expect(second).toEqual(first);
  });
});
