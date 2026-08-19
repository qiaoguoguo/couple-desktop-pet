import {
  createIdleFocusTimer,
  restoreFocusTimer,
  type PersistedFocusTimer,
} from "./focusTimer";

export interface FocusTimerPersistenceApi {
  readFocusTimer(): Promise<unknown>;
  writeFocusTimer(timer: PersistedFocusTimer): Promise<void>;
}

export async function loadFocusTimer(
  api: FocusTimerPersistenceApi,
  now: number,
) {
  try {
    return restoreFocusTimer(await api.readFocusTimer(), now);
  } catch {
    return createIdleFocusTimer();
  }
}

export function saveFocusTimer(
  api: FocusTimerPersistenceApi,
  state: PersistedFocusTimer,
) {
  return api.writeFocusTimer(state);
}
