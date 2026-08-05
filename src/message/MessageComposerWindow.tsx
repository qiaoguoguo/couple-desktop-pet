import { useState, type KeyboardEvent } from "react";
import {
  closeCurrentMessageComposerWindow,
  emitMessageComposerSubmit,
} from "./messageComposerEvents";

interface MessageComposerWindowProps {
  emitSubmit?: (text: string) => Promise<void>;
  closeWindow?: () => Promise<void> | void;
}

export function MessageComposerWindow({
  emitSubmit = emitMessageComposerSubmit,
  closeWindow = closeCurrentMessageComposerWindow,
}: MessageComposerWindowProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const trimmed = text.trim();

  async function submit() {
    if (!trimmed) {
      setStatus("先写一点想说的话");
      return;
    }

    try {
      await emitSubmit(trimmed);
      await closeWindow();
    } catch {
      setStatus("发送窗口暂时不可用");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <main className="message-composer-shell">
      <section className="message-composer-card" aria-label="发送消息">
        <header>
          <h1>发消息</h1>
          <p>写给对方桌宠的一句话</p>
        </header>
        <textarea
          className="message-composer-textarea"
          aria-label="消息内容"
          maxLength={280}
          rows={5}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="message-composer-actions">
          <span>{text.length}/280</span>
          <button type="button" onClick={() => void submit()}>
            发送
          </button>
        </div>
        {status ? <p className="message-composer-status">{status}</p> : null}
      </section>
    </main>
  );
}
