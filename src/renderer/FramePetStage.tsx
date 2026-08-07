import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
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
import { getFrameIndex } from "./animationPlayer";
import { EdgePetStage } from "./EdgePetStage";

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
  onPetClick(): void;
  onDragStart(): void;
  onDragEnd(): void;
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

export function FramePetStage({
  action,
  motion,
  scale,
  petPackage,
  edgeInteraction = null,
  onEdgePhaseComplete,
  onEdgePointerEnter,
  onEdgePointerLeave,
  onEdgeLoadError,
  onPetClick,
  onDragStart,
  onDragEnd,
}: FramePetStageProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

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

  const isEdgeInteraction = Boolean(edgeInteraction);
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

      activePointerIdRef.current = event.pointerId;
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
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

      const deltaX = event.clientX - pointerStart.x;
      const deltaY = event.clientY - pointerStart.y;

      if (Math.hypot(deltaX, deltaY) > dragClickThresholdPx) {
        if (!draggingRef.current) {
          draggingRef.current = true;
          onDragStart();
        }
      }
    },
    [onDragStart],
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
      onClick={isEdgeInteraction ? undefined : handleClick}
      onPointerDown={isEdgeInteraction ? undefined : handlePointerDown}
      onPointerMove={isEdgeInteraction ? undefined : handlePointerMove}
      onPointerUp={isEdgeInteraction ? undefined : finishDrag}
      onPointerCancel={isEdgeInteraction ? undefined : finishDrag}
      onPointerLeave={isEdgeInteraction ? undefined : finishDrag}
    >
      {edgeInteraction ? (
        <EdgePetStage
          profile={edgeInteraction.profile}
          phase={edgeInteraction.phase}
          scale={scale}
          onPhaseComplete={onEdgePhaseComplete ?? (() => undefined)}
          onPointerEnter={onEdgePointerEnter}
          onPointerLeave={onEdgePointerLeave}
          onPetClick={onPetClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onLoadError={onEdgeLoadError}
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
