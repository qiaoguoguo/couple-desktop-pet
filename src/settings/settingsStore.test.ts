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
      }),
    ).toEqual({
      scale: 1.4,
      autoMoveEnabled: false,
      movementRange: "free",
      bubblesEnabled: false,
      alwaysOnTop: false,
      clickThrough: true,
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
