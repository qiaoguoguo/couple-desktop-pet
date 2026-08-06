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
    () => normalizeImageCandidates(imageCandidates),
    [imageCandidates],
  );
  const imageCandidatesKey = useMemo(
    () => JSON.stringify(usableImageCandidates),
    [usableImageCandidates],
  );
  const [imageState, setImageState] = useState({
    key: imageCandidatesKey,
    index: 0,
  });
  const imageIndex =
    imageState.key === imageCandidatesKey ? imageState.index : 0;
  const imageUrl = usableImageCandidates[imageIndex] ?? null;

  useEffect(() => {
    setImageState((current) =>
      current.key === imageCandidatesKey
        ? current
        : { key: imageCandidatesKey, index: 0 },
    );
  }, [imageCandidatesKey]);

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
            onError={() =>
              setImageState({
                key: imageCandidatesKey,
                index: imageIndex + 1,
              })
            }
          />
        ) : (
          "TA"
        )}
      </span>
      <span key={view.variant} className="peer-status-content">
        <span className="peer-status-copy">
          <span className="peer-status-title">
            <span className="peer-status-dot" aria-hidden="true" />
            <strong>{view.title}</strong>
          </span>
          <span className="peer-status-detail">{view.detail}</span>
        </span>
        <span className="peer-status-icon" aria-hidden="true">
          {view.iconText}
        </span>
      </span>
    </aside>
  );
}

function normalizeImageCandidates(
  imageCandidates: readonly (string | null | undefined)[],
) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of imageCandidates) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    normalized.push(candidate);
  }

  return normalized;
}
