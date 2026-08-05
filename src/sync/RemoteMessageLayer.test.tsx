import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteMessageLayer } from "./RemoteMessageLayer";
import type { RemoteMessageCard } from "./remoteMessageQueue";

function remoteMessage(
  stage: RemoteMessageCard["stage"] = "visible",
): RemoteMessageCard {
  return {
    id: "msg_1",
    fromDeviceId: "dev_b",
    text: "想你啦",
    at: "2026-08-03T12:00:00.000Z",
    stage,
  };
}

async function advanceTypewriterText(text: string) {
  for (let index = 1; index < Array.from(text).length; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35);
    });
  }
}

describe("RemoteMessageLayer", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders only the persistent incoming message bubble", async () => {
    vi.useFakeTimers();
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("月亮伙伴")).toBeNull();
    expect(screen.getByText("想")).toBeTruthy();

    await advanceTypewriterText("想你啦");

    expect(screen.getByText("想你啦")).toBeTruthy();
  });

  it("acknowledges the message on mouse hover", () => {
    const onAcknowledge = vi.fn();
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));

    expect(onAcknowledge).toHaveBeenCalledWith("msg_1");
  });

  it("does not render when there is no active message", () => {
    render(
      <RemoteMessageLayer
        message={null}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });
});
