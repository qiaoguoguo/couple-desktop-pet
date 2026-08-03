import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "./petPackageContract";
import {
  buildPetPackageRegistry,
  resolveSelectedPetPackage,
} from "./petPackageRegistry";

describe("pet package registry", () => {
  const imported: ImportedPetPackageSummary = {
    id: "imported:moon-buddy",
    manifestId: "moon-buddy",
    name: "月亮伙伴",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 512, height: 512 },
    previewPath: "C:/app/pet-packages/moon-buddy/preview.png",
    framePaths: createFramePaths(),
  };

  it("combines the built-in package with imported packages", () => {
    const packages = buildPetPackageRegistry(
      [imported],
      (path) => `asset://${path}`,
    );

    expect(packages.map((pkg) => pkg.id)).toEqual([
      BUILT_IN_PET_PACKAGE_ID,
      "imported:moon-buddy",
    ]);
    expect(packages[1].actions["idle-breathe"].frames[0]).toBe(
      "asset://C:/app/pet-packages/moon-buddy/frames/idle-breathe-01.png",
    );
  });

  it("normalizes imported Windows paths before creating asset URLs", () => {
    const windowsImported: ImportedPetPackageSummary = {
      ...imported,
      previewPath: "C:\\app\\pet-packages\\moon-buddy\\preview.png",
      framePaths: createFramePaths("C:\\app\\pet-packages\\moon-buddy\\frames"),
    };
    const convertedPaths: string[] = [];

    const packages = buildPetPackageRegistry([windowsImported], (path) => {
      convertedPaths.push(path);
      return `asset://${path}`;
    });

    expect(packages[1].previewUrl).toBe(
      "asset://C:/app/pet-packages/moon-buddy/preview.png",
    );
    expect(packages[1].actions["idle-breathe"].frames[0]).toBe(
      "asset://C:/app/pet-packages/moon-buddy/frames/idle-breathe-01.png",
    );
    expect(convertedPaths.every((path) => !path.includes("\\"))).toBe(true);
  });

  it("falls back to built-in when selected package is missing", () => {
    const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);

    expect(resolveSelectedPetPackage(packages, "imported:missing").id).toBe(
      BUILT_IN_PET_PACKAGE_ID,
    );
  });
});

function createFramePaths(
  frameRoot = "C:/app/pet-packages/moon-buddy/frames",
): ImportedPetPackageSummary["framePaths"] {
  const framePaths = {} as ImportedPetPackageSummary["framePaths"];

  for (const action of REQUIRED_PET_ACTIONS) {
    framePaths[action] = Array.from(
      { length: 18 },
      (_, index) =>
        `${frameRoot}/${action}-${String(index + 1).padStart(2, "0")}.png`,
    );
  }

  return framePaths;
}
