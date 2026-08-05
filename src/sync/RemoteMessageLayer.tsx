import { useEffect, useMemo, useState } from "react";
import type {
  ResolvedPetMotion,
  ResolvedPetPackage,
} from "../assets/petPackageRegistry";
import { getFrameIndex } from "../renderer/animationPlayer";
import { TypewriterText } from "../ui/TypewriterText";
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
  const visitorMotion = useMemo(
    () => resolveRemoteVisitorMotion(peerPackage),
    [peerPackage],
  );

  useEffect(() => {
    setElapsedMs(0);
  }, [message?.id, peerPackage?.id, visitorMotion?.id]);

  useEffect(() => {
    if (!message || !visitorMotion) {
      return;
    }

    const frameTimer = window.setInterval(() => {
      setElapsedMs((current) => current + 100);
    }, 100);

    return () => window.clearInterval(frameTimer);
  }, [message, visitorMotion]);

  const imageUrl = useMemo(() => {
    if (visitorMotion) {
      return (
        visitorMotion.frames[
          getFrameIndex(
            elapsedMs,
            visitorMotion.frames.length,
            visitorMotion.fps,
            visitorMotion.loop,
          )
        ] ?? visitorMotion.frames[0]
      );
    }

    return peerPackage?.previewUrl ?? null;
  }, [elapsedMs, peerPackage?.previewUrl, visitorMotion]);

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
      <div className="remote-message-bubble">
        <TypewriterText text={message.text} />
      </div>
    </div>
  );
}

function resolveRemoteVisitorMotion(
  peerPackage: ResolvedPetPackage | null,
): ResolvedPetMotion | null {
  if (!peerPackage) {
    return null;
  }

  const motions = Object.values(peerPackage.motions);
  const usableMotions = motions.filter((motion) => motion.frames.length > 0);

  return (
    usableMotions.find((motion) => motion.tags.includes("message")) ??
    usableMotions.find((motion) => motion.id === peerPackage.defaultMotionId) ??
    usableMotions[0] ??
    null
  );
}
