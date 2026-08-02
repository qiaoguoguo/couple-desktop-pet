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
import type { Application, Sprite } from "pixi.js";
import { builtInPetManifest, type PetActionName } from "../assets/builtInPetManifest";
import { getFrameIndex } from "./animationPlayer";
import { getActionDefinition, getFrameAssetUrl } from "./frameAtlas";

interface PixiPetStageProps {
  action: PetActionName;
  scale: number;
  onPetClick(): void;
  onDragStart(): void;
  onDragEnd(): void;
}

interface PixiStageInstance {
  app: Application;
  sprite: Sprite;
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
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const pixiStageRef = useRef<PixiStageInstance | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pixiReady, setPixiReady] = useState(false);
  const [textureReady, setTextureReady] = useState(false);
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
    let disposed = false;
    let app: Application | null = null;

    async function initPixiStage() {
      try {
        const [{ Application: PixiApplication, Sprite: PixiSprite, Texture }] =
          await Promise.all([import("pixi.js")]);
        const host = canvasHostRef.current;

        if (!host || disposed) {
          return;
        }

        app = new PixiApplication();
        await app.init({
          width: builtInPetManifest.baseSize.width,
          height: builtInPetManifest.baseSize.height,
          backgroundAlpha: 0,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });

        if (disposed) {
          app.destroy({ removeView: true }, { children: true });
          return;
        }

        const sprite = new PixiSprite(Texture.EMPTY);
        sprite.anchor.set(0.5);
        sprite.position.set(
          builtInPetManifest.baseSize.width / 2,
          builtInPetManifest.baseSize.height / 2,
        );
        app.stage.addChild(sprite);
        host.replaceChildren(app.canvas);
        pixiStageRef.current = { app, sprite };
        setPixiReady(true);
      } catch {
        setPixiReady(false);
        setTextureReady(false);
      }
    }

    void initPixiStage();

    return () => {
      disposed = true;
      pixiStageRef.current = null;
      canvasHostRef.current?.replaceChildren();
      app?.destroy({ removeView: true }, { children: true });
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadFrame() {
      if (!pixiStageRef.current || !currentFrameUrl) {
        setTextureReady(false);
        return;
      }

      try {
        const { Assets } = await import("pixi.js");
        const texture = await Assets.load(currentFrameUrl);

        if (!disposed && pixiStageRef.current) {
          pixiStageRef.current.sprite.texture = texture;
          pixiStageRef.current.sprite.scale.set(
            calculateSpriteFitScale(
              texture.width,
              texture.height,
              builtInPetManifest.baseSize.width,
              builtInPetManifest.baseSize.height,
            ),
          );
          setTextureReady(true);
        }
      } catch {
        if (!disposed) {
          setTextureReady(false);
        }
      }
    }

    void loadFrame();

    return () => {
      disposed = true;
    };
  }, [currentFrameUrl, pixiReady]);

  const showFallback = !pixiReady || !textureReady;
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
      <div
        ref={canvasHostRef}
        className={showFallback ? "pixi-canvas-host is-hidden" : "pixi-canvas-host"}
        aria-hidden={showFallback}
      />
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
