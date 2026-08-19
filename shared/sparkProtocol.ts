export const SPARK_SYNC_CAPABILITY = "spark-v1" as const;
export type SparkSyncCapability = typeof SPARK_SYNC_CAPABILITY;

export type SparkTier =
  | "unlit"
  | "glimmer"
  | "warm"
  | "heartflame"
  | "blaze"
  | "everbright"
  | "stellar";

export type SparkCalendarState =
  | "qualified_today"
  | "pending_today"
  | "weekend_protected";

export type SparkInteractionKind = "message" | "surprise";

export interface PairSparkRequest {
  deviceId: string;
  deviceSecret: string;
  pairId: string;
}

export interface SparkStreakSnapshotV1 {
  version: 1;
  pairId: string;
  streakDays: number;
  tier: SparkTier;
  calendarState: SparkCalendarState;
  lastQualifiedDate: string | null;
  timezone: "Asia/Shanghai";
  asOf: string;
  refreshAt: string;
}

export interface SparkLeaderboardEntryV1 {
  rank: number;
  displayNames: [string, string];
  cities: [string, string];
  streakDays: number;
  tier: SparkTier;
}

export interface SparkLeaderboardSelfV1 {
  rank: number | null;
  displayNames: [string, string];
  cities: [string, string];
  streakDays: number;
  tier: SparkTier;
}

export interface SparkLeaderboardResponseV1 {
  version: 1;
  snapshot: SparkStreakSnapshotV1;
  top20: SparkLeaderboardEntryV1[];
  self: SparkLeaderboardSelfV1;
  asOf: string;
}

const CALENDAR_STATES = new Set<string>([
  "qualified_today",
  "pending_today",
  "weekend_protected",
]);
const PRIVATE_PUBLIC_KEYS = new Set<string>([
  "deviceId",
  "deviceSecret",
  "pairId",
  "latitude",
  "longitude",
  "district",
  "secret",
  "profile",
]);

export function getSparkTier(streakDays: number): SparkTier {
  if (streakDays >= 100) return "stellar";
  if (streakDays >= 60) return "everbright";
  if (streakDays >= 30) return "blaze";
  if (streakDays >= 15) return "heartflame";
  if (streakDays >= 5) return "warm";
  if (streakDays >= 1) return "glimmer";
  return "unlit";
}

export function readSparkStreakSnapshot(
  input: unknown,
): SparkStreakSnapshotV1 | null {
  if (
    !isRecord(input) ||
    input.version !== 1 ||
    !isNonEmptyString(input.pairId) ||
    !isNonNegativeInteger(input.streakDays) ||
    typeof input.tier !== "string" ||
    input.tier !== getSparkTier(input.streakDays) ||
    typeof input.calendarState !== "string" ||
    !CALENDAR_STATES.has(input.calendarState) ||
    !isNullableCanonicalDate(input.lastQualifiedDate) ||
    input.timezone !== "Asia/Shanghai" ||
    !isCanonicalTimestamp(input.asOf) ||
    !isCanonicalTimestamp(input.refreshAt)
  ) {
    return null;
  }

  return {
    version: 1,
    pairId: input.pairId,
    streakDays: input.streakDays,
    tier: input.tier as SparkTier,
    calendarState: input.calendarState as SparkCalendarState,
    lastQualifiedDate: input.lastQualifiedDate,
    timezone: "Asia/Shanghai",
    asOf: input.asOf,
    refreshAt: input.refreshAt,
  };
}

export function readSparkLeaderboardResponse(
  input: unknown,
): SparkLeaderboardResponseV1 | null {
  if (
    !isRecord(input) ||
    input.version !== 1 ||
    !Array.isArray(input.top20) ||
    input.top20.length > 20 ||
    !isCanonicalTimestamp(input.asOf)
  ) {
    return null;
  }

  const snapshot = readSparkStreakSnapshot(input.snapshot);
  const top20 = input.top20.map(readLeaderboardEntry);
  const self = readLeaderboardSelf(input.self);
  if (
    snapshot === null ||
    self === null ||
    top20.some((entry) => entry === null)
  ) {
    return null;
  }

  return {
    version: 1,
    snapshot,
    top20: top20 as SparkLeaderboardEntryV1[],
    self,
    asOf: input.asOf,
  };
}

function readLeaderboardEntry(input: unknown): SparkLeaderboardEntryV1 | null {
  if (
    !isRecord(input) ||
    containsPrivatePublicField(input) ||
    !isPositiveInteger(input.rank) ||
    !isPositiveInteger(input.streakDays) ||
    typeof input.tier !== "string" ||
    input.tier !== getSparkTier(input.streakDays)
  ) {
    return null;
  }

  const displayNames = readStringPair(input.displayNames);
  const cities = readStringPair(input.cities);
  return displayNames === null || cities === null
    ? null
    : {
        rank: input.rank,
        displayNames,
        cities,
        streakDays: input.streakDays,
        tier: input.tier as SparkTier,
      };
}

function readLeaderboardSelf(input: unknown): SparkLeaderboardSelfV1 | null {
  if (
    !isRecord(input) ||
    containsPrivatePublicField(input) ||
    !isNonNegativeInteger(input.streakDays) ||
    typeof input.tier !== "string" ||
    input.tier !== getSparkTier(input.streakDays) ||
    (input.streakDays === 0
      ? input.rank !== null
      : !isPositiveInteger(input.rank))
  ) {
    return null;
  }

  const displayNames = readStringPair(input.displayNames);
  const cities = readStringPair(input.cities);
  return displayNames === null || cities === null
    ? null
    : {
        rank: input.rank as number | null,
        displayNames,
        cities,
        streakDays: input.streakDays,
        tier: input.tier as SparkTier,
      };
}

function readStringPair(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const first = value[0];
  const second = value[1];
  return isNonEmptyString(first) && isNonEmptyString(second)
    ? [first, second]
    : null;
}

function containsPrivatePublicField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsPrivatePublicField);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, entry]) =>
      PRIVATE_PUBLIC_KEYS.has(key) || containsPrivatePublicField(entry),
  );
}

function isNullableCanonicalDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
