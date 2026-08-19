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

      if (sending) {
        return;
      }

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
      className="composer-panel message-composer-panel"
      aria-label="发送消息"
      onKeyDown={handlePanelKeyDown}
    >
      <div
        className="composer-card-shell message-composer-card"
        data-desktop-interactive-region=""
      >
        <header className="composer-card-header">
          <h1 className="composer-title">发送消息</h1>
          <p className="composer-description">写给对方桌宠的一句话</p>
        </header>
        <textarea
          className="composer-field-control message-composer-textarea"
          aria-label="消息内容"
          maxLength={280}
          rows={5}
          value={text}
          disabled={sending}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleTextAreaKeyDown}
          autoFocus
        />
        <div className="composer-footer message-composer-actions">
          <span className="composer-meta">{text.length}/280</span>
          <div className="composer-actions message-composer-action-buttons">
            <button
              type="button"
              className="composer-action composer-action--secondary message-composer-cancel"
              disabled={sending}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="composer-action composer-action--primary"
              disabled={sending}
              onClick={() => void submit()}
            >
              {sending ? "发送中" : "发送"}
            </button>
          </div>
        </div>
        {status ? (
          <p className="composer-status message-composer-status">{status}</p>
        ) : null}
      </div>
    </section>
  );
}
