import { useEffect, useState } from "react";
import {
  maxFocusDurationMinutes,
  minFocusDurationMinutes,
} from "./focusTimer";

interface FocusTimerPanelProps {
  initialMinutes: number;
  onStart: (minutes: number) => void;
  onClose: () => void;
}

const presets = [15, 25, 45, 60] as const;

export function FocusTimerPanel({
  initialMinutes,
  onStart,
  onClose,
}: FocusTimerPanelProps) {
  const [minutes, setMinutes] = useState(() => clampMinutes(initialMinutes));

  useEffect(() => {
    setMinutes(clampMinutes(initialMinutes));
  }, [initialMinutes]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <section
      className="composer-panel focus-timer-panel"
      aria-label="专注计时"
      data-desktop-interactive-region=""
    >
      <div className="composer-card-shell focus-timer-card">
        <header className="composer-card-header">
          <p className="composer-eyebrow">专注计时</p>
          <h1 className="composer-title">留一小段时间给自己</h1>
        </header>

        <output className="focus-timer-value" role="timer" aria-live="polite">
          {formatSelectedDuration(minutes)}
        </output>

        <div className="focus-timer-presets" aria-label="快捷时长">
          {presets.map((preset) => (
            <button
              key={preset}
              className="composer-choice"
              type="button"
              aria-pressed={minutes === preset}
              onClick={() => setMinutes(preset)}
            >
              {preset}分钟
            </button>
          ))}
        </div>

        <div className="focus-timer-stepper" aria-label="自定义时长">
          <button
            type="button"
            aria-label="减少一分钟"
            onClick={() => setMinutes((value) => clampMinutes(value - 1))}
          >
            −
          </button>
          <span>{minutes} 分钟</span>
          <button
            type="button"
            aria-label="增加一分钟"
            onClick={() => setMinutes((value) => clampMinutes(value + 1))}
          >
            +
          </button>
        </div>

        <footer className="composer-footer focus-timer-footer">
          <span className="composer-description">慢一点，也是在向前。</span>
          <div className="composer-actions">
            <button
              className="composer-action composer-action--secondary"
              type="button"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="composer-action composer-action--primary"
              type="button"
              onClick={() => onStart(minutes)}
            >
              开始专注
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) {
    return 25;
  }

  return Math.min(
    maxFocusDurationMinutes,
    Math.max(minFocusDurationMinutes, Math.round(value)),
  );
}

function formatSelectedDuration(minutes: number) {
  return `${String(minutes).padStart(2, "0")}:00`;
}
