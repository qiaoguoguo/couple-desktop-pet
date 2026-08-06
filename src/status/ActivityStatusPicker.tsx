import { useEffect, useMemo, useRef } from "react";
import type { ActivityStatus } from "../../shared/activityStatus";
import { activityStatusDisplayOptions } from "./activityStatusDisplay";

interface ActivityStatusPickerProps {
  currentStatus: ActivityStatus | null;
  onSelect(status: ActivityStatus | null): void;
  onClose(): void;
}

export function ActivityStatusPicker({
  currentStatus,
  onSelect,
  onClose,
}: ActivityStatusPickerProps) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentIndex = useMemo(
    () =>
      activityStatusDisplayOptions.findIndex(
        (option) => option.value === currentStatus,
      ),
    [currentStatus],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "Tab") {
        const focusableOptions = optionRefs.current.filter(
          (option): option is HTMLButtonElement => Boolean(option),
        );

        if (focusableOptions.length === 0) {
          return;
        }

        event.preventDefault();
        const activeIndex = focusableOptions.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const nextIndex = event.shiftKey
          ? activeIndex <= 0
            ? focusableOptions.length - 1
            : activeIndex - 1
          : activeIndex === -1 || activeIndex === focusableOptions.length - 1
            ? 0
            : activeIndex + 1;

        focusableOptions[nextIndex]?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    optionRefs.current[Math.max(currentIndex, 0)]?.focus();
  }, [currentIndex]);

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
        aria-modal={true}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="status-picker-grid">
          {activityStatusDisplayOptions.map((option, index) => (
            <button
              key={option.value ?? "online"}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              aria-pressed={currentStatus === option.value}
              onClick={() => onSelect(option.value)}
            >
              <span className="status-picker-icon" aria-hidden="true">
                {option.iconText}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
