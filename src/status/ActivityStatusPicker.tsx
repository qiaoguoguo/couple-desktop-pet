import { useEffect } from "react";
import type { ActivityStatus } from "../../shared/activityStatus";

interface ActivityStatusPickerProps {
  currentStatus: ActivityStatus | null;
  onSelect(status: ActivityStatus | null): void;
  onClose(): void;
}

const statusOptions = [
  { label: "在线", value: null },
  { label: "摸鱼中", value: "slacking" },
  { label: "发呆中", value: "dazing" },
  { label: "加班中", value: "overtime" },
] as const satisfies readonly {
  label: string;
  value: ActivityStatus | null;
}[];

export function ActivityStatusPicker({
  currentStatus,
  onSelect,
  onClose,
}: ActivityStatusPickerProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="activity-status-picker"
      data-testid="activity-status-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="status-picker-panel"
        role="dialog"
        aria-label="我的状态"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="status-picker-grid">
          {statusOptions.map((option) => (
            <button
              key={option.value ?? "online"}
              type="button"
              aria-pressed={currentStatus === option.value}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
