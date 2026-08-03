export type RemoteMessageStage = "visible" | "hovered" | "dismissing";

export interface RemoteMessageInput {
  id: string;
  fromDeviceId: string;
  text: string;
  at: string;
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
  const message: RemoteMessageCard = { ...input, stage: "visible" };

  if (!state.active) {
    return { active: message, queue: state.queue };
  }

  return { active: state.active, queue: [...state.queue, message] };
}

export function markRemoteMessageHovered(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (!state.active || state.active.id !== id || state.active.stage !== "visible") {
    return state;
  }

  return { ...state, active: { ...state.active, stage: "hovered" } };
}

export function markRemoteMessageDismissing(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (!state.active || state.active.id !== id || state.active.stage === "dismissing") {
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
