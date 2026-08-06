import type { CSSProperties, ReactNode } from "react";
import type { SyncRuntimeState } from "./syncTypes";

export const PEER_PRESENCE_WINDOW_WIDTH_PX = 320;
export const PEER_PRESENCE_RIGHT_PX = 14;
export const PEER_PRESENCE_TOP_PX = 28;
export const PEER_PRESENCE_GROUP_WIDTH_PX = 148;
export const PEER_PRESENCE_GROUP_HEIGHT_PX = 132;
export const PEER_PRESENCE_ORB_SIZE_PX = 76;
const PEER_PRESENCE_HEARTLINE_LEFT_OFFSET_PX = -56;
const PEER_PRESENCE_HEARTLINE_WIDTH_PX = 62;

export interface PeerPresenceLayerProps {
  status: SyncRuntimeState;
  peerImageUrl: string | null;
  onOpenMessageComposer(): void;
}

export function getPeerPresenceLayoutBounds({
  windowWidth = PEER_PRESENCE_WINDOW_WIDTH_PX,
  right = PEER_PRESENCE_RIGHT_PX,
  width = PEER_PRESENCE_GROUP_WIDTH_PX,
}: {
  windowWidth?: number;
  right?: number;
  width?: number;
} = {}) {
  const groupLeft = windowWidth - right - width;
  const groupRight = windowWidth - right;

  return {
    group: {
      left: groupLeft,
      right: groupRight,
    },
    heartline: {
      left: groupLeft + PEER_PRESENCE_HEARTLINE_LEFT_OFFSET_PX,
      right:
        groupLeft +
        PEER_PRESENCE_HEARTLINE_LEFT_OFFSET_PX +
        PEER_PRESENCE_HEARTLINE_WIDTH_PX,
    },
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
    "--peer-presence-top": `${PEER_PRESENCE_TOP_PX}px`,
    "--peer-presence-right": `${PEER_PRESENCE_RIGHT_PX}px`,
    "--peer-presence-group-width": `${PEER_PRESENCE_GROUP_WIDTH_PX}px`,
    "--peer-presence-group-height": `${PEER_PRESENCE_GROUP_HEIGHT_PX}px`,
    "--peer-presence-orb-size": `${PEER_PRESENCE_ORB_SIZE_PX}px`,
    "--peer-presence-heartline-left": `${PEER_PRESENCE_HEARTLINE_LEFT_OFFSET_PX}px`,
    "--peer-presence-heartline-width": `${PEER_PRESENCE_HEARTLINE_WIDTH_PX}px`,
  } as CSSProperties;
  const cardContent = (
    <>
      <span className="peer-presence-heartline" aria-hidden="true">
        <span className="peer-presence-heartline-end" aria-hidden="true" />
      </span>
      <span className="peer-presence-orb" aria-hidden={!peerImageUrl}>
        {peerImageUrl ? (
          <img src={peerImageUrl} alt="对方头像" draggable={false} />
        ) : (
          <span className="peer-presence-placeholder" aria-hidden="true">
            TA
          </span>
        )}
      </span>
      {isOnline ? (
        <span className="peer-presence-heart-badge" aria-label="在线心动角标" />
      ) : (
        <span className="peer-presence-moon" aria-label="离线月亮标记" />
      )}
      <span className="peer-presence-chips">
        <span className="peer-presence-chip peer-presence-label">
          <span className="peer-presence-dot" aria-hidden="true" />
          {label}
        </span>
        <span className="peer-presence-chip peer-presence-detail">{detail}</span>
      </span>
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
