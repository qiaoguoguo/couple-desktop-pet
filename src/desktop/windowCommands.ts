import type { MovementRange, PetSettings } from "../settings/settingsTypes";
import {
  invokeCommand,
  listenToDesktopEvent,
  startCurrentWindowDrag,
  type DesktopEventUnlisten,
} from "./desktopApi";

export function readSettings(): Promise<unknown> {
  return invokeCommand<unknown>("read_settings");
}

export function writeSettings(settings: PetSettings): Promise<void> {
  return invokeCommand<void>("write_settings", { settings });
}

export function setAlwaysOnTop(enabled: boolean): Promise<void> {
  return invokeCommand<void>("set_always_on_top", { enabled });
}

export function setClickThrough(enabled: boolean): Promise<void> {
  return invokeCommand<void>("set_click_through", { enabled });
}

export function resetWindowPosition(): Promise<void> {
  return invokeCommand<void>("reset_window_position");
}

export function moveWindowForAutoStep(
  movementRange: MovementRange,
): Promise<void> {
  return invokeCommand<void>("move_window_for_auto_step", { movementRange });
}

export function showWindow(): Promise<void> {
  return invokeCommand<void>("show_window");
}

export function hideWindow(): Promise<void> {
  return invokeCommand<void>("hide_window");
}

export function quitApp(): Promise<void> {
  return invokeCommand<void>("quit_app");
}

export function listenForOpenSettings(
  handler: () => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent("open-settings", handler);
}

export function startWindowDrag(): Promise<void> {
  return startCurrentWindowDrag();
}
