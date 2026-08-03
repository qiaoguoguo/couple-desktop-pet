import { BUILT_IN_PET_PACKAGE_ID } from "./petPackageContract";

export type IdleActionName = "idle-breathe" | "idle-look" | "idle-stretch";

export type MovementActionName = "walk" | "drag" | "sleep";

export type InteractionActionName =
  | "act-cute"
  | "act-typing"
  | "act-wave"
  | "act-hug"
  | "act-pout"
  | "act-drowsy";

export type PetActionName =
  | IdleActionName
  | MovementActionName
  | InteractionActionName;

export interface PetActionDefinition {
  fps: number;
  loop: boolean;
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

export const idleActionNames = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
] as const satisfies readonly IdleActionName[];

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
  durationMs: 6000,
  category,
  frames: frameSequence(action),
});

export const builtInPetManifest = {
  id: BUILT_IN_PET_PACKAGE_ID,
  name: "星星睡衣小星人",
  baseSize: { width: 256, height: 320 },
  actions: {
    "idle-breathe": longAction("idle", "idle-breathe", true),
    "idle-look": longAction("idle", "idle-look", true),
    "idle-stretch": longAction("idle", "idle-stretch", true),
    walk: longAction("movement", "walk", true),
    drag: longAction("movement", "drag", true),
    sleep: longAction("movement", "sleep", true),
    "act-cute": longAction("interaction", "act-cute", false),
    "act-typing": longAction("interaction", "act-typing", false),
    "act-wave": longAction("interaction", "act-wave", false),
    "act-hug": longAction("interaction", "act-hug", false),
    "act-pout": longAction("interaction", "act-pout", false),
    "act-drowsy": longAction("interaction", "act-drowsy", false),
  },
} as const satisfies BuiltInPetManifest;

export function getActionDefinition(action: PetActionName): PetActionDefinition {
  return builtInPetManifest.actions[action];
}
