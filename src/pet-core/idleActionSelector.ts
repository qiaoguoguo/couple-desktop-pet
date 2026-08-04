import type { IdleActionName } from "../assets/petActionNames";

export function selectNextIdleAction(
  history: readonly IdleActionName[],
  idleActions: readonly IdleActionName[],
  random: () => number = Math.random,
): IdleActionName {
  if (idleActions.length === 0) {
    throw new Error("idleActions must not be empty");
  }

  const recent = history.slice(-2);
  const blocked =
    recent.length === 2 && recent[0] === recent[1] ? recent[0] : null;
  const candidates = blocked
    ? idleActions.filter((action) => action !== blocked)
    : [...idleActions];
  const pool = candidates.length > 0 ? candidates : [...idleActions];
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));

  return pool[index];
}
