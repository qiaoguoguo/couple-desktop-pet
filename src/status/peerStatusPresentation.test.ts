import { describe, expect, it } from "vitest";
import { resolvePeerStatusView } from "./peerStatusPresentation";

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
    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connecting",
        peerPresence: "online",
        peerActivityStatus: "overtime",
      }),
    ).toEqual({
      variant: "connecting",
      title: "正在寻找TA",
      detail: "连接恢复后告诉你",
      iconText: "...",
    });

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
    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connected",
        peerPresence: "offline",
        peerActivityStatus: "slacking",
      }),
    ).toEqual({
      variant: "offline",
      title: "TA 离线",
      detail: "等TA回来",
      iconText: "月",
    });
  });

  it("maps online peers to ordinary or activity-specific status cards", () => {
    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connected",
        peerPresence: "online",
        peerActivityStatus: null,
      }),
    ).toEqual({
      variant: "online",
      title: "TA 在线",
      detail: "正在陪你",
      iconText: "心",
    });

    expect(
      resolvePeerStatusView({
        paired: true,
        connectionStatus: "connected",
        peerPresence: "online",
        peerActivityStatus: "slacking",
      }),
    ).toEqual({
      variant: "slacking",
      title: "TA 摸鱼中",
      detail: "偷偷歇一会",
      iconText: "鱼",
    });

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
