import { TypewriterText } from "../ui/TypewriterText";
import type { RemoteMessageCard } from "./remoteMessageQueue";

export interface RemoteMessageLayerProps {
  message: RemoteMessageCard | null;
  onAcknowledge(messageId: string): void;
}

export function RemoteMessageLayer({
  message,
  onAcknowledge,
}: RemoteMessageLayerProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={`remote-message-layer is-${message.stage}`}
      role="status"
      aria-label="对方桌宠消息"
      aria-live="polite"
      onPointerEnter={() => onAcknowledge(message.id)}
    >
      <div className="remote-message-bubble">
        <TypewriterText text={message.text} />
      </div>
    </div>
  );
}
