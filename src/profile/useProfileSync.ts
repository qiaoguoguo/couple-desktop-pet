import { useCallback, useRef, useState } from "react";
import {
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

  settingsRef.current = settings;
  updateSettingsRef.current = updateSettings;
  persistSettingsRef.current = persistSettings;
  createRelayClientRef.current = createRelayClient;

  const commitSettings = useCallback(async (nextSettings: PetSettings) => {
    settingsRef.current = nextSettings;
    updateSettingsRef.current(nextSettings);
    await persistSettingsRef.current(nextSettings);
  }, []);

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

      try {
        await commitSettings(localSettings);
      } catch {
        markProfilePending(settingsRef, updateSettingsRef);
        return { ok: false, message: "Unable to save profile locally" };
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
          return result.ok
            ? { ok: true }
            : { ok: false, message: result.message };
        }

        if (!result.ok) {
          await commitProfileState(commitSettings, settingsRef, "pending");
          return { ok: false, message: result.message };
        }

        await commitProfileState(commitSettings, settingsRef, "synced");
        return { ok: true };
      } catch {
        if (sequence === saveSequenceRef.current) {
          await commitProfileState(commitSettings, settingsRef, "pending").catch(
            () => undefined,
          );
        }
        return { ok: false, message: "Relay unavailable" };
      }
    },
    [commitSettings],
  );

  const rememberPeer = useCallback(
    (deviceId: string, profile: DeviceProfileV1) => {
      if (!deviceId.trim()) {
        return;
      }

      const current = settingsRef.current;
      const existing = current.profile.peerByDeviceId[deviceId];
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

function isNewerProfile(
  incoming: DeviceProfileV1,
  existing: DeviceProfileV1,
): boolean {
  const incomingTimestamp = Date.parse(incoming.updatedAt);
  const existingTimestamp = Date.parse(existing.updatedAt);

  if (Number.isFinite(incomingTimestamp) && Number.isFinite(existingTimestamp)) {
    return incomingTimestamp > existingTimestamp;
  }

  return incoming.updatedAt > existing.updatedAt;
}
