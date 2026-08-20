import {
  idleActionNames,
  interactionActionNames,
  isPetActionName,
  requiredPetActions,
  type IdleActionName,
  type PetActionName,
} from "./petActionNames";

export const Q_GIRL_BUILT_IN_PET_PACKAGE_ID = "builtin:q-girl" as const;
export const Q_BOY_BUILT_IN_PET_PACKAGE_ID = "builtin:q-boy" as const;
export const BUILT_IN_PET_PACKAGE_ID = Q_GIRL_BUILT_IN_PET_PACKAGE_ID;
export const BUILT_IN_PET_PACKAGE_IDS = [
  Q_GIRL_BUILT_IN_PET_PACKAGE_ID,
  Q_BOY_BUILT_IN_PET_PACKAGE_ID,
] as const;
const BUILT_IN_PET_PACKAGE_ID_ALIASES: ReadonlyMap<string, string> = new Map([
  ["builtin:star-sleeper", Q_GIRL_BUILT_IN_PET_PACKAGE_ID],
  ["imported:q-girl-complete-v3", Q_GIRL_BUILT_IN_PET_PACKAGE_ID],
  ["imported:q-boy-complete-v3", Q_BOY_BUILT_IN_PET_PACKAGE_ID],
]);
export const SHADOWED_BUILT_IN_IMPORT_MANIFEST_IDS = [
  "q-girl-complete-v3",
  "q-boy-complete-v3",
] as const;
export const IMPORTED_PET_PACKAGE_PREFIX = "imported:" as const;
export type PetPackageFormatVersion = 2 | 3;
export type PetPackageRenderer = "frame-sequence" | "motion-pool";
export const PET_FRAMES_PER_ACTION = 30;
export const PET_ACTION_FPS = 5;
export const PET_ACTION_DURATION_MS = 6000;
export const REQUIRED_PET_ACTIONS = requiredPetActions;
export const PET_MOTION_MIN_FRAMES = 1;
export const PET_MOTION_MAX_FRAMES = 60;
export const PET_MOTION_MIN_FPS = 1;
export const PET_MOTION_MAX_FPS = 12;
export const PET_MOTION_MIN_DURATION_MS = 3000;
export const PET_MOTION_MAX_DURATION_MS = 12000;
const REQUIRED_PET_SCENE_IDS = [
  ...interactionActionNames,
  "remote-message",
] as const;
export const UNSUPPORTED_LEGACY_PACKAGE_MESSAGE =
  "旧版资源包动作标准过低，请使用新版生成器重新生成。";

export interface PetPackageSize {
  width: number;
  height: number;
}

export interface PetPackageActionManifest {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: string;
}

export interface PetPackageBubbleCue {
  atMs: number;
  text?: string;
  source?: "remoteMessage";
}

export interface PetPackageSceneManifest {
  action: PetActionName;
  bubbleCues: readonly PetPackageBubbleCue[];
  returnTo: IdleActionName;
  waitForAcknowledge?: boolean;
}

export interface PetFixedActionPackageManifest {
  formatVersion: 2;
  renderer: "frame-sequence";
  id: string;
  name: string;
  baseSize: PetPackageSize;
  frameSize: PetPackageSize;
  actions: Record<PetActionName, PetPackageActionManifest>;
  scenes: Record<string, PetPackageSceneManifest>;
}

export interface PetMotionManifest {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: string;
  weight: number;
  tags: readonly string[];
}

export interface PetMotionPoolManifest {
  formatVersion: 3;
  renderer: "motion-pool";
  id: string;
  name: string;
  baseSize: PetPackageSize;
  frameSize: PetPackageSize;
  defaultMotion: string;
  motions: Record<string, PetMotionManifest>;
}

export type PetPackageManifest =
  | PetFixedActionPackageManifest
  | PetMotionPoolManifest;

export interface ImportedPetPackageSummary {
  id: string;
  manifestId: string;
  formatVersion: PetPackageFormatVersion;
  renderer: PetPackageRenderer;
  name: string;
  baseSize: PetPackageSize;
  frameSize: PetPackageSize;
  previewPath: string;
  portraitPath: string | null;
  offlinePortraitPath: string | null;
  actions: Record<PetActionName, PetPackageActionManifest>;
  scenes: Record<string, PetPackageSceneManifest>;
  framePaths: Record<PetActionName, string[]>;
  defaultMotion: string | null;
  motions: Record<string, PetMotionManifest>;
  motionFramePaths: Record<string, string[]>;
}

export interface ImportedPetMotionSummary extends PetMotionManifest {
  framePaths: readonly string[];
}

export function toImportedPetPackageId(manifestId: string): string {
  return `${IMPORTED_PET_PACKAGE_PREFIX}${manifestId}`;
}

export function normalizeBuiltInPetPackageId(id: string): string {
  return BUILT_IN_PET_PACKAGE_ID_ALIASES.get(id) ?? id;
}

export function isShadowedBuiltInImportManifestId(
  manifestId: string,
): boolean {
  return SHADOWED_BUILT_IN_IMPORT_MANIFEST_IDS.some(
    (shadowedId) => shadowedId === manifestId,
  );
}

export function isImportedPetPackageId(id: string): boolean {
  return id.startsWith(IMPORTED_PET_PACKAGE_PREFIX);
}

export function stripImportedPetPackagePrefix(id: string): string {
  return isImportedPetPackageId(id)
    ? id.slice(IMPORTED_PET_PACKAGE_PREFIX.length)
    : id;
}

export function buildFrameFileName(index: number): string {
  return `${String(index).padStart(4, "0")}.png`;
}

export function readPetPackageManifest(
  input: unknown,
): PetPackageManifest | null {
  return (
    readFixedActionPackageManifest(input) ?? readPetMotionPoolManifest(input)
  );
}

function readFixedActionPackageManifest(
  input: unknown,
): PetFixedActionPackageManifest | null {
  if (
    !isRecord(input) ||
    input.formatVersion !== 2 ||
    input.renderer !== "frame-sequence"
  ) {
    return null;
  }

  const id = readPackageId(input.id);
  const name = readNonEmptyString(input.name);
  const baseSize = readSize(input.baseSize);
  const frameSize = readSize(input.frameSize);
  const actions = readActions(input.actions);
  const scenes = readScenes(input.scenes);

  if (!id || !name || !baseSize || !frameSize || !actions || !scenes) {
    return null;
  }

  return {
    formatVersion: 2,
    renderer: "frame-sequence",
    id,
    name,
    baseSize,
    frameSize,
    actions,
    scenes,
  };
}

export function readPetMotionPoolManifest(
  input: unknown,
): PetMotionPoolManifest | null {
  if (
    !isRecord(input) ||
    input.formatVersion !== 3 ||
    input.renderer !== "motion-pool"
  ) {
    return null;
  }

  const id = readPackageId(input.id);
  const name = readNonEmptyString(input.name);
  const baseSize = readSize(input.baseSize);
  const frameSize = readSize(input.frameSize);
  const defaultMotion =
    typeof input.defaultMotion === "string" ? input.defaultMotion : "";
  const motions = readMotionManifests(input.motions);

  if (
    !id ||
    !name ||
    !baseSize ||
    !frameSize ||
    !isValidPetMotionId(defaultMotion) ||
    !motions ||
    !motions[defaultMotion]
  ) {
    return null;
  }

  return {
    formatVersion: 3,
    renderer: "motion-pool",
    id,
    name,
    baseSize,
    frameSize,
    defaultMotion,
    motions,
  };
}

function readMotionManifests(
  input: unknown,
): Record<string, PetMotionManifest> | null {
  if (!isRecord(input)) {
    return null;
  }

  const entries = Object.entries(input);
  if (entries.length === 0) {
    return null;
  }

  const motions: Record<string, PetMotionManifest> = {};

  for (const [motionId, value] of entries) {
    if (!isValidPetMotionId(motionId) || !isRecord(value)) {
      return null;
    }

    const fps = value.fps;
    const loop = value.loop;
    const frameCount = value.frameCount;
    const durationMs = value.durationMs;
    const frames = value.frames;
    const weight = typeof value.weight === "number" ? value.weight : 1;
    const tags = Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : ["idle"];

    if (
      !isIntegerInRange(fps, PET_MOTION_MIN_FPS, PET_MOTION_MAX_FPS) ||
      typeof loop !== "boolean" ||
      !isIntegerInRange(
        frameCount,
        PET_MOTION_MIN_FRAMES,
        PET_MOTION_MAX_FRAMES,
      ) ||
      !isIntegerInRange(
        durationMs,
        PET_MOTION_MIN_DURATION_MS,
        PET_MOTION_MAX_DURATION_MS,
      ) ||
      frames !== `motions/${motionId}/` ||
      !isFiniteNumberInRange(weight, 0, Number.POSITIVE_INFINITY) ||
      tags.length === 0
    ) {
      return null;
    }

    motions[motionId] = {
      fps,
      loop,
      frameCount,
      durationMs,
      frames,
      weight,
      tags,
    };
  }

  return motions;
}

export function isValidPetMotionId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isFiniteNumberInRange(
  value: unknown,
  minExclusive: number,
  maxInclusive: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > minExclusive &&
    value <= maxInclusive
  );
}

function readActions(
  input: unknown,
): PetFixedActionPackageManifest["actions"] | null {
  if (!isRecord(input)) {
    return null;
  }

  const entries = REQUIRED_PET_ACTIONS.map((action) => {
    const value = input[action];
    if (!isRecord(value)) {
      return null;
    }

    if (
      value.fps !== PET_ACTION_FPS ||
      value.frameCount !== PET_FRAMES_PER_ACTION ||
      value.durationMs !== PET_ACTION_DURATION_MS ||
      value.frames !== `frames/${action}/` ||
      typeof value.loop !== "boolean"
    ) {
      return null;
    }

    return [
      action,
      {
        fps: PET_ACTION_FPS,
        loop: value.loop,
        frameCount: PET_FRAMES_PER_ACTION,
        durationMs: PET_ACTION_DURATION_MS,
        frames: `frames/${action}/`,
      },
    ] as const;
  });

  if (entries.some((entry) => entry === null)) {
    return null;
  }

  return Object.fromEntries(
    entries as Array<[PetActionName, PetPackageActionManifest]>,
  ) as PetFixedActionPackageManifest["actions"];
}

function readScenes(
  input: unknown,
): PetFixedActionPackageManifest["scenes"] | null {
  if (!isRecord(input)) {
    return null;
  }

  const scenes: Record<string, PetPackageSceneManifest> = {};

  for (const [sceneId, value] of Object.entries(input)) {
    if (!sceneId.trim() || !isRecord(value)) {
      return null;
    }

    const action = readPetActionName(value.action);
    const bubbleCues = readBubbleCues(value.bubbleCues);
    const returnTo = readIdleActionName(value.returnTo);
    const waitForAcknowledge =
      typeof value.waitForAcknowledge === "boolean"
        ? value.waitForAcknowledge
        : undefined;

    if (!action || !bubbleCues || !returnTo) {
      return null;
    }

    scenes[sceneId] = {
      action,
      bubbleCues,
      returnTo,
      ...(waitForAcknowledge === undefined ? {} : { waitForAcknowledge }),
    };
  }

  for (const sceneId of REQUIRED_PET_SCENE_IDS) {
    if (!scenes[sceneId]) {
      return null;
    }
  }

  const remoteMessageScene = scenes["remote-message"];
  if (
    remoteMessageScene.waitForAcknowledge !== true ||
    !remoteMessageScene.bubbleCues.some(
      (cue) => cue.source === "remoteMessage",
    )
  ) {
    return null;
  }

  return scenes;
}

function readBubbleCues(input: unknown): readonly PetPackageBubbleCue[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const cues = input.map((value) => {
    if (!isRecord(value) || typeof value.atMs !== "number" || value.atMs < 0) {
      return null;
    }

    const text = typeof value.text === "string" ? value.text : undefined;
    const source =
      value.source === "remoteMessage" ? value.source : undefined;

    if (!text && !source) {
      return null;
    }

    return {
      atMs: value.atMs,
      ...(text === undefined ? {} : { text }),
      ...(source === undefined ? {} : { source }),
    };
  });

  return cues.some((cue) => cue === null)
    ? null
    : (cues as PetPackageBubbleCue[]);
}

function readSize(input: unknown): PetPackageSize | null {
  if (!isRecord(input)) {
    return null;
  }

  const width = input.width;
  const height = input.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    width < 64 ||
    height < 64 ||
    width > 2048 ||
    height > 2048
  ) {
    return null;
  }

  return { width, height };
}

function readPetActionName(value: unknown): PetActionName | null {
  return typeof value === "string" && isPetActionName(value) ? value : null;
}

function readIdleActionName(value: unknown): IdleActionName | null {
  return typeof value === "string" &&
    (idleActionNames as readonly string[]).includes(value)
    ? (value as IdleActionName)
    : null;
}

function readPackageId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
