export const ACTIVITY_STATUS_IDS = ["slacking", "dazing", "overtime"] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUS_IDS)[number];

const ACTIVITY_STATUS_SET = new Set<string>(ACTIVITY_STATUS_IDS);

export function isActivityStatus(value: unknown): value is ActivityStatus {
  return typeof value === "string" && ACTIVITY_STATUS_SET.has(value);
}

export function isNullableActivityStatus(
  value: unknown,
): value is ActivityStatus | null {
  return value === null || isActivityStatus(value);
}
