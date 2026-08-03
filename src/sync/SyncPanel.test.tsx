import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/defaultSettings";
import { SyncPanel } from "./SyncPanel";

describe("SyncPanel", () => {
  it("lets users enable sync and request a pair code", () => {
    const onSyncChange = vi.fn();
    const onCreatePairCode = vi.fn();

    const { rerender } = render(
      <SyncPanel
        sync={defaultSettings.sync}
        status={{ status: "disabled", peerPresence: "unknown", lastError: null }}
        messages={[]}
        pairCode={null}
        onSyncChange={onSyncChange}
        onCreatePairCode={onCreatePairCode}
        onAcceptPairCode={vi.fn()}
        onSendMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "启用远程互动" }));
    rerender(
      <SyncPanel
        sync={{ ...defaultSettings.sync, enabled: true }}
        status={{ status: "disconnected", peerPresence: "unknown", lastError: null }}
        messages={[]}
        pairCode={null}
        onSyncChange={onSyncChange}
        onCreatePairCode={onCreatePairCode}
        onAcceptPairCode={vi.fn()}
        onSendMessage={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "生成绑定码" }));

    expect(onSyncChange).toHaveBeenCalledWith({ enabled: true });
    expect(onCreatePairCode).toHaveBeenCalled();
  });

  it("keeps pair-code generation disabled until sync is enabled", () => {
    const onCreatePairCode = vi.fn();

    render(
      <SyncPanel
        sync={defaultSettings.sync}
        status={{ status: "disabled", peerPresence: "unknown", lastError: null }}
        messages={[]}
        pairCode={null}
        onSyncChange={vi.fn()}
        onCreatePairCode={onCreatePairCode}
        onAcceptPairCode={vi.fn()}
        onSendMessage={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "生成绑定码",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);

    expect(onCreatePairCode).not.toHaveBeenCalled();
  });

  it("disables sending while the peer is offline", () => {
    const onSendMessage = vi.fn();

    render(
      <SyncPanel
        sync={{
          ...defaultSettings.sync,
          enabled: true,
          pairId: "pair_1",
          peerDeviceId: "dev_b",
        }}
        status={{ status: "connected", peerPresence: "offline", lastError: null }}
        messages={[]}
        pairCode={null}
        onSyncChange={vi.fn()}
        onCreatePairCode={vi.fn()}
        onAcceptPairCode={vi.fn()}
        onSendMessage={onSendMessage}
      />,
    );

    expect(screen.getByText("对方当前不在线")).toBeTruthy();
    expect((screen.getByLabelText("发送消息") as HTMLTextAreaElement).disabled).toBe(
      true,
    );

    const button = screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("shows current-session received messages", () => {
    render(
      <SyncPanel
        sync={{
          ...defaultSettings.sync,
          enabled: true,
          pairId: "pair_1",
          peerDeviceId: "dev_b",
        }}
        status={{ status: "connected", peerPresence: "online", lastError: null }}
        messages={[
          {
            id: "msg_1",
            direction: "received",
            text: "想你啦",
            at: "2026-08-03T12:00:00.000Z",
          },
        ]}
        pairCode={null}
        onSyncChange={vi.fn()}
        onCreatePairCode={vi.fn()}
        onAcceptPairCode={vi.fn()}
        onSendMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("对方在线")).toBeTruthy();
    expect(screen.getByText("想你啦")).toBeTruthy();
  });
});
