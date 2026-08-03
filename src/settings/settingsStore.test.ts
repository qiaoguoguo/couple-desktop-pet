import { describe, expect, it } from "vitest";
import { defaultSettings } from "./defaultSettings";
import {
  loadSettings,
  mergeSettings,
  saveSettings,
  type SettingsPersistenceApi,
} from "./settingsStore";

describe("settings defaults", () => {
  it("uses local desktop pet defaults", () => {
    expect(defaultSettings.scale).toBe(1);
    expect(defaultSettings.autoMoveEnabled).toBe(true);
    expect(defaultSettings.bubblesEnabled).toBe(true);
    expect(defaultSettings.alwaysOnTop).toBe(true);
    expect(defaultSettings.clickThrough).toBe(false);
    expect(defaultSettings.movementRange).toBe("bottom");
  });

  it("uses disabled sync defaults", () => {
    expect(defaultSettings.sync).toEqual({
      enabled: false,
      relayUrl: "http://127.0.0.1:8787",
      deviceId: null,
      deviceSecret: null,
      pairId: null,
      peerDeviceId: null,
    });
  });
});

describe("mergeSettings", () => {
  it("clamps scale to the supported range", () => {
    expect(mergeSettings({ scale: 3 }).scale).toBe(2);
    expect(mergeSettings({ scale: 0.2 }).scale).toBe(0.5);
  });

  it("falls back to bottom for invalid movement ranges", () => {
    expect(mergeSettings({ movementRange: "invalid" as never }).movementRange).toBe(
      "bottom",
    );
  });

  it("keeps valid user settings", () => {
    expect(
      mergeSettings({
        scale: 1.4,
        autoMoveEnabled: false,
        movementRange: "free",
        bubblesEnabled: false,
        alwaysOnTop: false,
        clickThrough: true,
        sync: {
          enabled: true,
          relayUrl: "https://relay.example.com",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: "pair_a",
          peerDeviceId: "dev_b",
        },
      }),
    ).toEqual({
      scale: 1.4,
      autoMoveEnabled: false,
      movementRange: "free",
      bubblesEnabled: false,
      alwaysOnTop: false,
      clickThrough: true,
      sync: {
        enabled: true,
        relayUrl: "https://relay.example.com",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_a",
        peerDeviceId: "dev_b",
      },
    });
  });

  it("keeps valid sync settings", () => {
    expect(
      mergeSettings({
        sync: {
          enabled: true,
          relayUrl: "https://relay.example.com",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: "pair_a",
          peerDeviceId: "dev_b",
        },
      }),
    ).toMatchObject({
      sync: {
        enabled: true,
        relayUrl: "https://relay.example.com",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_a",
        peerDeviceId: "dev_b",
      },
    });
  });

  it("sanitizes invalid sync settings", () => {
    expect(
      mergeSettings({
        sync: {
          enabled: "yes" as never,
          relayUrl: "" as never,
          deviceId: 1 as never,
          deviceSecret: [] as never,
          pairId: 2 as never,
          peerDeviceId: false as never,
        },
      }),
    ).toMatchObject({
      sync: defaultSettings.sync,
    });
  });
});

describe("settings persistence", () => {
  it("loads validated settings from persistence", async () => {
    const api: SettingsPersistenceApi = {
      readSettings: async () => ({
        scale: 3,
        autoMoveEnabled: false,
        movementRange: "active-screen",
        bubblesEnabled: false,
        alwaysOnTop: false,
        clickThrough: true,
        sync: {
          enabled: true,
          relayUrl: "https://relay.example.com",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: "pair_a",
          peerDeviceId: "dev_b",
        },
      }),
      writeSettings: async () => undefined,
    };

    await expect(loadSettings(api)).resolves.toEqual({
      scale: 2,
      autoMoveEnabled: false,
      movementRange: "active-screen",
      bubblesEnabled: false,
      alwaysOnTop: false,
      clickThrough: true,
      sync: {
        enabled: true,
        relayUrl: "https://relay.example.com",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_a",
        peerDeviceId: "dev_b",
      },
    });
  });

  it("falls back to defaults when reading settings fails", async () => {
    const api: SettingsPersistenceApi = {
      readSettings: async () => {
        throw new Error("settings missing");
      },
      writeSettings: async () => undefined,
    };

    await expect(loadSettings(api)).resolves.toEqual(defaultSettings);
  });

  it("returns a fresh defaults object when reading settings fails", async () => {
    const api: SettingsPersistenceApi = {
      readSettings: async () => {
        throw new Error("settings missing");
      },
      writeSettings: async () => undefined,
    };

    const loadedSettings = await loadSettings(api);

    expect(loadedSettings).toEqual(defaultSettings);
    expect(loadedSettings).not.toBe(defaultSettings);
  });

  it("falls back to defaults when persisted data is invalid", async () => {
    const api: SettingsPersistenceApi = {
      readSettings: async () => null,
      writeSettings: async () => undefined,
    };

    await expect(loadSettings(api)).resolves.toEqual(defaultSettings);
  });

  it("writes validated settings", async () => {
    let writtenSettings = null as unknown;
    const api: SettingsPersistenceApi = {
      readSettings: async () => ({}),
      writeSettings: async (settings) => {
        writtenSettings = settings;
      },
    };

    await saveSettings(api, {
      ...defaultSettings,
      scale: 9,
      movementRange: "invalid" as never,
    });

    expect(writtenSettings).toEqual({
      ...defaultSettings,
      scale: 2,
      movementRange: "bottom",
    });
  });
});
