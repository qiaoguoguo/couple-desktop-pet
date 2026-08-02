import { describe, expect, it } from "vitest";
import mainSource from "../../src-tauri/src/main.rs?raw";
import tauriConfigRaw from "../../src-tauri/tauri.conf.json?raw";

interface TauriConfig {
  app: {
    windows: Array<{
      label?: string;
      transparent?: boolean;
      decorations?: boolean;
      shadow?: boolean;
    }>;
  };
}

describe("desktop window chrome configuration", () => {
  it("keeps the main pet window transparent, undecorated, and shadowless", () => {
    const tauriConfig = JSON.parse(tauriConfigRaw) as TauriConfig;
    const mainWindow = tauriConfig.app.windows.find(
      (windowConfig) => windowConfig.label === "main",
    );

    expect(mainWindow).toMatchObject({
      transparent: true,
      decorations: false,
      shadow: false,
    });
  });

  it("uses the Windows GUI subsystem so direct exe launches do not open a console", () => {
    expect(mainSource.trimStart()).toMatch(
      /^#!\[cfg_attr\(windows, windows_subsystem = "windows"\)\]/,
    );
  });
});
