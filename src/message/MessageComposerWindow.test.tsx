import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageComposerWindow } from "./MessageComposerWindow";
import type { MessageComposerResultPayload } from "./messageComposerEvents";

describe("MessageComposerWindow", () => {
  function listenForResult(
    handlerRef: { current: ((payload: MessageComposerResultPayload) => void) | null },
  ) {
    return vi.fn((handler: (payload: MessageComposerResultPayload) => void) => {
      handlerRef.current = handler;
      return Promise.resolve(() => {
        handlerRef.current = null;
      });
    });
  }

  it("submits trimmed text through the composer event bridge", async () => {
    const resultHandler = { current: null } as {
      current: ((payload: MessageComposerResultPayload) => void) | null;
    };
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    const closeWindow = vi.fn();
    render(
      <MessageComposerWindow
        emitSubmit={emitSubmit}
        closeWindow={closeWindow}
        listenForResult={listenForResult(resultHandler)}
      />,
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "  今天也想你  " },
    });
    const sendButton = screen.getByRole("button", { name: "发送" });
    fireEvent.click(sendButton);

    expect(emitSubmit).toHaveBeenCalledWith("今天也想你");
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
    expect(closeWindow).not.toHaveBeenCalled();

    await act(async () => {
      resultHandler.current?.({ ok: true });
      await Promise.resolve();
    });

    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it("uses Enter to send and Shift Enter for newline", async () => {
    const resultHandler = { current: null } as {
      current: ((payload: MessageComposerResultPayload) => void) | null;
    };
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MessageComposerWindow
        emitSubmit={emitSubmit}
        closeWindow={vi.fn()}
        listenForResult={listenForResult(resultHandler)}
      />,
    );

    const input = screen.getByLabelText("消息内容");
    fireEvent.change(input, { target: { value: "第一行\n第二行" } });
    expect((input as HTMLTextAreaElement).value).toBe("第一行\n第二行");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(emitSubmit).toHaveBeenCalledWith("第一行\n第二行");
  });

  it("keeps the window open and shows errors when the send result fails", async () => {
    const resultHandler = { current: null } as {
      current: ((payload: MessageComposerResultPayload) => void) | null;
    };
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    const closeWindow = vi.fn();
    render(
      <MessageComposerWindow
        emitSubmit={emitSubmit}
        closeWindow={closeWindow}
        listenForResult={listenForResult(resultHandler)}
      />,
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "晚安" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(emitSubmit).toHaveBeenCalledWith("晚安"));

    await act(async () => {
      resultHandler.current?.({ ok: false, message: "发送失败" });
      await Promise.resolve();
    });

    expect(closeWindow).not.toHaveBeenCalled();
    expect(screen.getByText("发送失败")).toBeTruthy();
    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows an error and exits sending state when submit cannot be emitted", async () => {
    const emitSubmit = vi.fn().mockRejectedValue(new Error("event unavailable"));
    render(
      <MessageComposerWindow emitSubmit={emitSubmit} closeWindow={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "晚安" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText("发送窗口暂时不可用")).toBeTruthy());
    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("does not emit empty messages", () => {
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MessageComposerWindow emitSubmit={emitSubmit} closeWindow={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(emitSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("先写一点想说的话")).toBeTruthy();
  });

  it("lets the user close the composer with the cancel button", () => {
    const closeWindow = vi.fn();
    render(<MessageComposerWindow closeWindow={closeWindow} />);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it("lets the user close the composer with Escape after an error", async () => {
    const emitSubmit = vi.fn().mockRejectedValue(new Error("event unavailable"));
    const closeWindow = vi.fn();
    render(
      <MessageComposerWindow emitSubmit={emitSubmit} closeWindow={closeWindow} />,
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "晚安" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText("发送窗口暂时不可用")).toBeTruthy());
    fireEvent.keyDown(screen.getByLabelText("消息内容"), { key: "Escape" });

    expect(closeWindow).toHaveBeenCalledTimes(1);
  });
});
