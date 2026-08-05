import type { ResolvedPetMotion } from "../assets/petPackageRegistry";

interface SelectNextPetMotionOptions {
  motions: Record<string, ResolvedPetMotion>;
  defaultMotionId: string;
  history: readonly string[];
  random?: () => number;
}

export function selectNextPetMotion({
  motions,
  defaultMotionId,
  history,
  random = Math.random,
}: SelectNextPetMotionOptions): string {
  const entries = Object.values(motions).filter(
    (motion) => motion.frames.length > 0,
  );

  if (entries.length === 0) {
    return defaultMotionId;
  }

  const preferredEntries = entries.filter(
    (motion) =>
      motion.tags.includes("idle") || motion.tags.includes("ambient"),
  );
  const selectionEntries =
    preferredEntries.length > 0 ? preferredEntries : entries;
  const lastMotion = history.at(-1);
  const candidates =
    selectionEntries.length > 1
      ? selectionEntries.filter((motion) => motion.id !== lastMotion)
      : selectionEntries;

  return selectWeightedMotion(candidates, random)?.id ?? defaultMotionId;
}

export function selectMotionForTag(
  motions: Record<string, ResolvedPetMotion>,
  tag: string,
  random: () => number = Math.random,
): string | null {
  const candidates = Object.values(motions).filter(
    (motion) => motion.tags.includes(tag) && motion.frames.length > 0,
  );

  return selectWeightedMotion(candidates, random)?.id ?? null;
}

function selectWeightedMotion(
  motions: readonly ResolvedPetMotion[],
  random: () => number,
): ResolvedPetMotion | null {
  if (motions.length === 0) {
    return null;
  }

  const totalWeight = motions.reduce(
    (sum, motion) => sum + Math.max(0, motion.weight),
    0,
  );

  if (totalWeight <= 0) {
    return motions[0];
  }

  let cursor = random() * totalWeight;
  for (const motion of motions) {
    cursor -= Math.max(0, motion.weight);

    if (cursor <= 0) {
      return motion;
    }
  }

  return motions[motions.length - 1];
}
