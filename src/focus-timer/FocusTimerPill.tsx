import focusIconUrl from "../assets/ui/interaction-buttons/new-tea-focus.png";
import { getRemainingMs, type FocusTimerState } from "./focusTimer";

interface FocusTimerPillProps {
  state: Extract<FocusTimerState, { status: "running" | "paused" }>;
  now: number;
  controlsOpen: boolean;
  onToggleControls: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  edge?: boolean;
  edgeSide?: "left" | "right" | "top" | "bottom";
}

export function FocusTimerPill({
  state,
  now,
  controlsOpen,
  onToggleControls,
  onPause,
  onResume,
  onEnd,
  edge = false,
  edgeSide,
}: FocusTimerPillProps) {
  return (
    <div
      className={`focus-timer-pill-shell${edge ? " is-edge" : ""}${
        edgeSide ? ` edge-${edgeSide}` : ""
      }`}
      data-desktop-interactive-region=""
    >
      <button
        className="focus-timer-pill"
        type="button"
        aria-label={controlsOpen ? "收起专注计时控制" : "打开专注计时控制"}
        aria-expanded={controlsOpen}
        onClick={onToggleControls}
      >
        <img src={focusIconUrl} alt="" aria-hidden="true" />
        <span role="timer" aria-live="off">
          {formatRemainingTime(getRemainingMs(state, now))}
        </span>
        {state.status === "paused" ? (
          <span className="focus-timer-paused-mark" aria-hidden="true">
            Ⅱ
          </span>
        ) : null}
      </button>

      {controlsOpen ? (
        <div className="focus-timer-controls" aria-label="专注计时控制">
          <button type="button" onClick={state.status === "running" ? onPause : onResume}>
            {state.status === "running" ? "暂停" : "继续"}
          </button>
          <button type="button" onClick={onEnd}>
            结束计时
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
