import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeerPresenceLayer } from "./PeerPresenceLayer";
import type { SyncRuntimeState } from "./syncTypes";

const baseStatus: SyncRuntimeState = {
  status: "connected",
  peerPresence: "online",
  peerPresenceChangedAt: "2026-08-06T08:00:00.000Z",
  peerLastSeenAt: null,
  lastError: null,
};

describe("PeerPresenceLayer", () => {
  it("renders warm online companion status", () => {
    render(
      <PeerPresenceLayer
        status={baseStatus}
        peerImageUrl="peer.png"
        onOpenMessageComposer={() => undefined}
      />,
    );

    expect(screen.getByLabelText("对方在线状态")).toBeTruthy();
    expect(screen.getByText("TA 在线")).toBeTruthy();
    expect(screen.getByText("正在陪你")).toBeTruthy();
    expect(screen.getByAltText("对方形象").getAttribute("src")).toBe(
      "peer.png",
    );
  });

  it("renders gentle offline waiting status", () => {
    render(
      <PeerPresenceLayer
        status={{
          ...baseStatus,
          peerPresence: "offline",
          peerLastSeenAt: "2026-08-06T07:58:00.000Z",
        }}
        peerImageUrl={null}
        onOpenMessageComposer={() => undefined}
      />,
    );

    expect(screen.getByText("TA 离线")).toBeTruthy();
    expect(screen.getByText("等TA回来")).toBeTruthy();
    expect(screen.getByLabelText("离线留言小窝")).toBeTruthy();
  });

  it("does not render when sync is not connected or peer presence is unknown", () => {
    const { rerender } = render(
      <PeerPresenceLayer
        status={{
          ...baseStatus,
          status: "connecting",
          peerPresence: "unknown",
        }}
        peerImageUrl={null}
        onOpenMessageComposer={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("对方在线状态")).toBeNull();

    rerender(
      <PeerPresenceLayer
        status={{ ...baseStatus, peerPresence: "unknown" }}
        peerImageUrl={null}
        onOpenMessageComposer={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("对方在线状态")).toBeNull();
  });

  it("opens the message composer when online status is clicked", () => {
    const onOpenMessageComposer = vi.fn();
    render(
      <PeerPresenceLayer
        status={baseStatus}
        peerImageUrl={null}
        onOpenMessageComposer={onOpenMessageComposer}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "给在线的TA发消息" }));

    expect(onOpenMessageComposer).toHaveBeenCalledTimes(1);
  });
});
