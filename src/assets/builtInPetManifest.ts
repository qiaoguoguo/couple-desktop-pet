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

export interface PetMotionDefinition {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: readonly string[];
  weight: number;
  tags: readonly string[];
}

export type InteractionFunctionId =
  | "open-weather"
  | "send-message"
  | "send-surprise"
  | "open-focus-timer"
  | "open-spark"
  | "open-status";

export type InteractionMenuSelection =
  | InteractionActionName
  | InteractionFunctionId;

export type InteractionMenuOptionId = InteractionMenuSelection;

export type InteractionMenuIconName =
  | "weather"
  | "message"
  | "focus"
  | "spark"
  | "surprise"
  | "status";

export interface PetInteractionOption {
  id: InteractionMenuOptionId;
  iconName: InteractionMenuIconName;
  label: string;
  bubble: string;
}

export interface BuiltInPetManifest {
  id: string;
  name: string;
  preview: string;
  portrait: string;
  offlinePortrait: string;
  baseSize: {
    width: number;
    height: number;
  };
  frameSize: {
    width: number;
    height: number;
  };
  actions: Record<PetActionName, PetActionDefinition>;
  motions: Record<string, PetMotionDefinition>;
  scenes: Record<string, PetPackageSceneManifest>;
}

export const interactionOptions = [
  {
    id: "open-weather",
    iconName: "weather",
    label: "双方天气",
    bubble: "",
  },
  {
    id: "send-message",
    iconName: "message",
    label: "发消息",
    bubble: "",
  },
  {
    id: "open-focus-timer",
    iconName: "focus",
    label: "专注一下",
    bubble: "",
  },
  {
    id: "open-spark",
    iconName: "spark",
    label: "续火花",
    bubble: "",
  },
  {
    id: "send-surprise",
    iconName: "surprise",
    label: "外卖到啦",
    bubble: "",
  },
  {
    id: "open-status",
    iconName: "status",
    label: "我的状态",
    bubble: "",
  },
] as const satisfies readonly PetInteractionOption[];

const frameSequence = (action: PetActionName) =>
  Array.from(
    { length: PET_FRAMES_PER_ACTION },
    (_, index) =>
      `pets/q-girl/frames/${action}/${String(index + 1).padStart(4, "0")}.png`,
  );

const motionFrameSequence = (motionId: string, frameCount: number) =>
  Array.from(
    { length: frameCount },
    (_, index) =>
      `pets/q-girl/frames/${motionId}/${String(index + 1).padStart(4, "0")}.png`,
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
  preview: "pets/q-girl/preview.png",
  portrait: "pets/q-girl/portrait.png",
  offlinePortrait: "pets/q-girl/portrait-offline.png",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 768, height: 960 },
  actions: Object.fromEntries(
    requiredPetActions.map((action) => [action, actionDefinition(action)]),
  ) as Record<PetActionName, PetActionDefinition>,
  motions: {
    "motion-message-pair": {
      fps: 8,
      loop: true,
      frameCount: 48,
      durationMs: 6000,
      frames: motionFrameSequence("motion-message-pair", 48),
      weight: 1,
      tags: ["message", "pair", "interaction"],
    },
  },
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
