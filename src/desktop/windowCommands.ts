import type { MovementRange, PetSettings } from "../settings/settingsTypes";
import type { PersistedFocusTimer } from "../focus-timer/focusTimer";
import type { EdgePeekSide } from "./edgePeek";
import {
  invokeCommand,
  listenToDesktopEvent,
  type DesktopEventUnlisten,
} from "./desktopApi";

export type ClickThroughRecoveryReason = "show" | "settings";
export type ComposerSurface =
  | "message"
  | "surprise"
  | "focus"
  | "weather"
  | "spark";
export interface InteractiveRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function readSettings(): Promise<unknown> {
  return invokeCommand<unknown>("read_settings");
}

export function writeSettings(settings: PetSettings): Promise<void> {
  return invokeCommand<void>("write_settings", { settings });
}

export function readFocusTimer(): Promise<unknown> {
  return invokeCommand<unknown>("read_focus_timer");
}

export function writeFocusTimer(timer: PersistedFocusTimer): Promise<void> {
  return invokeCommand<void>("write_focus_timer", { timer });
}

export function setAlwaysOnTop(enabled: boolean): Promise<void> {
  return invokeCommand<void>("set_always_on_top", { enabled });
}

export function setClickThrough(enabled: boolean): Promise<void> {
  return invokeCommand<void>("set_click_through", { enabled });
}

export function setInteractiveRegions(
  regions: InteractiveRegion[],
  deviceScaleFactor: number,
): Promise<void> {
  return invokeCommand<void>("set_interactive_regions", {
    regions,
    deviceScaleFactor,
  });
}

export function resetWindowPosition(): Promise<void> {
  return invokeCommand<void>("reset_window_position");
}

export function moveWindowForAutoStep(
  movementRange: MovementRange,
): Promise<void> {
  return invokeCommand<void>("move_window_for_auto_step", { movementRange });
}

export function snapWindowToEdgeIfNeeded(): Promise<EdgePeekSide | null> {
  return invokeCommand<EdgePeekSide | null>("snap_window_to_edge_if_needed");
}

export function dockWindowAtEdge(side: EdgePeekSide): Promise<void> {
  return invokeCommand<void>("dock_window_at_edge", { side });
}

export function restoreWindowFromEdgePeek(
  side: EdgePeekSide,
): Promise<void> {
  return invokeCommand<void>("restore_window_from_edge_peek", { side });
}

export function openMessageComposerSurface(
  surface: ComposerSurface,
): Promise<void> {
  return invokeCommand<void>("open_message_composer_surface", { surface });
}

export function closeMessageComposerSurface(): Promise<void> {
  return invokeCommand<void>("close_message_composer_surface");
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

export function listenForClickThroughRecovered(
  handler: (payload: { reason: ClickThroughRecoveryReason }) => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent("click-through-recovered", handler);
}

export function listenForWindowHidden(
  handler: () => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent("window-hidden", handler);
}

export function moveWindowForPointerDrag(
  deltaX: number,
  deltaY: number,
): Promise<void> {
  return invokeCommand<void>("move_window_for_pointer_drag", { deltaX, deltaY });
}
