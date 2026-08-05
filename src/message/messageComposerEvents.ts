import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  listenToDesktopEvent,
  type DesktopEventUnlisten,
} from "../desktop/desktopApi";

export interface MessageComposerSubmitPayload {
  text: string;
}

export interface MessageComposerResultPayload {
  ok: boolean;
  message?: string;
}

export const MESSAGE_COMPOSER_SUBMIT_EVENT = "message-composer-submit";
export const MESSAGE_COMPOSER_RESULT_EVENT = "message-composer-result";

export function emitMessageComposerSubmit(text: string): Promise<void> {
  return emit(MESSAGE_COMPOSER_SUBMIT_EVENT, { text });
}

export function emitMessageComposerResult(
  result: MessageComposerResultPayload,
): Promise<void> {
  return emit(MESSAGE_COMPOSER_RESULT_EVENT, result);
}

export function listenForMessageComposerSubmit(
  handler: (payload: MessageComposerSubmitPayload) => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent<MessageComposerSubmitPayload>(
    MESSAGE_COMPOSER_SUBMIT_EVENT,
    handler,
  );
}

export function listenForMessageComposerResult(
  handler: (payload: MessageComposerResultPayload) => void,
): Promise<DesktopEventUnlisten> {
  return listenToDesktopEvent<MessageComposerResultPayload>(
    MESSAGE_COMPOSER_RESULT_EVENT,
    handler,
  );
}

export function closeCurrentMessageComposerWindow(): Promise<void> {
  return getCurrentWindow().close();
}
