import type { CSSProperties } from "react";
import actCuteIconUrl from "../assets/ui/interaction-buttons/act-cute.png";
import actDrowsyIconUrl from "../assets/ui/interaction-buttons/act-drowsy.png";
import actHugIconUrl from "../assets/ui/interaction-buttons/act-hug.png";
import actPoutIconUrl from "../assets/ui/interaction-buttons/act-pout.png";
import sendMessageIconUrl from "../assets/ui/interaction-buttons/send-message.png";
import actTypingIconUrl from "../assets/ui/interaction-buttons/act-typing.png";
import actWaveIconUrl from "../assets/ui/interaction-buttons/act-wave.png";
import type { InteractionActionName } from "../assets/petActionNames";
import {
  SEND_MESSAGE_INTERACTION_ID,
  type InteractionCommandName,
  type PetInteractionOption,
} from "../assets/builtInPetManifest";

export type InteractionMenuSelection =
  | InteractionActionName
  | InteractionCommandName;

interface InteractionMenuProps {
  open: boolean;
  x: number;
  y: number;
  options: readonly PetInteractionOption[];
  onSelect(selection: InteractionMenuSelection): void;
}

const optionIcons: Record<InteractionMenuSelection, string> = {
  "act-cute": actCuteIconUrl,
  "act-typing": actTypingIconUrl,
  "act-wave": actWaveIconUrl,
  "act-hug": actHugIconUrl,
  "act-pout": actPoutIconUrl,
  "act-drowsy": actDrowsyIconUrl,
  [SEND_MESSAGE_INTERACTION_ID]: sendMessageIconUrl,
};

const optionPositions: Record<
  InteractionMenuSelection,
  { x: number; y: number }
> = {
  "act-cute": { x: -76, y: -88 },
  "act-typing": { x: 0, y: -112 },
  "act-wave": { x: 76, y: -88 },
  "act-hug": { x: -92, y: -12 },
  "act-pout": { x: 92, y: -12 },
  "act-drowsy": { x: 0, y: 62 },
  [SEND_MESSAGE_INTERACTION_ID]: { x: 0, y: 116 },
};

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
        const position = optionPositions[option.id];

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
              <img src={optionIcons[option.id]} alt="" />
            </span>
            <span className="pet-interaction-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
