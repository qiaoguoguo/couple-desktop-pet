import type { InteractionActionName } from "../assets/petActionNames";
import type { PetInteractionOption } from "../assets/builtInPetManifest";

interface InteractionMenuProps {
  open: boolean;
  x: number;
  y: number;
  options: readonly PetInteractionOption[];
  onSelect(action: InteractionActionName): void;
}

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
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitem"
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
