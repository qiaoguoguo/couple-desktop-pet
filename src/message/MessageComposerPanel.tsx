import { useState, type KeyboardEvent } from "react";

export interface MessageComposerPanelResult {
  ok: boolean;
  message?: string;
}

interface MessageComposerPanelProps {
  onSubmit(text: string): MessageComposerPanelResult | Promise<MessageComposerPanelResult>;
  onClose(): void;
}

export function MessageComposerPanel({
  onSubmit,
  onClose,
}: MessageComposerPanelProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const trimmed = text.trim();

  async function submit() {
    if (sending) {
      return;
    }

    if (!trimmed) {
      setStatus("先写一点想说的话");
      return;
    }

    setStatus(null);
    setSending(true);

    try {
      const result = await onSubmit(trimmed);

      if (result.ok) {
        onClose();
        return;
      }

      setStatus(result.message ?? "发送失败，请稍后重试");
      setSending(false);
    } catch {
      setStatus("发送失败，请稍后重试");
      setSending(false);
    }
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function handleTextAreaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <section
      className="message-composer-panel"
      aria-label="发送消息"
      onKeyDown={handlePanelKeyDown}
    >
      <div className="message-composer-card">
        <header>
          <h1>发送消息</h1>
          <p>写给对方桌宠的一句话</p>
        </header>
        <textarea
          className="message-composer-textarea"
          aria-label="消息内容"
          maxLength={280}
          rows={5}
          value={text}
          disabled={sending}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleTextAreaKeyDown}
          autoFocus
        />
        <div className="message-composer-actions">
          <span>{text.length}/280</span>
          <div className="message-composer-action-buttons">
            <button
              type="button"
              className="message-composer-cancel"
              onClick={onClose}
            >
              取消
            </button>
            <button type="button" disabled={sending} onClick={() => void submit()}>
              {sending ? "发送中" : "发送"}
            </button>
          </div>
        </div>
        {status ? <p className="message-composer-status">{status}</p> : null}
      </div>
    </section>
  );
}
