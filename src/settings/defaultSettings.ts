import type { PetSettings } from "./settingsTypes";

export const defaultSettings: PetSettings = {
  scale: 1,
  autoMoveEnabled: true,
  movementRange: "bottom",
  bubblesEnabled: true,
  alwaysOnTop: true,
  clickThrough: false,
  sync: {
    enabled: false,
    relayUrl: "http://127.0.0.1:8787",
    deviceId: null,
    deviceSecret: null,
    pairId: null,
    peerDeviceId: null,
  },
};
