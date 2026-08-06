import type { SyncRuntimeState } from "./syncTypes";

export interface PeerPresenceLayerProps {
  status: SyncRuntimeState;
  peerImageUrl: string | null;
  onOpenMessageComposer(): void;
}

export function PeerPresenceLayer({
  status,
  peerImageUrl,
  onOpenMessageComposer,
}: PeerPresenceLayerProps) {
  if (status.status !== "connected" || status.peerPresence === "unknown") {
    return null;
  }

  const isOnline = status.peerPresence === "online";
  const label = isOnline ? "TA 在线" : "TA 离线";
  const detail = isOnline ? "正在陪你" : "等TA回来";
  const buttonLabel = isOnline ? "给在线的TA发消息" : "查看离线状态";

  return (
    <aside
      className={`peer-presence-layer is-${status.peerPresence}`}
      aria-label="对方在线状态"
    >
      <button
        type="button"
        className="peer-presence-card"
        aria-label={buttonLabel}
        onClick={isOnline ? onOpenMessageComposer : undefined}
      >
        <span className="peer-presence-avatar" aria-hidden={!peerImageUrl}>
          {peerImageUrl ? (
            <img src={peerImageUrl} alt="对方形象" draggable={false} />
          ) : (
            <span className="peer-presence-placeholder" aria-hidden="true">
              TA
            </span>
          )}
        </span>
        <span className="peer-presence-copy">
          <span className="peer-presence-label">
            <span className="peer-presence-dot" aria-hidden="true" />
            {label}
          </span>
          <span className="peer-presence-detail">{detail}</span>
        </span>
        {isOnline ? (
          <span className="peer-presence-heartline" aria-hidden="true" />
        ) : (
          <span className="peer-presence-nest" aria-label="离线留言小窝">
            月
          </span>
        )}
      </button>
    </aside>
  );
}
