import { useState, type FormEvent } from "react";
import type { SyncSettings } from "../settings/settingsTypes";
import type { SessionMessage, SyncRuntimeState } from "./syncTypes";

export interface SyncPanelProps {
  sync: SyncSettings;
  status: SyncRuntimeState;
  messages: SessionMessage[];
  pairCode: { code: string; expiresAt: string } | null;
  onSyncChange(patch: Partial<SyncSettings>): void;
  onCreatePairCode(): void;
  onAcceptPairCode(code: string): void;
  onSendMessage(text: string): void;
}

export function SyncPanel({
  sync,
  status,
  messages,
  pairCode,
  onSyncChange,
  onCreatePairCode,
  onAcceptPairCode,
  onSendMessage,
}: SyncPanelProps) {
  const [acceptCode, setAcceptCode] = useState("");
  const [messageText, setMessageText] = useState("");
  const controlsDisabled = !sync.enabled;
  const canSend =
    sync.enabled &&
    Boolean(sync.pairId) &&
    status.status === "connected" &&
    status.peerPresence === "online";
  const sendDisabled = !canSend;
  const peerUnavailableMessage =
    sync.enabled && sync.pairId && !canSend
      ? "对方当前不在线"
      : null;

  function handleAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = acceptCode.trim();
    if (code) {
      onAcceptPairCode(code);
      setAcceptCode("");
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = messageText.trim();
    if (text) {
      onSendMessage(text);
      setMessageText("");
    }
  }

  return (
    <section className="sync-panel" aria-label="远程互动">
      <div className="sync-panel-header">
        <h2>远程互动</h2>
        <span>{readPresenceLabel(status)}</span>
      </div>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={sync.enabled}
          onChange={(event) => onSyncChange({ enabled: event.currentTarget.checked })}
        />
        <span>启用远程互动</span>
      </label>

      <label className="sync-field">
        <span>中继地址</span>
        <input
          type="url"
          value={sync.relayUrl}
          disabled={controlsDisabled}
          onChange={(event) => onSyncChange({ relayUrl: event.currentTarget.value })}
        />
      </label>

      <div className="sync-pair-actions">
        <button type="button" disabled={controlsDisabled} onClick={onCreatePairCode}>
          生成绑定码
        </button>
        {pairCode ? (
          <output className="sync-pair-code" aria-label="当前绑定码">
            {pairCode.code}
          </output>
        ) : null}
      </div>

      <form className="sync-inline-form" onSubmit={handleAccept}>
        <label className="sync-field">
          <span>输入绑定码</span>
          <input
            type="text"
            inputMode="numeric"
            value={acceptCode}
            disabled={controlsDisabled}
            onChange={(event) => setAcceptCode(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={controlsDisabled}>
          绑定
        </button>
      </form>

      <div className="sync-message-list" aria-label="当前会话消息">
        {messages.map((message) => (
          <p key={message.id} className={`sync-message is-${message.direction}`}>
            {message.text}
          </p>
        ))}
      </div>

      <form className="sync-inline-form" onSubmit={handleSend}>
        <label className="sync-field">
          <span>发送消息</span>
          <textarea
            rows={2}
            value={messageText}
            disabled={sendDisabled}
            onChange={(event) => setMessageText(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={sendDisabled}>
          发送
        </button>
      </form>

      {peerUnavailableMessage ? (
        <p className="sync-error">{peerUnavailableMessage}</p>
      ) : null}
      {status.lastError ? <p className="sync-error">{status.lastError}</p> : null}
    </section>
  );
}

function readPresenceLabel(status: SyncRuntimeState): string {
  if (status.status === "connecting") {
    return "连接中";
  }

  if (status.status === "authFailed") {
    return "认证失败";
  }

  if (status.status !== "connected") {
    return "未连接";
  }

  if (status.peerPresence === "online") {
    return "对方在线";
  }

  if (status.peerPresence === "offline") {
    return "对方离线";
  }

  return "未连接";
}
