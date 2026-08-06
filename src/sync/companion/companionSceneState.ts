import type {
  CompanionPresence,
  CompanionSceneContentState,
  CompanionSceneViewState,
  CompanionSide,
} from "./companionSceneTypes";

const MIN_COMPANION_SCENE_SCALE = 0.85;
const MAX_COMPANION_SCENE_SCALE = 1.25;

export function normalizeCompanionSceneState(
  input: unknown,
): CompanionSceneContentState {
  if (!isRecord(input)) {
    throw new Error("Invalid companion scene state");
  }

  const presence = readCompanionPresence(input.presence);

  return {
    presence,
    portraitUrl: normalizeUrl(input.portraitUrl),
    offlinePortraitUrl: normalizeUrl(input.offlinePortraitUrl),
    sceneScale: clampSceneScale(input.sceneScale),
    suspended: Boolean(input.suspended),
  };
}

export function normalizeCompanionSceneViewState(
  input: unknown,
): CompanionSceneViewState {
  if (!isRecord(input)) {
    throw new Error("Invalid companion scene view state");
  }

  return {
    ...normalizeCompanionSceneState(input),
    side: readCompanionSide(input.side),
    compact: Boolean(input.compact),
    revision: readRevision(input.revision),
  };
}

function readCompanionPresence(value: unknown): CompanionPresence {
  if (value === "hidden" || value === "online" || value === "offline") {
    return value;
  }

  throw new Error("Invalid companion presence");
}

function readCompanionSide(value: unknown): CompanionSide {
  if (value === "left" || value === "right") {
    return value;
  }

  throw new Error("Invalid companion side");
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clampSceneScale(value: unknown): number {
  if (typeof value !== "number") {
    return 1;
  }

  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(
    Math.max(value, MIN_COMPANION_SCENE_SCALE),
    MAX_COMPANION_SCENE_SCALE,
  );
}

function readRevision(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
