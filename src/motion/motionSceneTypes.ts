import type { IdleActionName, PetActionName } from "../assets/petActionNames";

export type MotionSceneId = PetActionName | "remote-message";

export interface MotionBubbleCue {
  atMs: number;
  text?: string;
  source?: "remoteMessage";
}

export interface MotionScene {
  id: MotionSceneId;
  action: PetActionName;
  durationMs: number;
  bubbleCues: readonly MotionBubbleCue[];
  returnTo: IdleActionName;
  waitForAcknowledge?: boolean;
}

export interface MotionSceneRuntime {
  scene: MotionScene;
  startedAt: number;
  remoteMessageText: string | null;
  firedCueIndexes: Set<number>;
}
