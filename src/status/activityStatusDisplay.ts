import type { ActivityStatus } from "../../shared/activityStatus";

export type ActivityStatusOptionValue = ActivityStatus | null;

export interface ActivityStatusDisplayOption {
  value: ActivityStatusOptionValue;
  label: string;
  iconText: string;
}

export const activityStatusDisplayOptions = [
  { value: null, label: "在线", iconText: "心" },
  { value: "slacking", label: "摸鱼中", iconText: "鱼" },
  { value: "dazing", label: "发呆中", iconText: "云" },
  { value: "overtime", label: "加班中", iconText: "班" },
] as const satisfies readonly ActivityStatusDisplayOption[];

export function readActivityStatusIconText(
  value: ActivityStatusOptionValue,
): string {
  return (
    activityStatusDisplayOptions.find((option) => option.value === value)
      ?.iconText ?? "心"
  );
}
