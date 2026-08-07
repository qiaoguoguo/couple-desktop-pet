import { useCallback, useEffect, useRef, useState } from "react";
import type { EdgePeekSide } from "../desktop/edgePeek";
import {
  transitionEdgeInteraction,
  type EdgeInteractionProfile,
  type EdgeInteractionState,
  type EdgeSide,
} from "./edgeInteraction";

interface UseEdgeInteractionOptions {
  packageId: string;
  snapWindowToEdgeIfNeeded(): Promise<EdgePeekSide | null>;
  restoreWindowFromEdgePeek(side: EdgePeekSide): Promise<void>;
  resetWindowPosition(): Promise<void>;
  preloadFrames(frames: readonly string[]): Promise<void>;
  getProfile(packageId: string, side: EdgeSide): EdgeInteractionProfile | null;
}

const edgeSides = ["left", "right", "top", "bottom"] as const;

export function useEdgeInteraction({
  packageId,
  snapWindowToEdgeIfNeeded,
  restoreWindowFromEdgePeek,
  resetWindowPosition,
  preloadFrames,
  getProfile,
}: UseEdgeInteractionOptions) {
  const [state, setState] = useState<EdgeInteractionState>(null);
  const [profile, setProfile] = useState<EdgeInteractionProfile | null>(null);
  const stateRef = useRef<EdgeInteractionState>(null);
  const pendingCallbackRef = useRef<(() => void) | null>(null);
  const restoreInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        pendingCallbackRef.current = null;
      };
    },
    [],
  );

  const recoverFromEdge = useCallback(async () => {
    const currentState = stateRef.current;

    if (!currentState || restoreInFlightRef.current) {
      return;
    }

    restoreInFlightRef.current = true;
    pendingCallbackRef.current = null;

    try {
      await restoreWindowFromEdgePeek(currentState.side);
    } catch {
      await resetWindowPosition().catch(() => undefined);
    } finally {
      if (mountedRef.current) {
        stateRef.current = null;
        setState(null);
        setProfile(null);
      }

      restoreInFlightRef.current = false;
    }
  }, [resetWindowPosition, restoreWindowFromEdgePeek]);

  const cancel = useCallback(() => {
    pendingCallbackRef.current = null;
    restoreInFlightRef.current = false;
    stateRef.current = null;
    setState(null);
    setProfile(null);
  }, []);

  const snapAfterDrag = useCallback(async () => {
    if (stateRef.current || restoreInFlightRef.current) {
      return;
    }

    const availableProfiles = new Map<EdgeSide, EdgeInteractionProfile>();

    for (const side of edgeSides) {
      const candidateProfile = getProfile(packageId, side);

      if (candidateProfile) {
        availableProfiles.set(side, candidateProfile);
      }
    }

    if (!availableProfiles.size) {
      return;
    }

    try {
      await preloadFrames(
        edgeSides.flatMap(
          (side) => availableProfiles.get(side)?.enter.frames ?? [],
        ),
      );
    } catch {
      return;
    }

    const side = await snapWindowToEdgeIfNeeded();

    if (!side || !mountedRef.current) {
      return;
    }

    const nextProfile =
      availableProfiles.get(side) ?? getProfile(packageId, side);

    if (!nextProfile) {
      await restoreWindowFromEdgePeek(side).catch(() => undefined);
      return;
    }

    const nextState = transitionEdgeInteraction(null, {
      type: "SNAPPED",
      side,
    });

    stateRef.current = nextState;
    setProfile(nextProfile);
    setState(nextState);

    void preloadFrames([
      ...nextProfile.idle.frames,
      ...nextProfile.react.frames,
    ]).catch(() => {
      if (stateRef.current?.side === side) {
        void recoverFromEdge();
      }
    });
  }, [
    getProfile,
    packageId,
    preloadFrames,
    recoverFromEdge,
    restoreWindowFromEdgePeek,
    snapWindowToEdgeIfNeeded,
  ]);

  const requestExitThen = useCallback((callback: () => void) => {
    const currentState = stateRef.current;

    if (!currentState) {
      callback();
      return;
    }

    if (
      currentState.phase === "exit" ||
      pendingCallbackRef.current ||
      restoreInFlightRef.current
    ) {
      return;
    }

    pendingCallbackRef.current = callback;
    const nextState = transitionEdgeInteraction(currentState, {
      type: "REQUEST_EXIT",
    });

    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const handlePhaseComplete = useCallback(async () => {
    const currentState = stateRef.current;

    if (!currentState) {
      return;
    }

    if (currentState.phase !== "exit") {
      const nextState = transitionEdgeInteraction(currentState, {
        type: "PHASE_FINISHED",
      });

      stateRef.current = nextState;
      setState(nextState);

      if (!nextState) {
        setProfile(null);
      }

      return;
    }

    if (restoreInFlightRef.current) {
      return;
    }

    restoreInFlightRef.current = true;
    const callback = pendingCallbackRef.current;
    pendingCallbackRef.current = null;

    try {
      await restoreWindowFromEdgePeek(currentState.side);

      if (!mountedRef.current) {
        return;
      }

      stateRef.current = null;
      setState(null);
      setProfile(null);
      callback?.();
    } catch {
      await resetWindowPosition().catch(() => undefined);

      if (mountedRef.current) {
        stateRef.current = null;
        setState(null);
        setProfile(null);
      }
    } finally {
      restoreInFlightRef.current = false;
    }
  }, [resetWindowPosition, restoreWindowFromEdgePeek]);

  const handlePointerEnter = useCallback(() => {
    const currentState = stateRef.current;

    if (!currentState || currentState.phase === "exit") {
      return;
    }

    const nextState = transitionEdgeInteraction(currentState, {
      type: "POINTER_ENTER",
    });

    stateRef.current = nextState;
    setState(nextState);
  }, []);

  return {
    state,
    renderState:
      state && profile
        ? {
            profile,
            phase: state.phase,
          }
        : null,
    snapAfterDrag,
    requestExitThen,
    handlePhaseComplete,
    handlePointerEnter,
    handleLoadError: recoverFromEdge,
    cancel,
  };
}
