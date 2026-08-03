import { getBuiltInFrameAssetUrl } from "../renderer/frameAtlas";
import {
  builtInPetManifest,
  getActionDefinition,
  type PetActionDefinition,
  type PetActionName,
} from "./builtInPetManifest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "./petPackageContract";

export interface ResolvedPetPackage {
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  previewUrl: string | null;
  source: "built-in" | "imported";
  actions: Record<PetActionName, PetActionDefinition>;
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
    previewUrl: null,
    source: "built-in",
    actions: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        {
          ...getActionDefinition(action),
          frames: getActionDefinition(action).frames.flatMap((framePath) => {
            const url = getBuiltInFrameAssetUrl(framePath);

            return url ? [url] : [];
          }),
        },
      ]),
    ) as Record<PetActionName, PetActionDefinition>,
  };
}

function buildImportedPackage(
  pkg: ImportedPetPackageSummary,
  convertFileSrc: (path: string) => string,
): ResolvedPetPackage | null {
  const actionEntries = REQUIRED_PET_ACTIONS.map((action) => {
    const frames = pkg.framePaths[action];
    if (!frames || frames.length !== PET_FRAMES_PER_ACTION) {
      return null;
    }

    return [
      action,
      {
        fps: 3,
        loop: isLoopingImportedAction(action),
        durationMs: 6000,
        category: readActionCategory(action),
        frames: frames.map(convertFileSrc),
      },
    ] as const;
  });

  if (actionEntries.some((entry) => entry === null)) {
    return null;
  }

  return {
    id: pkg.id,
    name: pkg.name,
    baseSize: pkg.baseSize,
    previewUrl: pkg.previewPath ? convertFileSrc(pkg.previewPath) : null,
    source: "imported",
    actions: Object.fromEntries(actionEntries) as Record<
      PetActionName,
      PetActionDefinition
    >,
  };
}

function isLoopingImportedAction(action: PetActionName): boolean {
  return (
    action.startsWith("idle") ||
    action === "walk" ||
    action === "drag" ||
    action === "sleep"
  );
}

function readActionCategory(
  action: PetActionName,
): PetActionDefinition["category"] {
  if (action.startsWith("idle")) {
    return "idle";
  }

  if (action.startsWith("act-")) {
    return "interaction";
  }

  return "movement";
}
