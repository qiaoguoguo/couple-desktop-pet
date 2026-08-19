import type { EdgeNoticeState } from "../pet/edgeNotice";
import { peerDefaultAvatarAsset } from "../status/statusIconAssets";
import type { RemoteMessageQueueState } from "../sync/remoteMessageQueue";

const surpriseIconUrl = new URL(
  "../assets/ui/surprise/heart-surprise.png",
  import.meta.url,
).href;
const messageDetail = "有一句话想让你看见";
const surpriseTitle = "有一份心意正在等你";
const surpriseDetail = "点一下，让惊喜慢慢打开";

export function projectStaticEdgeNotice(
  remoteMessages: RemoteMessageQueueState,
): EdgeNoticeState | null {
  const activeRemote = remoteMessages.active;

  if (!activeRemote) {
    return null;
  }

  const unreadCount = 1 + remoteMessages.queue.length;
  const active =
    activeRemote.content?.kind === "surprise"
      ? {
          kind: "surprise" as const,
          id: activeRemote.id,
          title: surpriseTitle,
          detail: surpriseDetail,
          iconUrl: surpriseIconUrl,
          unreadCount,
        }
      : {
          kind: "message" as const,
          id: activeRemote.id,
          title: activeRemote.text,
          detail: messageDetail,
          iconUrl: peerDefaultAvatarAsset.src,
          unreadCount,
        };

  return {
    snapshot: {
      presence: null,
      remote: active,
    },
    active,
    presentation: "expanded",
    expiresAt: null,
    presenceMarker: null,
    announcedPresenceRevision: null,
    announcedRemoteId: active.id,
  };
}
