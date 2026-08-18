import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  DeviceProfileV1,
  ProfileUpdateV1,
} from "../../shared/profileProtocol";
import { defaultSettings } from "../settings/defaultSettings";
import type { PetSettings } from "../settings/settingsTypes";
import type { RelayHttpClient } from "../sync/relayHttpClient";
import { useProfileSync } from "./useProfileSync";

const city = {
  provider: "weatherapi" as const,
  providerLocationId: 2654428,
  name: "Hangzhou",
  region: "Zhejiang",
  country: "China",
  latitude: 30.29,
  longitude: 120.16,
};

const profileUpdate: ProfileUpdateV1 = {
  version: 1,
  nickname: "小满",
  city,
};

describe("useProfileSync", () => {
  it("persists local profile and generated identity before syncing to Relay", async () => {
    let resolveSave: ((value: unknown) => void) | undefined;
    const saveProfile = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const persistSettings = vi.fn().mockResolvedValue(undefined);
    const relayClient = {
      searchLocations: vi.fn(),
      saveProfile,
    };
    const { result } = renderProfileHook({ relayClient, persistSettings });

    let savePromise: Promise<{ ok: boolean; message?: string }> | undefined;
    act(() => {
      savePromise = result.current.profileSync.saveLocalProfile(profileUpdate);
    });

    await waitFor(() => {
      expect(result.current.settings.profile).toMatchObject({
        local: profileUpdate,
        syncState: "saving",
      });
      expect(result.current.settings.sync.deviceId).toMatch(/^dev_/);
      expect(result.current.settings.sync.deviceSecret).toMatch(/^sec_/);
      expect(persistSettings).toHaveBeenCalled();
      expect(saveProfile).toHaveBeenCalled();
    });
    expect(persistSettings.mock.invocationCallOrder[0]).toBeLessThan(
      saveProfile.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );

    resolveSave?.({
      ok: true,
      profile: {
        ...profileUpdate,
        updatedAt: "2026-08-18T08:00:00.000Z",
      },
    });
    await act(async () => {
      await savePromise;
    });

    expect(result.current.profileSync.isComplete).toBe(true);
    expect(result.current.profileSync.saveState).toBe("synced");
  });

  it("keeps the local profile pending when Relay save fails", async () => {
    const persistSettings = vi.fn().mockResolvedValue(undefined);
    const relayClient = {
      searchLocations: vi.fn(),
      saveProfile: vi.fn().mockResolvedValue({
        ok: false,
        code: "relay_unavailable",
        message: "Relay unavailable",
      }),
    };
    const { result } = renderProfileHook({ relayClient, persistSettings });

    let response: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      response = await result.current.profileSync.saveLocalProfile(profileUpdate);
    });

    expect(response).toEqual({ ok: false, message: "Relay unavailable" });
    expect(result.current.settings.profile.local).toEqual(profileUpdate);
    expect(result.current.profileSync.saveState).toBe("pending");
  });

  it("persists and uploads B last when A persistence is delayed", async () => {
    const profileA = namedProfile("A");
    const profileB = namedProfile("B");
    const delayedPersistence = deferred<void>();
    const completedPersistence: string[] = [];
    const persistSettings = vi.fn(async (settings: PetSettings) => {
      const nickname = settings.profile.local?.nickname ?? "none";
      if (nickname === "A" && settings.profile.syncState === "saving") {
        await delayedPersistence.promise;
      }
      completedPersistence.push(`${nickname}:${settings.profile.syncState}`);
    });
    const relayPayloads: string[] = [];
    const relayClient = {
      searchLocations: vi.fn(),
      saveProfile: vi.fn(async ({ profile }: { profile: ProfileUpdateV1 }) => {
        relayPayloads.push(profile.nickname);
        return {
          ok: true,
          profile: {
            ...profile,
            updatedAt: "2026-08-18T08:00:00.000Z",
          },
        };
      }),
    };
    const { result } = renderProfileHook({ relayClient, persistSettings });

    let saveA: Promise<{ ok: boolean; message?: string }> | undefined;
    let saveB: Promise<{ ok: boolean; message?: string }> | undefined;
    act(() => {
      saveA = result.current.profileSync.saveLocalProfile(profileA);
    });
    await waitFor(() => expect(persistSettings).toHaveBeenCalledTimes(1));

    act(() => {
      saveB = result.current.profileSync.saveLocalProfile(profileB);
    });
    expect(result.current.settings.profile).toMatchObject({
      local: profileB,
      syncState: "saving",
    });

    delayedPersistence.resolve();
    await act(async () => {
      await Promise.all([saveA, saveB]);
    });

    expect(completedPersistence.at(-1)).toBe("B:synced");
    expect(relayPayloads).toEqual(["B"]);
    expect(result.current.settings.profile).toMatchObject({
      local: profileB,
      syncState: "synced",
    });
  });

  it("waits for delayed Relay A before uploading B last", async () => {
    const profileA = namedProfile("A");
    const profileB = namedProfile("B");
    const delayedRelay = deferred<void>();
    const relayCompletions: string[] = [];
    const persistSettings = vi.fn().mockResolvedValue(undefined);
    const relayClient = {
      searchLocations: vi.fn(),
      saveProfile: vi.fn(async ({ profile }: { profile: ProfileUpdateV1 }) => {
        if (profile.nickname === "A") {
          await delayedRelay.promise;
        }
        relayCompletions.push(profile.nickname);
        return {
          ok: true,
          profile: {
            ...profile,
            updatedAt: "2026-08-18T08:00:00.000Z",
          },
        };
      }),
    };
    const { result } = renderProfileHook({ relayClient, persistSettings });

    let saveA: Promise<{ ok: boolean; message?: string }> | undefined;
    let saveB: Promise<{ ok: boolean; message?: string }> | undefined;
    act(() => {
      saveA = result.current.profileSync.saveLocalProfile(profileA);
    });
    await waitFor(() => expect(relayClient.saveProfile).toHaveBeenCalledTimes(1));

    act(() => {
      saveB = result.current.profileSync.saveLocalProfile(profileB);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(relayClient.saveProfile).toHaveBeenCalledTimes(1);

    delayedRelay.resolve();
    await act(async () => {
      await Promise.all([saveA, saveB]);
    });

    expect(relayCompletions).toEqual(["A", "B"]);
    expect(result.current.settings.profile).toMatchObject({
      local: profileB,
      syncState: "synced",
    });
  });

  it("does not let an earlier persistence rejection mark B pending", async () => {
    const profileA = namedProfile("A");
    const profileB = namedProfile("B");
    const delayedPersistence = deferred<void>();
    const persistSettings = vi.fn(async (settings: PetSettings) => {
      if (
        settings.profile.local?.nickname === "A" &&
        settings.profile.syncState === "saving"
      ) {
        await delayedPersistence.promise;
      }
    });
    const relayClient = {
      searchLocations: vi.fn(),
      saveProfile: vi.fn(async ({ profile }: { profile: ProfileUpdateV1 }) => ({
        ok: true,
        profile: {
          ...profile,
          updatedAt: "2026-08-18T08:00:00.000Z",
        },
      })),
    };
    const { result } = renderProfileHook({ relayClient, persistSettings });

    let saveA: Promise<{ ok: boolean; message?: string }> | undefined;
    let saveB: Promise<{ ok: boolean; message?: string }> | undefined;
    act(() => {
      saveA = result.current.profileSync.saveLocalProfile(profileA);
    });
    await waitFor(() => expect(persistSettings).toHaveBeenCalledTimes(1));

    act(() => {
      saveB = result.current.profileSync.saveLocalProfile(profileB);
    });
    delayedPersistence.reject(new Error("disk write failed"));
    await act(async () => {
      await Promise.all([saveA, saveB]);
    });

    expect(relayClient.saveProfile).toHaveBeenCalledTimes(1);
    expect(relayClient.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profile: profileB }),
    );
    expect(result.current.settings.profile).toMatchObject({
      local: profileB,
      syncState: "synced",
    });
  });

  it("generates and persists identity before explicit city search", async () => {
    const persistSettings = vi.fn().mockResolvedValue(undefined);
    const relayClient = {
      searchLocations: vi.fn().mockResolvedValue({
        ok: true,
        locations: [city],
      }),
      saveProfile: vi.fn(),
    };
    const { result } = renderProfileHook({ relayClient, persistSettings });

    await act(async () => {
      await result.current.profileSync.searchCities("  Hangzhou  ");
    });

    expect(relayClient.searchLocations).toHaveBeenCalledWith({
      deviceId: expect.stringMatching(/^dev_/),
      deviceSecret: expect.stringMatching(/^sec_/),
      query: "Hangzhou",
    });
    expect(result.current.profileSync.searchState).toBe("idle");
    expect(result.current.profileSync.searchResults).toEqual([city]);
    expect(persistSettings).toHaveBeenCalled();
  });

  it("keeps the newest peer profile and ignores stale updates", async () => {
    const oldProfile: DeviceProfileV1 = {
      version: 1,
      nickname: "旧昵称",
      city: null,
      updatedAt: "2026-08-18T08:00:00.000Z",
    };
    const newerProfile: DeviceProfileV1 = {
      ...oldProfile,
      nickname: "新昵称",
      updatedAt: "2026-08-18T08:02:00.000Z",
    };
    const initialSettings: PetSettings = {
      ...defaultSettings,
      profile: {
        ...defaultSettings.profile,
        peerByDeviceId: { dev_b: oldProfile },
      },
    };
    const persistSettings = vi.fn().mockResolvedValue(undefined);
    const relayClient = {
      searchLocations: vi.fn(),
      saveProfile: vi.fn(),
    };
    const { result } = renderProfileHook({
      initialSettings,
      relayClient,
      persistSettings,
    });

    act(() => {
      result.current.profileSync.rememberPeer("dev_b", {
        ...oldProfile,
        nickname: "过期昵称",
        updatedAt: "2026-08-18T07:59:00.000Z",
      });
      result.current.profileSync.rememberPeer("dev_b", newerProfile);
      result.current.profileSync.rememberPeer("dev_b", {
        ...oldProfile,
        nickname: "延迟到达",
        updatedAt: "2026-08-18T08:01:00.000Z",
      });
    });

    expect(result.current.settings.profile.peerByDeviceId.dev_b).toEqual(
      newerProfile,
    );
    await waitFor(() => expect(persistSettings).toHaveBeenCalledTimes(1));
  });

  it.each(["__proto__", "constructor"])(
    "stores prototype-like peer device ID %s as an own property",
    async (deviceId) => {
      const profile: DeviceProfileV1 = {
        version: 1,
        nickname: deviceId,
        city: null,
        updatedAt: "2026-08-18T08:02:00.000Z",
      };
      const persistSettings = vi.fn().mockResolvedValue(undefined);
      const relayClient = {
        searchLocations: vi.fn(),
        saveProfile: vi.fn(),
      };
      const { result } = renderProfileHook({ relayClient, persistSettings });

      act(() => {
        result.current.profileSync.rememberPeer(deviceId, profile);
      });

      const peers = result.current.settings.profile.peerByDeviceId;
      expect(Object.prototype.hasOwnProperty.call(peers, deviceId)).toBe(true);
      expect(peers[deviceId]).toEqual(profile);
      await waitFor(() => expect(persistSettings).toHaveBeenCalledTimes(1));
    },
  );
});

function namedProfile(nickname: string): ProfileUpdateV1 {
  return { ...profileUpdate, nickname };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderProfileHook({
  initialSettings = {
    ...defaultSettings,
    profile: {
      ...defaultSettings.profile,
      peerByDeviceId: {},
    },
    sync: { ...defaultSettings.sync },
  },
  relayClient,
  persistSettings,
}: {
  initialSettings?: PetSettings;
  relayClient: {
    searchLocations: ReturnType<typeof vi.fn>;
    saveProfile: ReturnType<typeof vi.fn>;
  };
  persistSettings: ReturnType<typeof vi.fn>;
}) {
  return renderHook(() => {
    const [settings, updateSettings] = useState(initialSettings);
    const profileSync = useProfileSync({
      settings,
      updateSettings,
      persistSettings: persistSettings as unknown as (
        settings: PetSettings,
      ) => Promise<void>,
      createRelayClient: () =>
        relayClient as unknown as Pick<
          RelayHttpClient,
          "searchLocations" | "saveProfile"
        >,
    });
    return { settings, profileSync };
  });
}
