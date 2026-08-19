import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SurpriseMessageContent } from "../../shared/syncProtocol";
import {
  SURPRISE_THEME_COPY,
  SURPRISE_THEME_ORDER,
} from "./surpriseThemes";
import { SurpriseComposerPanel } from "./SurpriseComposerPanel";

const themeLabels = [
  "哄你开心",
  "想说抱歉",
  "生日惊喜",
  "节日心意",
  "只是想你",
  "小小惊喜",
] as const;

function setup(
  onSubmit = vi.fn().mockResolvedValue({ ok: true }),
  onClose = vi.fn(),
) {
  render(<SurpriseComposerPanel onSubmit={onSubmit} onClose={onClose} />);

  return {
    onSubmit,
    onClose,
    secret: screen.getByLabelText("惊喜暗号") as HTMLInputElement,
    note: screen.getByLabelText("想对 TA 说") as HTMLTextAreaElement,
    submit: screen.getByRole("button", { name: "送出这份心意" }),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("SurpriseComposerPanel", () => {
  it("uses the shared visible card as the hit region containing both footer actions", () => {
    setup();

    const panel = screen.getByRole("region", { name: "送一份小心意" });
    const card = panel.querySelector(".composer-card-shell");
    const cancel = screen.getByRole("button", { name: "取消" });
    const submit = screen.getByRole("button", { name: "送出这份心意" });

    expect(panel.classList.contains("composer-panel")).toBe(true);
    expect(panel.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(card?.hasAttribute("data-desktop-interactive-region")).toBe(true);
    expect(card?.contains(cancel)).toBe(true);
    expect(card?.contains(submit)).toBe(true);
    expect(cancel.classList.contains("composer-action--secondary")).toBe(true);
    expect(submit.classList.contains("composer-action--primary")).toBe(true);
  });

  it("starts on the general theme with all six exact theme choices", () => {
    const { note } = setup();

    expect(screen.getByRole("region", { name: "送一份小心意" })).toBeTruthy();
    expect(screen.getByText("这次想说")).toBeTruthy();
    expect(SURPRISE_THEME_ORDER.map((theme) => SURPRISE_THEME_COPY[theme].label)).toEqual([
      ...themeLabels,
    ]);

    for (const label of themeLabels) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }

    expect(
      screen
        .getByRole("button", { name: "小小惊喜" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(note.value).toBe(SURPRISE_THEME_COPY.general.defaultNote);
  });

  it("replaces the note with the selected theme default deterministically", () => {
    const { note } = setup();

    fireEvent.change(note, { target: { value: "我先自己写一点" } });
    fireEvent.click(screen.getByRole("button", { name: "想说抱歉" }));

    expect(
      screen
        .getByRole("button", { name: "想说抱歉" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(note.value).toBe(SURPRISE_THEME_COPY.apology.defaultNote);

    fireEvent.click(screen.getByRole("button", { name: "生日惊喜" }));

    expect(note.value).toBe(SURPRISE_THEME_COPY.birthday.defaultNote);
  });

  it.each([
    ["empty secret", "", "先填一个惊喜暗号"],
    ["space secret", "   ", "先填一个惊喜暗号"],
    ["underscore secret", "A_1024", "暗号只能使用英文字母、数字或短横线"],
    ["25-character secret", "A".repeat(25), "暗号最多 24 个字符"],
  ])("rejects %s and focuses the secret field", async (_name, value, error) => {
    const { onSubmit, secret, submit } = setup();

    fireEvent.change(secret, { target: { value } });
    fireEvent.click(submit);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(error)).toBeTruthy();
    expect(document.activeElement).toBe(secret);
  });

  it("rejects a 121-character note and focuses the note field", async () => {
    const { onSubmit, secret, note, submit } = setup();

    fireEvent.change(secret, { target: { value: "A-7482" } });
    fireEvent.change(note, { target: { value: "你".repeat(121) } });
    fireEvent.click(submit);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText("留言最多 120 个字符")).toBeTruthy();
    expect(document.activeElement).toBe(note);
  });

  it("submits trimmed content and fallback text with a valid secret", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    const { secret, note, submit } = setup(onSubmit, onClose);

    fireEvent.change(secret, { target: { value: "  A-7482  " } });
    fireEvent.change(note, { target: { value: "  是我不好。  " } });
    fireEvent.click(submit);

    const expectedContent: SurpriseMessageContent = {
      kind: "surprise",
      version: 1,
      theme: "general",
      secret: "A-7482",
      note: "是我不好。",
    };

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expectedContent,
        "一份小心意在等你。惊喜暗号：A-7482。是我不好。",
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("omits an empty note from content and fallback text", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const { secret, note, submit } = setup(onSubmit);

    fireEvent.change(secret, { target: { value: "7482" } });
    fireEvent.change(note, { target: { value: "   " } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          kind: "surprise",
          version: 1,
          theme: "general",
          secret: "7482",
        },
        "一份小心意在等你。惊喜暗号：7482。",
      ),
    );
  });

  it("counts Unicode note characters instead of UTF-16 code units", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const { secret, note, submit } = setup(onSubmit);
    const noteText = "💗".repeat(120);

    fireEvent.change(secret, { target: { value: "A-7482" } });
    fireEvent.change(note, { target: { value: noteText } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ note: noteText }),
        `一份小心意在等你。惊喜暗号：A-7482。${noteText}`,
      ),
    );
  });

  it("disables theme buttons, inputs, and actions while sending", async () => {
    const deferred = createDeferred<{ ok: boolean; message?: string }>();
    const onSubmit = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();
    const { secret, note, submit } = setup(onSubmit, onClose);

    fireEvent.change(secret, { target: { value: "A-7482" } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "小小惊喜" }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
    expect(secret.disabled).toBe(true);
    expect(note.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "送出这份心意" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    deferred.resolve({ ok: true });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("ignores Escape while sending and retains values after the send fails", async () => {
    const deferred = createDeferred<{ ok: boolean; message?: string }>();
    const onSubmit = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();
    const { secret, note, submit } = setup(onSubmit, onClose);

    fireEvent.click(screen.getByRole("button", { name: "想说抱歉" }));
    fireEvent.change(secret, { target: { value: "A-7482" } });
    fireEvent.change(note, { target: { value: "是我不好。" } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "送出这份心意" }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );

    fireEvent.keyDown(secret, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    deferred.resolve({ ok: false, message: "发送失败，请稍后重试" });

    expect(await screen.findByText("发送失败，请稍后重试")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "想说抱歉" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(secret.value).toBe("A-7482");
    expect(note.value).toBe("是我不好。");
  });

  it("retains theme and field values after a failed submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      message: "发送失败，请稍后重试",
    });
    const onClose = vi.fn();
    const { secret, note, submit } = setup(onSubmit, onClose);

    fireEvent.click(screen.getByRole("button", { name: "想说抱歉" }));
    fireEvent.change(secret, { target: { value: "A-7482" } });
    fireEvent.change(note, { target: { value: "是我不好。" } });
    fireEvent.click(submit);

    expect(await screen.findByText("发送失败，请稍后重试")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "想说抱歉" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(secret.value).toBe("A-7482");
    expect(note.value).toBe("是我不好。");
  });

  it("closes with Cancel and Escape", () => {
    const onClose = vi.fn();
    const { secret } = setup(vi.fn(), onClose);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.keyDown(secret, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
