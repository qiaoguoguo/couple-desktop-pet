import {
  type IdleActionName,
  type InteractionActionName,
  type PetActionName,
} from "../assets/petActionNames";
import { selectNextIdleAction } from "./idleActionSelector";

export type IdleBehaviorSource = "idle" | "ambient-interaction";

export type IdleBehaviorSelection =
  | {
      action: IdleActionName;
      source: "idle";
    }
  | {
      action: InteractionActionName;
      source: "ambient-interaction";
    };

export interface SelectNextIdleBehaviorOptions {
  history: readonly PetActionName[];
  idleActions: readonly IdleActionName[];
  ambientEnabled: boolean;
  random?: () => number;
}

const ambientChance = 0.3;
const weightedAmbientActions: Array<{
  action: InteractionActionName;
  weight: number;
}> = [
  { action: "act-cute", weight: 6 },
  { action: "act-wave", weight: 6 },
  { action: "act-drowsy", weight: 5 },
  { action: "act-typing", weight: 3 },
  { action: "act-hug", weight: 3 },
  { action: "act-pout", weight: 1 },
];

export function selectNextIdleBehavior({
  history,
  idleActions,
  ambientEnabled,
  random = Math.random,
}: SelectNextIdleBehaviorOptions): IdleBehaviorSelection {
  if (ambientEnabled && random() < ambientChance) {
    return {
      action: selectWeightedAmbientAction(history, random),
      source: "ambient-interaction",
    };
  }

  return {
    action: selectNextIdleAction(
      history.filter(isIdleActionName),
      idleActions,
      random,
    ),
    source: "idle",
  };
}

function selectWeightedAmbientAction(
  history: readonly PetActionName[],
  random: () => number,
): InteractionActionName {
  const lastAction = history.at(-1);
  const candidates = weightedAmbientActions.filter(
    (candidate) => candidate.action !== lastAction,
  );
  const pool = candidates.length > 0 ? candidates : weightedAmbientActions;
  const totalWeight = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = random() * totalWeight;

  for (const candidate of pool) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      return candidate.action;
    }
  }

  return pool[pool.length - 1].action;
}

function isIdleActionName(action: PetActionName): action is IdleActionName {
  return (
    action === "idle-breathe" ||
    action === "idle-look" ||
    action === "idle-stretch"
  );
}
