import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { PetActionName } from "../assets/petActionNames";
import type {
  ResolvedPetMotion,
  ResolvedPetPackage,
} from "../assets/petPackageRegistry";
import type {
  EdgeInteractionProfile,
  EdgePhase,
} from "../pet/edgeInteraction";
import type { EdgeNoticeState } from "../pet/edgeNotice";
import { EdgeCompanionStage } from "./EdgeCompanionStage";
import { EdgeNoticeCard } from "./EdgeNoticeCard";
import { getFrameIndex } from "./animationPlayer";
import { EdgePetStage } from "./EdgePetStage";
import {
  createFallbackCssAlphaBounds,
  mapAlphaBoundsToCssRect,
  resolveFrameAlphaBounds,
  type CssAlphaBounds,
} from "./frameAlphaBounds";

interface FramePetStageProps {
  action: PetActionName;
  motion: ResolvedPetMotion;
  scale: number;
  petPackage: ResolvedPetPackage;
  edgeInteraction?: {
    profile: EdgeInteractionProfile;
    phase: EdgePhase;
  } | null;
  onEdgePhaseComplete?(): void;
  onEdgePointerEnter?(): void;
  onEdgePointerLeave?(): void;
  onEdgeLoadError?(): void;
  edgeNotice?: EdgeNoticeState | null;
  onEdgeNoticePointerEnter?(): void;
  onEdgeNoticePointerLeave?(): void;
  onEdgeNoticeActivate?(notice: NonNullable<EdgeNoticeState["active"]>): void;
  onPetClick(): void;
  onDragStart(): void;
  onDragMove?(delta: { x: number; y: number }): void;
  onDragEnd(): void;
  children?: ReactNode;
}

const actionLabels: Record<PetActionName, string> = {
  "idle-breathe": "待机",
  "idle-look": "张望",
  "idle-stretch": "伸懒腰",
  walk: "散步",
  drag: "拖拽",
  sleep: "睡觉",
  "act-cute": "撒娇",
  "act-typing": "敲电脑",
  "act-wave": "打招呼",
  "act-hug": "求抱抱",
  "act-pout": "生气",
  "act-drowsy": "犯困",
};
const dragClickThresholdPx = 4;
const displayWidthPx = 256;
const displayHeightPx = 320;

export function FramePetStage({
  action,
  motion,
  scale,
  petPackage,
  edgeInteraction = null,
  onEdgeLoadError,
  edgeNotice = null,
  onEdgeNoticeActivate,
  onPetClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
}: FramePetStageProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragScreenPositionRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const draggingRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [alphaHitBounds, setAlphaHitBounds] = useState<CssAlphaBounds>(() =>
    createFallbackCssAlphaBounds(displayWidthPx, displayHeightPx),
  );

  const currentFrameUrl = useMemo(() => {
    if (!motion.frames.length) {
      return null;
    }

    const frameIndex = getFrameIndex(
      elapsedMs,
      motion.frames.length,
      motion.fps,
      motion.loop,
    );

    return motion.frames[frameIndex] ?? null;
  }, [elapsedMs, motion]);

  useEffect(() => {
    setElapsedMs(0);
  }, [motion.id, petPackage.id]);

  useEffect(() => {
    const frameTimer = window.setInterval(() => {
      setElapsedMs((current) => current + 100);
    }, 100);

    return () => window.clearInterval(frameTimer);
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [currentFrameUrl]);

  useEffect(() => {
    let disposed = false;

    if (!currentFrameUrl || imageFailed) {
      setAlphaHitBounds(
        createFallbackCssAlphaBounds(displayWidthPx, displayHeightPx),
      );
      return () => {
        disposed = true;
      };
    }

    setAlphaHitBounds(
      createFallbackCssAlphaBounds(displayWidthPx, displayHeightPx),
    );

    void resolveFrameAlphaBounds(currentFrameUrl).then((bounds) => {
      if (disposed) {
        return;
      }

      setAlphaHitBounds(
        bounds
          ? mapAlphaBoundsToCssRect(bounds, displayWidthPx, displayHeightPx)
          : createFallbackCssAlphaBounds(displayWidthPx, displayHeightPx),
      );
    });

    return () => {
      disposed = true;
    };
  }, [currentFrameUrl, imageFailed]);

  const isEdgeInteraction = Boolean(edgeInteraction);
  const useMicroCompanion = Boolean(
    edgeInteraction?.profile.companion &&
      edgeInteraction.profile.side !== "top" &&
      (edgeInteraction.phase === "idle" || edgeInteraction.phase === "react"),
  );
  const showLegacyTopNotice = Boolean(
    edgeNotice?.presentation === "expanded" &&
      (edgeNotice.active?.kind === "message" ||
        edgeNotice.active?.kind === "surprise") &&
      edgeInteraction?.profile.side === "top" &&
      (edgeInteraction.phase === "idle" || edgeInteraction.phase === "react"),
  );
  const showFallback = !currentFrameUrl || imageFailed;
  const stageStyle = {
    "--pet-scale": String(scale),
  } as CSSProperties;
  const finishDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      const wasDragging = draggingRef.current;

      if (wasDragging) {
        suppressNextClickRef.current = true;
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }

      activePointerIdRef.current = null;
      pointerStartRef.current = null;
      lastDragScreenPositionRef.current = null;
      draggingRef.current = false;

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (wasDragging) {
        onDragEnd();
      }
    },
    [onDragEnd],
  );
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== null) {
        return;
      }

      const screenPosition = readPointerScreenPosition(event);

      activePointerIdRef.current = event.pointerId;
      pointerStartRef.current = screenPosition;
      lastDragScreenPositionRef.current = screenPosition;
      draggingRef.current = false;
      suppressNextClickRef.current = false;

      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [],
  );
  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const pointerStart = pointerStartRef.current;

      if (activePointerIdRef.current !== event.pointerId || !pointerStart) {
        return;
      }

      const currentScreenPosition = readPointerScreenPosition(event);
      const deltaX = currentScreenPosition.x - pointerStart.x;
      const deltaY = currentScreenPosition.y - pointerStart.y;

      if (Math.hypot(deltaX, deltaY) > dragClickThresholdPx) {
        if (!draggingRef.current) {
          draggingRef.current = true;
          onDragStart();
        }

        const lastDragScreenPosition = lastDragScreenPositionRef.current;

        if (lastDragScreenPosition) {
          onDragMove?.({
            x: currentScreenPosition.x - lastDragScreenPosition.x,
            y: currentScreenPosition.y - lastDragScreenPosition.y,
          });
        }

        lastDragScreenPositionRef.current = currentScreenPosition;
      }
    },
    [onDragMove, onDragStart],
  );
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onPetClick();
    },
    [onPetClick],
  );
  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!suppressNextClickRef.current) {
      return;
    }

    suppressNextClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <div
      className={
        isEdgeInteraction
          ? `pet-frame-stage is-edge-interaction is-edge-${edgeInteraction?.profile.side}`
          : "pet-frame-stage"
      }
      data-action={action}
      data-motion-id={motion.id}
      data-pet-package-id={petPackage.id}
      data-edge-interaction-side={edgeInteraction?.profile.side}
      style={stageStyle}
      onClickCapture={handleClickCapture}
      onClick={isEdgeInteraction ? undefined : handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onPointerLeave={finishDrag}
    >
      {edgeInteraction && !useMicroCompanion ? (
        <EdgePetStage
          profile={edgeInteraction.profile}
          phase={edgeInteraction.phase}
          scale={scale}
          frozen={
            edgeInteraction.profile.side === "top" &&
            edgeInteraction.phase === "idle"
          }
          onLoadError={onEdgeLoadError}
        />
      ) : null}
      {showLegacyTopNotice && edgeNotice ? (
        <EdgeNoticeCard
          side="top"
          state={edgeNotice}
          onActivate={onEdgeNoticeActivate}
        />
      ) : null}
      {edgeInteraction?.profile.companion && useMicroCompanion ? (
        <EdgeCompanionStage
          profile={edgeInteraction.profile.companion}
          scale={scale}
          noticeState={edgeNotice}
          onNoticeActivate={onEdgeNoticeActivate}
          onLoadError={onEdgeLoadError}
        />
      ) : null}
      {!isEdgeInteraction ? children : null}
      {!isEdgeInteraction ? (
        <span
          className="pet-alpha-hit-region"
          data-testid="pet-alpha-hit-region"
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
      {!isEdgeInteraction && currentFrameUrl && !imageFailed ? (
        <img
          className="pet-frame-image"
          src={currentFrameUrl}
          alt={petPackage.name}
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {!isEdgeInteraction && showFallback ? (
        <div className="pet-dev-card pet-fallback-card" aria-label={`${petPackage.name}开发占位`}>
          <div className="pet-dev-face">
            <span>Q</span>
          </div>
          <p>{motion.id || actionLabels[action]}</p>
        </div>
      ) : null}
    </div>
  );
}

function readPointerScreenPosition(event: PointerEvent<HTMLDivElement>) {
  return {
    x: event.screenX,
    y: event.screenY,
  };
}
