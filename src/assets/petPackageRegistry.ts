import { getBuiltInFrameAssetUrl } from "../renderer/frameAtlas";
import {
  builtInPetManifest,
  getActionDefinition,
  type PetActionDefinition,
  type PetActionName,
} from "./builtInPetManifest";
import { readPetActionCategory } from "./petActionNames";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
  type PetPackageSceneManifest,
} from "./petPackageContract";

export interface ResolvedPetPackage {
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  previewUrl: string | null;
  source: "built-in" | "imported";
  actions: Record<PetActionName, PetActionDefinition>;
  scenes: Record<string, PetPackageSceneManifest>;
}

export function buildPetPackageRegistry(
  importedPackages: ImportedPetPackageSummary[],
  convertFileSrc: (path: string) => string,
): ResolvedPetPackage[] {
  return [
    buildBuiltInPackage(),
    ...importedPackages.flatMap((pkg) => {
      const resolved = buildImportedPackage(pkg, convertFileSrc);

      return resolved ? [resolved] : [];
    }),
  ];
}

export function resolveSelectedPetPackage(
  packages: readonly ResolvedPetPackage[],
  selectedPackageId: string,
): ResolvedPetPackage {
  return (
    packages.find((pkg) => pkg.id === selectedPackageId) ??
    packages.find((pkg) => pkg.id === BUILT_IN_PET_PACKAGE_ID) ??
    packages[0]
  );
}

function buildBuiltInPackage(): ResolvedPetPackage {
  return {
    id: BUILT_IN_PET_PACKAGE_ID,
    name: builtInPetManifest.name,
    baseSize: builtInPetManifest.baseSize,
    frameSize: builtInPetManifest.frameSize,
    previewUrl: null,
    source: "built-in",
    scenes: builtInPetManifest.scenes,
    actions: buildActionRecord((action) => {
      const actionDefinition = getActionDefinition(action);

      return {
        ...actionDefinition,
        frames: actionDefinition.frames.flatMap((framePath) => {
          const url = getBuiltInFrameAssetUrl(framePath);

          return url ? [url] : [];
        }),
      };
    }),
  };
}

function buildImportedPackage(
  pkg: ImportedPetPackageSummary,
  convertFileSrc: (path: string) => string,
): ResolvedPetPackage | null {
  const actions: Partial<Record<PetActionName, PetActionDefinition>> = {};

  for (const action of REQUIRED_PET_ACTIONS) {
    const frames = pkg.framePaths[action];
    if (!frames || frames.length !== PET_FRAMES_PER_ACTION) {
      return null;
    }

    const actionManifest = pkg.actions[action];
    if (!actionManifest) {
      return null;
    }

    actions[action] = {
      fps: actionManifest.fps,
      loop: actionManifest.loop,
      frameCount: actionManifest.frameCount,
      durationMs: actionManifest.durationMs,
      category: readPetActionCategory(action),
      frames: frames.map((framePath) =>
        convertFileSrc(normalizeImportedAssetPath(framePath)),
      ),
    };
  }

  return {
    id: pkg.id,
    name: pkg.name,
    baseSize: pkg.baseSize,
    frameSize: pkg.frameSize,
    previewUrl: convertFileSrc(normalizeImportedAssetPath(pkg.previewPath)),
    source: "imported",
    actions: actions as Record<PetActionName, PetActionDefinition>,
    scenes: pkg.scenes,
  };
}

function buildActionRecord(
  createAction: (action: PetActionName) => PetActionDefinition,
): Record<PetActionName, PetActionDefinition> {
  const actions = {} as Record<PetActionName, PetActionDefinition>;

  for (const action of REQUIRED_PET_ACTIONS) {
    actions[action] = createAction(action);
  }

  return actions;
}

function normalizeImportedAssetPath(path: string): string {
  return path.replaceAll("\\", "/");
}
