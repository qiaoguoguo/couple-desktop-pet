import { describe, expect, it } from "vitest";
import tauriConfigRaw from "../../src-tauri/tauri.conf.json?raw";

describe("Tauri security config", () => {
  it("allows the default cloud relay over http and websocket", () => {
    const config = JSON.parse(tauriConfigRaw) as {
      app?: {
        security?: {
          csp?: string;
        };
      };
    };

    const csp = config.app?.security?.csp ?? "";

    expect(csp).toContain("http://159.75.175.47:8787");
    expect(csp).toContain("ws://159.75.175.47:8787");
  });

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
