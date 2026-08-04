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
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import { getFrameIndex } from "./animationPlayer";

interface FramePetStageProps {
  action: PetActionName;
  scale: number;
  petPackage: ResolvedPetPackage;
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
  scale,
  petPackage,
  onPetClick,
  onDragStart,
  onDragEnd,
}: FramePetStageProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const actionDefinition = petPackage.actions[action];

  const currentFrameUrl = useMemo(() => {
    if (!actionDefinition.frames.length) {
      return null;
    }

    const frameIndex = getFrameIndex(
      elapsedMs,
      actionDefinition.frames.length,
      actionDefinition.fps,
      actionDefinition.loop,
    );

    return actionDefinition.frames[frameIndex] ?? null;
  }, [actionDefinition, elapsedMs]);

  useEffect(() => {
    setElapsedMs(0);
  }, [action, petPackage.id]);

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
      className="pet-frame-stage"
      data-action={action}
      data-pet-package-id={petPackage.id}
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
          alt={petPackage.name}
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {showFallback ? (
        <div className="pet-dev-card pet-fallback-card" aria-label={`${petPackage.name}开发占位`}>
          <div className="pet-dev-face">
            <span>Q</span>
          </div>
          <p>{actionLabels[action]}</p>
        </div>
      ) : null}
    </div>
  );
}
