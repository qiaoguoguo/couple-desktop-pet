export interface BubbleState {
  id: number;
  message: string;
  visible: boolean;
}

let nextBubbleId = 1;

export function createHiddenBubble(): BubbleState {
  return {
    id: 0,
    message: "",
    visible: false,
  };
}

export function showBubble(message: string): BubbleState {
  return {
    id: nextBubbleId++,
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
