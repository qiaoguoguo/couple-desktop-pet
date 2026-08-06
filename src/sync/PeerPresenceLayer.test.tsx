import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getPeerPresenceLayoutBounds,
  PeerPresenceLayer,
  PEER_PRESENCE_GROUP_HEIGHT_PX,
  PEER_PRESENCE_GROUP_WIDTH_PX,
  PEER_PRESENCE_ORB_SIZE_PX,
  PEER_PRESENCE_RIGHT_PX,
  PEER_PRESENCE_TOP_PX,
  PEER_PRESENCE_WINDOW_WIDTH_PX,
} from "./PeerPresenceLayer";
import type { SyncRuntimeState } from "./syncTypes";

const baseStatus: SyncRuntimeState = {
  status: "connected",
  peerPresence: "online",
  peerPresenceChangedAt: "2026-08-06T08:00:00.000Z",
  peerLastSeenAt: null,
  lastError: null,
};

describe("PeerPresenceLayer", () => {
  it("renders a warm online companion mini avatar with chips and heartline", () => {
    const { container } = render(
      <PeerPresenceLayer
        status={baseStatus}
        peerImageUrl="peer.png"
        onOpenMessageComposer={() => undefined}
      />,
    );

    const layer = screen.getByLabelText("对方在线状态") as HTMLElement;
    const orb = container.querySelector(".peer-presence-orb");
    const chips = container.querySelectorAll(".peer-presence-chip");

    expect(layer).toBeTruthy();
    expect(orb).toBeTruthy();
    expect(container.querySelector(".peer-presence-heart-badge")).toBeTruthy();
    expect(container.querySelector(".peer-presence-heartline")).toBeTruthy();
    expect(chips).toHaveLength(2);
    expect(screen.getByText("TA 在线")).toBeTruthy();
    expect(screen.getByText("正在陪你")).toBeTruthy();
    expect(screen.getByAltText("对方头像").getAttribute("src")).toBe(
      "peer.png",
    );
  });

  it("exposes stable layout variables for the companion presence group", () => {
    render(
      <PeerPresenceLayer
        status={baseStatus}
        peerImageUrl="peer.png"
        onOpenMessageComposer={() => undefined}
      />,
    );

    const layer = screen.getByLabelText("对方在线状态") as HTMLElement;
    expect(layer.style.getPropertyValue("--peer-presence-top")).toBe(
      `${PEER_PRESENCE_TOP_PX}px`,
    );
    expect(layer.style.getPropertyValue("--peer-presence-right")).toBe(
      `${PEER_PRESENCE_RIGHT_PX}px`,
    );
    expect(layer.style.getPropertyValue("--peer-presence-group-width")).toBe(
      `${PEER_PRESENCE_GROUP_WIDTH_PX}px`,
    );
    expect(layer.style.getPropertyValue("--peer-presence-group-height")).toBe(
      `${PEER_PRESENCE_GROUP_HEIGHT_PX}px`,
    );
    expect(layer.style.getPropertyValue("--peer-presence-orb-size")).toBe(
      `${PEER_PRESENCE_ORB_SIZE_PX}px`,
    );
  });

  it("renders gentle offline waiting status", () => {
    const { container } = render(
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
    expect(container.querySelector(".peer-presence-orb")).toBeTruthy();
    expect(screen.getByLabelText("离线月亮标记")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status", { name: "对方离线状态" })).toBeTruthy();
  });

  it("keeps the companion presence group and heartline inside the default 320px pet window", () => {
    const bounds = getPeerPresenceLayoutBounds();

    expect(bounds.group.left).toBeGreaterThanOrEqual(0);
    expect(bounds.group.right).toBeLessThanOrEqual(PEER_PRESENCE_WINDOW_WIDTH_PX);
    expect(bounds.heartline.left).toBeGreaterThanOrEqual(0);
    expect(bounds.heartline.right).toBeLessThanOrEqual(
      PEER_PRESENCE_WINDOW_WIDTH_PX,
    );
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
