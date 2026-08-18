import { useCallback, useRef, useState } from "react";
import {
  parseCanonicalProfileTimestamp,
  validateProfileUpdate,
  type CityLocationV1,
  type DeviceProfileV1,
  type ProfileUpdateV1,
} from "../../shared/profileProtocol";
import type { PetSettings, ProfileSettings } from "../settings/settingsTypes";
import { ensureDeviceIdentity } from "../sync/deviceIdentity";
import { RelayHttpClient } from "../sync/relayHttpClient";

type ProfileRelayClient = Pick<
  RelayHttpClient,
  "searchLocations" | "saveProfile"
>;

export interface UseProfileSyncOptions {
  settings: PetSettings;
  updateSettings(settings: PetSettings): void;
  persistSettings(settings: PetSettings): Promise<void> | void;
  createRelayClient?(relayUrl: string): ProfileRelayClient;
}

export interface UseProfileSyncResult {
  isComplete: boolean;
  searchState: "idle" | "searching" | "error";
  searchResults: CityLocationV1[];
  saveState: ProfileSettings["syncState"];
  searchCities(query: string): Promise<void>;
  saveLocalProfile(
    profile: ProfileUpdateV1,
  ): Promise<{ ok: boolean; message?: string }>;
  retryPendingProfile(): Promise<{ ok: boolean; message?: string }>;
  markLocalProfileSynced(profile: ProfileUpdateV1): Promise<void>;
  rememberPeer(deviceId: string, profile: DeviceProfileV1): void;
}

export function useProfileSync({
  settings,
  updateSettings,
  persistSettings,
  createRelayClient = (relayUrl) => new RelayHttpClient(relayUrl),
}: UseProfileSyncOptions): UseProfileSyncResult {
  const [searchState, setSearchState] =
    useState<UseProfileSyncResult["searchState"]>("idle");
  const [searchResults, setSearchResults] = useState<CityLocationV1[]>([]);
  const settingsRef = useRef(settings);
  const updateSettingsRef = useRef(updateSettings);
  const persistSettingsRef = useRef(persistSettings);
  const createRelayClientRef = useRef(createRelayClient);
  const searchSequenceRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const saveSideEffectQueueRef = useRef<Promise<void>>(Promise.resolve());

  settingsRef.current = settings;
  updateSettingsRef.current = updateSettings;
  persistSettingsRef.current = persistSettings;
  createRelayClientRef.current = createRelayClient;

  const applySettings = useCallback((nextSettings: PetSettings) => {
    settingsRef.current = nextSettings;
    updateSettingsRef.current(nextSettings);
  }, []);

  const commitSettings = useCallback(async (nextSettings: PetSettings) => {
    applySettings(nextSettings);
    await persistSettingsRef.current(nextSettings);
  }, [applySettings]);

  const searchCities = useCallback(
    async (query: string) => {
      const sequence = ++searchSequenceRef.current;
      setSearchState("searching");

      try {
        let current = settingsRef.current;
        const identity = ensureDeviceIdentity(current.sync);
        if (identity !== current.sync) {
          current = { ...current, sync: identity };
          await commitSettings(current);
        }

        if (!identity.deviceId || !identity.deviceSecret) {
          throw new Error("Device identity is unavailable");
        }

        const result = await createRelayClientRef
          .current(identity.relayUrl)
          .searchLocations({
            deviceId: identity.deviceId,
            deviceSecret: identity.deviceSecret,
            query: query.trim(),
          });

        if (sequence !== searchSequenceRef.current) {
          return;
        }

        if (result.ok) {
          setSearchResults(result.locations);
          setSearchState("idle");
          return;
        }

        setSearchResults([]);
        setSearchState("error");
      } catch {
        if (sequence === searchSequenceRef.current) {
          setSearchResults([]);
          setSearchState("error");
        }
      }
    },
    [commitSettings],
  );

  const saveLocalProfile = useCallback(
    async (
      profile: ProfileUpdateV1,
    ): Promise<{ ok: boolean; message?: string }> => {
      const validated = validateProfileUpdate(profile);
      if (!validated.ok) {
        return { ok: false, message: validated.message };
      }

      const sequence = ++saveSequenceRef.current;
      const current = settingsRef.current;
      const identity = ensureDeviceIdentity(current.sync);
      const localSettings: PetSettings = {
        ...current,
        sync: identity,
        profile: {
          ...current.profile,
          local: validated.profile,
          syncState: "saving",
        },
      };
      applySettings(localSettings);

      const operation = saveSideEffectQueueRef.current
        .catch(() => undefined)
        .then(async (): Promise<{ ok: boolean; message?: string }> => {
          if (sequence !== saveSequenceRef.current) {
            return { ok: true };
          }

          try {
            await persistSettingsRef.current(settingsRef.current);
          } catch {
            if (sequence !== saveSequenceRef.current) {
              return { ok: true };
            }
            markProfilePending(settingsRef, updateSettingsRef);
            return { ok: false, message: "Unable to save profile locally" };
          }

          if (sequence !== saveSequenceRef.current) {
            return { ok: true };
          }

          if (!identity.deviceId || !identity.deviceSecret) {
            markProfilePending(settingsRef, updateSettingsRef);
            return { ok: false, message: "Device identity is unavailable" };
          }

          try {
            const result = await createRelayClientRef
              .current(identity.relayUrl)
              .saveProfile({
                deviceId: identity.deviceId,
                deviceSecret: identity.deviceSecret,
                profile: validated.profile,
              });

            if (sequence !== saveSequenceRef.current) {
              return { ok: true };
            }

            if (!result.ok) {
              await commitProfileState(commitSettings, settingsRef, "pending");
              return { ok: false, message: result.message };
            }

            await commitProfileState(commitSettings, settingsRef, "synced");
            return { ok: true };
          } catch {
            if (sequence !== saveSequenceRef.current) {
              return { ok: true };
            }
            await commitProfileState(commitSettings, settingsRef, "pending").catch(
              () => undefined,
            );
            return { ok: false, message: "Relay unavailable" };
          }
        });

      saveSideEffectQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [applySettings, commitSettings],
  );

  const retryPendingProfile = useCallback(() => {
    const current = settingsRef.current;
    const profile = current.profile.local;
    if (profile === null || current.profile.syncState !== "pending") {
      return Promise.resolve({ ok: true });
    }

    const sequence = ++saveSequenceRef.current;
    const identity = ensureDeviceIdentity(current.sync);
    applySettings({
      ...current,
      sync: identity,
      profile: { ...current.profile, syncState: "saving" },
    });

    const operation = saveSideEffectQueueRef.current
      .catch(() => undefined)
      .then(async (): Promise<{ ok: boolean; message?: string }> => {
        if (
          sequence !== saveSequenceRef.current ||
          !isCurrentLocalProfile(settingsRef.current, profile)
        ) {
          return { ok: true };
        }

        if (identity !== current.sync) {
          try {
            await persistSettingsRef.current(settingsRef.current);
          } catch {
            markProfilePending(settingsRef, updateSettingsRef);
            return { ok: false, message: "Unable to save device identity locally" };
          }
        }

        if (!identity.deviceId || !identity.deviceSecret) {
          markProfilePending(settingsRef, updateSettingsRef);
          return { ok: false, message: "Device identity is unavailable" };
        }

        let result: Awaited<ReturnType<ProfileRelayClient["saveProfile"]>>;
        try {
          result = await createRelayClientRef.current(identity.relayUrl).saveProfile({
            deviceId: identity.deviceId,
            deviceSecret: identity.deviceSecret,
            profile,
          });
        } catch {
          if (
            sequence === saveSequenceRef.current &&
            isCurrentLocalProfile(settingsRef.current, profile)
          ) {
            await commitProfileState(commitSettings, settingsRef, "pending").catch(
              () => markProfilePending(settingsRef, updateSettingsRef),
            );
          }
          return { ok: false, message: "Relay unavailable" };
        }

        if (
          sequence !== saveSequenceRef.current ||
          !isCurrentLocalProfile(settingsRef.current, profile)
        ) {
          return { ok: true };
        }

        if (!result.ok) {
          await commitProfileState(commitSettings, settingsRef, "pending").catch(
            () => markProfilePending(settingsRef, updateSettingsRef),
          );
          return { ok: false, message: result.message };
        }

        try {
          await commitProfileState(commitSettings, settingsRef, "synced");
          return { ok: true };
        } catch {
          if (
            sequence === saveSequenceRef.current &&
            isCurrentLocalProfile(settingsRef.current, profile)
          ) {
            markProfilePending(settingsRef, updateSettingsRef);
          }
          return { ok: false, message: "Unable to save profile locally" };
        }
      });

    saveSideEffectQueueRef.current = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }, [applySettings, commitSettings]);

  const markLocalProfileSynced = useCallback(
    (profile: ProfileUpdateV1): Promise<void> => {
      const validated = validateProfileUpdate(profile);
      if (
        !validated.ok ||
        !isCurrentLocalProfile(settingsRef.current, validated.profile)
      ) {
        return Promise.resolve();
      }

      const sequence = ++saveSequenceRef.current;
      const operation = saveSideEffectQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (
            sequence !== saveSequenceRef.current ||
            !isCurrentLocalProfile(settingsRef.current, validated.profile)
          ) {
            return;
          }

          try {
            await commitProfileState(commitSettings, settingsRef, "synced");
          } catch {
            if (
              sequence === saveSequenceRef.current &&
              isCurrentLocalProfile(settingsRef.current, validated.profile)
            ) {
              markProfilePending(settingsRef, updateSettingsRef);
            }
          }
        });

      saveSideEffectQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [commitSettings],
  );

  const rememberPeer = useCallback(
    (deviceId: string, profile: DeviceProfileV1) => {
      if (!deviceId.trim()) {
        return;
      }

      const current = settingsRef.current;
      const peers = current.profile.peerByDeviceId;
      const existing = Object.prototype.hasOwnProperty.call(peers, deviceId)
        ? peers[deviceId]
        : undefined;
      if (existing && !isNewerProfile(profile, existing)) {
        return;
      }

      const peerByDeviceId = Object.fromEntries([
        ...Object.entries(current.profile.peerByDeviceId).filter(
          ([storedDeviceId]) => storedDeviceId !== deviceId,
        ),
        [deviceId, profile],
      ]);
      const nextSettings: PetSettings = {
        ...current,
        profile: { ...current.profile, peerByDeviceId },
      };

      void commitSettings(nextSettings).catch(() => undefined);
    },
    [commitSettings],
  );

  return {
    isComplete: settings.profile.local !== null,
    searchState,
    searchResults,
    saveState: settings.profile.syncState,
    searchCities,
    saveLocalProfile,
    retryPendingProfile,
    markLocalProfileSynced,
    rememberPeer,
  };
}

async function commitProfileState(
  commitSettings: (settings: PetSettings) => Promise<void>,
  settingsRef: { current: PetSettings },
  syncState: ProfileSettings["syncState"],
): Promise<void> {
  const current = settingsRef.current;
  await commitSettings({
    ...current,
    profile: { ...current.profile, syncState },
  });
}

function markProfilePending(
  settingsRef: { current: PetSettings },
  updateSettingsRef: { current(settings: PetSettings): void },
): void {
  const current = settingsRef.current;
  const pending: PetSettings = {
    ...current,
    profile: { ...current.profile, syncState: "pending" },
  };
  settingsRef.current = pending;
  updateSettingsRef.current(pending);
}

function isCurrentLocalProfile(
  settings: PetSettings,
  expected: ProfileUpdateV1,
): boolean {
  const current = settings.profile.local;
  return current !== null && profilesMatch(current, expected);
}

function profilesMatch(left: ProfileUpdateV1, right: ProfileUpdateV1): boolean {
  return (
    left.version === right.version &&
    left.nickname === right.nickname &&
    left.city.provider === right.city.provider &&
    left.city.providerLocationId === right.city.providerLocationId &&
    left.city.name === right.city.name &&
    left.city.region === right.city.region &&
    left.city.country === right.city.country &&
    left.city.latitude === right.city.latitude &&
    left.city.longitude === right.city.longitude
  );
}

function isNewerProfile(
  incoming: DeviceProfileV1,
  existing: DeviceProfileV1,
): boolean {
  const incomingTimestamp = parseCanonicalProfileTimestamp(incoming.updatedAt);
  const existingTimestamp = parseCanonicalProfileTimestamp(existing.updatedAt);

  if (incomingTimestamp === null) {
    return false;
  }

  return existingTimestamp === null || incomingTimestamp > existingTimestamp;
}
