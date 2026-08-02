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
import type { PetActionName } from "../assets/builtInPetManifest";
import { getFrameIndex } from "./animationPlayer";
import { getActionDefinition, getFrameAssetUrl } from "./frameAtlas";

interface PixiPetStageProps {
  action: PetActionName;
  scale: number;
  onPetClick(): void;
  onDragStart(): void;
  onDragEnd(): void;
}

const actionLabels: Record<PetActionName, string> = {
  idle: "待机",
  walk: "散步",
  drag: "拖拽",
  happy: "开心",
  sleep: "睡觉",
};
const dragClickThresholdPx = 4;

export function PixiPetStage({
  action,
  scale,
  onPetClick,
  onDragStart,
  onDragEnd,
}: PixiPetStageProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const actionDefinition = getActionDefinition(action);

  const currentFrameUrl = useMemo(() => {
    const frameIndex = getFrameIndex(
      elapsedMs,
      actionDefinition.frames.length,
      actionDefinition.fps,
      actionDefinition.loop,
    );

    return getFrameAssetUrl(actionDefinition.frames[frameIndex] ?? "");
  }, [actionDefinition, elapsedMs]);

  useEffect(() => {
    setElapsedMs(0);
  }, [action]);

  useEffect(() => {
    const frameTimer = window.setInterval(() => {
      setElapsedMs((current) => current + 100);
    }, 100);

    return () => window.clearInterval(frameTimer);
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [currentFrameUrl]);

  const showFallback = !currentFrameUrl || imageFailed;
  const stageStyle = { "--pet-scale": String(scale) } as CSSProperties;
  const finishDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      if (dragMovedRef.current) {
        suppressNextClickRef.current = true;
      }

      activePointerIdRef.current = null;
      pointerStartRef.current = null;
      dragMovedRef.current = false;

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      onDragEnd();
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
      dragMovedRef.current = false;
      suppressNextClickRef.current = false;

      event.currentTarget.setPointerCapture?.(event.pointerId);
      onDragStart();
    },
    [onDragStart],
  );
  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const pointerStart = pointerStartRef.current;

    if (activePointerIdRef.current !== event.pointerId || !pointerStart) {
      return;
    }

    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;

    if (Math.hypot(deltaX, deltaY) > dragClickThresholdPx) {
      dragMovedRef.current = true;
    }
  }, []);
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
      className="pixi-pet-stage"
      data-action={action}
      style={stageStyle}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onPointerLeave={finishDrag}
    >
      {currentFrameUrl && !imageFailed ? (
        <img
          className="pet-frame-image"
          src={currentFrameUrl}
          alt="星星睡衣小星人"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {showFallback ? (
        <div className="pet-dev-card pet-fallback-card" aria-label="星星睡衣小星人开发占位">
          <div className="pet-dev-face">
            <span>星</span>
          </div>
          <p>{actionLabels[action]}</p>
        </div>
      ) : null}
    </div>
  );
}

export function calculateSpriteFitScale(
  textureWidth: number,
  textureHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  if (
    textureWidth <= 0 ||
    textureHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return 1;
  }

  return Math.min(targetWidth / textureWidth, targetHeight / textureHeight);
}
