import { useEffect, useMemo, useState } from "react";
import type { PeerStatusView } from "./peerStatusPresentation";

interface PeerStatusCardProps {
  view: PeerStatusView;
  imageCandidates?: readonly (string | null | undefined)[];
}

export function PeerStatusCard({
  view,
  imageCandidates = [],
}: PeerStatusCardProps) {
  const usableImageCandidates = useMemo(
    () => imageCandidates.filter((candidate): candidate is string => Boolean(candidate)),
    [imageCandidates],
  );
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = usableImageCandidates[imageIndex] ?? null;

  useEffect(() => {
    setImageIndex(0);
  }, [usableImageCandidates]);

  return (
    <aside
      className="peer-status-card"
      aria-label="对方状态"
      data-status-variant={view.variant}
    >
      <span className="peer-status-avatar" aria-hidden={imageUrl ? undefined : "true"}>
        {imageUrl ? (
          <img
            src={imageUrl}
            width={28}
            height={28}
            alt="对方头像"
            onError={() => setImageIndex((current) => current + 1)}
          />
        ) : (
          "TA"
        )}
      </span>
      <span className="peer-status-copy">
        <strong>{view.title}</strong>
        <span>{view.detail}</span>
      </span>
      <span className="peer-status-icon" aria-hidden="true">
        {view.iconText}
      </span>
    </aside>
  );
}
