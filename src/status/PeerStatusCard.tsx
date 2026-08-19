import { useEffect, useMemo, useState } from "react";
import type { PeerStatusView } from "./peerStatusPresentation";
import {
  peerDefaultAvatarAsset,
  peerPresenceSurfaceAsset,
} from "./statusIconAssets";

interface PeerStatusCardProps {
  view: PeerStatusView;
  imageCandidates?: readonly (string | null | undefined)[];
}

export function PeerStatusCard({
  view,
  imageCandidates = [],
}: PeerStatusCardProps) {
  const usableImageCandidates = useMemo(
    () =>
      normalizeImageCandidates([
        ...imageCandidates,
        peerDefaultAvatarAsset.src,
      ]),
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
  const statusLabel = useMemo(() => readCompactStatusLabel(view.title), [view.title]);

  useEffect(() => {
    setImageState((current) =>
      current.key === imageCandidatesKey
        ? current
        : { key: imageCandidatesKey, index: 0 },
    );
  }, [imageCandidatesKey]);

  return (
    <aside
      className="peer-presence-tag"
      aria-label="对方状态"
      data-status-variant={view.variant}
    >
      <img
        className="peer-presence-surface"
        src={peerPresenceSurfaceAsset.src}
        alt={peerPresenceSurfaceAsset.alt}
        aria-hidden="true"
        draggable={false}
      />
      <span className="peer-status-avatar" aria-hidden={imageUrl ? undefined : "true"}>
        {imageUrl ? (
          <img
            src={imageUrl}
            width={12}
            height={16}
            alt="对方头像"
            onError={() =>
              setImageState({
                key: imageCandidatesKey,
                index: imageIndex + 1,
              })
            }
          />
        ) : null}
      </span>
      <span key={view.variant} className="peer-status-content">
        <span className="peer-status-dot" aria-hidden="true" />
        <span className="peer-status-icon" aria-hidden="true">
          <img src={view.icon.src} alt="" draggable={false} />
        </span>
        <strong className="peer-status-label">{statusLabel}</strong>
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

function readCompactStatusLabel(title: string) {
  return title.replace(/\s+/g, "");
}
