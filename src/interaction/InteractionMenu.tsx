import type { CSSProperties } from "react";
import actCuteIconUrl from "../assets/ui/interaction-buttons/act-cute.png";
import actDrowsyIconUrl from "../assets/ui/interaction-buttons/act-drowsy.png";
import actHugIconUrl from "../assets/ui/interaction-buttons/act-hug.png";
import actPoutIconUrl from "../assets/ui/interaction-buttons/act-pout.png";
import actTypingIconUrl from "../assets/ui/interaction-buttons/act-typing.png";
import actWaveIconUrl from "../assets/ui/interaction-buttons/act-wave.png";
import type { InteractionActionName } from "../assets/petActionNames";
import type {
  InteractionMenuSelection,
  PetInteractionOption,
} from "../assets/builtInPetManifest";

export type { InteractionMenuSelection };

interface InteractionMenuProps {
  open: boolean;
  x: number;
  y: number;
  options: readonly PetInteractionOption[];
  onSelect: (selection: InteractionMenuSelection) => void;
}

const optionIcons: Record<InteractionActionName, string> = {
  "act-cute": actCuteIconUrl,
  "act-typing": actTypingIconUrl,
  "act-wave": actWaveIconUrl,
  "act-hug": actHugIconUrl,
  "act-pout": actPoutIconUrl,
  "act-drowsy": actDrowsyIconUrl,
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

        return (
          <button
            key={option.id}
            type="button"
            className="pet-interaction-button"
            role="menuitem"
            style={
              {
                "--menu-x": `${position.x}px`,
                "--menu-y": `${position.y}px`,
                "--menu-delay": `${index * 24}ms`,
              } as CSSProperties
            }
            onClick={() => onSelect(option.id)}
          >
            <span className="pet-interaction-icon" aria-hidden="true">
              <img src={optionIcons[option.iconAction]} alt="" />
            </span>
            <span className="pet-interaction-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
