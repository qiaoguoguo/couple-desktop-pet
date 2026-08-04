import type {
  MotionBubbleCue,
  MotionScene,
  MotionSceneRuntime,
} from "./motionSceneTypes";

export function createMotionSceneRuntime(
  scene: MotionScene,
  startedAt: number,
  remoteMessageText: string | null = null,
): MotionSceneRuntime {
  return {
    scene,
    startedAt,
    remoteMessageText,
    firedCueIndexes: new Set<number>(),
  };
}

export function readDueBubbleCues(
  runtime: MotionSceneRuntime,
  now: number,
): MotionBubbleCue[] {
  const elapsedMs = now - runtime.startedAt;
  const cues: MotionBubbleCue[] = [];

  runtime.scene.bubbleCues.forEach((cue, index) => {
    if (runtime.firedCueIndexes.has(index) || elapsedMs < cue.atMs) {
      return;
    }

    runtime.firedCueIndexes.add(index);
    cues.push(resolveBubbleCue(cue, runtime.remoteMessageText));
  });

  return cues;
}

export function isMotionSceneComplete(
  runtime: MotionSceneRuntime,
  now: number,
  acknowledged: boolean,
): boolean {
  if (now - runtime.startedAt < runtime.scene.durationMs) {
    return false;
  }

  if (runtime.scene.waitForAcknowledge) {
    return acknowledged;
  }

  return true;
}

function resolveBubbleCue(
  cue: MotionBubbleCue,
  remoteMessageText: string | null,
): MotionBubbleCue {
  if (cue.source !== "remoteMessage") {
    return cue;
  }

  return {
    ...cue,
    text: remoteMessageText ?? "",
  };
}
