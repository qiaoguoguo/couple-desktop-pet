import type {
  EdgeAnchor,
  EdgeInteractionProfile,
  EdgePhaseMotion,
  EdgeSide,
} from "../pet/edgeInteraction";

const Q_GIRL_PACKAGE_ID = "builtin:q-girl";
const edgeSides = ["left", "right", "top", "bottom"] as const;
const edgePhases = ["enter", "idle", "react"] as const;

const contactAnchors: Record<EdgeSide, EdgeAnchor> = {
  left: { x: 0.2203125, y: 0.5 },
  right: { x: 0.778125, y: 0.5 },
  top: { x: 0.5, y: 0.05 },
  bottom: { x: 0.5, y: 0.367 },
};
const frameSourceSides: Record<EdgeSide, EdgeSide> = {
  left: "right",
  right: "left",
  top: "top",
  bottom: "bottom",
};
const sideFrameAnchorX: Partial<
  Record<
    EdgeSide,
    Partial<Record<(typeof edgePhases)[number], Array<number | null>>>
  >
> = {
  left: {
    enter: [null, null, 0.4625, 0.4625, 0.475, null],
    idle: [
      0.3, 0.2203125, 0.3125, 0.3140625, 0.321875, 0.3265625,
      0.25, 0.315625, 0.31875, 0.3078125, 0.3125, 0.3125,
      0.3125, 0.3078125, 0.31875, 0.315625, 0.25, 0.3265625,
      0.321875, 0.3140625, 0.3125, 0.2203125,
    ],
    react: [0.403125, 0.36875, 0.39375, 0.3703125, 0.3640625, 0.40625],
  },
  right: {
    enter: [null, null, 0.5359375, 0.5359375, 0.5234375, null],
    idle: [
      0.6984375, 0.778125, 0.6875, 0.684375, 0.6765625, 0.671875,
      0.75, 0.6828125, 0.6796875, 0.690625, 0.6859375, 0.6859375,
      0.6859375, 0.690625, 0.6796875, 0.6828125, 0.75, 0.671875,
      0.6765625, 0.684375, 0.6875, 0.778125,
    ],
    react: [0.5953125, 0.6296875, 0.6046875, 0.628125, 0.634375, 0.5921875],
  },
};

const phaseSettings: Record<
  (typeof edgePhases)[number],
  { frameCount: number; fps: number; loop: boolean; durationMs: number }
> = {
  enter: { frameCount: 6, fps: 8, loop: false, durationMs: 750 },
  idle: { frameCount: 22, fps: 4, loop: true, durationMs: 5500 },
  react: { frameCount: 6, fps: 6, loop: false, durationMs: 1000 },
};

const edgeFrameModules = import.meta.glob(
  "./pets/q-girl/edge-interaction/*/*/*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

function getSortedPhaseFrames(
  side: EdgeSide,
  phase: keyof typeof phaseSettings,
): string[] {
  const sourceSide = frameSourceSides[side];
  const expectedPrefix = `./pets/q-girl/edge-interaction/${sourceSide}/${phase}/`;
  const frames = Object.entries(edgeFrameModules)
    .filter(([path]) => path.startsWith(expectedPrefix))
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([, url]) => url);

  return shouldReverseSideEnter(side, phase) ? frames.reverse() : frames;
}

function shouldReverseSideEnter(
  side: EdgeSide,
  phase: keyof typeof phaseSettings,
) {
  return phase === "enter" && (side === "left" || side === "right");
}

function createPhaseMotion(
  side: EdgeSide,
  phase: keyof typeof phaseSettings,
): EdgePhaseMotion {
  const settings = phaseSettings[phase];
  const frames = getSortedPhaseFrames(side, phase);
  const contactAnchor = contactAnchors[side];
  const rawFrameAnchorX = sideFrameAnchorX[side]?.[phase] ?? [];
  const frameAnchorX = shouldReverseSideEnter(side, phase)
    ? [...rawFrameAnchorX].reverse()
    : rawFrameAnchorX;

  return {
    frames,
    fps: settings.fps,
    loop: settings.loop,
    durationMs: settings.durationMs,
    frameAnchors: Array.from({ length: settings.frameCount }, (_, index) => ({
      x: frameAnchorX[index] ?? contactAnchor.x,
      y: contactAnchor.y,
    })),
  };
}

const qGirlEdgeProfiles: Record<EdgeSide, EdgeInteractionProfile> =
  Object.fromEntries(
    edgeSides.map((side) => [
      side,
      {
        side,
        contactAnchor: contactAnchors[side],
        enter: createPhaseMotion(side, "enter"),
        idle: createPhaseMotion(side, "idle"),
        react: createPhaseMotion(side, "react"),
      },
    ]),
  ) as Record<EdgeSide, EdgeInteractionProfile>;

export function getBuiltInEdgeProfile(
  packageId: string,
  side: EdgeSide,
): EdgeInteractionProfile | null {
  if (packageId !== Q_GIRL_PACKAGE_ID) {
    return null;
  }

  return qGirlEdgeProfiles[side] ?? null;
}
