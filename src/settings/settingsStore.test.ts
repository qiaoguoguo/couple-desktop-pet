import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./defaultSettings";
import {
  loadSettings,
  mergeSettings,
  saveSettings,
  type PetSettings,
  type SettingsPersistenceApi,
} from "./settingsStore";

const city = {
  provider: "weatherapi",
  providerLocationId: 1785728,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.27,
  longitude: 120.15,
} as const;

const localProfile = {
  version: 1,
  nickname: "小满",
  city,
} as const;

const peerProfile = {
  version: 1,
  nickname: "阿岚",
  city: {
    ...city,
    providerLocationId: 1795565,
    name: "上海",
    region: "上海",
    latitude: 31.23,
    longitude: 121.47,
  },
  updatedAt: "2026-08-18T08:00:00.000Z",
} as const;

describe("settings defaults", () => {
  it("uses local desktop pet defaults", () => {
    expect(defaultSettings.scale).toBe(1);
    expect(defaultSettings.autoMoveEnabled).toBe(true);
    expect(defaultSettings.bubblesEnabled).toBe(true);
    expect(defaultSettings.alwaysOnTop).toBe(true);
    expect(defaultSettings.clickThrough).toBe(false);
    expect(defaultSettings.movementRange).toBe("bottom");
    expect(defaultSettings.appearance).toEqual({
      selectedPetPackageId: "builtin:q-girl",
      peerPetPackageByDeviceId: {},
    });
  });

  it("uses disabled sync defaults", () => {
    expect(defaultSettings.sync).toEqual({
      enabled: true,
      relayUrl: "http://159.75.175.47:8787",
      deviceId: null,
      deviceSecret: null,
      pairId: null,
      peerDeviceId: null,
      activityStatus: null,
    });
  });

  it("uses empty profile defaults", () => {
    expect(defaultSettings.profile).toEqual({
      local: null,
      peerByDeviceId: {},
      syncState: "idle",
    });
  });
});

describe("mergeSettings", () => {
  it("adds empty profile state to legacy settings", () => {
    const settings = mergeSettings({
      scale: 1,
      sync: { ...defaultSettings.sync },
    });

    expect(settings.profile).toEqual({
      local: null,
      peerByDeviceId: {},
      syncState: "idle",
    });
  });

  it("keeps valid local and peer profiles", () => {
    const settings = mergeSettings({
      profile: {
        local: { ...localProfile, nickname: "  小满  " },
        peerByDeviceId: { dev_b: peerProfile },
        syncState: "synced",
      },
    } as never);

    expect(settings.profile.local?.nickname).toBe("小满");
    expect(settings.profile.peerByDeviceId.dev_b.nickname).toBe("阿岚");
    expect(settings.profile.syncState).toBe("synced");
  });

  it("drops malformed local and peer profiles independently", () => {
    const settings = mergeSettings({
      profile: {
        local: { ...localProfile, city: { ...city, provider: "unknown" } },
        peerByDeviceId: {
          dev_b: peerProfile,
          dev_bad: { ...peerProfile, version: 2 },
          dev_missing: null,
        },
        syncState: "synced",
      },
    } as never);

    expect(settings.profile.local).toBeNull();
    expect(settings.profile.peerByDeviceId).toEqual({ dev_b: peerProfile });
  });

  it("preserves a JSON-parsed __proto__ peer device id as an own property", () => {
    const persistedProfiles = JSON.parse(
      `{"__proto__":${JSON.stringify(peerProfile)}}`,
    ) as Record<string, unknown>;

    const profiles = mergeSettings({
      profile: {
        local: localProfile,
        peerByDeviceId: persistedProfiles,
        syncState: "synced",
      },
    } as never).profile.peerByDeviceId;

    expect(Object.prototype.hasOwnProperty.call(profiles, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(profiles)).toBe(Object.prototype);
    expect(profiles.__proto__).toEqual(peerProfile);
  });

  it.each(["saving", "error"])(
    "normalizes transient %s state to pending",
    (syncState) => {
      expect(
        mergeSettings({
          profile: { local: localProfile, peerByDeviceId: {}, syncState },
        } as never).profile.syncState,
      ).toBe("pending");
    },
  );

  it("defaults appearance settings to the built-in package", () => {
    expect(mergeSettings({}).appearance).toEqual({
      selectedPetPackageId: "builtin:q-girl",
      peerPetPackageByDeviceId: {},
    });
  });

  it("migrates every historical selected and peer pet package id", () => {
    expect(
      mergeSettings({
        appearance: {
          selectedPetPackageId: "imported:q-boy-complete-v3",
          peerPetPackageByDeviceId: {
            dev_star: "builtin:star-sleeper",
            dev_girl: "imported:q-girl-complete-v3",
            dev_boy: "imported:q-boy-complete-v3",
            dev_custom: "imported:moon-buddy",
          },
        },
      }),
    ).toMatchObject({
      appearance: {
        selectedPetPackageId: "builtin:q-boy",
        peerPetPackageByDeviceId: {
          dev_star: "builtin:q-girl",
          dev_girl: "builtin:q-girl",
          dev_boy: "builtin:q-boy",
          dev_custom: "imported:moon-buddy",
        },
      },
    });
  });

  it("reads valid appearance settings and drops invalid peer mappings", () => {
    expect(
      mergeSettings({
        appearance: {
          selectedPetPackageId: "imported:moon-buddy",
          peerPetPackageByDeviceId: {
            dev_a: "imported:moon-buddy",
            dev_b: 3,
          },
        },
      } as never),
    ).toMatchObject({
      appearance: {
        selectedPetPackageId: "imported:moon-buddy",
        peerPetPackageByDeviceId: {
          dev_a: "imported:moon-buddy",
        },
      },
    });
  });

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
        appearance: {
          selectedPetPackageId: "imported:moon-buddy",
          peerPetPackageByDeviceId: {
            dev_a: "imported:moon-buddy",
          },
        },
        sync: {
          enabled: true,
          relayUrl: "https://relay.example.com",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: "pair_a",
          peerDeviceId: "dev_b",
          activityStatus: null,
        },
      }),
    ).toEqual({
      scale: 1.4,
      autoMoveEnabled: false,
      movementRange: "free",
      bubblesEnabled: false,
      alwaysOnTop: false,
      clickThrough: true,
      appearance: {
        selectedPetPackageId: "imported:moon-buddy",
        peerPetPackageByDeviceId: {
          dev_a: "imported:moon-buddy",
        },
      },
      profile: {
        local: null,
        peerByDeviceId: {},
        syncState: "idle",
      },
      sync: {
        enabled: true,
        relayUrl: "https://relay.example.com",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_a",
        peerDeviceId: "dev_b",
        activityStatus: null,
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
          activityStatus: null,
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
        activityStatus: null,
      },
    });
  });

  it("persists valid local activity statuses", () => {
    expect(
      mergeSettings({
        sync: {
          activityStatus: "dazing",
        } as never,
      }),
    ).toMatchObject({
      sync: {
        activityStatus: "dazing",
      },
    });
  });

  it("rejects unknown local activity statuses", () => {
    expect(
      mergeSettings({
        sync: {
          activityStatus: "gaming",
        } as never,
      }),
    ).toMatchObject({
      sync: {
        activityStatus: null,
      },
    });
  });

  it("keeps local activity status when pair fields are cleared", () => {
    expect(
      mergeSettings({
        sync: {
          pairId: null,
          peerDeviceId: null,
          activityStatus: "slacking",
        } as never,
      }),
    ).toMatchObject({
      sync: {
        pairId: null,
        peerDeviceId: null,
        activityStatus: "slacking",
      },
    });
  });

  it.each([
    undefined,
    "",
    "http://127.0.0.1:8787",
    "http://localhost:8787",
  ])("uses the cloud relay for legacy relay url %s", (relayUrl) => {
    const settings = mergeSettings({ sync: { relayUrl } as never });

    expect(settings.sync.enabled).toBe(true);
    expect(settings.sync.relayUrl).toBe("http://159.75.175.47:8787");
  });

  it("migrates old disabled local sync settings to the enabled cloud relay", () => {
    const settings = mergeSettings({
      sync: {
        enabled: false,
        relayUrl: "http://127.0.0.1:8787",
      } as never,
    });

    expect(settings.sync.enabled).toBe(true);
    expect(settings.sync.relayUrl).toBe("http://159.75.175.47:8787");
  });

  it("migrates a bound RFC1918 LAN relay to the cloud and clears server scoped pair fields", () => {
    const settings = mergeSettings({
      sync: {
        enabled: true,
        relayUrl: "http://192.168.1.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_old_lan",
        peerDeviceId: "dev_b",
        activityStatus: "overtime",
      },
    });

    expect(settings.sync).toEqual({
      enabled: true,
      relayUrl: "http://159.75.175.47:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: null,
      peerDeviceId: null,
      activityStatus: "overtime",
    });
  });

  it.each([
    "http://10.0.0.5:8787",
    "http://172.16.0.1:8787",
    "http://172.31.255.255:8787",
    "http://0.0.0.0:8787",
    "http://[::1]:8787",
    "http://localhost:8787",
  ])("clears pair fields when legacy private relay %s is migrated", (relayUrl) => {
    const settings = mergeSettings({
      sync: {
        relayUrl,
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_old",
        peerDeviceId: "dev_b",
        activityStatus: "slacking",
      } as never,
    });

    expect(settings.sync).toMatchObject({
      relayUrl: "http://159.75.175.47:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: null,
      peerDeviceId: null,
      activityStatus: "slacking",
    });
  });

  it("keeps custom public relay pair fields", () => {
    const settings = mergeSettings({
      sync: {
        relayUrl: "https://relay.example.com",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_public",
        peerDeviceId: "dev_b",
        activityStatus: "dazing",
      } as never,
    });

    expect(settings.sync).toMatchObject({
      relayUrl: "https://relay.example.com",
      pairId: "pair_public",
      peerDeviceId: "dev_b",
      activityStatus: "dazing",
    });
  });

  it("does not treat private-looking domain names as legacy private relays", () => {
    const settings = mergeSettings({
      sync: {
        relayUrl: "https://192.168.x.example.com",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_domain",
        peerDeviceId: "dev_b",
      } as never,
    });

    expect(settings.sync).toMatchObject({
      relayUrl: "https://192.168.x.example.com",
      pairId: "pair_domain",
      peerDeviceId: "dev_b",
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
          activityStatus: "gaming" as never,
        },
      }),
    ).toMatchObject({
      sync: defaultSettings.sync,
    });
  });
});

describe("settings persistence", () => {
  it("round trips non-default local and peer profiles", async () => {
    let persistedSettings: unknown = null;
    const api: SettingsPersistenceApi = {
      readSettings: async () => persistedSettings,
      writeSettings: async (settings) => {
        persistedSettings = JSON.parse(JSON.stringify(settings)) as unknown;
      },
    };

    await saveSettings(api, {
      ...defaultSettings,
      profile: {
        local: localProfile,
        peerByDeviceId: { dev_b: peerProfile },
        syncState: "synced",
      },
    });

    await expect(loadSettings(api)).resolves.toMatchObject({
      profile: {
        local: localProfile,
        peerByDeviceId: { dev_b: peerProfile },
        syncState: "synced",
      },
    });
  });

  it("persists selected and peer package migrations exactly once", async () => {
    const writeSettings = vi.fn(async (_settings: PetSettings) => undefined);
    const api: SettingsPersistenceApi = {
      readSettings: async () => ({
        appearance: {
          selectedPetPackageId: "imported:q-boy-complete-v3",
          peerPetPackageByDeviceId: {
            dev_star: "builtin:star-sleeper",
            dev_girl: "imported:q-girl-complete-v3",
            dev_boy: "imported:q-boy-complete-v3",
            dev_custom: "imported:q-photo-chibi",
            dev_invalid: 3,
          },
        },
      }),
      writeSettings,
    };

    const loadedSettings = await loadSettings(api);

    expect(loadedSettings.appearance).toEqual({
      selectedPetPackageId: "builtin:q-boy",
      peerPetPackageByDeviceId: {
        dev_star: "builtin:q-girl",
        dev_girl: "builtin:q-girl",
        dev_boy: "builtin:q-boy",
        dev_custom: "imported:q-photo-chibi",
      },
    });
    expect(writeSettings).toHaveBeenCalledTimes(1);
    expect(writeSettings).toHaveBeenCalledWith(loadedSettings);
  });

  it("persists combined relay and appearance migrations exactly once", async () => {
    const writeSettings = vi.fn(async (_settings: PetSettings) => undefined);
    const api: SettingsPersistenceApi = {
      readSettings: async () => ({
        appearance: {
          selectedPetPackageId: "imported:q-girl-complete-v3",
          peerPetPackageByDeviceId: {
            dev_b: "imported:q-boy-complete-v3",
          },
        },
        sync: {
          enabled: true,
          relayUrl: "http://192.168.1.47:8787",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: "pair_old_lan",
          peerDeviceId: "dev_b",
          activityStatus: "overtime",
        },
      }),
      writeSettings,
    };

    const loadedSettings = await loadSettings(api);

    expect(writeSettings).toHaveBeenCalledTimes(1);
    const persistedSettings = writeSettings.mock.calls[0]?.[0];
    expect(persistedSettings).toBe(loadedSettings);
    expect(persistedSettings).toMatchObject({
      appearance: {
        selectedPetPackageId: "builtin:q-girl",
        peerPetPackageByDeviceId: {
          dev_b: "builtin:q-boy",
        },
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
        activityStatus: "overtime",
      },
    });
  });

  it("returns migrated appearance settings when persistence rejects", async () => {
    const writeSettings = vi.fn(async (_settings: PetSettings) => {
      throw new Error("settings write failed");
    });
    const api: SettingsPersistenceApi = {
      readSettings: async () => ({
        appearance: {
          selectedPetPackageId: "imported:q-girl-complete-v3",
          peerPetPackageByDeviceId: {
            dev_boy: "imported:q-boy-complete-v3",
          },
        },
      }),
      writeSettings,
    };

    await expect(loadSettings(api)).resolves.toMatchObject({
      appearance: {
        selectedPetPackageId: "builtin:q-girl",
        peerPetPackageByDeviceId: {
          dev_boy: "builtin:q-boy",
        },
      },
    });
    expect(writeSettings).toHaveBeenCalledTimes(1);
  });

  it("loads validated settings from persistence", async () => {
    const api: SettingsPersistenceApi = {
      readSettings: async () => ({
        scale: 3,
        autoMoveEnabled: false,
        movementRange: "active-screen",
        bubblesEnabled: false,
        alwaysOnTop: false,
        clickThrough: true,
        appearance: {
          selectedPetPackageId: "imported:moon-buddy",
          peerPetPackageByDeviceId: {
            dev_a: "imported:moon-buddy",
          },
        },
        sync: {
          enabled: true,
          relayUrl: "https://relay.example.com",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: "pair_a",
          peerDeviceId: "dev_b",
          activityStatus: "slacking",
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
      appearance: {
        selectedPetPackageId: "imported:moon-buddy",
        peerPetPackageByDeviceId: {
          dev_a: "imported:moon-buddy",
        },
      },
      profile: {
        local: null,
        peerByDeviceId: {},
        syncState: "idle",
      },
      sync: {
        enabled: true,
        relayUrl: "https://relay.example.com",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_a",
        peerDeviceId: "dev_b",
        activityStatus: "slacking",
      },
    });
  });

  it("persists cloud relay migration after loading stale bound LAN settings", async () => {
    let writtenSettings = null as PetSettings | null;
    const api: SettingsPersistenceApi = {
      readSettings: async () => ({
        sync: {
          enabled: true,
          relayUrl: "http://192.168.1.47:8787",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: "pair_old_lan",
          peerDeviceId: "dev_b",
          activityStatus: "overtime",
        },
      }),
      writeSettings: async (settings) => {
        writtenSettings = settings;
      },
    };

    const loadedSettings = await loadSettings(api);

    expect(loadedSettings.sync).toEqual({
      enabled: true,
      relayUrl: "http://159.75.175.47:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: null,
      peerDeviceId: null,
      activityStatus: "overtime",
    });
    expect(writtenSettings).toEqual(loadedSettings);
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
      sync: {
        ...defaultSettings.sync,
        activityStatus: "overtime",
      } as never,
    });

    expect(writtenSettings).toEqual({
      ...defaultSettings,
      scale: 2,
      movementRange: "bottom",
      sync: {
        ...defaultSettings.sync,
        activityStatus: "overtime",
      },
    });
  });
});
