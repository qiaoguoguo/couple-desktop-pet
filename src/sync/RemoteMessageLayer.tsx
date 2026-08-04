import { useEffect, useMemo, useState } from "react";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import { getFrameIndex } from "../renderer/animationPlayer";
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
  const [elapsedMs, setElapsedMs] = useState(0);
  const visitorAction = peerPackage?.actions["act-wave"] ?? null;

  useEffect(() => {
    setElapsedMs(0);
  }, [message?.id, peerPackage?.id]);

  useEffect(() => {
    if (!message || !visitorAction || visitorAction.frames.length === 0) {
      return;
    }

    const frameTimer = window.setInterval(() => {
      setElapsedMs((current) => current + 100);
    }, 100);

    return () => window.clearInterval(frameTimer);
  }, [message, visitorAction]);

  const imageUrl = useMemo(() => {
    if (visitorAction && visitorAction.frames.length > 0) {
      return (
        visitorAction.frames[
          getFrameIndex(
            elapsedMs,
            visitorAction.frames.length,
            visitorAction.fps,
            visitorAction.loop,
          )
        ] ?? visitorAction.frames[0]
      );
    }

    return (
      peerPackage?.previewUrl ??
      peerPackage?.actions["idle-breathe"].frames[0] ??
      null
    );
  }, [elapsedMs, peerPackage, visitorAction]);

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
