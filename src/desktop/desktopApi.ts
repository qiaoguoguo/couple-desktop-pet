import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

type CommandArgs = Record<string, unknown>;
export type DesktopEventUnlisten = () => void;

export function invokeCommand<T>(
  command: string,
  args?: CommandArgs,
): Promise<T> {
  return invoke<T>(command, args);
}

export function listenToDesktopEvent<T = void>(
  eventName: string,
  handler: (payload: T) => void,
): Promise<DesktopEventUnlisten> {
  return listen<T>(eventName, (event: Event<T>) => handler(event.payload));
}

export function startCurrentWindowDrag(): Promise<void> {
  return getCurrentWindow().startDragging();
}
