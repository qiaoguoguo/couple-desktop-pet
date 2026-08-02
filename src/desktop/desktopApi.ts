import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

type CommandArgs = Record<string, unknown>;
export type DesktopEventUnlisten = () => void;

export function invokeCommand<T>(
  command: string,
  args?: CommandArgs,
): Promise<T> {
  return invoke<T>(command, args);
}

export function listenToDesktopEvent(
  eventName: string,
  handler: () => void,
): Promise<DesktopEventUnlisten> {
  return listen(eventName, handler);
}

export function startCurrentWindowDrag(): Promise<void> {
  return getCurrentWindow().startDragging();
}
