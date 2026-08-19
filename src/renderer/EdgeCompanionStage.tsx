import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { EdgeCompanionVisualProfile } from "../pet/edgeInteraction";
import type { EdgeNoticeState } from "../pet/edgeNotice";
import { EdgeNoticeCard } from "./EdgeNoticeCard";
import {
  getEdgeCompanionLayout,
  type EdgeCompanionLayout,
} from "./edgeCompanionLayout";
import {
  resolveFrameAlphaBounds,
  type FrameAlphaBounds,
} from "./frameAlphaBounds";

type ActiveEdgeNotice = NonNullable<EdgeNoticeState["active"]>;

interface EdgeCompanionStageProps {
  profile: EdgeCompanionVisualProfile;
  scale: number;
  noticeState?: EdgeNoticeState | null;
  onNoticeActivate?(notice: ActiveEdgeNotice): void;
  onLoadError?(): void;
}

export function EdgeCompanionStage({
  profile,
  scale,
  noticeState = null,
  onNoticeActivate,
  onLoadError,
}: EdgeCompanionStageProps) {
  const [assetFailed, setAssetFailed] = useState(false);
  const [alphaBounds, setAlphaBounds] = useState<FrameAlphaBounds | null>(null);
  const onLoadErrorRef = useRef(onLoadError);
  const loadGenerationRef = useRef(0);
  const failedGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  const recoverFromLoadFailure = useCallback((generation: number) => {
    if (failedGenerationRef.current === generation) {
      return;
    }

    failedGenerationRef.current = generation;
    setAssetFailed(true);
    setAlphaBounds(null);
    onLoadErrorRef.current?.();
  }, []);

  useEffect(() => {
    let disposed = false;
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setAssetFailed(false);
    setAlphaBounds(null);

    void (async () => {
      try {
        const bounds = await resolveFrameAlphaBounds(profile.idleUrl);

        if (disposed) {
          return;
        }

        if (bounds) {
          setAlphaBounds(bounds);
        } else {
          recoverFromLoadFailure(generation);
        }
      } catch {
        if (!disposed) {
          recoverFromLoadFailure(generation);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [profile.idleUrl, recoverFromLoadFailure]);

  const layout = useMemo(
    () => getEdgeCompanionLayout(profile, scale, alphaBounds, "idle"),
    [alphaBounds, profile, scale],
  );
  const handleAssetError = useCallback(() => {
    recoverFromLoadFailure(loadGenerationRef.current);
  }, [recoverFromLoadFailure]);
  const activeNotice = noticeState?.active;
  const showExpandedRemoteNotice =
    noticeState?.presentation === "expanded" &&
    (activeNotice?.kind === "message" || activeNotice?.kind === "surprise");

  return (
    <div
      className="edge-companion-stage"
      data-testid="edge-companion-stage"
      data-edge-side={profile.side}
    >
      {!assetFailed && alphaBounds ? (
        <CompanionVisual
          profile={profile}
          layout={layout}
          onAssetError={handleAssetError}
        />
      ) : null}
      {showExpandedRemoteNotice && noticeState ? (
        <EdgeNoticeCard
          side={profile.side}
          state={noticeState}
          onActivate={onNoticeActivate}
        />
      ) : null}
    </div>
  );
}

interface CompanionVisualProps {
  profile: EdgeCompanionVisualProfile;
  layout: EdgeCompanionLayout;
  onAssetError(): void;
}

function CompanionVisual({
  profile,
  layout,
  onAssetError,
}: CompanionVisualProps) {
  const boxStyle = rectStyle(layout.box);
  const frameStyle = {
    ...rectStyle(layout.frame),
    transform: layout.frame.mirrorX ? "scaleX(-1)" : undefined,
  } satisfies CSSProperties;

  return (
    <div className="edge-companion-box" style={boxStyle}>
      <img
        className="edge-companion-frame"
        data-testid="edge-companion-frame"
        data-frame-kind="idle"
        src={profile.idleUrl}
        alt="边缘微型桌宠"
        draggable={false}
        style={frameStyle}
        onDragStart={(event) => event.preventDefault()}
        onError={onAssetError}
      />
      {layout.alphaHit ? (
        <span
          className="edge-companion-alpha-hit-region"
          data-testid="edge-companion-alpha-hit-region"
          data-desktop-interactive-region=""
          style={rectStyle(layout.alphaHit)}
        />
      ) : null}
    </div>
  );
}

function rectStyle(rect: CssRect) {
  return {
    position: "absolute",
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  } satisfies CSSProperties;
}

interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
