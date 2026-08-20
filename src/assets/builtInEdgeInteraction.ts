import type {
  EdgeAnchor,
  EdgeInteractionProfile,
  EdgePhaseMotion,
  EdgeSide,
} from "../pet/edgeInteraction";
import { getBuiltInEdgeCompanionVisual } from "./builtInEdgeCompanion";

const Q_GIRL_PACKAGE_ID = "builtin:q-girl";
const edgeSides = ["left", "right", "top", "bottom"] as const;
const topIdleFrameUrl = new URL(
  "./pets/q-girl/edge-interaction/top/idle/0001.png",
  import.meta.url,
).href;

const contactAnchors: Record<EdgeSide, EdgeAnchor> = {
  left: { x: 0.2203125, y: 0.5 },
  right: { x: 0.778125, y: 0.5 },
  top: { x: 0.5, y: 0.05 },
  bottom: { x: 0.5, y: 0.367 },
};

function createStaticMotion(contactAnchor: EdgeAnchor): EdgePhaseMotion {
  return {
    frames: [topIdleFrameUrl],
    fps: 1,
    loop: false,
    durationMs: 1000,
    frameAnchors: [contactAnchor],
  };
}

const qGirlEdgeProfiles = Object.fromEntries(
  edgeSides.map((side) => {
    const staticMotion = createStaticMotion(contactAnchors[side]);
    const companion = getBuiltInEdgeCompanionVisual(Q_GIRL_PACKAGE_ID, side);

    return [
      side,
      {
        side,
        contactAnchor: contactAnchors[side],
        enter: staticMotion,
        idle: staticMotion,
        react: staticMotion,
        ...(companion ? { companion } : {}),
      },
    ];
  }),
) as Record<EdgeSide, EdgeInteractionProfile>;

export function getBuiltInEdgeProfile(
  packageId: string,
  side: EdgeSide,
): EdgeInteractionProfile | null {
  if (packageId !== Q_GIRL_PACKAGE_ID) {
    return null;
  }

  return qGirlEdgeProfiles[side];
}
