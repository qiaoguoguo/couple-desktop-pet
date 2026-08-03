import { describe, expect, it, vi } from "vitest";
import { createPetPackageCommands } from "./petPackageCommands";

describe("pet package commands", () => {
  it("calls Tauri import_pet_package with sourcePath", async () => {
    const invoke = vi.fn(async () => ({
      id: "imported:moon-buddy",
      manifestId: "moon-buddy",
      name: "月亮伙伴",
      baseSize: { width: 256, height: 320 },
      frameSize: { width: 512, height: 512 },
      previewPath: "C:/app/pet-packages/moon-buddy/preview.png",
      framePaths: { "idle-breathe": [] },
    }));
    const api = createPetPackageCommands(invoke);

    await api.importPetPackage("C:/Users/me/moon.cdpet");

    expect(invoke).toHaveBeenCalledWith("import_pet_package", {
      sourcePath: "C:/Users/me/moon.cdpet",
    });
  });
});
