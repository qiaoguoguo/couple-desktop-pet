import type { FocusTimerState } from "./focusTimer";

export type FocusTimerPresentation =
  | "hidden"
  | "queued"
  | "animating"
  | "expanded"
  | "collapsed";

const entranceDurationMs = 2_400;
const expandedDurationMs = 12_000;

export function projectFocusTimerPresentation(
  timer: FocusTimerState,
  surfaceOwnerActive: boolean,
  now: number,
  visibleSince: number | null,
): FocusTimerPresentation {
  if (timer.status !== "completed-unacknowledged") {
    return "hidden";
  }

  if (surfaceOwnerActive) {
    return "queued";
  }

  if (timer.collapsed) {
    return "collapsed";
  }

  if (visibleSince === null) {
    return "animating";
  }

  const elapsed = Math.max(0, now - visibleSince);

  if (elapsed < entranceDurationMs) {
    return "animating";
  }

  if (elapsed < entranceDurationMs + expandedDurationMs) {
    return "expanded";
  }

  return "collapsed";
}
