import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/defaultSettings";
import { SyncPanel, type SyncPanelProps } from "./SyncPanel";
import type { SyncRuntimeState } from "./syncTypes";

function syncStatus(
  overrides: Partial<SyncRuntimeState> = {},
): SyncRuntimeState {
  return {
    status: "disconnected",
    peerPresence: "unknown",
    peerActivityStatus: null,
    peerPresenceChangedAt: null,
    peerLastSeenAt: null,
    lastError: null,
    ...overrides,
  };
}

function renderSyncPanel(props: Partial<SyncPanelProps> = {}) {
  const mergedProps: SyncPanelProps = {
    sync: defaultSettings.sync,
    status: syncStatus(),
    messages: [],
    pairCode: null,
    profileComplete: true,
    onSyncChange: vi.fn(),
    onCreatePairCode: vi.fn(),
    onAcceptPairCode: vi.fn(),
    onUnpair: vi.fn(),
    ...props,
  };

  render(<SyncPanel {...mergedProps} />);
  return mergedProps;
}

describe("SyncPanel", () => {
  it("hides relay internals and inline send form", () => {
    renderSyncPanel();

    expect(screen.queryByLabelText("启用远程互动")).toBeNull();
    expect(screen.queryByLabelText("中继地址")).toBeNull();
    expect(screen.queryByLabelText("发送消息")).toBeNull();
    expect(screen.getByRole("button", { name: "生成绑定码" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "绑定" })).toBeTruthy();
    expect(screen.getByLabelText("输入绑定码").getAttribute("aria-label")).toBe("输入绑定码");
  });

  it("lets users request a pair code from the default cloud relay setup", () => {
    const onCreatePairCode = vi.fn();
    renderSyncPanel({ onCreatePairCode });

    fireEvent.click(screen.getByRole("button", { name: "生成绑定码" }));

    expect(onCreatePairCode).toHaveBeenCalled();
  });

  it("shows waiting and paired binding states", () => {
    const { rerender } = render(
      <SyncPanel
        sync={defaultSettings.sync}
        status={syncStatus()}
        messages={[]}
        pairCode={{ code: "123456", expiresAt: "2026-08-03T12:10:00.000Z" }}
        profileComplete={true}
        onSyncChange={vi.fn()}
        onCreatePairCode={vi.fn()}
        onAcceptPairCode={vi.fn()}
        onUnpair={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("当前绑定码").textContent).toBe("123456");
    expect(screen.getByText("等待对方输入绑定码")).toBeTruthy();

    rerender(
      <SyncPanel
        sync={{
          ...defaultSettings.sync,
          pairId: "pair_1",
          peerDeviceId: "dev_b",
        }}
        status={syncStatus()}
        messages={[]}
        pairCode={null}
        profileComplete={true}
        onSyncChange={vi.fn()}
        onCreatePairCode={vi.fn()}
        onAcceptPairCode={vi.fn()}
        onUnpair={vi.fn()}
      />,
    );

    expect(screen.getByText("已绑定")).toBeTruthy();
  });

  it("shows an unpair action when already paired", () => {
    const onUnpair = vi.fn();

    renderSyncPanel({
      sync: {
        ...defaultSettings.sync,
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
      status: syncStatus({ status: "connected", peerPresence: "online" }),
      onUnpair,
    });

    fireEvent.click(screen.getByRole("button", { name: "取消绑定" }));

    expect(onUnpair).toHaveBeenCalledTimes(1);
  });

  it("shows current-session received messages", () => {
    renderSyncPanel({
      sync: {
        ...defaultSettings.sync,
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
      status: syncStatus({ status: "connected", peerPresence: "online" }),
      messages: [
        {
          id: "msg_1",
          direction: "received",
          text: "想你啦",
          at: "2026-08-03T12:00:00.000Z",
        },
      ],
    });

    expect(screen.getByText("对方在线")).toBeTruthy();
    expect(screen.getByText("想你啦")).toBeTruthy();
  });

  it("blocks both pairing paths until basic information is complete", () => {
    const onCreatePairCode = vi.fn();
    const onAcceptPairCode = vi.fn();
    renderSyncPanel({
      profileComplete: false,
      onCreatePairCode,
      onAcceptPairCode,
    });

    const createButton = screen.getByRole("button", { name: "生成绑定码" });
    const acceptButton = screen.getByRole("button", { name: "绑定" });
    expect(createButton.hasAttribute("disabled")).toBe(true);
    expect(acceptButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("请先完成基本信息")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("输入绑定码"), {
      target: { value: "123456" },
    });
    fireEvent.click(createButton);
    fireEvent.click(acceptButton);

    expect(onCreatePairCode).not.toHaveBeenCalled();
    expect(onAcceptPairCode).not.toHaveBeenCalled();
  });
});
