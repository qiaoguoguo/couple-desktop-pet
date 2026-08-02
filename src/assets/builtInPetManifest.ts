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

const repeatFrames = (frames: readonly string[], count = 18) =>
  Array.from({ length: count }, (_, index) => frames[index % frames.length]);

const oldIdleFrames = [
  "pets/star-sleeper/idle-01.png",
  "pets/star-sleeper/idle-02.png",
  "pets/star-sleeper/idle-03.png",
  "pets/star-sleeper/idle-04.png",
] as const;

const oldWalkFrames = [
  "pets/star-sleeper/walk-01.png",
  "pets/star-sleeper/walk-02.png",
  "pets/star-sleeper/walk-03.png",
  "pets/star-sleeper/walk-04.png",
  "pets/star-sleeper/walk-05.png",
  "pets/star-sleeper/walk-06.png",
] as const;

const oldDragFrames = [
  "pets/star-sleeper/drag-01.png",
  "pets/star-sleeper/drag-02.png",
] as const;

const oldHappyFrames = [
  "pets/star-sleeper/happy-01.png",
  "pets/star-sleeper/happy-02.png",
  "pets/star-sleeper/happy-03.png",
  "pets/star-sleeper/happy-04.png",
] as const;

const oldSleepFrames = [
  "pets/star-sleeper/sleep-01.png",
  "pets/star-sleeper/sleep-02.png",
  "pets/star-sleeper/sleep-03.png",
  "pets/star-sleeper/sleep-04.png",
] as const;

const longAction = (
  category: PetActionDefinition["category"],
  frames: readonly string[],
  loop: boolean,
): PetActionDefinition => ({
  fps: 3,
  loop,
  durationMs: 6000,
  category,
  frames: repeatFrames(frames),
});

export const builtInPetManifest = {
  id: "star-sleeper",
  name: "星星睡衣小星人",
  baseSize: { width: 256, height: 320 },
  actions: {
    "idle-breathe": longAction("idle", oldIdleFrames, true),
    "idle-look": longAction("idle", oldIdleFrames, true),
    "idle-stretch": longAction("idle", oldHappyFrames, true),
    walk: longAction("movement", oldWalkFrames, true),
    drag: longAction("movement", oldDragFrames, true),
    sleep: longAction("movement", oldSleepFrames, true),
    "act-cute": longAction("interaction", oldHappyFrames, false),
    "act-typing": longAction("interaction", oldHappyFrames, false),
    "act-wave": longAction("interaction", oldHappyFrames, false),
    "act-hug": longAction("interaction", oldHappyFrames, false),
    "act-pout": longAction("interaction", oldHappyFrames, false),
    "act-drowsy": longAction("interaction", oldSleepFrames, false),
  },
} as const satisfies BuiltInPetManifest;

export function getActionDefinition(action: PetActionName): PetActionDefinition {
  return builtInPetManifest.actions[action];
}
