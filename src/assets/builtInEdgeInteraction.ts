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
  left: { x: 0.275, y: 0.5 },
  right: { x: 0.725, y: 0.5 },
  top: { x: 0.5, y: 0.05 },
  bottom: { x: 0.5, y: 0.367 },
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
  const expectedPrefix = `./pets/q-girl/edge-interaction/${side}/${phase}/`;

  return Object.entries(edgeFrameModules)
    .filter(([path]) => path.startsWith(expectedPrefix))
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([, url]) => url);
}

function createPhaseMotion(
  side: EdgeSide,
  phase: keyof typeof phaseSettings,
): EdgePhaseMotion {
  const settings = phaseSettings[phase];
  const frames = getSortedPhaseFrames(side, phase);
  const contactAnchor = contactAnchors[side];

  return {
    frames,
    fps: settings.fps,
    loop: settings.loop,
    durationMs: settings.durationMs,
    frameAnchors: Array.from({ length: settings.frameCount }, () => contactAnchor),
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
