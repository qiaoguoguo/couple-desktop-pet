import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  type PetPackageSceneManifest,
} from "./petPackageContract";
import {
  isLoopingPetAction,
  readPetActionCategory,
  requiredPetActions,
  type IdleActionName,
  type InteractionActionName,
  type PetActionName,
} from "./petActionNames";

export {
  idleActionNames,
  interactionActionNames,
  type IdleActionName,
  type InteractionActionName,
  type MovementActionName,
  type PetActionName,
} from "./petActionNames";

export interface PetActionDefinition {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  category: "idle" | "movement" | "interaction";
  frames: readonly string[];
}

export interface PetInteractionOption {
  id: InteractionActionName;
  label: string;
  bubble: string;
}

export interface BuiltInPetManifest {
  id: string;
  name: string;
  baseSize: {
    width: number;
    height: number;
  };
  frameSize: {
    width: number;
    height: number;
  };
  actions: Record<PetActionName, PetActionDefinition>;
  scenes: Record<string, PetPackageSceneManifest>;
}

export const interactionOptions = [
  { id: "act-cute", label: "撒娇卖萌", bubble: "陪我一会儿嘛。" },
  { id: "act-typing", label: "敲电脑", bubble: "我也在努力敲代码。" },
  { id: "act-wave", label: "打招呼", bubble: "嗨，我在这里！" },
  { id: "act-hug", label: "求抱抱", bubble: "可以抱一下吗？" },
  { id: "act-pout", label: "生气鼓脸", bubble: "哼，快哄我。" },
  { id: "act-drowsy", label: "困困打盹", bubble: "有点困啦。" },
] as const satisfies readonly PetInteractionOption[];

const frameSequence = (action: PetActionName) =>
  Array.from(
    { length: PET_FRAMES_PER_ACTION },
    (_, index) =>
      `pets/q-girl/frames/${action}/${String(index + 1).padStart(4, "0")}.png`,
  );

const actionDefinition = (action: PetActionName): PetActionDefinition => ({
  fps: PET_ACTION_FPS,
  loop: isLoopingPetAction(action),
  frameCount: PET_FRAMES_PER_ACTION,
  durationMs: PET_ACTION_DURATION_MS,
  category: readPetActionCategory(action),
  frames: frameSequence(action),
});

export const builtInPetManifest = {
  id: BUILT_IN_PET_PACKAGE_ID,
  name: "Q 版小人",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 768, height: 960 },
  actions: Object.fromEntries(
    requiredPetActions.map((action) => [action, actionDefinition(action)]),
  ) as Record<PetActionName, PetActionDefinition>,
  scenes: {
    "act-cute": {
      action: "act-cute",
      bubbleCues: [{ atMs: 1800, text: "陪我一会儿嘛。" }],
      returnTo: "idle-breathe",
    },
    "act-typing": {
      action: "act-typing",
      bubbleCues: [{ atMs: 1800, text: "我也在努力敲代码。" }],
      returnTo: "idle-breathe",
    },
    "act-wave": {
      action: "act-wave",
      bubbleCues: [{ atMs: 1200, text: "嗨，我在这里！" }],
      returnTo: "idle-breathe",
    },
    "act-hug": {
      action: "act-hug",
      bubbleCues: [{ atMs: 2000, text: "可以抱一下吗？" }],
      returnTo: "idle-breathe",
    },
    "act-pout": {
      action: "act-pout",
      bubbleCues: [{ atMs: 1800, text: "哼，快哄我。" }],
      returnTo: "idle-breathe",
    },
    "act-drowsy": {
      action: "act-drowsy",
      bubbleCues: [{ atMs: 2200, text: "有点困啦。" }],
      returnTo: "idle-breathe",
    },
    "remote-message": {
      action: "act-wave",
      bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
      waitForAcknowledge: true,
      returnTo: "idle-breathe",
    },
  },
} as const satisfies BuiltInPetManifest;

export function getActionDefinition(action: PetActionName): PetActionDefinition {
  return builtInPetManifest.actions[action];
}
