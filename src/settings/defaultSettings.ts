import { BUILT_IN_PET_PACKAGE_ID } from "../assets/petPackageContract";
import type { PetSettings } from "./settingsTypes";

export const DEFAULT_RELAY_URL = "http://159.75.175.47:8787";

export const defaultSettings: PetSettings = {
  scale: 1,
  autoMoveEnabled: true,
  movementRange: "bottom",
  bubblesEnabled: true,
  alwaysOnTop: true,
  clickThrough: false,
  appearance: {
    selectedPetPackageId: BUILT_IN_PET_PACKAGE_ID,
    peerPetPackageByDeviceId: {},
  },
  sync: {
    enabled: true,
    relayUrl: DEFAULT_RELAY_URL,
    deviceId: null,
    deviceSecret: null,
    pairId: null,
    peerDeviceId: null,
    activityStatus: null,
  },
};
