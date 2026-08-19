import focusIconUrl from "../assets/ui/interaction-buttons/new-tea-focus.png";
import type { FocusTimerState } from "./focusTimer";
import type { FocusTimerPresentation } from "./focusTimerPresentation";

interface FocusTimerCompletionProps {
  state: Extract<
    FocusTimerState,
    { status: "completed-unacknowledged" }
  >;
  presentation: FocusTimerPresentation;
  onAcknowledge: () => void;
  onRepeat: () => void;
  onExpand: () => void;
  edge?: boolean;
  edgeSide?: "left" | "right" | "top" | "bottom";
}

export function FocusTimerCompletion({
  presentation,
  onAcknowledge,
  onRepeat,
  onExpand,
  edge = false,
  edgeSide,
}: FocusTimerCompletionProps) {
  if (presentation === "hidden" || presentation === "queued") {
    return null;
  }

  if (presentation === "collapsed") {
    return (
      <button
        className={`focus-timer-completion-marker${edge ? " is-edge" : ""}${
          edgeSide ? ` edge-${edgeSide}` : ""
        }`}
        type="button"
        aria-label="打开专注完成提醒"
        data-desktop-interactive-region=""
        onClick={onExpand}
      >
        <img src={focusIconUrl} alt="" />
        <span className="focus-timer-unread-dot" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      className={`focus-timer-completion${
        presentation === "animating" ? " is-animating" : ""
      }${edge ? " is-edge" : ""}${edgeSide ? ` edge-${edgeSide}` : ""}`}
      aria-label="专注完成提醒"
      data-desktop-interactive-region=""
    >
      <div className="focus-timer-celebration" aria-hidden="true">
        <span className="focus-timer-ring focus-timer-ring--one" />
        <span className="focus-timer-ring focus-timer-ring--two" />
        <span className="focus-timer-paper focus-timer-paper--one" />
        <span className="focus-timer-paper focus-timer-paper--two" />
        <span className="focus-timer-paper focus-timer-paper--three" />
        <img src={focusIconUrl} alt="" />
      </div>
      <div className="focus-timer-completion-card">
        <p className="composer-eyebrow">专注完成</p>
        <h2>这一小段，认真完成了</h2>
        <p>辛苦啦，休息一下吧。</p>
        <div className="focus-timer-completion-actions">
          <button type="button" onClick={onAcknowledge}>
            知道啦
          </button>
          <button className="is-primary" type="button" onClick={onRepeat}>
            再来一次
          </button>
        </div>
      </div>
    </section>
  );
}
