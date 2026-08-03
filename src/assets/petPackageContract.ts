import type { PetActionDefinition, PetActionName } from "./builtInPetManifest";

export const BUILT_IN_PET_PACKAGE_ID = "builtin:star-sleeper" as const;
export const IMPORTED_PET_PACKAGE_PREFIX = "imported:" as const;
export const PET_FRAMES_PER_ACTION = 18;

export const REQUIRED_PET_ACTIONS = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
  "walk",
  "drag",
  "sleep",
  "act-cute",
  "act-typing",
  "act-wave",
  "act-hug",
  "act-pout",
  "act-drowsy",
] as const satisfies readonly PetActionName[];

export interface PetPackageManifest {
  formatVersion: 1;
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  actions: Record<PetActionName, Pick<PetActionDefinition, "fps" | "loop">>;
}

export interface ImportedPetPackageSummary {
  id: string;
  manifestId: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  previewPath: string | null;
  framePaths: Record<PetActionName, string[]>;
}

export function toImportedPetPackageId(manifestId: string): string {
  return `${IMPORTED_PET_PACKAGE_PREFIX}${manifestId}`;
}

export function isImportedPetPackageId(id: string): boolean {
  return id.startsWith(IMPORTED_PET_PACKAGE_PREFIX);
}

export function stripImportedPetPackagePrefix(id: string): string {
  return isImportedPetPackageId(id)
    ? id.slice(IMPORTED_PET_PACKAGE_PREFIX.length)
    : id;
}

export function buildFrameFileName(
  action: PetActionName,
  index: number,
): string {
  return `${action}-${String(index).padStart(2, "0")}.png`;
}

export function readPetPackageManifest(
  input: unknown,
): PetPackageManifest | null {
  if (!isRecord(input) || input.formatVersion !== 1) {
    return null;
  }

  const id = readPackageId(input.id);
  const name = readNonEmptyString(input.name);
  const baseSize = readSize(input.baseSize);
  const frameSize = readSize(input.frameSize);
  const actions = readActions(input.actions);

  if (!id || !name || !baseSize || !frameSize || !actions) {
    return null;
  }

  return { formatVersion: 1, id, name, baseSize, frameSize, actions };
}

function readActions(input: unknown): PetPackageManifest["actions"] | null {
  if (!isRecord(input)) {
    return null;
  }

  const entries = REQUIRED_PET_ACTIONS.map((action) => {
    const value = input[action];
    if (!isRecord(value)) {
      return null;
    }

    const fps =
      typeof value.fps === "number" && value.fps > 0 && value.fps <= 24
        ? value.fps
        : null;
    const loop = typeof value.loop === "boolean" ? value.loop : null;

    return fps && loop !== null ? [action, { fps, loop }] : null;
  });

  if (entries.some((entry) => entry === null)) {
    return null;
  }

  return Object.fromEntries(
    entries as Array<
      [PetActionName, Pick<PetActionDefinition, "fps" | "loop">]
    >,
  ) as PetPackageManifest["actions"];
}

function readSize(input: unknown): { width: number; height: number } | null {
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
