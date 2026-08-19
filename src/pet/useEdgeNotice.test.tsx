import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EdgeNoticeSnapshot,
  EdgePresenceNotice,
  EdgeRemoteNotice,
} from "./edgeNotice";
import { useEdgeNotice } from "./useEdgeNotice";

const emptySnapshot: EdgeNoticeSnapshot = {
  presence: null,
  remote: null,
};

function presenceSnapshot(revision: string): EdgeNoticeSnapshot {
  const presence: EdgePresenceNotice = {
    kind: "presence",
    revision,
    tone: "online",
    title: "TA 回来啦",
    detail: "刚刚上线",
    iconUrl: "/presence.png",
  };

  return { presence, remote: null };
}

function messageSnapshot(id: string, unreadCount = 1): EdgeNoticeSnapshot {
  const remote: EdgeRemoteNotice = {
    kind: "message",
    id,
    title: "今晚一起看电影吗？",
    detail: "有一句话想让你看见",
    iconUrl: "/message.png",
    unreadCount,
  };

  return { presence: null, remote };
}

function surpriseSnapshot(id: string): EdgeNoticeSnapshot {
  const remote: EdgeRemoteNotice = {
    kind: "surprise",
    id,
    title: "有一份心意正在等你",
    detail: "点一下，让惊喜慢慢打开",
    iconUrl: "/surprise.png",
    unreadCount: 1,
  };

  return { presence: null, remote };
}

describe("useEdgeNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps the same message ID on one absolute deadline without restarting its timer", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useEdgeNotice({ active: true, snapshot }),
      { initialProps: { snapshot: messageSnapshot("m-1") } },
    );

    expect(result.current.state.presentation).toBe("expanded");
    expect(result.current.state.expiresAt).toBe(9_000);
    expect(vi.getTimerCount()).toBe(1);

    act(() => vi.advanceTimersByTime(4_000));
    rerender({ snapshot: messageSnapshot("m-1", 2) });

    expect(result.current.state.expiresAt).toBe(9_000);
    expect(vi.getTimerCount()).toBe(1);

    act(() => vi.advanceTimersByTime(3_999));
    expect(result.current.state.presentation).toBe("expanded");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.presentation).toBe("marker");
    expect(result.current.state.expiresAt).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["presence", presenceSnapshot("online:1"), 3_000],
    ["message", messageSnapshot("m-2"), 8_000],
    ["surprise", surpriseSnapshot("s-1"), 12_000],
  ] as const)("expires an expanded %s at its absolute deadline", (_, snapshot, timeoutMs) => {
    const { result } = renderHook(() =>
      useEdgeNotice({ active: true, snapshot }),
    );

    expect(result.current.state.presentation).toBe("expanded");
    act(() => vi.advanceTimersByTime(timeoutMs - 1));
    expect(result.current.state.presentation).toBe("expanded");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.presentation).toBe("marker");
  });

  it("treats hover as preview-only and collapses again on leave", () => {
    const { result } = renderHook(() =>
      useEdgeNotice({ active: true, snapshot: messageSnapshot("m-3") }),
    );

    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current.state.presentation).toBe("marker");

    act(() => result.current.handlePointerEnter());
    expect(result.current.state.presentation).toBe("expanded");
    expect(result.current.state.active?.kind).toBe("message");
    expect((result.current.state.active as EdgeRemoteNotice).id).toBe("m-3");
    expect(result.current.state.expiresAt).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    act(() => result.current.handlePointerLeave());
    expect(result.current.state.presentation).toBe("marker");
    expect((result.current.state.active as EdgeRemoteNotice).id).toBe("m-3");
  });

  it("clears its timer while inactive and announces a notice received while inactive on return", () => {
    const { result, rerender, unmount } = renderHook(
      ({ active, snapshot }) => useEdgeNotice({ active, snapshot }),
      {
        initialProps: {
          active: true,
          snapshot: messageSnapshot("m-4"),
        },
      },
    );

    expect(vi.getTimerCount()).toBe(1);
    rerender({ active: false, snapshot: messageSnapshot("m-4") });
    expect(result.current.state.presentation).toBe("hidden");
    expect(result.current.state.expiresAt).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    rerender({ active: false, snapshot: surpriseSnapshot("s-2") });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ active: true, snapshot: surpriseSnapshot("s-2") });
    expect(result.current.state.active?.kind).toBe("surprise");
    expect(result.current.state.presentation).toBe("expanded");
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hides an opened preview without acknowledging or discarding its notice", () => {
    const { result } = renderHook(() =>
      useEdgeNotice({ active: true, snapshot: messageSnapshot("m-5") }),
    );

    act(() => result.current.handleNoticeOpen());

    expect(result.current.state.presentation).toBe("hidden");
    expect(result.current.state.active?.kind).toBe("message");
    expect((result.current.state.active as EdgeRemoteNotice).id).toBe("m-5");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stays hidden and timer-free for an inactive empty snapshot", () => {
    const { result } = renderHook(() =>
      useEdgeNotice({ active: false, snapshot: emptySnapshot }),
    );

    expect(result.current.state.presentation).toBe("hidden");
    expect(vi.getTimerCount()).toBe(0);
  });
});
