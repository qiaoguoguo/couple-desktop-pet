import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  createEdgeNoticeState,
  transitionEdgeNotice,
  type EdgeNoticeSnapshot,
} from "./edgeNotice";

interface UseEdgeNoticeOptions {
  active: boolean;
  snapshot: EdgeNoticeSnapshot;
}

export function useEdgeNotice({ active, snapshot }: UseEdgeNoticeOptions) {
  const stableSnapshot = useMemo<EdgeNoticeSnapshot>(
    () => ({
      presence: snapshot.presence
        ? {
            kind: "presence",
            revision: snapshot.presence.revision,
            tone: snapshot.presence.tone,
            title: snapshot.presence.title,
            detail: snapshot.presence.detail,
            iconUrl: snapshot.presence.iconUrl,
          }
        : null,
      remote: snapshot.remote
        ? {
            kind: snapshot.remote.kind,
            id: snapshot.remote.id,
            title: snapshot.remote.title,
            detail: snapshot.remote.detail,
            iconUrl: snapshot.remote.iconUrl,
            unreadCount: snapshot.remote.unreadCount,
          }
        : null,
    }),
    [
      snapshot.presence?.detail,
      snapshot.presence?.iconUrl,
      snapshot.presence?.revision,
      snapshot.presence?.title,
      snapshot.presence?.tone,
      snapshot.remote?.detail,
      snapshot.remote?.iconUrl,
      snapshot.remote?.id,
      snapshot.remote?.kind,
      snapshot.remote?.title,
      snapshot.remote?.unreadCount,
    ],
  );
  const [state, dispatch] = useReducer(
    transitionEdgeNotice,
    stableSnapshot,
    createEdgeNoticeState,
  );

  useEffect(() => {
    if (!active) {
      dispatch({ type: "EDGE_EXITED" });
      return;
    }

    dispatch({ type: "EDGE_ENTERED" });
    dispatch({
      type: "SNAPSHOT_CHANGED",
      now: Date.now(),
      snapshot: stableSnapshot,
    });
  }, [active, stableSnapshot]);

  useEffect(() => {
    if (!active || state.expiresAt === null) {
      return;
    }

    let timerId: number | null = null;

    const expireAtDeadline = () => {
      const remainingMs = state.expiresAt! - Date.now();

      if (remainingMs > 0) {
        timerId = window.setTimeout(expireAtDeadline, remainingMs);
        return;
      }

      timerId = null;
      dispatch({ type: "TIMER_EXPIRED" });
    };

    timerId = window.setTimeout(
      expireAtDeadline,
      Math.max(0, state.expiresAt - Date.now()),
    );

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [active, state.expiresAt]);

  const handlePointerEnter = useCallback(() => {
    if (active) {
      dispatch({ type: "POINTER_ENTER" });
    }
  }, [active]);

  const handlePointerLeave = useCallback(() => {
    if (active) {
      dispatch({ type: "POINTER_LEAVE" });
    }
  }, [active]);

  const handleNoticeOpen = useCallback(() => {
    dispatch({ type: "EDGE_EXITED" });
  }, []);

  return {
    state,
    handlePointerEnter,
    handlePointerLeave,
    handleNoticeOpen,
  };
}
