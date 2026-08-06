import { getBuiltInFrameAssetUrl } from "../renderer/frameAtlas";
import {
  builtInPetManifest,
  getActionDefinition,
  type PetActionDefinition,
  type PetMotionDefinition,
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

export interface ResolvedPetMotion {
  id: string;
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: string[];
  weight: number;
  tags: readonly string[];
}

export interface ResolvedPetPackage {
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  previewUrl: string | null;
  portraitUrl: string | null;
  offlinePortraitUrl: string | null;
  source: "built-in" | "imported";
  defaultMotionId: string;
  motions: Record<string, ResolvedPetMotion>;
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

export function getDefaultPetMotion(
  pkg: ResolvedPetPackage,
): ResolvedPetMotion {
  return pkg.motions[pkg.defaultMotionId] ?? Object.values(pkg.motions)[0];
}

function buildBuiltInPackage(): ResolvedPetPackage {
  const actions = buildActionRecord((action) => {
    const actionDefinition = getActionDefinition(action);

    return {
      ...actionDefinition,
      frames: actionDefinition.frames.flatMap((framePath) => {
        const url = getBuiltInFrameAssetUrl(framePath);

        return url ? [url] : [];
      }),
    };
  });

  return {
    id: BUILT_IN_PET_PACKAGE_ID,
    name: builtInPetManifest.name,
    baseSize: builtInPetManifest.baseSize,
    frameSize: builtInPetManifest.frameSize,
    previewUrl: null,
    portraitUrl: null,
    offlinePortraitUrl: null,
    source: "built-in",
    scenes: builtInPetManifest.scenes,
    defaultMotionId: "idle-breathe",
    motions: {
      ...buildMotionsFromActions(actions),
      ...buildBuiltInExtraMotions(builtInPetManifest.motions),
    },
    actions,
  };
}

function buildImportedPackage(
  pkg: ImportedPetPackageSummary,
  convertFileSrc: (path: string) => string,
): ResolvedPetPackage | null {
  if (pkg.formatVersion === 3 && pkg.renderer === "motion-pool") {
    return buildImportedMotionPoolPackage(pkg, convertFileSrc);
  }

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
    previewUrl: resolveImportedAssetUrl(pkg.previewPath, convertFileSrc),
    portraitUrl:
      resolveImportedOptionalAssetUrl(pkg.portraitPath, convertFileSrc) ??
      resolveImportedAssetUrl(pkg.previewPath, convertFileSrc),
    offlinePortraitUrl:
      resolveImportedOptionalAssetUrl(pkg.offlinePortraitPath, convertFileSrc) ??
      resolveImportedOptionalAssetUrl(pkg.portraitPath, convertFileSrc) ??
      resolveImportedAssetUrl(pkg.previewPath, convertFileSrc),
    source: "imported",
    defaultMotionId: "idle-breathe",
    motions: buildMotionsFromActions(
      actions as Record<PetActionName, PetActionDefinition>,
    ),
    actions: actions as Record<PetActionName, PetActionDefinition>,
    scenes: pkg.scenes,
  };
}

function buildImportedMotionPoolPackage(
  pkg: ImportedPetPackageSummary,
  convertFileSrc: (path: string) => string,
): ResolvedPetPackage | null {
  if (!pkg.defaultMotion || !pkg.motions[pkg.defaultMotion]) {
    return null;
  }

  const motions: Record<string, ResolvedPetMotion> = {};

  for (const [motionId, motion] of Object.entries(pkg.motions)) {
    const frames = pkg.motionFramePaths[motionId];
    if (!frames || frames.length !== motion.frameCount) {
      return null;
    }

    motions[motionId] = {
      id: motionId,
      fps: motion.fps,
      loop: motion.loop,
      frameCount: motion.frameCount,
      durationMs: motion.durationMs,
      frames: frames.map((framePath) =>
        convertFileSrc(normalizeImportedAssetPath(framePath)),
      ),
      weight: motion.weight,
      tags: motion.tags,
    };
  }

  const defaultMotion = motions[pkg.defaultMotion];
  if (!defaultMotion) {
    return null;
  }

  return {
    id: pkg.id,
    name: pkg.name,
    baseSize: pkg.baseSize,
    frameSize: pkg.frameSize,
    previewUrl: resolveImportedAssetUrl(pkg.previewPath, convertFileSrc),
    portraitUrl:
      resolveImportedOptionalAssetUrl(pkg.portraitPath, convertFileSrc) ??
      resolveImportedAssetUrl(pkg.previewPath, convertFileSrc),
    offlinePortraitUrl:
      resolveImportedOptionalAssetUrl(pkg.offlinePortraitPath, convertFileSrc) ??
      resolveImportedOptionalAssetUrl(pkg.portraitPath, convertFileSrc) ??
      resolveImportedAssetUrl(pkg.previewPath, convertFileSrc),
    source: "imported",
    defaultMotionId: pkg.defaultMotion,
    motions,
    actions: buildActionFallbackFromDefaultMotion(defaultMotion),
    scenes: {},
  };
}

function buildMotionsFromActions(
  actions: Record<PetActionName, PetActionDefinition>,
): Record<string, ResolvedPetMotion> {
  return Object.fromEntries(
    Object.entries(actions).map(([actionId, action]) => [
      actionId,
      {
        id: actionId,
        fps: action.fps,
        loop: action.loop,
        frameCount: action.frameCount,
        durationMs: action.durationMs,
        frames: [...action.frames],
        weight: actionId.startsWith("idle-") ? 2 : 1,
        tags: [
          readPetActionCategory(actionId as PetActionName),
          "legacy-action",
          actionId,
        ],
      },
    ]),
  );
}

function buildBuiltInExtraMotions(
  motions: Record<string, PetMotionDefinition>,
): Record<string, ResolvedPetMotion> {
  return Object.fromEntries(
    Object.entries(motions).map(([motionId, motion]) => [
      motionId,
      {
        id: motionId,
        fps: motion.fps,
        loop: motion.loop,
        frameCount: motion.frameCount,
        durationMs: motion.durationMs,
        frames: motion.frames.flatMap((framePath) => {
          const url = getBuiltInFrameAssetUrl(framePath);

          return url ? [url] : [];
        }),
        weight: motion.weight,
        tags: motion.tags,
      },
    ]),
  );
}

function buildActionFallbackFromDefaultMotion(
  motion: ResolvedPetMotion,
): Record<PetActionName, PetActionDefinition> {
  return buildActionRecord((action) => ({
    fps: motion.fps,
    loop: motion.loop,
    frameCount: motion.frameCount,
    durationMs: motion.durationMs,
    category: readPetActionCategory(action),
    frames: motion.frames,
  }));
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

function resolveImportedAssetUrl(
  path: string,
  convertFileSrc: (path: string) => string,
): string {
  return convertFileSrc(normalizeImportedAssetPath(path));
}

function resolveImportedOptionalAssetUrl(
  path: string | null,
  convertFileSrc: (path: string) => string,
): string | null {
  return path ? resolveImportedAssetUrl(path, convertFileSrc) : null;
}
