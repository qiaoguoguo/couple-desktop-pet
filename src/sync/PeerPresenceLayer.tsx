import type { CSSProperties, ReactNode } from "react";
import type { SyncRuntimeState } from "./syncTypes";

export const PEER_PRESENCE_WINDOW_WIDTH_PX = 320;
export const PEER_PRESENCE_RIGHT_PX = 8;
export const PEER_PRESENCE_CARD_WIDTH_PX = 124;

export interface PeerPresenceLayerProps {
  status: SyncRuntimeState;
  peerImageUrl: string | null;
  onOpenMessageComposer(): void;
}

export function getPeerPresenceHorizontalBounds({
  windowWidth = PEER_PRESENCE_WINDOW_WIDTH_PX,
  right = PEER_PRESENCE_RIGHT_PX,
  width = PEER_PRESENCE_CARD_WIDTH_PX,
}: {
  windowWidth?: number;
  right?: number;
  width?: number;
} = {}) {
  return {
    left: windowWidth - right - width,
    right: windowWidth - right,
  };
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
  const layoutStyle = {
    "--peer-presence-right": `${PEER_PRESENCE_RIGHT_PX}px`,
    "--peer-presence-card-width": `${PEER_PRESENCE_CARD_WIDTH_PX}px`,
  } as CSSProperties;
  const cardContent = (
    <>
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
    </>
  );

  return (
    <aside
      className={`peer-presence-layer is-${status.peerPresence}`}
      aria-label="对方在线状态"
      style={layoutStyle}
    >
      {isOnline ? (
        <PresenceCardButton onClick={onOpenMessageComposer}>
          {cardContent}
        </PresenceCardButton>
      ) : (
        <div
          className="peer-presence-card"
          role="status"
          aria-label="对方离线状态"
        >
          {cardContent}
        </div>
      )}
    </aside>
  );
}

function PresenceCardButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="peer-presence-card"
      aria-label="给在线的TA发消息"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
