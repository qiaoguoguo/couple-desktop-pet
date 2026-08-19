import type { SurpriseMessageContent } from "../../shared/syncProtocol";
import { SurpriseMessageCard } from "../surprise/SurpriseMessageCard";
import { TypewriterText } from "../ui/TypewriterText";
import type { RemoteMessageCard } from "./remoteMessageQueue";

export interface RemoteMessageLayerProps {
  message: RemoteMessageCard | null;
  onAcknowledge(messageId: string): void;
  onReveal(messageId: string): void;
  onDismiss(messageId: string): void;
}

export function RemoteMessageLayer({
  message,
  onAcknowledge,
  onReveal,
  onDismiss,
}: RemoteMessageLayerProps) {
  if (!message) {
    return null;
  }

  if (isSurpriseMessage(message)) {
    return (
      <div
        className={`remote-message-layer remote-message-layer--surprise is-${message.stage}`}
        role="status"
        aria-label="对方小心意消息"
        aria-live="polite"
        data-desktop-interactive-region=""
      >
        <SurpriseMessageCard
          message={message}
          onReveal={onReveal}
          onDismiss={onDismiss}
        />
      </div>
    );
  }

  return (
    <div
      className={`remote-message-layer is-${message.stage}`}
      role="status"
      aria-label="对方桌宠消息"
      aria-live="polite"
      data-desktop-interactive-region=""
      onPointerEnter={() => onAcknowledge(message.id)}
    >
      <div className="remote-message-bubble">
        <TypewriterText text={message.text} />
      </div>
    </div>
  );
}

function isSurpriseMessage(
  message: RemoteMessageCard,
): message is RemoteMessageCard & { content: SurpriseMessageContent } {
  return message.content?.kind === "surprise";
}
