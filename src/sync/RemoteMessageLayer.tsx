import { useEffect, useState } from "react";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import type { RemoteMessageCard } from "./remoteMessageQueue";

export interface RemoteMessageLayerProps {
  message: RemoteMessageCard | null;
  peerPackage: ResolvedPetPackage | null;
  onAcknowledge(messageId: string): void;
}

export function RemoteMessageLayer({
  message,
  peerPackage,
  onAcknowledge,
}: RemoteMessageLayerProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const imageUrl =
    peerPackage?.previewUrl ??
    peerPackage?.actions["idle-breathe"].frames[0] ??
    null;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl, message?.id]);

  if (!message) {
    return null;
  }

  const peerName = peerPackage?.name ?? "对方桌宠";
  const shouldShowImage = Boolean(imageUrl) && !imageFailed;

  return (
    <div
      className={`remote-message-layer is-${message.stage}`}
      role="status"
      aria-label="对方桌宠消息"
      aria-live="polite"
      onPointerEnter={() => onAcknowledge(message.id)}
    >
      <figure className="remote-visitor">
        {shouldShowImage ? (
          <img
            className="remote-visitor-image"
            src={imageUrl ?? undefined}
            alt={`${peerName}来访`}
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            className="remote-visitor-fallback"
            role="img"
            aria-label="对方桌宠来访占位"
          >
            <span>友</span>
          </div>
        )}
        <figcaption>{peerName}</figcaption>
      </figure>
      <div className="remote-message-bubble">{message.text}</div>
    </div>
  );
}
