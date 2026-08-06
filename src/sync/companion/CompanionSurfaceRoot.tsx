import { useEffect, useMemo, useState } from "react";
import {
  listenCompanionScene,
  readCompanionScene,
  requestOpenMessageComposer,
} from "../../desktop/companionWindowCommands";
import type { CompanionPresence, CompanionSceneViewState } from "./companionSceneTypes";
import { usePresenceMotionDirector } from "./presenceMotionDirector";

export type CompanionSurface = "peer-presence" | "peer-link" | "offline-nest";

const SUPPORTED_SURFACES = new Set<CompanionSurface>([
  "peer-presence",
  "peer-link",
  "offline-nest",
]);
const LISTEN_RETRY_DELAY_MS = 140;
const READ_RETRY_DELAY_MS = 120;

export function readCompanionSurfaceFromSearch(
  search = window.location.search,
): CompanionSurface | null {
  const surface = new URLSearchParams(search).get("surface");

  return SUPPORTED_SURFACES.has(surface as CompanionSurface)
    ? (surface as CompanionSurface)
    : null;
}

export function readCompanionSurfaceFromLocation(
  search = window.location.search,
  hash = window.location.hash,
): CompanionSurface | null {
  return (
    readCompanionSurfaceFromSearch(hash.startsWith("#") ? hash.slice(1) : hash) ??
    readCompanionSurfaceFromSearch(search)
  );
}

export function readCompanionSurfaceFromLabel(
  label: string | null | undefined,
): CompanionSurface | null {
  return SUPPORTED_SURFACES.has(label as CompanionSurface)
    ? (label as CompanionSurface)
    : null;
}

export function CompanionSurfaceRoot({
  surface,
}: {
  surface: CompanionSurface;
}) {
  const state = useCompanionSceneState();

  if (!state || state.suspended || state.presence === "hidden") {
    return null;
  }

  if (surface === "peer-link") {
    return <PeerLinkSurface state={state} />;
  }

  if (surface === "offline-nest") {
    return <OfflineNestSurface state={state} />;
  }

  return <PeerPresenceSurface state={state} />;
}

function useCompanionSceneState(): CompanionSceneViewState | null {
  const [state, setState] = useState<CompanionSceneViewState | null>(null);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;
    let retryTimer: number | null = null;
    let listenRetryTimer: number | null = null;

    const applyState = (nextState: CompanionSceneViewState) => {
      if (active) {
        setState(nextState);
      }
    };

    const readCurrentState = (allowRetry: boolean) => {
      void readCompanionScene()
        .then(applyState)
        .catch(() => {
          if (active && allowRetry) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              readCurrentState(false);
            }, READ_RETRY_DELAY_MS);
          }
        });
    };

    const listenForUpdates = (allowRetry: boolean) => {
      void listenCompanionScene(applyState)
        .then((nextUnlisten) => {
          if (active) {
            unlisten = nextUnlisten;
          } else {
            nextUnlisten();
          }
        })
        .catch(() => {
          if (active && allowRetry) {
            listenRetryTimer = window.setTimeout(() => {
              listenRetryTimer = null;
              listenForUpdates(false);
            }, LISTEN_RETRY_DELAY_MS);
          }
        });
    };

    listenForUpdates(true);
    readCurrentState(true);

    return () => {
      active = false;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      if (listenRetryTimer !== null) {
        window.clearTimeout(listenRetryTimer);
      }
      unlisten?.();
    };
  }, []);

  return state;
}

function PeerPresenceSurface({
  state,
}: {
  state: CompanionSceneViewState;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const motion = usePresenceMotionDirector({
    presence: state.presence,
    suspended: state.suspended,
    reducedMotion,
  });
  const imageCandidates = usePresencePortraitCandidates(state);
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0);
  const imageUrl = imageCandidates[imageCandidateIndex] ?? null;
  const isOnline = state.presence === "online";
  const label = isOnline ? "TA 在线" : "TA 离线";
  const detail = isOnline ? "正在陪你" : "等TA回来";
  const image = imageUrl ? (
    <img
      src={imageUrl}
      alt="对方桌宠头像"
      onError={() => {
        setImageCandidateIndex((current) => current + 1);
      }}
    />
  ) : (
    <span className="companion-presence-placeholder" aria-hidden="true">
      TA
    </span>
  );

  useEffect(() => {
    setImageCandidateIndex(0);
  }, [
    state.offlinePortraitUrl,
    state.portraitUrl,
    state.previewUrl,
    state.motionFallbackUrl,
    state.presence,
    state.revision,
  ]);

  const content = (
    <>
      <span className="companion-presence-orb">{image}</span>
      <span className="companion-presence-badge" aria-hidden="true" />
      <span className="companion-presence-chips">
        <span>{label}</span>
        <span>{detail}</span>
      </span>
    </>
  );

  if (isOnline) {
    return (
      <button
        type="button"
        className={`companion-presence-surface is-${state.presence} is-${state.side}`}
        data-motion-phase={motion.phase}
        aria-label={`${label}，${detail}`}
        onMouseEnter={motion.onHover}
        onMouseDown={motion.onPress}
        onClick={() => {
          motion.onPress();
          void requestOpenMessageComposer();
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`companion-presence-surface is-${state.presence} is-${state.side}`}
      data-motion-phase={motion.phase}
      role="status"
    >
      {content}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    if (!media) {
      return;
    }

    const handleChange = () => setReducedMotion(media.matches);

    media.addEventListener?.("change", handleChange);

    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  return reducedMotion;
}

function PeerLinkSurface({ state }: { state: CompanionSceneViewState }) {
  if (state.compact || state.presence === "hidden") {
    return null;
  }
  const isOnline = state.presence === "online";

  return (
    <div
      className={`companion-link-surface is-${state.presence} is-${state.side}`}
      role="img"
      aria-label={isOnline ? "心动连线" : "月光连线"}
    >
      <span className="companion-link-visual" aria-hidden="true">
        <span className="companion-link-path" />
        {isOnline ? (
          <span className="companion-link-heart" />
        ) : (
          <span className="companion-link-moon-dot" />
        )}
      </span>
    </div>
  );
}

function OfflineNestSurface({ state }: { state: CompanionSceneViewState }) {
  if (state.presence !== "offline" || state.compact) {
    return null;
  }

  return (
    <div
      className={`companion-offline-nest-surface is-${state.side}`}
      role="img"
      aria-label="离线留言小窝"
    >
      <span className="companion-offline-nest-image" aria-hidden="true" />
    </div>
  );
}

function usePresencePortraitCandidates(
  state: CompanionSceneViewState,
): readonly string[] {
  return useMemo(() => {
    const candidates =
      state.presence === "offline"
        ? [
            state.offlinePortraitUrl,
            state.portraitUrl,
            state.previewUrl,
            state.motionFallbackUrl,
          ]
        : [state.portraitUrl, state.previewUrl, state.motionFallbackUrl];

    return candidates.filter((url): url is string => Boolean(url));
  }, [
    state.offlinePortraitUrl,
    state.portraitUrl,
    state.previewUrl,
    state.motionFallbackUrl,
    state.presence,
  ]);
}
