export const defaultFocusDurationMinutes = 25;
export const minFocusDurationMinutes = 1;
export const maxFocusDurationMinutes = 180;

export type FocusTimerState =
  | { status: "idle"; lastDurationMinutes: number }
  | {
      status: "running";
      durationMinutes: number;
      startedAt: number;
      endsAt: number;
    }
  | {
      status: "paused";
      durationMinutes: number;
      remainingMs: number;
    }
  | {
      status: "completed-unacknowledged";
      durationMinutes: number;
      completedAt: number;
      collapsed: boolean;
    };

export type PersistedFocusTimer = FocusTimerState;

export function createIdleFocusTimer(
  lastDurationMinutes = defaultFocusDurationMinutes,
): FocusTimerState {
  return {
    status: "idle",
    lastDurationMinutes: clampDurationMinutes(lastDurationMinutes),
  };
}

export function startFocusTimer(
  durationMinutes: number,
  now: number,
): Extract<FocusTimerState, { status: "running" }> {
  const normalizedDuration = clampDurationMinutes(durationMinutes);

  return {
    status: "running",
    durationMinutes: normalizedDuration,
    startedAt: now,
    endsAt: now + normalizedDuration * 60_000,
  };
}

export function pauseFocusTimer(
  state: FocusTimerState,
  now: number,
): FocusTimerState {
  if (state.status !== "running") {
    return state;
  }

  return {
    status: "paused",
    durationMinutes: state.durationMinutes,
    remainingMs: getRemainingMs(state, now),
  };
}

export function resumeFocusTimer(
  state: FocusTimerState,
  now: number,
): FocusTimerState {
  if (state.status !== "paused") {
    return state;
  }

  return {
    status: "running",
    durationMinutes: state.durationMinutes,
    startedAt: now,
    endsAt: now + state.remainingMs,
  };
}

export function completeFocusTimerIfDue(
  state: FocusTimerState,
  now: number,
): FocusTimerState {
  if (state.status !== "running" || now < state.endsAt) {
    return state;
  }

  return {
    status: "completed-unacknowledged",
    durationMinutes: state.durationMinutes,
    completedAt: now,
    collapsed: false,
  };
}

export function acknowledgeFocusTimer(state: FocusTimerState): FocusTimerState {
  if (state.status !== "completed-unacknowledged") {
    return state;
  }

  return createIdleFocusTimer(state.durationMinutes);
}

export function repeatFocusTimer(
  state: FocusTimerState,
  now: number,
): FocusTimerState {
  if (state.status !== "completed-unacknowledged") {
    return state;
  }

  return startFocusTimer(state.durationMinutes, now);
}

export function endFocusTimer(state: FocusTimerState): FocusTimerState {
  if (state.status === "idle") {
    return state;
  }

  return createIdleFocusTimer(state.durationMinutes);
}

export function setFocusTimerCollapsed(
  state: FocusTimerState,
  collapsed: boolean,
): FocusTimerState {
  if (
    state.status !== "completed-unacknowledged" ||
    state.collapsed === collapsed
  ) {
    return state;
  }

  return { ...state, collapsed };
}

export function getRemainingMs(state: FocusTimerState, now: number): number {
  if (state.status === "running") {
    return Math.max(0, state.endsAt - now);
  }

  if (state.status === "paused") {
    return Math.max(0, state.remainingMs);
  }

  return 0;
}

export function restoreFocusTimer(
  input: unknown,
  now: number,
): FocusTimerState {
  if (!isRecord(input) || typeof input.status !== "string") {
    return createIdleFocusTimer();
  }

  if (input.status === "idle" && isValidDuration(input.lastDurationMinutes)) {
    return createIdleFocusTimer(input.lastDurationMinutes);
  }

  if (
    input.status === "running" &&
    isValidDuration(input.durationMinutes) &&
    isFiniteNumber(input.startedAt) &&
    isFiniteNumber(input.endsAt) &&
    input.endsAt >= input.startedAt
  ) {
    return completeFocusTimerIfDue(
      {
        status: "running",
        durationMinutes: input.durationMinutes,
        startedAt: input.startedAt,
        endsAt: input.endsAt,
      },
      now,
    );
  }

  if (
    input.status === "paused" &&
    isValidDuration(input.durationMinutes) &&
    isFiniteNumber(input.remainingMs) &&
    input.remainingMs >= 0
  ) {
    return {
      status: "paused",
      durationMinutes: input.durationMinutes,
      remainingMs: input.remainingMs,
    };
  }

  if (
    input.status === "completed-unacknowledged" &&
    isValidDuration(input.durationMinutes) &&
    isFiniteNumber(input.completedAt) &&
    typeof input.collapsed === "boolean"
  ) {
    return {
      status: "completed-unacknowledged",
      durationMinutes: input.durationMinutes,
      completedAt: input.completedAt,
      collapsed: input.collapsed,
    };
  }

  return createIdleFocusTimer();
}

function clampDurationMinutes(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes)) {
    return defaultFocusDurationMinutes;
  }

  return Math.min(
    maxFocusDurationMinutes,
    Math.max(minFocusDurationMinutes, Math.round(durationMinutes)),
  );
}

function isValidDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minFocusDurationMinutes &&
    value <= maxFocusDurationMinutes
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
