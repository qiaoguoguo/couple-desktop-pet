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
import {
  getEdgePhaseMotion,
  type EdgeInteractionProfile,
  type EdgePhase,
} from "../pet/edgeInteraction";
import { getFrameIndex } from "./animationPlayer";

interface EdgePetStageProps {
  profile: EdgeInteractionProfile;
  phase: EdgePhase;
  scale: number;
  onPhaseComplete(): void;
  onPointerEnter?(): void;
  onPointerLeave?(): void;
  onPetClick?(): void;
  onDragStart?(): void;
  onDragEnd?(): void;
  onLoadError?(): void;
}

const displayWidthPx = 320;
const displayHeightPx = 360;
const dragClickThresholdPx = 4;

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

export function preloadEdgeFrames(frames: readonly string[]): Promise<void> {
  if (typeof Image === "undefined") {
    return Promise.resolve();
  }

  return Promise.all(
    frames.map(
      (frame) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();

          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Failed to preload ${frame}`));
          image.src = frame;
        }),
    ),
  ).then(() => undefined);
}

export function EdgePetStage({
  profile,
  phase,
  scale,
  onPhaseComplete,
  onPointerEnter,
  onPointerLeave,
  onPetClick,
  onDragStart,
  onDragEnd,
  onLoadError,
}: EdgePetStageProps) {
  const motion = useMemo(
    () => getEdgePhaseMotion(profile, phase),
    [phase, profile],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    let animationFrame = 0;
    let startTime: number | null = null;
    let completed = false;
    let disposed = false;

    setFrameIndex(0);

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
          onPhaseComplete();
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
  }, [motion, onPhaseComplete]);

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
        onDragEnd?.();
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
          onDragStart?.();
        }
      }
    },
    [onDragStart],
  );

  const handlePointerLeave = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.();
      finishDrag(event);
    },
    [finishDrag, onPointerLeave],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onPetClick?.();
    },
    [onPetClick],
  );

  const frameUrl = motion.frames[frameIndex] ?? motion.frames[0] ?? "";
  const frameAnchor = motion.frameAnchors[frameIndex] ??
    motion.frameAnchors[0] ??
    profile.contactAnchor;
  const translateX = (profile.contactAnchor.x - frameAnchor.x) * displayWidthPx;
  const translateY = (profile.contactAnchor.y - frameAnchor.y) * displayHeightPx;
  const frameStyle = {
    transform: `translate(${formatPx(translateX)}, ${formatPx(translateY)}) scale(${scale})`,
    transformOrigin: `${formatPx(profile.contactAnchor.x * displayWidthPx)} ${formatPx(
      profile.contactAnchor.y * displayHeightPx,
    )}`,
  } satisfies CSSProperties;

  return (
    <div
      className="edge-pet-stage"
      data-testid="edge-pet-stage"
      data-edge-phase={phase}
      data-frame-index={frameIndex}
      onClick={handleClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <img
        className="edge-pet-frame"
        src={frameUrl}
        alt={phaseLabels[phase]}
        draggable={false}
        style={frameStyle}
        onError={onLoadError}
      />
    </div>
  );
}
