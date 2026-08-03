import { describe, expect, it } from "vitest";
import tauriConfigRaw from "../../src-tauri/tauri.conf.json?raw";

describe("Tauri security config", () => {
  it("allows imported pet package images through the local asset protocol", () => {
    const config = JSON.parse(tauriConfigRaw) as {
      app?: {
        security?: {
          assetProtocol?: {
            enable?: boolean;
            scope?: string[];
          };
        };
      };
    };

    expect(config.app?.security?.assetProtocol).toEqual({
      enable: true,
      scope: ["$APPDATA/pet-packages/**/*"],
    });
  });
});
