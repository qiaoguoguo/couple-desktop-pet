export interface BubbleState {
  message: string;
  visible: boolean;
}

export function createHiddenBubble(): BubbleState {
  return {
    message: "",
    visible: false,
  };
}

export function showBubble(message: string): BubbleState {
  return {
    message,
    visible: true,
  };
}

export function hideBubble(state: BubbleState): BubbleState {
  return {
    ...state,
    visible: false,
  };
}
