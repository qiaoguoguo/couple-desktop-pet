import { describe, expect, it, vi } from "vitest";
import { createPetPackageCommands } from "./petPackageCommands";
import type { ImportedPetPackageSummary } from "./petPackageContract";

describe("pet package commands", () => {
  it("calls Tauri import_pet_package with sourcePath", async () => {
    const importedPackage: ImportedPetPackageSummary = {
      id: "imported:moon-buddy",
      manifestId: "moon-buddy",
      formatVersion: 2,
      renderer: "frame-sequence",
      name: "月亮伙伴",
      baseSize: { width: 256, height: 320 },
      frameSize: { width: 768, height: 960 },
      previewPath: "C:/app/pet-packages/moon-buddy/preview.png",
      portraitPath: null,
      offlinePortraitPath: null,
      actions: {} as ImportedPetPackageSummary["actions"],
      scenes: {} as ImportedPetPackageSummary["scenes"],
      framePaths: {} as ImportedPetPackageSummary["framePaths"],
      defaultMotion: "idle-breathe",
      motions: {} as ImportedPetPackageSummary["motions"],
      motionFramePaths: {} as ImportedPetPackageSummary["motionFramePaths"],
    };
    const invoke = vi.fn(async () => importedPackage);
    const api = createPetPackageCommands(
      invoke as unknown as NonNullable<
        Parameters<typeof createPetPackageCommands>[0]
      >,
    );

    await api.importPetPackage("C:/Users/me/moon.cdpet");

    expect(invoke).toHaveBeenCalledWith("import_pet_package", {
      sourcePath: "C:/Users/me/moon.cdpet",
    });
  });
});
