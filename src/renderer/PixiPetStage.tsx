import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

export function PixiPetStage({
  action,
  scale,
  onPetClick,
  onDragStart,
  onDragEnd,
}: PixiPetStageProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const pixiStageRef = useRef<PixiStageInstance | null>(null);
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

  return (
    <div
      className="pixi-pet-stage"
      data-action={action}
      style={stageStyle}
      onClick={onPetClick}
      onPointerDown={onDragStart}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      onPointerLeave={onDragEnd}
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
