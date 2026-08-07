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
  onUnpair(): void;
}

export function SyncPanel({
  sync,
  status,
  messages,
  pairCode,
  onCreatePairCode,
  onAcceptPairCode,
  onUnpair,
}: SyncPanelProps) {
  const [acceptCode, setAcceptCode] = useState("");
  const pairStatusText = sync.pairId
    ? "已绑定"
    : pairCode
      ? "等待对方输入绑定码"
      : null;

  function handleAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = acceptCode.trim();
    if (code) {
      onAcceptPairCode(code);
      setAcceptCode("");
    }
  }

  return (
    <section className="sync-panel" aria-label="远程互动">
      <div className="sync-panel-header">
        <h2>远程互动</h2>
        <span>{readPresenceLabel(status)}</span>
      </div>

      <div className="sync-pair-actions">
        <button
          type="button"
          disabled={Boolean(sync.pairId)}
          onClick={onCreatePairCode}
        >
          生成绑定码
        </button>
        {pairCode ? (
          <output className="sync-pair-code" aria-label="当前绑定码">
            {pairCode.code}
          </output>
        ) : null}
        {pairStatusText ? <span className="sync-pair-status">{pairStatusText}</span> : null}
        {sync.pairId ? (
          <button type="button" className="sync-unpair" onClick={onUnpair}>
            取消绑定
          </button>
        ) : null}
      </div>

      <form className="sync-inline-form" onSubmit={handleAccept}>
        <label className="sync-field">
          <span>输入绑定码</span>
          <input
            aria-label="输入绑定码"
            type="text"
            inputMode="numeric"
            value={acceptCode}
            onChange={(event) => setAcceptCode(event.currentTarget.value)}
          />
        </label>
        <button type="submit">
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
