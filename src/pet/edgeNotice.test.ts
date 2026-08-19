import { describe, expect, it } from "vitest";
import {
  createEdgeNoticeState,
  getEdgeNoticeTimeoutMs,
  transitionEdgeNotice,
  type EdgeNoticeSnapshot,
  type EdgeNoticeState,
  type EdgePresenceNotice,
  type EdgeRemoteNotice,
} from "./edgeNotice";

const emptySnapshot: EdgeNoticeSnapshot = {
  presence: null,
  remote: null,
};

function onlinePresence(revision: string): EdgePresenceNotice {
  return {
    kind: "presence",
    revision,
    tone: "online",
    title: "小茶在线",
    detail: "正在桌面边缘等你",
    iconUrl: "/presence-online.png",
  };
}

function messageNotice(id: string, unreadCount: number): EdgeRemoteNotice {
  return {
    kind: "message",
    id,
    title: "收到消息",
    detail: "今晚一起看电影吗？",
    iconUrl: "/message.png",
    unreadCount,
  };
}

function messageSnapshot(id: string, unreadCount: number): EdgeNoticeSnapshot {
  return {
    presence: null,
    remote: messageNotice(id, unreadCount),
  };
}

function presenceSnapshot(revision: string): EdgeNoticeSnapshot {
  return {
    presence: onlinePresence(revision),
    remote: null,
  };
}

function surpriseSnapshot(id: string): EdgeNoticeSnapshot {
  return {
    presence: null,
    remote: {
      kind: "surprise",
      id,
      title: "惊喜来了",
      detail: "有一个小惊喜在等你",
      iconUrl: "/surprise.png",
      unreadCount: 1,
    },
  };
}

function applySnapshot(
  snapshot: EdgeNoticeSnapshot,
  now = 100,
  state = createEdgeNoticeState(emptySnapshot),
) {
  return transitionEdgeNotice(state, {
    type: "SNAPSHOT_CHANGED",
    now,
    snapshot,
  });
}

function expire(state: EdgeNoticeState) {
  return transitionEdgeNotice(state, { type: "TIMER_EXPIRED" });
}

function hover(state: EdgeNoticeState) {
  return transitionEdgeNotice(state, { type: "POINTER_ENTER" });
}

function leave(state: EdgeNoticeState) {
  return transitionEdgeNotice(state, { type: "POINTER_LEAVE" });
}

function reconcileSameRemote(expandedState: EdgeNoticeState) {
  return applySnapshot(messageSnapshot("m-2", 2), 700, expandedState);
}

function reconcileNewRemote(
  oldMessageState: EdgeNoticeState,
  nextSnapshot: EdgeNoticeSnapshot,
) {
  return applySnapshot(nextSnapshot, 900, oldMessageState);
}

describe("edge notice timing", () => {
  it.each([
    ["presence", 3000],
    ["message", 8000],
    ["surprise", 12000],
  ] as const)("uses the approved %s timeout", (kind, expected) => {
    expect(getEdgeNoticeTimeoutMs(kind)).toBe(expected);
  });
});

describe("transitionEdgeNotice", () => {
  it("keeps the active remote message ahead of a later presence revision", () => {
    const state = createEdgeNoticeState(emptySnapshot);
    const withMessage = transitionEdgeNotice(state, {
      type: "SNAPSHOT_CHANGED",
      now: 100,
      snapshot: messageSnapshot("m-1", 1),
    });
    const withPresence = transitionEdgeNotice(withMessage, {
      type: "SNAPSHOT_CHANGED",
      now: 200,
      snapshot: {
        ...messageSnapshot("m-1", 1),
        presence: onlinePresence("online:2"),
      },
    });

    expect(withPresence.active?.kind).toBe("message");
    expect(withPresence.presenceMarker).toBe("online");
  });

  it("does not expand a presence revision already absorbed behind a remote notice", () => {
    const withRemoteAndPresence = transitionEdgeNotice(
      createEdgeNoticeState(emptySnapshot),
      {
        type: "SNAPSHOT_CHANGED",
        now: 100,
        snapshot: {
          ...messageSnapshot("m-1", 1),
          presence: onlinePresence("online:2"),
        },
      },
    );
    const afterRemoteClears = transitionEdgeNotice(withRemoteAndPresence, {
      type: "SNAPSHOT_CHANGED",
      now: 200,
      snapshot: presenceSnapshot("online:2"),
    });

    expect(afterRemoteClears.active?.kind).toBe("presence");
    expect(afterRemoteClears.presentation).toBe("marker");
    expect(afterRemoteClears.expiresAt).toBeNull();
    expect(afterRemoteClears.presenceMarker).toBe("online");
  });

  it("moves expired notices to markers without discarding their active notice", () => {
    const presenceState = applySnapshot(presenceSnapshot("online:1"));
    const messageState = applySnapshot(messageSnapshot("m-1", 1));
    const surpriseState = applySnapshot(surpriseSnapshot("s-1"));

    expect(expire(presenceState).presentation).toBe("marker");
    expect(expire(messageState).presentation).toBe("marker");
    expect(expire(surpriseState).presentation).toBe("marker");
  });

  it("expands markers on hover and returns them to markers on leave", () => {
    const markerState = expire(applySnapshot(messageSnapshot("m-1", 1)));

    expect(hover(markerState).presentation).toBe("expanded");
    expect(leave(hover(markerState)).presentation).toBe("marker");
  });

  it("preserves presentation timing for the same remote and expands a new remote", () => {
    const expandedState = applySnapshot(messageSnapshot("m-2", 1));
    const oldMessageState = applySnapshot(messageSnapshot("m-3", 1));

    expect(reconcileSameRemote(expandedState).expiresAt).toBe(
      expandedState.expiresAt,
    );
    expect(
      reconcileNewRemote(oldMessageState, surpriseSnapshot("s-2")).active?.kind,
    ).toBe("surprise");
  });

  it("hides edge notices when the companion leaves the edge and restores markers on return", () => {
    const markerState = expire(applySnapshot(messageSnapshot("m-4", 1)));
    const hiddenState = transitionEdgeNotice(markerState, {
      type: "EDGE_EXITED",
    });

    expect(hiddenState.presentation).toBe("hidden");
    expect(
      transitionEdgeNotice(hiddenState, { type: "EDGE_ENTERED" }).presentation,
    ).toBe("marker");
  });
});
