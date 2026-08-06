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

    void readCompanionScene().then((currentState) => {
      if (active) {
        setState(currentState);
      }
    });

    void listenCompanionScene((nextState) => {
      if (active) {
        setState(nextState);
      }
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten;
      } else {
        nextUnlisten();
      }
    });

    return () => {
      active = false;
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
  const imageUrl = usePresencePortraitUrl(state);
  const [imageFailed, setImageFailed] = useState(false);
  const isOnline = state.presence === "online";
  const label = isOnline ? "TA 在线" : "TA 离线";
  const detail = isOnline ? "正在陪你" : "等TA回来";
  const image = imageUrl && !imageFailed ? (
    <img
      src={imageUrl}
      alt="对方桌宠头像"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <span className="companion-presence-placeholder" aria-hidden="true">
      TA
    </span>
  );

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl, state.revision]);

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
  if (state.presence !== "online" || state.compact) {
    return null;
  }

  return (
    <div
      className={`companion-link-surface is-${state.side}`}
      role="img"
      aria-label="心动连线"
    >
      <span className="companion-link-line" aria-hidden="true" />
      <span className="companion-link-heart" aria-hidden="true" />
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

function usePresencePortraitUrl(state: CompanionSceneViewState): string | null {
  return useMemo(() => {
    if (state.presence === "offline") {
      return state.offlinePortraitUrl ?? state.portraitUrl;
    }

    return state.portraitUrl;
  }, [state.offlinePortraitUrl, state.portraitUrl, state.presence]);
}
