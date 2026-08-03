export interface BubbleState {
  id: number;
  message: string;
  visible: boolean;
  durationMs: number;
}

let nextBubbleId = 1;

export function createHiddenBubble(): BubbleState {
  return {
    id: 0,
    message: "",
    visible: false,
    durationMs: 0,
  };
}

export function showBubble(
  message: string,
  options: { durationMs?: number } = {},
): BubbleState {
  return {
    id: nextBubbleId++,
    message,
    visible: true,
    durationMs: options.durationMs ?? 1800,
  };
}

export function hideBubble(state: BubbleState): BubbleState {
  return {
    ...state,
    visible: false,
  };
}
