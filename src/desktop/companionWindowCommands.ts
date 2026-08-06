import type {
  CompanionSceneContentState,
  CompanionSceneViewState,
} from "../sync/companion/companionSceneTypes";
import { normalizeCompanionSceneViewState } from "../sync/companion/companionSceneState";
import {
  invokeCommand,
  listenToDesktopEvent,
  type DesktopEventUnlisten,
} from "./desktopApi";

export function updateCompanionScene(
  state: CompanionSceneContentState,
): Promise<CompanionSceneViewState> {
  return invokeCommand<unknown>("update_companion_scene", { state }).then(
    normalizeCompanionSceneViewState,
  );
}

export function readCompanionScene(): Promise<CompanionSceneViewState> {
  return invokeCommand<unknown>("read_companion_scene").then(
    normalizeCompanionSceneViewState,
  );
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
  return listenToDesktopEvent<unknown>("companion-scene-updated", (payload) => {
    try {
      handler(normalizeCompanionSceneViewState(payload));
    } catch {
      // Drop malformed cross-window payloads and keep the last valid scene.
    }
  });
}

export function listenForOpenMessageComposerRequest(
  handler: () => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent("open-message-composer", handler);
}
