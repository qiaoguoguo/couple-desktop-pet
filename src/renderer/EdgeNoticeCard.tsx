import type { PointerEvent } from "react";
import type { EdgeSide } from "../pet/edgeInteraction";
import type { EdgeNoticeState } from "../pet/edgeNotice";
import { getEdgeNoticePlacement } from "./edgeCompanionLayout";

const surpriseHeartUrl = new URL(
  "../assets/ui/surprise/heart-surprise.png",
  import.meta.url,
).href;
const surpriseTitle = "有一份心意正在等你";
const surpriseDetail = "点一下，让惊喜慢慢打开";

type ActiveEdgeNotice = NonNullable<EdgeNoticeState["active"]>;

interface EdgeNoticeCardProps {
  side: EdgeSide;
  state: EdgeNoticeState;
  onPointerEnter?(): void;
  onPointerLeave?(): void;
  onActivate?(notice: ActiveEdgeNotice): void;
}

export function EdgeNoticeCard({
  side,
  state,
  onPointerEnter,
  onPointerLeave,
  onActivate,
}: EdgeNoticeCardProps) {
  const active = state.active;

  if (!active || state.presentation === "hidden") {
    return null;
  }

  const placement = getEdgeNoticePlacement(side);
  const sharedProps = {
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onPointerEnter?.();
    },
    onPointerLeave: (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onPointerLeave?.();
    },
    onClick: () => onActivate?.(active),
  };

  return (
    <div
      className="edge-notice-surface"
      data-testid="edge-notice-surface"
      data-edge-side={side}
      data-edge-notice-placement={
        side === "top" ? "inward-below" : "inward-adjacent"
      }
      data-edge-notice-axis={placement.axis}
      data-edge-notice-direction={placement.direction}
    >
      {state.presentation === "expanded" ? (
        <ExpandedNoticeButton notice={active} {...sharedProps} />
      ) : (
        <NoticeMarker notice={active} {...sharedProps} />
      )}
    </div>
  );
}

interface NoticeControlProps {
  notice: ActiveEdgeNotice;
  onPointerEnter(event: PointerEvent<HTMLButtonElement>): void;
  onPointerLeave(event: PointerEvent<HTMLButtonElement>): void;
  onClick(): void;
}

function ExpandedNoticeButton({
  notice,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: NoticeControlProps) {
  const title = notice.kind === "surprise" ? surpriseTitle : notice.title;
  const detail = notice.kind === "surprise" ? surpriseDetail : notice.detail;
  const iconUrl = notice.kind === "surprise" ? surpriseHeartUrl : notice.iconUrl;

  return (
    <button
      className={`edge-notice-card edge-notice-card--${notice.kind}`}
      type="button"
      aria-label={`${title} ${detail}`}
      data-edge-notice-kind={notice.kind}
      data-desktop-interactive-region=""
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <img
        className="edge-notice-icon"
        src={iconUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
      <span className="edge-notice-copy">
        <strong
          className={
            notice.kind === "message"
              ? "edge-notice-title edge-notice-title--ellipsis"
              : "edge-notice-title"
          }
        >
          {title}
        </strong>
        <small
          className={
            notice.kind === "message"
              ? "edge-notice-detail edge-notice-detail--ellipsis"
              : "edge-notice-detail"
          }
        >
          {detail}
        </small>
      </span>
    </button>
  );
}

function NoticeMarker({
  notice,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: NoticeControlProps) {
  if (notice.kind === "presence") {
    return (
      <button
        className={`edge-notice-marker edge-notice-marker--presence is-${notice.tone}`}
        type="button"
        aria-label={notice.tone === "online" ? "在线状态" : "离线状态"}
        data-desktop-interactive-region=""
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      >
        <span aria-hidden="true" />
      </button>
    );
  }

  if (notice.kind === "message") {
    return (
      <button
        className="edge-notice-marker edge-notice-marker--message"
        type="button"
        aria-label={`${notice.unreadCount} 条未读消息`}
        data-desktop-interactive-region=""
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      >
        {notice.unreadCount > 9 ? "9+" : String(notice.unreadCount)}
      </button>
    );
  }

  return (
    <button
      className="edge-notice-marker edge-notice-marker--surprise"
      type="button"
      aria-label="查看小心意"
      data-desktop-interactive-region=""
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <img
        src={surpriseHeartUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
    </button>
  );
}
