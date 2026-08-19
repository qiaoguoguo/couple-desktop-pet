import { useCallback, useEffect, useRef, useState } from "react";
import {
  acknowledgeFocusTimer,
  completeFocusTimerIfDue,
  createIdleFocusTimer,
  endFocusTimer,
  pauseFocusTimer,
  repeatFocusTimer,
  resumeFocusTimer,
  setFocusTimerCollapsed,
  startFocusTimer,
  type FocusTimerState,
} from "./focusTimer";
import {
  loadFocusTimer,
  saveFocusTimer,
  type FocusTimerPersistenceApi,
} from "./focusTimerStore";

interface UseFocusTimerOptions {
  api: FocusTimerPersistenceApi;
  now?: () => number;
}

export function useFocusTimer({
  api,
  now = Date.now,
}: UseFocusTimerOptions) {
  const [state, setState] = useState<FocusTimerState>(() =>
    createIdleFocusTimer(),
  );
  const [clockNow, setClockNow] = useState(() => now());
  const [ready, setReady] = useState(false);
  const apiRef = useRef(api);
  const nowRef = useRef(now);
  apiRef.current = api;
  nowRef.current = now;

  useEffect(() => {
    let disposed = false;

    void loadFocusTimer(api, nowRef.current()).then((restored) => {
      if (disposed) {
        return;
      }

      setState(restored);
      setClockNow(nowRef.current());
      setReady(true);

      if (restored.status === "completed-unacknowledged") {
        void saveFocusTimer(api, restored).catch(() => undefined);
      }
    });

    return () => {
      disposed = true;
    };
  }, [api]);

  const transition = useCallback(
    (project: (current: FocusTimerState, at: number) => FocusTimerState) => {
      const at = nowRef.current();
      setClockNow(at);
      setState((current) => {
        const next = project(current, at);

        if (next !== current) {
          void saveFocusTimer(apiRef.current, next).catch(() => undefined);
        }

        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!ready || state.status !== "running") {
      return;
    }

    const timerId = window.setInterval(() => {
      transition((current, at) => completeFocusTimerIfDue(current, at));
    }, 1_000);

    return () => window.clearInterval(timerId);
  }, [ready, state.status, transition]);

  return {
    state,
    now: clockNow,
    ready,
    start: useCallback(
      (minutes: number) => transition((_current, at) => startFocusTimer(minutes, at)),
      [transition],
    ),
    pause: useCallback(
      () => transition((current, at) => pauseFocusTimer(current, at)),
      [transition],
    ),
    resume: useCallback(
      () => transition((current, at) => resumeFocusTimer(current, at)),
      [transition],
    ),
    end: useCallback(
      () => transition((current) => endFocusTimer(current)),
      [transition],
    ),
    acknowledge: useCallback(
      () => transition((current) => acknowledgeFocusTimer(current)),
      [transition],
    ),
    repeat: useCallback(
      () => transition((current, at) => repeatFocusTimer(current, at)),
      [transition],
    ),
    collapse: useCallback(
      () => transition((current) => setFocusTimerCollapsed(current, true)),
      [transition],
    ),
    expand: useCallback(
      () => transition((current) => setFocusTimerCollapsed(current, false)),
      [transition],
    ),
  };
}
