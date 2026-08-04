import { BUILT_IN_PET_PACKAGE_ID } from "./petPackageContract";
import {
  isLoopingPetAction,
  readPetActionCategory,
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
  actions: Record<PetActionName, PetActionDefinition>;
}

export const interactionOptions = [
  { id: "act-cute", label: "撒娇卖萌", bubble: "陪我一会儿嘛。" },
  { id: "act-typing", label: "敲电脑", bubble: "我也在努力敲代码。" },
  { id: "act-wave", label: "打招呼", bubble: "嗨，我在这里！" },
  { id: "act-hug", label: "求抱抱", bubble: "可以抱一下吗？" },
  { id: "act-pout", label: "生气鼓脸", bubble: "哼，快哄我。" },
  { id: "act-drowsy", label: "困困打盹", bubble: "有点困啦。" },
] as const satisfies readonly PetInteractionOption[];

const frameSequence = (action: PetActionName, count = 18) =>
  Array.from(
    { length: count },
    (_, index) =>
      `pets/star-sleeper/${action}-${String(index + 1).padStart(2, "0")}.png`,
  );

const longAction = (
  category: PetActionDefinition["category"],
  action: PetActionName,
  loop: boolean,
): PetActionDefinition => ({
  fps: 3,
  loop,
  frameCount: 18,
  durationMs: 6000,
  category,
  frames: frameSequence(action),
});

export const builtInPetManifest = {
  id: BUILT_IN_PET_PACKAGE_ID,
  name: "星星睡衣小星人",
  baseSize: { width: 256, height: 320 },
  actions: {
    "idle-breathe": longAction(
      readPetActionCategory("idle-breathe"),
      "idle-breathe",
      isLoopingPetAction("idle-breathe"),
    ),
    "idle-look": longAction(
      readPetActionCategory("idle-look"),
      "idle-look",
      isLoopingPetAction("idle-look"),
    ),
    "idle-stretch": longAction(
      readPetActionCategory("idle-stretch"),
      "idle-stretch",
      isLoopingPetAction("idle-stretch"),
    ),
    walk: longAction(readPetActionCategory("walk"), "walk", isLoopingPetAction("walk")),
    drag: longAction(readPetActionCategory("drag"), "drag", isLoopingPetAction("drag")),
    sleep: longAction(readPetActionCategory("sleep"), "sleep", isLoopingPetAction("sleep")),
    "act-cute": longAction(
      readPetActionCategory("act-cute"),
      "act-cute",
      isLoopingPetAction("act-cute"),
    ),
    "act-typing": longAction(
      readPetActionCategory("act-typing"),
      "act-typing",
      isLoopingPetAction("act-typing"),
    ),
    "act-wave": longAction(
      readPetActionCategory("act-wave"),
      "act-wave",
      isLoopingPetAction("act-wave"),
    ),
    "act-hug": longAction(
      readPetActionCategory("act-hug"),
      "act-hug",
      isLoopingPetAction("act-hug"),
    ),
    "act-pout": longAction(
      readPetActionCategory("act-pout"),
      "act-pout",
      isLoopingPetAction("act-pout"),
    ),
    "act-drowsy": longAction(
      readPetActionCategory("act-drowsy"),
      "act-drowsy",
      isLoopingPetAction("act-drowsy"),
    ),
  },
} as const satisfies BuiltInPetManifest;

export function getActionDefinition(action: PetActionName): PetActionDefinition {
  return builtInPetManifest.actions[action];
}
