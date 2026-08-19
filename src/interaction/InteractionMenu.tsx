import type { CSSProperties } from "react";
import type { SparkStreakSnapshotV1 } from "../../shared/sparkProtocol";
import newTeaFocusIconUrl from "../assets/ui/interaction-buttons/new-tea-focus.png";
import newTeaMessageIconUrl from "../assets/ui/interaction-buttons/new-tea-message.png";
import newTeaStatusIconUrl from "../assets/ui/interaction-buttons/new-tea-status.png";
import newTeaWeatherIconUrl from "../assets/ui/interaction-buttons/new-tea-weather.png";
import heartSurpriseIconUrl from "../assets/ui/surprise/heart-surprise.png";
import type {
  InteractionMenuIconName,
  InteractionMenuSelection,
  PetInteractionOption,
} from "../assets/builtInPetManifest";
import { getSparkAsset } from "../spark/sparkAssets";

export type { InteractionMenuSelection };

export type SparkMenuAvailability =
  | "loading"
  | "available"
  | "unavailable";

interface InteractionMenuProps {
  open: boolean;
  x: number;
  y: number;
  options: readonly PetInteractionOption[];
  paired?: boolean;
  snapshot?: SparkStreakSnapshotV1 | null;
  sparkAvailability?: SparkMenuAvailability;
  onSelect: (selection: InteractionMenuSelection) => void;
}

const optionIcons: Record<InteractionMenuIconName, string> = {
  weather: newTeaWeatherIconUrl,
  message: newTeaMessageIconUrl,
  focus: newTeaFocusIconUrl,
  spark: getSparkAsset("unlit"),
  surprise: heartSurpriseIconUrl,
  status: newTeaStatusIconUrl,
};

const optionPositions = [
  { x: -76, y: -88 },
  { x: 0, y: -112 },
  { x: 76, y: -88 },
  { x: -92, y: -12 },
  { x: 92, y: -12 },
  { x: 0, y: 62 },
] as const;

export function InteractionMenu({
  open,
  x,
  y,
  options,
  paired = false,
  snapshot = null,
  sparkAvailability = "available",
  onSelect,
}: InteractionMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="pet-interaction-menu"
      role="menu"
      aria-label="互动选项"
      style={{ left: x, top: y }}
    >
      {options.map((option, index) => {
        const position = optionPositions[index] ?? { x: 0, y: 0 };
        const isSpark = option.id === "open-spark";
        const sparkTier = snapshot?.tier ?? "unlit";
        const sparkUnavailable =
          isSpark && paired && sparkAvailability === "unavailable";
        const label = isSpark
          ? !paired
            ? "续火花"
            : snapshot === null
              ? "--天"
              : `${snapshot.streakDays}天`
          : option.label;
        const accessibleLabel = isSpark
          ? !paired
            ? "续火花"
            : snapshot === null
              ? sparkAvailability === "unavailable"
                ? "续火花，连续天数暂不可用"
                : "续火花，连续天数加载中"
              : sparkAvailability === "unavailable"
                ? `续火花，上次连续 ${snapshot.streakDays} 天，数据暂不可用`
                : sparkAvailability === "loading"
                  ? `续火花，当前连续 ${snapshot.streakDays} 天，正在更新`
                  : `续火花，当前连续 ${snapshot.streakDays} 天`
          : undefined;
        const breathing =
          isSpark &&
          snapshot !== null &&
          ["blaze", "everbright", "stellar"].includes(snapshot.tier);

        return (
          <button
            key={option.id}
            type="button"
            className={`pet-interaction-button${
              sparkUnavailable
                ? " pet-interaction-button--spark-unavailable"
                : ""
            }`}
            role="menuitem"
            aria-label={accessibleLabel}
            data-desktop-interactive-region=""
            data-spark-availability={
              isSpark && paired ? sparkAvailability : undefined
            }
            style={
              {
                "--menu-x": `${position.x}px`,
                "--menu-y": `${position.y}px`,
                "--menu-delay": `${index * 24}ms`,
              } as CSSProperties
            }
            onClick={() => onSelect(option.id)}
          >
            <span
              className={`pet-interaction-icon pet-interaction-icon--${option.iconName}${
                breathing ? " spark-tier-icon--breathing" : ""
              }`}
              data-desktop-non-geometric-animation={
                breathing ? "spark-tier-breathe" : undefined
              }
              aria-hidden="true"
            >
              <img
                src={isSpark ? getSparkAsset(sparkTier) : optionIcons[option.iconName]}
                alt=""
              />
            </span>
            <span className="pet-interaction-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
