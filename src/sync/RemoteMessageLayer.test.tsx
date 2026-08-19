import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RemoteMessageLayer,
  type RemoteMessageLayerProps,
} from "./RemoteMessageLayer";
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

function surpriseMessage(
  stage: RemoteMessageCard["stage"] = "collapsed",
): RemoteMessageCard {
  return {
    id: "surprise_1",
    fromDeviceId: "dev_b",
    text: "一份小心意在等你。惊喜暗号：A-1024。是我不好。",
    at: "2026-08-12T10:00:00.000Z",
    stage,
    content: {
      kind: "surprise",
      version: 1,
      theme: "apology",
      secret: "A-1024",
      note: "是我不好。",
    },
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
        onReveal={vi.fn()}
        onDismiss={vi.fn()}
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
        onReveal={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));

    expect(onAcknowledge).toHaveBeenCalledWith("msg_1");
  });

  it("routes collapsed surprise content to the surprise card without leaking private fields", () => {
    const { container } = render(
      <RemoteMessageLayer
        message={surpriseMessage("collapsed")}
        onAcknowledge={vi.fn()}
        onReveal={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("对方小心意消息")).toBeTruthy();
    expect(screen.getByText("有句话想认真说")).toBeTruthy();
    expect(screen.getByText("轻轻点开看看")).toBeTruthy();
    expect(screen.queryByText("A-1024")).toBeNull();
    expect(screen.queryByText("是我不好。")).toBeNull();
    expect(container.innerHTML).not.toContain("A-1024");
    expect(container.innerHTML).not.toContain("是我不好。");
  });

  it("does not acknowledge surprise cards on hover and reveals them only on click", () => {
    const onAcknowledge = vi.fn();
    const onReveal = vi.fn();
    render(
      <RemoteMessageLayer
        message={surpriseMessage("collapsed")}
        onAcknowledge={onAcknowledge}
        onReveal={onReveal}
        onDismiss={vi.fn()}
      />,
    );

    const cardButton = screen.getByRole("button", { name: /轻轻点开看看/ });

    fireEvent.pointerEnter(cardButton);
    expect(onAcknowledge).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();

    fireEvent.click(cardButton);
    expect(onReveal).toHaveBeenCalledWith("surprise_1");
  });

  it("dismisses revealed surprise cards with the receiver action", () => {
    const onDismiss = vi.fn();
    render(
      <RemoteMessageLayer
        message={surpriseMessage("revealed")}
        onAcknowledge={vi.fn()}
        onReveal={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "我收下啦" }));

    expect(onDismiss).toHaveBeenCalledWith("surprise_1");
  });

  it("does not render when there is no active message", () => {
    render(
      <RemoteMessageLayer
        message={null}
        onAcknowledge={vi.fn()}
        onReveal={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });

  it("requires reveal and dismiss callbacks at the public prop boundary", () => {
    // @ts-expect-error surprise callbacks are required so App cannot forget them.
    const props: RemoteMessageLayerProps = {
      message: null,
      onAcknowledge: vi.fn(),
    };

    expect(props.message).toBeNull();
  });
});
