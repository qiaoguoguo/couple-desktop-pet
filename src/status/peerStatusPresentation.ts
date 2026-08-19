import {
  isActivityStatus,
  type ActivityStatus,
} from "../../shared/activityStatus";
import type {
  PeerPresence,
  SyncConnectionStatus,
} from "../sync/syncTypes";
import { readActivityStatusIcon } from "./activityStatusDisplay";
import {
  peerStatusIconAssets,
  type StatusIconAsset,
} from "./statusIconAssets";

export type PeerStatusVariant =
  | "connecting"
  | "online"
  | "offline"
  | ActivityStatus;

export interface PeerStatusView {
  variant: PeerStatusVariant;
  title: string;
  detail: string;
  icon: StatusIconAsset;
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
    icon: peerStatusIconAssets.connecting,
  },
  offline: {
    variant: "offline",
    title: "TA 离线",
    detail: "等TA回来",
    icon: peerStatusIconAssets.offline,
  },
  online: {
    variant: "online",
    title: "TA 在线",
    detail: "正在陪你",
    icon: readActivityStatusIcon(null),
  },
  slacking: {
    variant: "slacking",
    title: "TA 摸鱼中",
    detail: "偷偷歇一会",
    icon: readActivityStatusIcon("slacking"),
  },
  dazing: {
    variant: "dazing",
    title: "TA 发呆中",
    detail: "灵魂出走啦",
    icon: readActivityStatusIcon("dazing"),
  },
  overtime: {
    variant: "overtime",
    title: "TA 加班中",
    detail: "努力搬砖中",
    icon: readActivityStatusIcon("overtime"),
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
