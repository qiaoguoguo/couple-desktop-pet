import type { ActivityStatus } from "../../shared/activityStatus";
import {
  activityStatusIconAssets,
  type StatusIconAsset,
} from "./statusIconAssets";

export type ActivityStatusOptionValue = ActivityStatus | null;

export interface ActivityStatusDisplayOption {
  value: ActivityStatusOptionValue;
  label: string;
  icon: StatusIconAsset;
}

export const activityStatusDisplayOptions = [
  { value: null, label: "在线", icon: activityStatusIconAssets.online },
  { value: "slacking", label: "摸鱼中", icon: activityStatusIconAssets.slacking },
  { value: "dazing", label: "发呆中", icon: activityStatusIconAssets.dazing },
  { value: "overtime", label: "加班中", icon: activityStatusIconAssets.overtime },
] as const satisfies readonly ActivityStatusDisplayOption[];

export function readActivityStatusIcon(
  value: ActivityStatusOptionValue,
): StatusIconAsset {
  return (
    activityStatusDisplayOptions.find((option) => option.value === value)
      ?.icon ?? activityStatusIconAssets.online
  );
}
