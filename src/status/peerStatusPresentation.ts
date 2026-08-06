import {
  isActivityStatus,
  type ActivityStatus,
} from "../../shared/activityStatus";
import type {
  PeerPresence,
  SyncConnectionStatus,
} from "../sync/syncTypes";

export type PeerStatusVariant = "connecting" | "online" | "offline" | ActivityStatus;

export interface PeerStatusView {
  variant: PeerStatusVariant;
  title: string;
  detail: string;
  iconText: string;
}

export interface PeerStatusPresentationInput {
  paired: boolean;
  connectionStatus: SyncConnectionStatus;
  peerPresence: PeerPresence;
  peerActivityStatus: ActivityStatus | null | unknown;
}

const statusViews: Record<PeerStatusVariant, PeerStatusView> = {
  connecting: {
    variant: "connecting",
    title: "正在寻找TA",
    detail: "连接恢复后告诉你",
    iconText: "...",
  },
  offline: {
    variant: "offline",
    title: "TA 离线",
    detail: "等TA回来",
    iconText: "月",
  },
  online: {
    variant: "online",
    title: "TA 在线",
    detail: "正在陪你",
    iconText: "心",
  },
  slacking: {
    variant: "slacking",
    title: "TA 摸鱼中",
    detail: "偷偷歇一会",
    iconText: "鱼",
  },
  dazing: {
    variant: "dazing",
    title: "TA 发呆中",
    detail: "灵魂出走啦",
    iconText: "云",
  },
  overtime: {
    variant: "overtime",
    title: "TA 加班中",
    detail: "努力搬砖中",
    iconText: "班",
  },
};

export function resolvePeerStatusView({
  paired,
  connectionStatus,
  peerPresence,
  peerActivityStatus,
}: PeerStatusPresentationInput): PeerStatusView | null {
  if (!paired) {
    return null;
  }

  if (connectionStatus !== "connected" || peerPresence === "unknown") {
    return statusViews.connecting;
  }

  if (peerPresence === "offline") {
    return statusViews.offline;
  }

  if (isActivityStatus(peerActivityStatus)) {
    return statusViews[peerActivityStatus];
  }

  return statusViews.online;
}
