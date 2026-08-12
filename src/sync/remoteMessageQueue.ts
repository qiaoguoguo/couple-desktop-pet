import type { StructuredMessageContent } from "../../shared/syncProtocol";

export type RemoteMessageStage =
  | "visible"
  | "hovered"
  | "collapsed"
  | "revealed"
  | "dismissing";

export interface RemoteMessageInput {
  id: string;
  fromDeviceId: string;
  text: string;
  at: string;
  content?: StructuredMessageContent;
}

export interface RemoteMessageCard extends RemoteMessageInput {
  stage: RemoteMessageStage;
}

export interface RemoteMessageQueueState {
  active: RemoteMessageCard | null;
  queue: RemoteMessageCard[];
}

export function createEmptyRemoteMessageQueue(): RemoteMessageQueueState {
  return { active: null, queue: [] };
}

export function enqueueRemoteMessage(
  state: RemoteMessageQueueState,
  input: RemoteMessageInput,
): RemoteMessageQueueState {
  const message: RemoteMessageCard = {
    ...input,
    stage: isSurpriseMessage(input) ? "collapsed" : "visible",
  };

  if (!state.active) {
    return { active: message, queue: state.queue };
  }

  return { active: state.active, queue: [...state.queue, message] };
}

export function markRemoteMessageHovered(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (
    !state.active ||
    state.active.id !== id ||
    state.active.stage !== "visible" ||
    isSurpriseMessage(state.active)
  ) {
    return state;
  }

  return { ...state, active: { ...state.active, stage: "hovered" } };
}

export function revealRemoteSurprise(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (
    !state.active ||
    state.active.id !== id ||
    state.active.stage !== "collapsed" ||
    !isSurpriseMessage(state.active)
  ) {
    return state;
  }

  return { ...state, active: { ...state.active, stage: "revealed" } };
}

export function markRemoteMessageDismissing(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (!state.active || state.active.id !== id || state.active.stage === "dismissing") {
    return state;
  }

  if (isSurpriseMessage(state.active)) {
    if (state.active.stage !== "revealed") {
      return state;
    }
  } else if (state.active.stage !== "visible" && state.active.stage !== "hovered") {
    return state;
  }

  return { ...state, active: { ...state.active, stage: "dismissing" } };
}

export function completeRemoteMessageDismissal(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (!state.active || state.active.id !== id) {
    return state;
  }

  const [nextMessage, ...remainingQueue] = state.queue;

  return {
    active: nextMessage ?? null,
    queue: remainingQueue,
  };
}

function isSurpriseMessage(
  message: RemoteMessageInput,
): message is RemoteMessageInput & { content: StructuredMessageContent } {
  return message.content?.kind === "surprise";
}
