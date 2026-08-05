import { useEffect, useState, type KeyboardEvent } from "react";
import {
  closeCurrentMessageComposerWindow,
  emitMessageComposerSubmit,
  listenForMessageComposerResult,
  type MessageComposerResultPayload,
} from "./messageComposerEvents";

interface MessageComposerWindowProps {
  emitSubmit?: (text: string) => Promise<void>;
  listenForResult?: (
    handler: (payload: MessageComposerResultPayload) => void,
  ) => Promise<() => void>;
  closeWindow?: () => Promise<void> | void;
}

export function MessageComposerWindow({
  emitSubmit = emitMessageComposerSubmit,
  listenForResult = listenForMessageComposerResult,
  closeWindow = closeCurrentMessageComposerWindow,
}: MessageComposerWindowProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const trimmed = text.trim();

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForResult((result) => {
      if (disposed) {
        return;
      }

      if (result.ok) {
        void closeWindow();
        return;
      }

      setStatus(result.message ?? "发送失败，请稍后重试");
      setSending(false);
    })
      .then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      })
      .catch(() => {
        if (!disposed) {
          setStatus("发送窗口暂时不可用");
          setSending(false);
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [closeWindow, listenForResult]);

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
      await emitSubmit(trimmed);
    } catch {
      setStatus("发送窗口暂时不可用");
      setSending(false);
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
          disabled={sending}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="message-composer-actions">
          <span>{text.length}/280</span>
          <button type="button" disabled={sending} onClick={() => void submit()}>
            {sending ? "发送中" : "发送"}
          </button>
        </div>
        {status ? <p className="message-composer-status">{status}</p> : null}
      </section>
    </main>
  );
}
