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
  dockWindowAtEdge(side: EdgePeekSide): Promise<void>;
  resetWindowPosition(): Promise<void>;
  preloadFrames(frames: readonly string[]): Promise<void>;
  getProfile(packageId: string, side: EdgeSide): EdgeInteractionProfile | null;
}

interface EdgeActivationToken {
  generation: number;
}

const edgeSides = ["left", "right", "top", "bottom"] as const;

function getRequiredStaticEdgeFrames(
  profile: EdgeInteractionProfile,
): readonly string[] {
  return profile.companion
    ? [profile.companion.idleUrl]
    : profile.idle.frames.slice(0, 1);
}

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
  const activationGenerationRef = useRef(0);
  const activationInFlightRef = useRef<EdgeActivationToken | null>(null);
  const nativeSnapQueueRef = useRef<Promise<void>>(Promise.resolve());
  const packageIdRef = useRef(packageId);
  const mountedRef = useRef(true);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      pendingCallbackRef.current = null;
      activationGenerationRef.current += 1;
    };
  }, []);

  const restoreDockedSide = useCallback(
    async (side: EdgeSide) => {
      try {
        await restoreWindowFromEdgePeek(side);
      } catch {
        await resetWindowPosition().catch(() => undefined);
      }
    },
    [resetWindowPosition, restoreWindowFromEdgePeek],
  );

  const runSerializedNativeSnap = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      const previous = nativeSnapQueueRef.current;
      let release: () => void = () => undefined;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      nativeSnapQueueRef.current = previous.then(() => current);

      await previous;

      try {
        return await operation();
      } finally {
        release();
      }
    },
    [],
  );

  const recoverFromEdge = useCallback(async () => {
    pendingCallbackRef.current = null;
    const currentState = stateRef.current;

    if (!currentState || restoreInFlightRef.current) {
      return;
    }

    restoreInFlightRef.current = true;

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

  useEffect(() => {
    if (packageIdRef.current === packageId) {
      return;
    }

    packageIdRef.current = packageId;
    activationGenerationRef.current += 1;
    pendingCallbackRef.current = null;

    const side = stateRef.current?.side;
    setProfile(null);

    if (!side || restoreInFlightRef.current) {
      stateRef.current = null;
      setState(null);
      return;
    }

    restoreInFlightRef.current = true;
    void restoreDockedSide(side).finally(() => {
      if (mountedRef.current) {
        stateRef.current = null;
        setState(null);
        setProfile(null);
      }

      restoreInFlightRef.current = false;
    });
  }, [packageId, restoreDockedSide]);

  const cancel = useCallback(() => {
    pendingCallbackRef.current = null;
    activationGenerationRef.current += 1;
    stateRef.current = null;
    setState(null);
    setProfile(null);
  }, []);

  const snapAfterDrag = useCallback(async () => {
    const generation = activationGenerationRef.current;

    if (
      stateRef.current ||
      restoreInFlightRef.current ||
      activationInFlightRef.current?.generation === generation
    ) {
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

    const token: EdgeActivationToken = { generation };
    activationInFlightRef.current = token;
    const isActivationCurrent = () =>
      mountedRef.current &&
      activationGenerationRef.current === generation &&
      activationInFlightRef.current === token &&
      !stateRef.current &&
      !restoreInFlightRef.current;

    try {
      await preloadFrames(
        edgeSides.flatMap((side) => {
          const candidateProfile = availableProfiles.get(side);
          return candidateProfile
            ? getRequiredStaticEdgeFrames(candidateProfile)
            : [];
        }),
      );

      if (!isActivationCurrent()) {
        return;
      }

      await runSerializedNativeSnap(async () => {
        if (!isActivationCurrent()) {
          return;
        }

        const side = await snapWindowToEdgeIfNeeded();

        if (!side) {
          return;
        }

        if (!isActivationCurrent()) {
          await restoreDockedSide(side);
          return;
        }

        const nextProfile = availableProfiles.get(side);

        if (!nextProfile) {
          await restoreDockedSide(side);
          return;
        }

        const nextState = transitionEdgeInteraction(null, {
          type: "SNAPPED",
          side,
        });

        stateRef.current = nextState;
        setProfile(nextProfile);
        setState(nextState);
      });
    } catch {
      return;
    } finally {
      if (activationInFlightRef.current === token) {
        activationInFlightRef.current = null;
      }
    }
  }, [
    getProfile,
    packageId,
    preloadFrames,
    restoreDockedSide,
    runSerializedNativeSnap,
    snapWindowToEdgeIfNeeded,
  ]);

  const requestExitThen = useCallback(
    (callback: () => void) => {
      const currentState = stateRef.current;

      if (!currentState) {
        callback();
        return;
      }

      if (pendingCallbackRef.current || restoreInFlightRef.current) {
        return;
      }

      pendingCallbackRef.current = callback;
      restoreInFlightRef.current = true;

      void (async () => {
        let restored = false;

        try {
          await restoreWindowFromEdgePeek(currentState.side);
          restored = true;
        } catch {
          pendingCallbackRef.current = null;
          await resetWindowPosition().catch(() => undefined);
        } finally {
          const pendingCallback = pendingCallbackRef.current;
          pendingCallbackRef.current = null;

          if (restored && mountedRef.current) {
            stateRef.current = null;
            setState(null);
            setProfile(null);
          }

          restoreInFlightRef.current = false;

          if (restored && mountedRef.current) {
            pendingCallback?.();
          }
        }
      })();
    },
    [resetWindowPosition, restoreWindowFromEdgePeek],
  );

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
    handleLoadError: recoverFromEdge,
    cancel,
  };
}
