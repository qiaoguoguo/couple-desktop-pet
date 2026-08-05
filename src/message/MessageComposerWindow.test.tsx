import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageComposerWindow } from "./MessageComposerWindow";

describe("MessageComposerWindow", () => {
  it("submits trimmed text through the composer event bridge", async () => {
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MessageComposerWindow emitSubmit={emitSubmit} closeWindow={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "  今天也想你  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(emitSubmit).toHaveBeenCalledWith("今天也想你");
  });

  it("uses Enter to send and Shift Enter for newline", async () => {
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MessageComposerWindow emitSubmit={emitSubmit} closeWindow={vi.fn()} />,
    );

    const input = screen.getByLabelText("消息内容");
    fireEvent.change(input, { target: { value: "第一行\n第二行" } });
    expect((input as HTMLTextAreaElement).value).toBe("第一行\n第二行");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(emitSubmit).toHaveBeenCalledWith("第一行\n第二行");
  });
});
