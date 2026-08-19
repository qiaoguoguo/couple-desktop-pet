import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import {
  edgeStageContactAnchors,
  getEdgePhaseMotion,
  type EdgeInteractionProfile,
  type EdgePhase,
} from "../pet/edgeInteraction";
import { getFrameIndex } from "./animationPlayer";
import {
  mapAlphaBoundsToCssRect,
  resolveFrameAlphaBounds,
  type CssAlphaBounds,
} from "./frameAlphaBounds";

interface EdgePetStageProps {
  profile: EdgeInteractionProfile;
  phase: EdgePhase;
  scale: number;
  frozen?: boolean;
  onPhaseComplete?(): void;
  onPointerEnter?(): void;
  onPointerLeave?(): void;
  onPetClick?(): void;
  onLoadError?(): void;
}

const displayWidthPx = 320;
const displayHeightPx = 360;

const phaseLabels: Record<EdgePhase, string> = {
  enter: "桌宠边缘进入",
  idle: "桌宠边缘待机",
  react: "桌宠边缘反应",
  exit: "桌宠边缘退出",
};

function formatPx(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;

  return `${normalized}px`;
}

export function EdgePetStage({
  profile,
  phase,
  scale,
  frozen = false,
  onPhaseComplete,
  onPointerEnter,
  onPointerLeave,
  onPetClick,
  onLoadError,
}: EdgePetStageProps) {
  const motion = useMemo(
    () => (frozen ? profile.idle : getEdgePhaseMotion(profile, phase)),
    [frozen, phase, profile],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const onPhaseCompleteRef = useRef(onPhaseComplete);
  const [alphaHitBounds, setAlphaHitBounds] = useState<CssAlphaBounds | null>(
    null,
  );
  const onLoadErrorRef = useRef(onLoadError);
  const loadGenerationRef = useRef(0);
  const failedGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    onPhaseCompleteRef.current = onPhaseComplete;
  }, [onPhaseComplete]);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    setFrameIndex(0);

    if (frozen) {
      return;
    }

    let animationFrame = 0;
    let startTime: number | null = null;
    let completed = false;
    let disposed = false;

    function tick(timestamp: number) {
      if (disposed) {
        return;
      }

      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsedMs = Math.max(0, timestamp - startTime);

      setFrameIndex(
        getFrameIndex(elapsedMs, motion.frames.length, motion.fps, motion.loop),
      );

      if (!motion.loop && elapsedMs >= motion.durationMs) {
        if (!completed) {
          completed = true;
          onPhaseCompleteRef.current?.();
        }

        return;
      }

      animationFrame = window.requestAnimationFrame(tick);
    }

    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [frozen, motion]);

  const handleClick = useCallback(
    (_event: MouseEvent<HTMLDivElement>) => {
      onPetClick?.();
    },
    [onPetClick],
  );

  const displayedFrameIndex = frozen ? 0 : frameIndex;
  const frameUrl =
    motion.frames[displayedFrameIndex] ?? motion.frames[0] ?? "";

  const recoverFromLoadFailure = useCallback((generation: number) => {
    if (
      loadGenerationRef.current !== generation ||
      failedGenerationRef.current === generation
    ) {
      return;
    }

    failedGenerationRef.current = generation;
    setAlphaHitBounds(null);
    onLoadErrorRef.current?.();
  }, []);

  useEffect(() => {
    let disposed = false;
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;

    if (!frameUrl) {
      setAlphaHitBounds(null);
      return () => {
        disposed = true;
      };
    }

    setAlphaHitBounds(null);

    void (async () => {
      try {
        const bounds = await resolveFrameAlphaBounds(frameUrl);

        if (disposed || loadGenerationRef.current !== generation) {
          return;
        }

        if (!bounds) {
          recoverFromLoadFailure(generation);
          return;
        }

        setAlphaHitBounds(
          mapAlphaBoundsToCssRect(bounds, displayWidthPx, displayHeightPx),
        );
      } catch {
        if (!disposed && loadGenerationRef.current === generation) {
          recoverFromLoadFailure(generation);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [frameUrl, recoverFromLoadFailure]);

  const handleImageError = useCallback(() => {
    recoverFromLoadFailure(loadGenerationRef.current);
  }, [recoverFromLoadFailure]);

  const frameAnchor = motion.frameAnchors[displayedFrameIndex] ??
    motion.frameAnchors[0] ??
    profile.contactAnchor;
  const stageContactAnchor = edgeStageContactAnchors[profile.side];
  const translateX =
    (stageContactAnchor.x - frameAnchor.x) * displayWidthPx * scale;
  const translateY =
    (stageContactAnchor.y - frameAnchor.y) * displayHeightPx * scale;
  const frameStyle = {
    transform: `translate(${formatPx(translateX)}, ${formatPx(translateY)}) scale(${scale})`,
    transformOrigin: `${formatPx(stageContactAnchor.x * displayWidthPx)} ${formatPx(
      stageContactAnchor.y * displayHeightPx,
    )}`,
  } satisfies CSSProperties;
  const hitRegionTransformStyle = {
    ...frameStyle,
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  } satisfies CSSProperties;

  return (
    <div
      className="edge-pet-stage"
      data-testid="edge-pet-stage"
      data-edge-phase={phase}
      data-frame-index={displayedFrameIndex}
      onClick={frozen ? undefined : handleClick}
      onPointerEnter={frozen ? undefined : onPointerEnter}
      onPointerLeave={frozen ? undefined : onPointerLeave}
    >
      <span
        className="edge-pet-hit-transform"
        style={hitRegionTransformStyle}
      >
        {alphaHitBounds ? (
          <span
            className="pet-alpha-hit-region"
            data-testid="edge-pet-alpha-hit-region"
            data-desktop-interactive-region=""
            style={{
              position: "absolute",
              left: alphaHitBounds.left,
              top: alphaHitBounds.top,
              width: alphaHitBounds.width,
              height: alphaHitBounds.height,
              pointerEvents: "none",
            }}
          />
        ) : null}
      </span>
      <img
        className="edge-pet-frame"
        src={frameUrl}
        alt={phaseLabels[phase]}
        draggable={false}
        style={frameStyle}
        onError={handleImageError}
      />
    </div>
  );
}
