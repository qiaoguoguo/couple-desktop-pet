import { describe, expect, it } from "vitest";
import {
  resolvePeerStatusView,
  type PeerStatusView,
} from "./peerStatusPresentation";
import {
  activityStatusIconAssets,
  peerStatusIconAssets,
  type StatusIconAsset,
} from "./statusIconAssets";

function expectStatusIcon(
  view: PeerStatusView | null,
  icon: StatusIconAsset,
  alt: string,
) {
  expect(view?.icon).toBe(icon);
  expect(view?.icon.alt).toBe(alt);
  expect(view?.icon.src).toMatch(/^(data:image\/svg\+xml|.*\.svg)/);
}

describe("resolvePeerStatusView", () => {
  it("does not render a status when the local user is unpaired", () => {
    expect(
      resolvePeerStatusView({
        paired: false,
        connectionStatus: "connected",
        peerPresence: "online",
        peerActivityStatus: "slacking",
      }),
    ).toBeNull();
  });

  it("shows the connecting state before any online or offline peer state is known", () => {
    const connectingView = resolvePeerStatusView({
      paired: true,
      connectionStatus: "connecting",
      peerPresence: "online",
      peerActivityStatus: "overtime",
    });

    expect(connectingView).toMatchObject({
      variant: "connecting",
      title: "正在寻找TA",
      detail: "连接恢复后告诉你",
    });
    expectStatusIcon(
      connectingView,
      peerStatusIconAssets.connecting,
      "正在寻找TA",
    );

    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connected",
        peerPresence: "unknown",
        peerActivityStatus: "slacking",
      })?.variant,
    ).toBe("connecting");
  });

  it("shows offline before local peer activity details", () => {
    const offlineView = resolvePeerStatusView({
      paired: true,
      connectionStatus: "connected",
      peerPresence: "offline",
      peerActivityStatus: "slacking",
    });

    expect(offlineView).toMatchObject({
      variant: "offline",
      title: "TA 离线",
      detail: "等TA回来",
    });
    expectStatusIcon(offlineView, peerStatusIconAssets.offline, "离线");
  });

  it("maps online peers to ordinary or activity-specific status cards", () => {
    const onlineView = resolvePeerStatusView({
      paired: true,
      connectionStatus: "connected",
      peerPresence: "online",
      peerActivityStatus: null,
    });

    expect(onlineView).toMatchObject({
      variant: "online",
      title: "TA 在线",
      detail: "正在陪你",
    });
    expectStatusIcon(onlineView, activityStatusIconAssets.online, "在线");

    const slackingView = resolvePeerStatusView({
      paired: true,
      connectionStatus: "connected",
      peerPresence: "online",
      peerActivityStatus: "slacking",
    });

    expect(slackingView).toMatchObject({
      variant: "slacking",
      title: "TA 摸鱼中",
      detail: "偷偷歇一会",
    });
    expectStatusIcon(slackingView, activityStatusIconAssets.slacking, "摸鱼中");

    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connected",
        peerPresence: "online",
        peerActivityStatus: "dazing",
      })?.title,
    ).toBe("TA 发呆中");

    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connected",
        peerPresence: "online",
        peerActivityStatus: "overtime",
      })?.title,
    ).toBe("TA 加班中");
  });

  it("treats unknown peer activity values as ordinary online", () => {
    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connected",
        peerPresence: "online",
        peerActivityStatus: "gaming",
      })?.variant,
    ).toBe("online");
  });
});
