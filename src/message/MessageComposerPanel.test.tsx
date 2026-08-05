import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageComposerPanel } from "./MessageComposerPanel";

describe("MessageComposerPanel", () => {
  it("submits trimmed text and closes only after a successful send", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    render(<MessageComposerPanel onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "  晚安  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("晚安"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps the panel open and shows an error when sending fails", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      message: "发送失败",
    });
    const onClose = vi.fn();
    render(<MessageComposerPanel onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "晚安" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText("发送失败")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("does not submit empty text", () => {
    const onSubmit = vi.fn();
    render(<MessageComposerPanel onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("先写一点想说的话")).toBeTruthy();
  });

  it("keeps Shift Enter as a newline and uses Enter to submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<MessageComposerPanel onSubmit={onSubmit} onClose={vi.fn()} />);

    const input = screen.getByLabelText("消息内容");
    fireEvent.change(input, { target: { value: "第一行" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.change(input, { target: { value: "第一行\n第二行" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("第一行\n第二行"),
    );
  });

  it("closes with the cancel button and Escape", () => {
    const onClose = vi.fn();
    render(<MessageComposerPanel onSubmit={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(screen.getByLabelText("消息内容"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
