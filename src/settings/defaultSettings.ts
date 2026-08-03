import { BUILT_IN_PET_PACKAGE_ID } from "../assets/petPackageContract";
import type { PetSettings } from "./settingsTypes";

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
    enabled: false,
    relayUrl: "http://127.0.0.1:8787",
    deviceId: null,
    deviceSecret: null,
    pairId: null,
    peerDeviceId: null,
  },
};
