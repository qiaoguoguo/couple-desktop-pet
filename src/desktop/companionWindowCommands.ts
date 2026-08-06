import type {
  CompanionSceneContentState,
  CompanionSceneViewState,
} from "../sync/companion/companionSceneTypes";
import {
  invokeCommand,
  listenToDesktopEvent,
  type DesktopEventUnlisten,
} from "./desktopApi";

export function updateCompanionScene(
  state: CompanionSceneContentState,
): Promise<CompanionSceneViewState> {
  return invokeCommand<CompanionSceneViewState>("update_companion_scene", {
    state,
  });
}

export function readCompanionScene(): Promise<CompanionSceneViewState> {
  return invokeCommand<CompanionSceneViewState>("read_companion_scene");
}

export function hideCompanionScene(): Promise<void> {
  return invokeCommand<void>("hide_companion_scene");
}

export function requestOpenMessageComposer(): Promise<void> {
  return invokeCommand<void>("request_open_message_composer");
}

export function listenCompanionScene(
  handler: (state: CompanionSceneViewState) => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent("companion-scene-updated", handler);
}

export function listenForOpenMessageComposerRequest(
  handler: () => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent("open-message-composer", handler);
}
