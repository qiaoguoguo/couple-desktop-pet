export type PresenceMarkerTone = "online" | "offline";
export type EdgeNoticeKind = "presence" | "message" | "surprise";
export type EdgeNoticePresentation = "hidden" | "expanded" | "marker";

export interface EdgePresenceNotice {
  kind: "presence";
  revision: string;
  tone: PresenceMarkerTone;
  title: string;
  detail: string;
  iconUrl: string;
}

export interface EdgeRemoteNotice {
  kind: "message" | "surprise";
  id: string;
  title: string;
  detail: string;
  iconUrl: string;
  unreadCount: number;
}

export interface EdgeNoticeSnapshot {
  presence: EdgePresenceNotice | null;
  remote: EdgeRemoteNotice | null;
}

export interface EdgeNoticeState {
  snapshot: EdgeNoticeSnapshot;
  active: EdgePresenceNotice | EdgeRemoteNotice | null;
  presentation: EdgeNoticePresentation;
  expiresAt: number | null;
  presenceMarker: PresenceMarkerTone | null;
  announcedPresenceRevision: string | null;
  announcedRemoteId: string | null;
}

type EdgeNoticeEvent =
  | {
      type: "SNAPSHOT_CHANGED";
      now: number;
      snapshot: EdgeNoticeSnapshot;
    }
  | { type: "TIMER_EXPIRED" }
  | { type: "POINTER_ENTER" }
  | { type: "POINTER_LEAVE" }
  | { type: "EDGE_ENTERED" }
  | { type: "EDGE_EXITED" };

function isPresenceNotice(
  notice: EdgeNoticeState["active"],
): notice is EdgePresenceNotice {
  return notice?.kind === "presence";
}

function expandNotice(
  state: EdgeNoticeState,
  snapshot: EdgeNoticeSnapshot,
  active: EdgePresenceNotice | EdgeRemoteNotice,
  now: number,
): EdgeNoticeState {
  return {
    ...state,
    snapshot,
    active,
    presentation: "expanded",
    expiresAt: now + getEdgeNoticeTimeoutMs(active.kind),
    presenceMarker: snapshot.presence?.tone ?? null,
    announcedPresenceRevision:
      active.kind === "presence"
        ? active.revision
        : state.announcedPresenceRevision,
    announcedRemoteId:
      active.kind === "presence" ? state.announcedRemoteId : active.id,
  };
}

export function createEdgeNoticeState(
  snapshot: EdgeNoticeSnapshot,
): EdgeNoticeState {
  return {
    snapshot,
    active: null,
    presentation: "hidden",
    expiresAt: null,
    presenceMarker: snapshot.presence?.tone ?? null,
    announcedPresenceRevision: null,
    announcedRemoteId: null,
  };
}

export function transitionEdgeNotice(
  state: EdgeNoticeState,
  event: EdgeNoticeEvent,
): EdgeNoticeState {
  if (event.type === "SNAPSHOT_CHANGED") {
    return reconcileSnapshot(state, event.snapshot, event.now);
  }

  if (event.type === "TIMER_EXPIRED") {
    if (state.active === null) {
      return {
        ...state,
        presentation: "hidden",
        expiresAt: null,
      };
    }

    return {
      ...state,
      presentation: "marker",
      expiresAt: null,
      presenceMarker:
        state.active.kind === "presence"
          ? state.active.tone
          : state.presenceMarker,
    };
  }

  if (event.type === "POINTER_ENTER") {
    if (state.active === null || state.presentation === "expanded") {
      return state;
    }

    return {
      ...state,
      presentation: "expanded",
    };
  }

  if (event.type === "POINTER_LEAVE") {
    if (state.active === null || state.presentation !== "expanded") {
      return state;
    }

    return {
      ...state,
      presentation: "marker",
      expiresAt: null,
    };
  }

  if (event.type === "EDGE_EXITED") {
    return {
      ...state,
      presentation: "hidden",
      expiresAt: null,
    };
  }

  if (state.active === null || state.presentation !== "hidden") {
    return state;
  }

  return {
    ...state,
    presentation: "marker",
  };
}

export function getEdgeNoticeTimeoutMs(kind: EdgeNoticeKind): number {
  if (kind === "presence") {
    return 3000;
  }

  if (kind === "message") {
    return 8000;
  }

  return 12000;
}

function reconcileSnapshot(
  state: EdgeNoticeState,
  snapshot: EdgeNoticeSnapshot,
  now: number,
): EdgeNoticeState {
  const presenceMarker = snapshot.presence?.tone ?? null;

  if (snapshot.remote !== null) {
    if (snapshot.remote.id !== state.announcedRemoteId) {
      return {
        ...expandNotice(state, snapshot, snapshot.remote, now),
        announcedPresenceRevision:
          snapshot.presence?.revision ?? state.announcedPresenceRevision,
      };
    }

    return {
      ...state,
      snapshot,
      active: snapshot.remote,
      presenceMarker,
      announcedPresenceRevision:
        snapshot.presence?.revision ?? state.announcedPresenceRevision,
    };
  }

  if (snapshot.presence !== null) {
    if (snapshot.presence.revision !== state.announcedPresenceRevision) {
      return {
        ...expandNotice(state, snapshot, snapshot.presence, now),
        announcedRemoteId: null,
      };
    }

    return {
      ...state,
      snapshot,
      active: snapshot.presence,
      presentation: isPresenceNotice(state.active) ? state.presentation : "marker",
      expiresAt: isPresenceNotice(state.active) ? state.expiresAt : null,
      presenceMarker,
      announcedRemoteId: null,
    };
  }

  return {
    ...state,
    snapshot,
    active: null,
    presentation: "hidden",
    expiresAt: null,
    presenceMarker: null,
    announcedPresenceRevision: null,
    announcedRemoteId: null,
  };
}
