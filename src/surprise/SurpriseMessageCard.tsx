import type { SurpriseMessageContent } from "../../shared/syncProtocol";
import heartSurpriseIconUrl from "../assets/ui/surprise/heart-surprise.png";
import type { RemoteMessageCard } from "../sync/remoteMessageQueue";
import { getSurpriseThemeCopy } from "./surpriseThemes";

type SurpriseRemoteMessageCard = RemoteMessageCard & {
  content: SurpriseMessageContent;
};

interface SurpriseMessageCardProps {
  message: SurpriseRemoteMessageCard;
  onReveal(messageId: string): void;
  onDismiss(messageId: string): void;
}

export function SurpriseMessageCard({
  message,
  onReveal,
  onDismiss,
}: SurpriseMessageCardProps) {
  const copy = getSurpriseThemeCopy(message.content.theme);
  const revealed =
    message.stage === "revealed" || message.stage === "dismissing";

  if (!revealed) {
    return (
      <button
        type="button"
        className="surprise-message-card surprise-message-card--collapsed"
        aria-expanded="false"
        onClick={() => onReveal(message.id)}
      >
        <img src={heartSurpriseIconUrl} alt="" aria-hidden="true" />
        <span className="surprise-message-copy">
          <span className="surprise-message-eyebrow">
            {copy.collapsedEyebrow}
          </span>
          <span className="surprise-message-title">{copy.collapsedTitle}</span>
          <span className="surprise-message-hint">轻轻点开看看</span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={`surprise-message-card surprise-message-card--revealed ${
        message.stage === "dismissing" ? "is-dismissing" : ""
      }`}
      role="status"
      aria-label="小心意已展开"
    >
      <header className="surprise-message-revealed-header">
        <img src={heartSurpriseIconUrl} alt="" aria-hidden="true" />
        <span className="surprise-message-copy">
          <span className="surprise-message-eyebrow">
            {copy.revealedEyebrow}
          </span>
          <span className="surprise-message-title">{copy.revealedTitle}</span>
        </span>
      </header>

      <div className="surprise-message-secret">
        <span>惊喜暗号</span>
        <strong>{message.content.secret}</strong>
      </div>

      {message.content.note ? (
        <p className="surprise-message-note" data-testid="surprise-note">
          {message.content.note}
        </p>
      ) : null}

      <button
        type="button"
        className="surprise-message-dismiss"
        onClick={() => onDismiss(message.id)}
      >
        我收下啦
      </button>
    </div>
  );
}
